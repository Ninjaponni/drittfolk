import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { easing } from 'maath'
import { useAvatarStore } from '../stores/avatarStore'
import { avatarPositions } from './Avatar'

// --- Parametre ---

// Circle overview (total)
const OVERVIEW_RADIUS = 14
const OVERVIEW_HEIGHT = 8
const OVERVIEW_ORBIT_SPEED = 0.02 // rad/sek

// Duel close (nær) — dynamisk avstand basert på duellant-spredning
const CLOSE_MIN_DISTANCE = 8
const CLOSE_PADDING = 4 // ekstra avstand utover halvparten av duellant-gap
const CLOSE_HEIGHT = 3.0
const CLOSE_LOOKAT_Y = 1.4

// Cinematic (siste duell)
const CINE_LOW_HEIGHT = 0.5
const CINE_LOW_DIST = 4
const CINE_SWEEP_HEIGHT = 2
const CINE_SWEEP_DIST = 3.5
const CINE_SWEEP_SPEED = 0.3 // rad/sek

// Follow-cam (manuell klikk)
const FOLLOW_DISTANCE = 6
const FOLLOW_HEIGHT = 3.5
const FOLLOW_LOOKAT_Y = 1.0
const FOLLOW_ORBIT_SPEED = Math.PI * 2 / 40

// Damping
const SMOOTH_OVERVIEW = 0.8
const SMOOTH_CLOSE = 1.5
const SMOOTH_CINEMATIC = 1.0
const SMOOTH_FOLLOW = 0.6
const SMOOTH_LOOK = 1.2
const MAX_SPEED = 4

// Hjelpevektorer
const _lookTarget = new THREE.Vector3()
const _orbitTarget = new THREE.Vector3()

type CameraMode = 'circle_overview' | 'duel_close' | 'duel_cinematic' | 'following'

