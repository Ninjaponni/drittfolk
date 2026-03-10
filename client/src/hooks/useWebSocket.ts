import { useEffect, useRef, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import type { InsultEvent, Avatar } from '../../../shared/types'

type InsultHandler = (event: InsultEvent) => void
type NewAvatarHandler = (avatar: Avatar) => void

export function useWebSocket(onInsult: InsultHandler, onNewAvatar: NewAvatarHandler) {
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    const socket = io({ transports: ['websocket'] })
    socketRef.current = socket

    socket.on('insult', (event: InsultEvent) => {
      onInsult(event)
    })

    socket.on('new-avatar', (avatar: Avatar) => {
      onNewAvatar(avatar)
    })

    return () => {
      socket.disconnect()
    }
  }, []) // bevisst tom deps — handlers via ref

  return socketRef
}
