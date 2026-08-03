import { useEffect } from 'react'
import Avatar from './Avatar'
import { useAvatarStore } from '../stores/avatarStore'
import { useWebSocket } from '../hooks/useWebSocket'

export default function Arena() {
  const avatars = useAvatarStore((s) => s.avatars)
  const fetchAvatars = useAvatarStore((s) => s.fetchAvatars)

  // WebSocket — lytter etter interaksjons-events
  useWebSocket()

  useEffect(() => {
    fetchAvatars()
  }, []) // eslint-disable-line -- kjør kun ved mount

  return (
    <group>
      {avatars.map((avatar) => (
        <Avatar key={avatar.id} data={avatar} />
      ))}
    </group>
  )
}
