import { Html } from '@react-three/drei'
import { useState, useEffect } from 'react'

interface Props {
  text: string
  position: [number, number, number]
}

export default function SpeechBubble({ text, position }: Props) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
  }, [])

  return (
    <Html position={position} center distanceFactor={10} zIndexRange={[200, 200]} style={{ pointerEvents: 'none' }}>
      <div style={{
        background: '#fff',
        color: '#1a1a1a',
        padding: '11px 18px',
        borderRadius: '15px',
        fontSize: '15.5px',
        fontFamily: 'Inter, system-ui, sans-serif',
        width: 'max-content',
        maxWidth: '900px',
        lineHeight: '1.4',
        textWrap: 'balance',
        boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.3s ease',
        position: 'relative',
        textAlign: 'left',
      }}>
        {text}
        <div style={{
          position: 'absolute',
          bottom: '-6px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 0,
          height: 0,
          borderLeft: '6px solid transparent',
          borderRight: '6px solid transparent',
          borderTop: '6px solid #fff',
        }} />
      </div>
    </Html>
  )
}
