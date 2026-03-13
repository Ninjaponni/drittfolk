import { useRef, useEffect, useCallback } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import * as THREE from 'three'
import { useAvatarStore } from '../stores/avatarStore'
import Arena from './Arena'
import AutoCamera from './AutoCamera'

const ZOOM_SPEED = 1.5       // scroll-sensitivitet
const ZOOM_LERP_RATE = 3     // damping (lavere = tregere)
const MIN_DISTANCE = 5
const MAX_DISTANCE = 60

// Dampet zoom — OrbitControls håndterer alt unntatt zoom
function DampedZoom() {
  const { camera, gl } = useThree()
  const targetDistance = useRef(camera.position.length())
  const controlsEnabled = useRef(true)

  const autoCameraEnabled = useAvatarStore((s) => s.autoCameraEnabled)
  const focusedId = useAvatarStore((s) => s.focusedId)
  controlsEnabled.current = !autoCameraEnabled && !focusedId

  const handleWheel = useCallback((e: WheelEvent) => {
    if (!controlsEnabled.current) return
    e.preventDefault()
    const delta = e.deltaY > 0 ? ZOOM_SPEED : -ZOOM_SPEED
    targetDistance.current = Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE,
      targetDistance.current + delta
    ))
  }, [])

  useEffect(() => {
    const canvas = gl.domElement
    canvas.addEventListener('wheel', handleWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', handleWheel)
  }, [gl, handleWheel])

  useFrame((_, rawDelta) => {
    if (!controlsEnabled.current) {
      // Synk target med faktisk avstand når vi ikke kontrollerer
      targetDistance.current = camera.position.length()
      return
    }
    const dt = Math.min(rawDelta, 0.1)
    const currentDist = camera.position.length()
    const newDist = currentDist + (targetDistance.current - currentDist) * (1 - Math.exp(-ZOOM_LERP_RATE * dt))
    if (Math.abs(newDist - currentDist) > 0.001) {
      camera.position.multiplyScalar(newDist / currentDist)
    }
  })

  return null
}

export default function Scene() {
  const controlsRef = useRef<OrbitControlsImpl>(null)
  const autoCameraEnabled = useAvatarStore((s) => s.autoCameraEnabled)
  const focusedId = useAvatarStore((s) => s.focusedId)
  const cameraLookAt = useAvatarStore((s) => s.cameraLookAt)

  // Synk OrbitControls target når auto-kamera slås av eller follow-cam avsluttes
  useEffect(() => {
    if (!autoCameraEnabled && !focusedId && controlsRef.current) {
      controlsRef.current.target.set(...cameraLookAt)
      controlsRef.current.update()
    }
  }, [autoCameraEnabled, focusedId])

  return (
    <>
      {/* Hvit uendelighet — sterkt ambient + mild retningslys */}
      <color attach="background" args={['#ffffff']} />
      <ambientLight intensity={1.2} />
      <directionalLight position={[10, 20, 10]} intensity={0.8} />


      {/* Usynlig gulvplan — fanger klikk som bommer på avatarer */}
      <mesh
        rotation-x={-Math.PI / 2}
        position={[0, -0.01, 0]}
        onClick={() => {
          const store = useAvatarStore.getState()
          if (store.focusedId) store.setFocused(null)
          else if (store.autoCameraEnabled) store.toggleAutoCamera()
        }}
      >
        <planeGeometry args={[200, 200]} />
        <meshBasicMaterial visible={false} side={THREE.DoubleSide} />
      </mesh>

      <Arena />
      <AutoCamera />

      <DampedZoom />
      <OrbitControls
        ref={controlsRef}
        makeDefault
        enabled={!autoCameraEnabled && !focusedId}
        enableZoom={false}
        enableDamping
        dampingFactor={0.03}
        maxPolarAngle={Math.PI / 2.2}
      />
    </>
  )
}
