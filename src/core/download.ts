import {
  downloadFile,
  stopDownload,
  mkdir,
  unlink,
  privateStorageDirectoryPath,
} from '@/utils/fs'
import { getMusicUrl } from '@/core/music/online'
import { formatMusicName } from '@/utils/tools'
import settingState from '@/store/setting/state'
import { getData, saveData } from '@/plugins/storage'
import { storageDataPrefix } from '@/config/constant'

/**
 * 最大同时下载数（并发控制）
 */
const MAX_CONCURRENT = 2

/**
 * 下载目录：应用私有文档目录，规避 Android scoped storage 权限限制
 */
const DOWNLOAD_DIR = `${privateStorageDirectoryPath}/download`

/**
 * 音质 -> 文件扩展名映射
 */
export const QUALITY_EXT_MAP: Record<LX.Quality, LX.Download.FileExt> = {
  '128k': 'mp3',
  '192k': 'mp3',
  '320k': 'mp3',
  flac: 'flac',
  flac24bit: 'flac',
  ape: 'ape',
  wav: 'wav',
}

/**
 * 音质展示排序（flac24bit 排最后，且在可选列表中默认过滤避免空 URL）
 */
export const QUALITY_ORDER: LX.Quality[] = ['128k', '192k', '320k', 'flac', 'ape', 'wav', 'flac24bit']

export const getQualityExt = (quality: LX.Quality): LX.Download.FileExt => QUALITY_EXT_MAP[quality]

interface DownloadTaskRuntime extends LX.Download.ListItem {
  jobId: number | null
}

let list: LX.Download.ListItem[] = []
let onListUpdate: ((list: LX.Download.ListItem[]) => void) | null = null
let runningCount = 0
let initialized = false
let saving = false
let saveAgain = false

const waitingQueue: DownloadTaskRuntime[] = []
const runningTasks = new Map<string, DownloadTaskRuntime>()

const emit = () => {
  onListUpdate?.([...list])
}

const save = () => {
  // 节流持久化：合并连续写入请求
  if (saving) {
    saveAgain = true
    return
  }
  saving = true
  void saveData(storageDataPrefix.downloadList, list).catch(() => {
    // 保存失败不影响内存态
  }).finally(() => {
    saving = false
    if (saveAgain) {
      saveAgain = false
      save()
    }
  })
}

