import { memo, useCallback } from 'react'
import { FlatList, TouchableOpacity, View } from 'react-native'
import { useI18n } from '@/lang'
import { useDownloadList } from '@/store/download/hook'
import downloadAction from '@/store/download/action'
import { useTheme } from '@/store/theme/hook'
import { createStyle, confirmDialog } from '@/utils/tools'
import { QUALITY_ORDER } from '@/core/download'
import Text from '@/components/common/Text'
import { Icon } from '@/components/common/Icon'

const getQualitySize = (musicInfo: LX.Music.MusicInfoOnline, quality: LX.Quality) => {
  const qualityInfo = musicInfo.meta.qualitys.find(q => q.type == quality)
  return qualityInfo?.size || ''
}

const StatusText = ({ task }: { task: LX.Download.ListItem }) => {
  const t = useI18n()
  const theme = useTheme()
  switch (task.status) {
    case 'waiting':
      return <Text color={theme['c-font-label']} size={12}>{t('download_status_waiting')}</Text>
    case 'run':
      return <Text color={theme['c-primary']} size={12}>{t('download_status_running')} {task.speed ? ` · ${task.speed}` : ''}</Text>
    case 'pause':
      return <Text color={theme['c-font-label']} size={12}>{t('download_status_pause')}</Text>
    case 'error':
      return <Text color="#e74c3c" size={12}>{task.statusText || t('download_status_error')}</Text>
    case 'completed':
      return <Text color={theme['c-primary']} size={12}>{t('download_status_completed')}</Text>
    default:
      return null
  }
}

const TaskItem = memo(({ task }: { task: LX.Download.ListItem }) => {
  const t = useI18n()
  const theme = useTheme()
  const progress = Math.max(0, Math.min(task.progress || 0, 1))

  const handlePause = () => downloadAction.pauseDownloadTask(task.id)
  const handleContinue = () => downloadAction.continueDownloadTask(task.id)
  const handleRetry = () => downloadAction.retryDownloadTask(task.id)
  const handleRemove = useCallback(async() => {
    const isConfirm = await confirmDialog({
      message: t('download_remove_confirm_tip', { name: task.metadata.musicInfo.name }),
    })
    if (!isConfirm) return
    void downloadAction.removeDownloadTask(task.id)
  }, [task, t])

  return (
    <View style={styles.item}>
      <View style={styles.itemHeader}>
        <Text
          style={styles.itemName}
          size={14}
          color={theme['c-primary-font']}
          numberOfLines={1}
        >{task.metadata.musicInfo.name}</Text>
        <Text style={styles.itemQuality} size={11} color={theme['c-font-label']}>
          {task.metadata.quality}{getQualitySize(task.metadata.musicInfo, task.metadata.quality) ? ` · ${getQualitySize(task.metadata.musicInfo, task.metadata.quality)}` : ''}
        </Text>
      </View>
      <View style={styles.itemSub}>
        <Text style={styles.itemSinger} size={12} color={theme['c-font-label']} numberOfLines={1}>
          {task.metadata.musicInfo.singer} · {task.metadata.ext}
        </Text>
        <StatusText task={task} />
      </View>

      {task.status != 'completed'
        ? <View style={styles.progressWrap}>
            <View style={[styles.progressInner, { width: `${progress * 100}%` }]} />
          </View>
        : null}

      <View style={styles.itemActions}>
        {task.status == 'run'
          ? <ActionBtn icon="pause" label={t('download_pause')} onPress={handlePause} />
          : task.status == 'pause'
            ? <ActionBtn icon="play" label={t('download_continue')} onPress={handleContinue} />
            : task.status == 'error'
              ? <ActionBtn icon="download-2" label={t('download_retry')} onPress={handleRetry} />
              : task.status == 'waiting'
                ? <Text size={11} color={theme['c-font-label']}>{t('download_waitting_tip')}</Text>
                : null}
        <ActionBtn icon="remove" label={t('delete')} onPress={() => void handleRemove()} />
      </View>
    </View>
  )
})

const ActionBtn = ({ icon, label, onPress }: { icon: string, label: string, onPress: () => void }) => {
  const theme = useTheme()
  return (
    <TouchableOpacity style={styles.actionBtn} onPress={onPress}>
      <Icon name={icon} size={14} color={theme['c-font-label']} />
      <Text style={styles.actionText} size={11} color={theme['c-font-label']}>{label}</Text>
    </TouchableOpacity>
  )
}

export default memo(() => {
  const t = useI18n()
  const theme = useTheme()
  const list = useDownloadList()

  const renderItem = useCallback(({ item }: { item: LX.Download.ListItem }) => (
    <TaskItem task={item} />
  ), [])

  const ListEmptyComponent = useCallback(() => (
    <View style={styles.empty}>
      <Icon name="download-2" size={48} color={theme['c-font-label']} />
      <Text style={styles.emptyText} color={theme['c-font-label']}>{t('download_list_empty')}</Text>
    </View>
  ), [theme, t])

  return (
    <FlatList
      data={list}
      keyExtractor={item => item.id}
      renderItem={renderItem}
      ListEmptyComponent={ListEmptyComponent}
      contentContainerStyle={list.length ? undefined : styles.emptyWrap}
    />
  )
})

const styles = createStyle({
  emptyWrap: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  empty: {
    alignItems: 'center',
  },
  emptyText: {
    marginTop: 12,
  },
  item: {
    paddingTop: 12,
    paddingBottom: 8,
    paddingLeft: 15,
    paddingRight: 15,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemName: {
    flex: 1,
    marginRight: 8,
  },
  itemQuality: {
    maxWidth: 110,
  },
  itemSub: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  itemSinger: {
    flex: 1,
    marginRight: 8,
  },
  progressWrap: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
    marginTop: 10,
    overflow: 'hidden',
  },
  progressInner: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#4caf50',
  },
  itemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 4,
    paddingRight: 16,
  },
  actionText: {
    marginLeft: 4,
  },
})
