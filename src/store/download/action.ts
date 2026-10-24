import state, { type InitState } from './state'
import downloadCore from '@/core/download'

const handleListUpdate = (list: LX.Download.ListItem[]) => {
  state.list = list
  global.state_event.downloadListUpdated(list)
}

// 绑定下载管理器 -> store 的更新通道，并在启动时恢复持久化的下载列表
downloadCore.setDownloadListUpdateHandler(handleListUpdate)
void downloadCore.initDownloadList()

export default {
  initList() {
    return downloadCore.initDownloadList()
  },
  async addDownloadTask(musicInfo: LX.Music.MusicInfoOnline, quality: LX.Quality): Promise<boolean> {
    return downloadCore.addDownloadTask(musicInfo, quality)
  },
  pauseDownloadTask(id: string) {
    downloadCore.pauseDownloadTask(id)
  },
  continueDownloadTask(id: string) {
    downloadCore.continueDownloadTask(id)
  },
  retryDownloadTask(id: string) {
    downloadCore.retryDownloadTask(id)
  },
  async removeDownloadTask(id: string) {
    await downloadCore.removeDownloadTask(id)
  },
}
