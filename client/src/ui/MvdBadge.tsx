import { useState, useEffect } from 'react'
import { fetchMVD } from '../api/avatars'
import type { MvdData } from '../api/avatars'
import { useAvatarStore } from '../stores/avatarStore'

// Poller MVD hvert 60. sekund
export default function MvdBadge() {
  const [mvd, setMvd] = useState<MvdData | null>(null)
  const avatars = useAvatarStore((s) => s.avatars)
  const setFocused = useAvatarStore((s) => s.setFocused)

  useEffect(() => {
    let active = true

    async function poll() {
      try {
        const data = await fetchMVD()
        if (active) setMvd(data)
      } catch { /* ignorer feil */ }
    }

    poll()
    const interval = setInterval(poll, 60_000)
    return () => { active = false; clearInterval(interval) }
  }, [])

  if (!mvd) return null

  return (
    <div className="mvd-badge" title="Most Valuable Dumming — den mest aktive dummingen siste 24 timer">
      <div className="mvd-title">MVD</div>
      <div
        className="mvd-name nemesis-link"
        onClick={() => {
          const avatar = avatars.find((a) => a.id === mvd.id)
          if (avatar) setFocused(avatar.id)
        }}
      >
        {mvd.name}
      </div>
      <div className="mvd-count">{mvd.interaction_count} interaksjoner siste 24t</div>
    </div>
  )
}
