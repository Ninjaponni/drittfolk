import { useCallback } from 'react'
import { Canvas } from '@react-three/fiber'
import Scene from './scene/Scene'
import MenuBar from './ui/MenuBar'
import StatsPanel from './ui/StatsPanel'
import SearchBar from './ui/SearchBar'
import MvdBadge from './ui/MvdBadge'
import CommentaryBanner from './ui/CommentaryBanner'
import RoundHud from './ui/RoundHud'
import { useAutoHide } from './hooks/useAutoHide'
import { useAvatarStore } from './stores/avatarStore'
import './ui/styles/ui.css'

export default function App() {
  const uiVisible = useAutoHide(8000)
  const autoCameraEnabled = useAvatarStore((s) => s.autoCameraEnabled)
  const toggleAutoCamera = useAvatarStore((s) => s.toggleAutoCamera)
  const roundActive = useAvatarStore((s) => s.roundActive)
  const roundTimeRemaining = useAvatarStore((s) => s.roundTimeRemaining)
  const currentCommentary = useAvatarStore((s) => s.currentCommentary)
  const killFeed = useAvatarStore((s) => s.killFeed)
  const popCommentary = useAvatarStore((s) => s.popCommentary)

  return (
    <>
      <Canvas
        camera={{ position: [0, 8, 20], fov: 50 }}
        style={{ position: 'fixed', inset: 0, zIndex: 0 }}
        onPointerMissed={() => {
          const store = useAvatarStore.getState()
          if (store.focusedId) store.setFocused(null)
        }}
      >
        <Scene />
      </Canvas>
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 10, opacity: uiVisible ? 1 : 0, transition: 'opacity 0.5s ease' }}>
        <MenuBar />
        <SearchBar />
        <MvdBadge />
      </div>
      <StatsPanel />

      {/* Runde-HUD */}
      {roundActive && (
        <RoundHud
          timeRemaining={roundTimeRemaining}
          killFeed={killFeed}
        />
      )}

      {/* Kommentator-banner */}
      {currentCommentary && (
        <CommentaryBanner
          key={currentCommentary.trigger + '-' + currentCommentary.lines.map(l => l.text).join('')}
          lines={currentCommentary.lines}
        />
      )}

      {/* Auto-kamera toggle */}
      <button
        onClick={toggleAutoCamera}
        className="auto-camera-btn"
        style={{ opacity: uiVisible ? 1 : 0 }}
        title={autoCameraEnabled ? 'Slå av auto-kamera' : 'Slå på auto-kamera'}
      >
        {autoCameraEnabled ? 'AUTO' : 'FRI'}
      </button>
    </>
  )
}
