// To-kommentator banner — typewriter-effekt, kø-system
import { useState, useEffect, useRef, useCallback } from 'react'

interface CommentaryLine {
  speaker: 'A' | 'B'
  text: string
}

interface Props {
  lines: CommentaryLine[]
}

const CPS = 30 // tegn per sekund for typewriter
const HOLD_DURATION = 8000 // vis i 8 sekunder etter siste linje
const FADE_DURATION = 2000

export default function CommentaryBanner({ lines }: Props) {
  const [displayedLines, setDisplayedLines] = useState<Array<{ speaker: string; text: string }>>([])
  const [visible, setVisible] = useState(false)
  const [fading, setFading] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const typingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const queueRef = useRef<CommentaryLine[]>([])
  const currentIndexRef = useRef(0)
  const currentCharRef = useRef(0)

  const clearTimers = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    if (typingRef.current) clearInterval(typingRef.current)
  }, [])

  // Start typewriter for en linje
  const typeLine = useCallback((lineIndex: number) => {
    const line = queueRef.current[lineIndex]
    if (!line) {
      // Alle linjer vist — hold og fade
      timeoutRef.current = setTimeout(() => {
        setFading(true)
        timeoutRef.current = setTimeout(() => {
          setVisible(false)
          setFading(false)
          setDisplayedLines([])
        }, FADE_DURATION)
      }, HOLD_DURATION)
      return
    }

    currentCharRef.current = 0
    // Legg til tom linje
    setDisplayedLines(prev => [...prev, { speaker: line.speaker, text: '' }])

    typingRef.current = setInterval(() => {
      currentCharRef.current++
      const charCount = currentCharRef.current
      const fullText = line.text

      if (charCount >= fullText.length) {
        // Linje ferdig
        if (typingRef.current) clearInterval(typingRef.current)
        setDisplayedLines(prev => {
          const updated = [...prev]
          updated[lineIndex] = { speaker: line.speaker, text: fullText }
          return updated
        })
        // Neste linje etter kort pause
        timeoutRef.current = setTimeout(() => typeLine(lineIndex + 1), 300)
        return
      }

      setDisplayedLines(prev => {
        const updated = [...prev]
        updated[lineIndex] = { speaker: line.speaker, text: fullText.slice(0, charCount) }
        return updated
      })
    }, 1000 / CPS)
  }, [])

  // Nye linjer — start visning
  useEffect(() => {
    if (!lines || lines.length === 0) return

    clearTimers()
    queueRef.current = lines
    currentIndexRef.current = 0
    setDisplayedLines([])
    setFading(false)
    setVisible(true)

    // Start typewriter
    typeLine(0)

    return clearTimers
  }, [lines, clearTimers, typeLine])

  if (!visible || displayedLines.length === 0) return null

  return (
    <div style={{
      position: 'fixed',
      bottom: 40,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 120,
      maxWidth: 700,
      width: '90%',
      pointerEvents: 'none',
      opacity: fading ? 0 : 1,
      transition: `opacity ${FADE_DURATION}ms ease`,
    }}>
      <div style={{
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderRadius: 12,
        padding: '16px 24px',
        fontFamily: "'Inter', system-ui, sans-serif",
      }}>
        {displayedLines.map((line, i) => (
          <div key={i} style={{
            marginBottom: i < displayedLines.length - 1 ? 8 : 0,
            lineHeight: 1.5,
          }}>
            <span style={{
              fontWeight: 600,
              fontSize: 13,
              color: line.speaker === 'A' ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.7)',
              marginRight: 8,
            }}>
              {line.speaker}:
            </span>
            <span style={{
              fontSize: 14,
              color: line.speaker === 'A' ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.95)',
              fontWeight: line.speaker === 'B' ? 400 : 300,
            }}>
              {line.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
