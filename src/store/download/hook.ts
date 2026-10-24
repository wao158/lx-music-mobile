import { useEffect, useState } from 'react'
import state from './state'

export const useDownloadList = () => {
  const [list, setList] = useState<LX.Download.ListItem[]>(state.list)

  useEffect(() => {
    const handleUpdate = (list: LX.Download.ListItem[]) => {
      setList([...list])
    }
    global.state_event.on('downloadListUpdated', handleUpdate)
    return () => {
      global.state_event.off('downloadListUpdated', handleUpdate)
    }
  }, [])

  return list
}
