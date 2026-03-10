import { Html } from '@react-three/drei'
import { useState, useEffect } from 'react'

interface Props {
  text: string
  position: [number, number, number]
  duration?: number
  onDone?: () => void
}

export default function SpeechBubble({ text, position, duration = 5000, onDone }: Props) {
  const [fading, setFading] = useState(false)

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFading(true), duration - 500)
    const removeTimer = setTimeout(() => onDone?.(), duration)
    return () => {
      clearTimeout(fadeTimer)
      clearTimeout(removeTimer)
    }
  }, [duration, onDone])

  return (
    <Html position={position} center style={{ pointerEvents: 'none' }}>
      <div className={`speech-bubble ${fading ? 'fading' : ''}`}>
        {text}
      </div>
    </Html>
  )
}
