import { useAvatarStore } from '../stores/avatarStore'
import { PERSONALITY_LABELS } from '../../../shared/types'
import type { PersonalityType } from '../../../shared/types'

export default function StatsPanel() {
  const focusedId = useAvatarStore((s) => s.focusedId)
  const avatars = useAvatarStore((s) => s.avatars)
  const stats = useAvatarStore((s) => s.focusedStats)
  const setFocused = useAvatarStore((s) => s.setFocused)

  if (!focusedId) return null

  const avatar = avatars.find((a) => a.id === focusedId)
  if (!avatar) return null

  const personalityLabel = PERSONALITY_LABELS[avatar.personality_type as PersonalityType]?.no || avatar.personality_type

  return (
    <div className="stats-panel">
      <button className="stats-close" onClick={() => setFocused(null)}>×</button>
      <h2>{avatar.name}</h2>
      <span className="personality-badge">{personalityLabel}</span>

      <div className="stat-row">
        <div className="stat-label">Fornærmelser gitt</div>
        <div className="stat-value">{avatar.stats_insults_given}</div>
      </div>

      <div className="stat-row">
        <div className="stat-label">Fornærmelser mottatt</div>
        <div className="stat-value">{avatar.stats_insults_received}</div>
      </div>

      {stats && (
        <>
          <div className="stat-row">
            <div className="stat-label">Nemesis</div>
            <div className="stat-value">
              {stats.nemesis ? `${stats.nemesis.name} (${stats.nemesis.count} interaksjoner)` : 'Ingen ennå'}
            </div>
          </div>

          <div className="stat-row">
            <div className="stat-label">Favorittfornærmelse</div>
            <div className="stat-value">
              {stats.favorite_insult ? `"${stats.favorite_insult}"` : '—'}
            </div>
          </div>

          <div className="stat-row">
            <div className="stat-label">Verste mottatt</div>
            <div className="stat-value">
              {stats.worst_received
                ? `"${stats.worst_received.text}" — ${stats.worst_received.from}`
                : '—'}
            </div>
          </div>

          <div className="stat-row">
            <div className="stat-label">Yndlingsord</div>
            <div className="stat-value">{stats.favorite_word || '—'}</div>
          </div>
        </>
      )}

      <div className="stat-row" style={{ marginTop: 24, opacity: 0.4 }}>
        <div className="stat-label">I arenaen siden</div>
        <div className="stat-value">{new Date(avatar.created_at).toLocaleDateString('no-NB')}</div>
      </div>
    </div>
  )
}
