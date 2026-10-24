import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { ScrollView, TouchableOpacity, View } from 'react-native'
import { useI18n } from '@/lang'
import Modal, { type ModalType } from '@/components/common/Modal'
import { useTheme } from '@/store/theme/hook'
import { createStyle } from '@/utils/tools'
import Text from '@/components/common/Text'
import { QUALITY_ORDER } from '@/core/download'

export interface DownloadQualitySelectorType {
  show: (musicInfo: LX.Music.MusicInfoOnline) => Promise<LX.Quality | null>
}

let selectorRef: DownloadQualitySelectorType | null = null
export const setDownloadQualitySelector = (ref: DownloadQualitySelectorType | null) => {
  selectorRef = ref
}
export const showDownloadQualitySelector = (musicInfo: LX.Music.MusicInfoOnline) => {
  return selectorRef ? selectorRef.show(musicInfo) : Promise.resolve<LX.Quality | null>(null)
}

interface QualityOption {
  quality: LX.Quality
  size: string
}

/**
 * 计算可选音质：musicInfo.meta.qualitys ∩ 当前源支持列表，
 * 过滤 flac24bit 等仅少数源支持、容易拿到空 URL 的音质，并按常用顺序排序
 */
export const getDownloadableQualitys = (musicInfo: LX.Music.MusicInfoOnline): QualityOption[] => {
  const supported = global.lx.qualityList[musicInfo.source] || []
  const list: QualityOption[] = []
  for (const item of musicInfo.meta.qualitys || []) {
    if (!item?.type) continue
    if (item.type == 'flac24bit') continue
    if (!supported.includes(item.type)) continue
    list.push({ quality: item.type, size: item.size || '' })
  }
  return list.sort((a, b) => QUALITY_ORDER.indexOf(a.quality) - QUALITY_ORDER.indexOf(b.quality))
}

export default forwardRef<DownloadQualitySelectorType>((_, ref) => {
  const t = useI18n()
  const theme = useTheme()
  const modalRef = useRef<ModalType>(null)
  const [musicInfo, setMusicInfo] = useState<LX.Music.MusicInfoOnline | null>(null)
  const resolveRef = useRef<((quality: LX.Quality | null) => void) | null>(null)

  const qualitys = useMemo(() => musicInfo ? getDownloadableQualitys(musicInfo) : [], [musicInfo])

  useImperativeHandle(ref, () => ({
    show(musicInfo: LX.Music.MusicInfoOnline) {
      setMusicInfo(musicInfo)
      modalRef.current?.setVisible(true)
      return new Promise<LX.Quality | null>(resolve => {
        resolveRef.current = resolve
      })
    },
  }))

  const handleSelect = (quality: LX.Quality) => {
    resolveRef.current?.(quality)
    resolveRef.current = null
    modalRef.current?.setVisible(false)
  }
  const handleCancel = () => {
    resolveRef.current?.(null)
    resolveRef.current = null
    modalRef.current?.setVisible(false)
  }
  const handleHide = () => {
    if (!resolveRef.current) return
    resolveRef.current(null)
    resolveRef.current = null
  }

  return (
    <Modal ref={modalRef} onHide={handleHide} bgColor="rgba(0,0,0,0.4)">
      <View style={styles.container}>
        <View style={[styles.panel, { backgroundColor: theme['c-content-background'] }]}>
          <Text style={styles.title} size={15} color={theme['c-primary-font']} numberOfLines={1}>
            {musicInfo ? musicInfo.name : ''}
          </Text>
          <Text style={styles.subTitle} size={12} color={theme['c-font-label']} numberOfLines={1}>
            {t('download_quality_select_title')}
          </Text>
          {qualitys.length
            ? <ScrollView style={styles.list} bounces={false}>
                {qualitys.map(item => (
                  <TouchableOpacity
                    key={item.quality}
                    style={[styles.item, { backgroundColor: theme['c-primary-light-700-alpha-200'] }]}
                    onPress={() => handleSelect(item.quality)}
                  >
                    <Text size={14} color={theme['c-primary-font']}>{item.quality}</Text>
                    {item.size ? <Text style={styles.itemSize} size={12} color={theme['c-font-label']}>{item.size}</Text> : null}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            : <Text style={styles.emptyTip} size={13} color={theme['c-font-label']}>{t('download_no_quality_tip')}</Text>}
          <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel}>
            <Text size={14} color={theme['c-font-label']}>{t('cancel')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
})

const styles = createStyle({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  panel: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 12,
    padding: 20,
  },
  title: {
    textAlign: 'center',
  },
  subTitle: {
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 14,
  },
  list: {
    maxHeight: 280,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 8,
    paddingTop: 12,
    paddingBottom: 12,
    paddingLeft: 16,
    paddingRight: 16,
    marginBottom: 8,
  },
  itemSize: {
    marginLeft: 12,
  },
  emptyTip: {
    textAlign: 'center',
    paddingTop: 10,
    paddingBottom: 20,
  },
  cancelBtn: {
    alignItems: 'center',
    paddingTop: 14,
    paddingBottom: 2,
  },
})