const sanitizeFileName = (name: string) => name.replace(/[\\/:*?"<>|\r\n]/g, '_').trim() || 'untitled'

const formatSpeed = (bytes: number) => {
  if (!bytes || bytes < 0) return ''
  if (bytes < 1024) return `${bytes.toFixed(0)} B/s`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB/s`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB/s`
}

const formatSize = (bytes: number) => {
  if (!bytes || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes.toFixed(0)} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

const updateTask = (id: string, data: Partial<LX.Download.ListItem>) => {
  const index = list.findIndex(t => t.id == id)
  if (index < 0) return
  list[index] = { ...list[index], ...data }
  emit()
}

const setTaskStatus = (id: string, status: LX.Download.DownloadTaskStatus, statusText = '') => {
  updateTask(id, { status, statusText })
}

const errorTask = (id: string, message: string) => {
  const task = list.find(t => t.id == id)
  if (!task) return
  setTaskStatus(id, 'error', message)
  save()
}

const completeTask = (id: string) => {
  const task = list.find(t => t.id == id)
  if (!task) return
  setTaskStatus(id, 'completed', global.i18n.t('download_status_completed'))
  updateTask(id, { isComplate: true, progress: 1, speed: '' })
  save()
}

const schedule = () => {
  while (runningCount < MAX_CONCURRENT && waitingQueue.length) {
    const task = waitingQueue.shift()!
    if (list.find(t => t.id == task.id)) void runTask(task)
  }
}

const runTask = async(task: DownloadTaskRuntime) => {
  runningCount++
  runningTasks.set(task.id, task)

  try {
    setTaskStatus(task.id, 'run', global.i18n.t('download_status_running'))
    updateTask(task.id, { isComplate: false, speed: '' })

    // 1. 获取对应音质 URL
    let url: string
    try {
      url = await getMusicUrl({
        musicInfo: task.metadata.musicInfo,
        quality: task.metadata.quality,
        isRefresh: false,
        allowToggleSource: false,
      })
    } catch (err: any) {
      setTaskStatus(task.id, 'error', err.message || global.i18n.t('download_get_url_failed'))
      save()
      return
    }

    // 2. 计算落盘路径
    const name = task.metadata.musicInfo.name
    const singer = task.metadata.musicInfo.singer
    const fileName = `${sanitizeFileName(formatMusicName(settingState.setting['download.fileName'], name, singer))}.${task.metadata.ext}`
    const filePath = `${DOWNLOAD_DIR}/${fileName}`
    updateTask(task.id, { metadata: { ...task.metadata, url, filePath } })

    // 3. 确保目录存在
    try {
      await mkdir(DOWNLOAD_DIR)
    } catch (err) {
      // 目录已存在时忽略
    }

    // 4. 发起下载
    const startTime = Date.now()
    let lastBytes = 0
    let lastTime = startTime
    const job = downloadFile(url, filePath, {
      progressInterval: 500,
      progressDivider: 1,
      begin: (res) => {
        updateTask(task.id, { total: res.contentLength > 0 ? res.contentLength : 0, downloaded: 0, progress: 0 })
      },
      progress: (res) => {
        const downloaded = res.bytesWritten
        const total = res.contentLength > 0 ? res.contentLength : (list.find(t => t.id == task.id)?.total || 0)
        const progress = total > 0 ? Math.min(downloaded / total, 1) : 0
        const now = Date.now()
        const dt = (now - lastTime) / 1000
        let speed = ''
        if (dt >= 1) {
          const bytes = downloaded - lastBytes
          lastBytes = downloaded
          lastTime = now
          speed = formatSpeed(bytes / dt)
        }
        updateTask(task.id, { downloaded, total, progress, speed })
      },
      connectionTimeout: 10_000,
      readTimeout: 30_000,
    })
    task.jobId = job.jobId

    const result = await job.promise
    if (result.statusCode == 200) {
      completeTask(task.id)
    } else {
      errorTask(task.id, `HTTP ${result.statusCode}`)
    }
  } catch (err: any) {
    // 被暂停/删除时不视为错误
    const current = list.find(t => t.id == task.id)
    if (current && current.status == 'run') {
      errorTask(task.id, err.message || global.i18n.t('download_error_tip'))
    }
  } finally {
    runningCount--
    runningTasks.delete(task.id)
    schedule()
  }
}

/**
 * 暂停任务
 */
export const pauseDownloadTask = (id: string) => {
  const task = runningTasks.get(id)
  if (task?.jobId != null) stopDownload(task.jobId)
  const current = list.find(t => t.id == id)
  if (!current || current.status != 'run') return
  updateTask(id, { status: 'pause', statusText: global.i18n.t('download_status_pause'), speed: '' })
  save()
}

/**
 * 继续任务（重新下载）
 */
export const continueDownloadTask = (id: string) => {
  const current = list.find(t => t.id == id)
  if (!current || current.status != 'pause') return
  updateTask(id, { status: 'waiting', statusText: global.i18n.t('download_status_waiting') })
  const runtime = { ...current, jobId: null } as DownloadTaskRuntime
  waitingQueue.push(runtime)
  save()
  schedule()
}

/**
 * 重试任务
 */
export const retryDownloadTask = (id: string) => {
  const current = list.find(t => t.id == id)
  if (!current || current.status != 'error') return
  updateTask(id, { status: 'waiting', statusText: global.i18n.t('download_status_waiting'), downloaded: 0, total: 0, progress: 0, speed: '' })
  const runtime = { ...current, jobId: null } as DownloadTaskRuntime
  waitingQueue.push(runtime)
  save()
  schedule()
}

/**
 * 删除任务（同时停止下载并删除已落盘文件）
 */
export const removeDownloadTask = async(id: string) => {
  const task = runningTasks.get(id)
  if (task?.jobId != null) stopDownload(task.jobId)
  const current = list.find(t => t.id == id)
  const filePath = current?.metadata.filePath
  list = list.filter(t => t.id != id)
  emit()
  save()
  if (filePath) {
    try {
      await unlink(filePath)
    } catch (err) {
      // 文件不存在时忽略
    }
  }
}

/**
 * 添加下载任务
 * @returns false 表示列表中已存在同音质未完成任务
 */
export const addDownloadTask = async(musicInfo: LX.Music.MusicInfoOnline, quality: LX.Quality): Promise<boolean> => {
  const id = `${musicInfo.source}_${musicInfo.id}_${quality}`
  const exists = list.find(t => t.id == id)
  if (exists && !['completed', 'error'].includes(exists.status)) return false
  if (exists) list = list.filter(t => t.id != id)

  const task: DownloadTaskRuntime = {
    id,
    isComplate: false,
    status: 'waiting',
    statusText: global.i18n.t('download_status_waiting'),
    downloaded: 0,
    total: 0,
    progress: 0,
    speed: '',
    jobId: null,
    metadata: {
      musicInfo,
      url: null,
      quality,
      ext: getQualityExt(quality),
      fileName: '',
      filePath: '',
    },
  }
  list.unshift(task)
  waitingQueue.push(task)
  emit()
  save()
  schedule()
  return true
}

/**
 * 获取当前下载列表
 */
export const getDownloadList = () => [...list]

/**
 * 设置列表更新回调（由 store action 绑定到全局 state）
 */
export const setDownloadListUpdateHandler = (handler: (list: LX.Download.ListItem[]) => void) => {
  onListUpdate = handler
  if (initialized) handler([...list])
}

/**
 * 初始化：从持久化存储恢复下载列表
 */
export const initDownloadList = async() => {
  if (initialized) return
  initialized = true
  try {
    const saved = await getData<LX.Download.ListItem[]>(storageDataPrefix.downloadList)
    if (Array.isArray(saved)) {
      list = saved.map(item => ({
        ...item,
        // 上次会话中断的任务不可自动继续，统一置为暂停，等待用户操作
        status: (item.status == 'completed' ? 'completed' : 'pause'),
        statusText: item.status == 'completed' ? global.i18n.t('download_status_completed') : global.i18n.t('download_status_pause'),
        speed: '',
        metadata: {
          ...item.metadata,
          url: null,
        },
      }))
      save()
      emit()
    }
  } catch (err) {
    // 恢复失败时使用空列表
  }
}

export default {
  initDownloadList,
  addDownloadTask,
  pauseDownloadTask,
  continueDownloadTask,
  retryDownloadTask,
  removeDownloadTask,
  getDownloadList,
  setDownloadListUpdateHandler,
  formatSize,
  QUALITY_ORDER,
}