export default function AutoCamera() {
  const { camera } = useThree()

  const lookAtPos = useRef(new THREE.Vector3(0, 1, 0))
  const angleRef = useRef(Math.PI / 2)
  const timeRef = useRef(0)
  const modeRef = useRef<CameraMode>('circle_overview')

  // Follow-cam
  const followAzimuthRef = useRef(0)
  const prevFocusedRef = useRef<string | null>(null)

  // Cinematic sub-phase
  const cinePhaseRef = useRef(0) // 0=low, 1=over-shoulder, 2=sweep
  const cineSweepAngle = useRef(0)

  // Spor forrige duell for kamerakutt
  const prevDuelIdRef = useRef<string | null>(null)

  useFrame((_, rawDelta) => {
    const { autoCameraEnabled, focusedId, currentDuel, roundActive } = useAvatarStore.getState()

    const dt = Math.min(rawDelta, 0.1)
    timeRef.current += dt

    // --- Follow-cam: focusedId har prioritet ---
    if (focusedId && modeRef.current !== 'following') {
      modeRef.current = 'following'
      const pos = avatarPositions.get(focusedId)
      if (pos) {
        followAzimuthRef.current = Math.atan2(
          camera.position.x - pos.x,
          camera.position.z - pos.z
        )
      }
    }
    if (!focusedId && modeRef.current === 'following') {
      modeRef.current = 'circle_overview'
      angleRef.current = Math.atan2(camera.position.z, camera.position.x)
    }
    prevFocusedRef.current = focusedId

    // --- Auto-kamera: duell-moduser ---
    if (autoCameraEnabled && modeRef.current !== 'following') {
      if (currentDuel) {
        // Ny duell? Kamerabytte
        if (currentDuel.id !== prevDuelIdRef.current) {
          prevDuelIdRef.current = currentDuel.id
          if (currentDuel.isLastDuel) {
            modeRef.current = 'duel_cinematic'
            cinePhaseRef.current = 0
            cineSweepAngle.current = 0
          } else {
            modeRef.current = 'duel_close'
          }
        }

        // Oppdater cinematic sub-phase basert på duell-fase
        if (modeRef.current === 'duel_cinematic') {
          if (currentDuel.phase === 'approach') cinePhaseRef.current = 0
          else if (currentDuel.phase === 'faceoff') cinePhaseRef.current = 2 // sweep
          else if (currentDuel.phase === 'insult') cinePhaseRef.current = 3 // tett på vinner
        }
      } else {
        // Ingen aktiv duell — tilbake til overview
        if (modeRef.current !== 'circle_overview') {
          modeRef.current = 'circle_overview'
          angleRef.current = Math.atan2(camera.position.z, camera.position.x)
          prevDuelIdRef.current = null
        }
      }
    }

    if (!autoCameraEnabled && modeRef.current !== 'following') return

    // --- Beregn mål + beveg kamera ---

    if (modeRef.current === 'following' && focusedId) {
      const pos = avatarPositions.get(focusedId)
      if (pos) {
        followAzimuthRef.current += FOLLOW_ORBIT_SPEED * dt
        _orbitTarget.set(
          pos.x + Math.sin(followAzimuthRef.current) * FOLLOW_DISTANCE,
          FOLLOW_HEIGHT,
          pos.z + Math.cos(followAzimuthRef.current) * FOLLOW_DISTANCE
        )
        _lookTarget.set(pos.x, FOLLOW_LOOKAT_Y, pos.z)
      }
      easing.damp3(camera.position, _orbitTarget, SMOOTH_FOLLOW, dt, MAX_SPEED)
      easing.damp3(lookAtPos.current, _lookTarget, SMOOTH_FOLLOW, dt)

    } else if (modeRef.current === 'circle_overview') {
      angleRef.current += OVERVIEW_ORBIT_SPEED * dt
      const angle = angleRef.current
      _orbitTarget.set(
        Math.cos(angle) * OVERVIEW_RADIUS,
        OVERVIEW_HEIGHT,
        Math.sin(angle) * OVERVIEW_RADIUS
      )
      _lookTarget.set(0, 1, 0)

      easing.damp3(camera.position, _orbitTarget, SMOOTH_OVERVIEW, dt)
      easing.damp3(lookAtPos.current, _lookTarget, SMOOTH_LOOK, dt)

    } else if (modeRef.current === 'duel_close' && currentDuel) {
      // Nær kamera — vinkelrett på duellant-linjen, dynamisk avstand
      const posA = avatarPositions.get(currentDuel.avatarA)
      const posB = avatarPositions.get(currentDuel.avatarB)

      if (posA && posB) {
        const midX = (posA.x + posB.x) / 2
        const midZ = (posA.z + posB.z) / 2
        const dx = posB.x - posA.x
        const dz = posB.z - posA.z
        const duelSpan = Math.hypot(dx, dz)
        const len = duelSpan || 1

        // Dynamisk avstand: jo lenger fra hverandre, jo lenger tilbake
        const dist = Math.max(CLOSE_MIN_DISTANCE, duelSpan / 2 + CLOSE_PADDING)

        // Vinkelrett vektor
        const perpX = -dz / len
        const perpZ = dx / len
        // Velg side basert på nåværende kameraposisjon
        const camDot = (camera.position.x - midX) * perpX + (camera.position.z - midZ) * perpZ
        const side = camDot >= 0 ? 1 : -1

        _orbitTarget.set(
          midX + perpX * dist * side,
          CLOSE_HEIGHT,
          midZ + perpZ * dist * side
        )
        _lookTarget.set(midX, CLOSE_LOOKAT_Y, midZ)
      }

      easing.damp3(camera.position, _orbitTarget, SMOOTH_CLOSE, dt, MAX_SPEED)
      easing.damp3(lookAtPos.current, _lookTarget, SMOOTH_LOOK, dt)

    } else if (modeRef.current === 'duel_cinematic' && currentDuel) {
      // Cinematic kamera — samurai-stil
      const posA = avatarPositions.get(currentDuel.avatarA)
      const posB = avatarPositions.get(currentDuel.avatarB)

      if (posA && posB) {
        const midX = (posA.x + posB.x) / 2
        const midZ = (posA.z + posB.z) / 2

        if (cinePhaseRef.current === 0) {
          // Lav vinkel opp — dramatisk approach
          _orbitTarget.set(midX + 2, CINE_LOW_HEIGHT, midZ + CINE_LOW_DIST)
          _lookTarget.set(midX, 1.5, midZ)

        } else if (cinePhaseRef.current === 1) {
          // Over-skulder fra avatar A mot B
          _orbitTarget.set(
            posA.x + (posA.x - posB.x) * 0.3,
            1.8,
            posA.z + (posA.z - posB.z) * 0.3
          )
          _lookTarget.set(posB.x, 1.4, posB.z)

        } else if (cinePhaseRef.current === 2) {
          // Langsom sweep arc
          cineSweepAngle.current += CINE_SWEEP_SPEED * dt
          _orbitTarget.set(
            midX + Math.cos(cineSweepAngle.current) * CINE_SWEEP_DIST,
            CINE_SWEEP_HEIGHT,
            midZ + Math.sin(cineSweepAngle.current) * CINE_SWEEP_DIST
          )
          _lookTarget.set(midX, 1.2, midZ)

        } else if (cinePhaseRef.current === 3) {
          // Tett på vinner under fornærmelse
          const winnerId = currentDuel.winnerId || currentDuel.avatarA
          const winnerPos = avatarPositions.get(winnerId)
          if (winnerPos) {
            const toCenter = Math.atan2(-winnerPos.x, -winnerPos.z)
            _orbitTarget.set(
              winnerPos.x + Math.sin(toCenter + 0.5) * 2.5,
              1.8,
              winnerPos.z + Math.cos(toCenter + 0.5) * 2.5
            )
            _lookTarget.set(winnerPos.x, 1.4, winnerPos.z)
          }
        }
      }

      easing.damp3(camera.position, _orbitTarget, SMOOTH_CINEMATIC, dt, MAX_SPEED)
      easing.damp3(lookAtPos.current, _lookTarget, SMOOTH_LOOK, dt)
    }

    camera.lookAt(lookAtPos.current)
    useAvatarStore.getState().setCameraLookAt(
      lookAtPos.current.x, lookAtPos.current.y, lookAtPos.current.z
    )
  })

  return null
}
