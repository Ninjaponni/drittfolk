// Minimal runde-HUD — timer + kill feed
import { useState, useEffect, useRef } from 'react'

interface KillFeedEntry {
  id: string
  text: string
  timestamp: number
}

interface Props {
  timeRemaining: number  // sekunder
  killFeed: KillFeedEntry[]
}

const FEED_DISPLAY_COUNT = 4
const FEED_FADE_MS = 10_000

export default function RoundHud({ timeRemaining, killFeed }: Props) {
  // Timer
  const mins = Math.floor(Math.max(0, timeRemaining) / 60)
  const secs = Math.floor(Math.max(0, timeRemaining) % 60)
  const timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`

  // Filtrer feed — vis siste N entries, fade ut gamle
  const now = Date.now()
  const visibleFeed = killFeed
    .slice(-FEED_DISPLAY_COUNT)
    .map(entry => ({
      ...entry,
      opacity: Math.max(0, 1 - (now - entry.timestamp) / FEED_FADE_MS),
    }))
    .filter(entry => entry.opacity > 0)

  // Force re-render for fade
  const [, setTick] = useState(0)
  const tickRef = useRef<ReturnType<typeof setInterval>>(undefined)
  useEffect(() => {
    tickRef.current = setInterval(() => setTick(t => t + 1), 500)
    return () => { if (tickRef.current) clearInterval(tickRef.current) }
  }, [])

  return (
    <>
      {/* Timer — topp-venstre */}
      <div style={{
        position: 'fixed',
        top: 16,
        left: 24,
        zIndex: 110,
        fontFamily: "'Inter', system-ui, sans-serif",
        fontSize: 16,
        fontWeight: 300,
        letterSpacing: '0.05em',
        color: timeRemaining < 60 ? 'rgba(200, 50, 50, 0.7)' : 'rgba(0, 0, 0, 0.35)',
        userSelect: 'none',
        pointerEvents: 'none',
        transition: 'color 0.5s ease',
      }}>
        {timeStr}
      </div>

      {/* Kill feed — topp-høyre */}
      {visibleFeed.length > 0 && (
        <div style={{
          position: 'fixed',
          top: 50,
          right: 24,
          zIndex: 110,
          fontFamily: "'Inter', system-ui, sans-serif",
          pointerEvents: 'none',
          userSelect: 'none',
          maxWidth: 280,
        }}>
          {visibleFeed.map(entry => (
            <div key={entry.id} style={{
              fontSize: 11,
              color: `rgba(0, 0, 0, ${0.45 * entry.opacity})`,
              marginBottom: 4,
              opacity: entry.opacity,
              transition: 'opacity 0.5s ease',
              lineHeight: 1.4,
            }}>
              {entry.text}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
