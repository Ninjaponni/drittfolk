import { useState, useEffect, useRef, useMemo } from 'react'
import { useAvatarStore, isOwnAvatar } from '../stores/avatarStore'
import { PERSONALITY_LABELS } from '../../../shared/types'
import type { PersonalityType } from '../../../shared/types'

// Formater levetid på norsk
function formatAge(createdAt: string): string {
  const ms = Date.now() - new Date(createdAt).getTime()
  const mins = Math.floor(ms / 60000)
  const hours = Math.floor(mins / 60)
  const days = Math.floor(hours / 24)
  if (mins < 60) return `${mins} min`
  if (hours < 24) return `${hours} t ${mins % 60} min`
  const restH = hours % 24
  return `${days} ${days === 1 ? 'dag' : 'dager'}${restH > 0 ? ` ${restH} t` : ''}`
}

export default function StatsPanel() {
  const focusedId = useAvatarStore((s) => s.focusedId)
  const avatars = useAvatarStore((s) => s.avatars)
  const stats = useAvatarStore((s) => s.focusedStats)
  const setFocused = useAvatarStore((s) => s.setFocused)
  const removeAvatar = useAvatarStore((s) => s.removeAvatar)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const panelRef = useRef<HTMLDivElement>(null)

  // Follow-modus avsluttes med X-knapp, klikk utenfor, eller klikk på annen avatar

  if (!focusedId) return null

  const avatar = avatars.find((a) => a.id === focusedId)
  if (!avatar) return null

  const personalityLabel = PERSONALITY_LABELS[avatar.personality_type as PersonalityType]?.no || avatar.personality_type

  return (
    <div className="stats-panel" ref={panelRef}>
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
              {stats.nemesis ? (
                <span
                  className="nemesis-link"
                  onClick={() => {
                    const nemesis = avatars.find((a) => a.name === stats.nemesis!.name)
                    if (nemesis) setFocused(nemesis.id)
                  }}
                >
                  {stats.nemesis.name} ({stats.nemesis.count} interaksjoner)
                </span>
              ) : 'Ingen ennå'}
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

        </>
      )}

      <div className="stat-row" style={{ marginTop: 24, opacity: 0.4 }}>
        <div className="stat-label">Levd i denne verden</div>
        <div className="stat-value">{formatAge(avatar.created_at)}</div>
      </div>

      {isOwnAvatar(avatar.id) && (
        <div style={{ marginTop: 24, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 16 }}>
          {!confirmDelete ? (
            <button className="stats-delete-btn" onClick={() => setConfirmDelete(true)}>
              Ta livet av {avatar.name}
            </button>
          ) : (
            <div>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>
                Er du sikker? Dette kan ikke angres.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="stats-delete-btn confirm" onClick={() => removeAvatar(avatar.id)}>
                  Ja, drep
                </button>
                <button className="stats-delete-btn cancel" onClick={() => setConfirmDelete(false)}>
                  Angre
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
