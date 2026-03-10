import { useEffect } from 'react'
import Avatar from './Avatar'
import { useAvatarStore } from '../stores/avatarStore'

export default function Arena() {
  const avatars = useAvatarStore((s) => s.avatars)
  const fetchAvatars = useAvatarStore((s) => s.fetchAvatars)

  useEffect(() => {
    fetchAvatars()
  }, [fetchAvatars])

  return (
    <group>
      {avatars.map((avatar) => (
        <Avatar key={avatar.id} data={avatar} />
      ))}
    </group>
  )
}
