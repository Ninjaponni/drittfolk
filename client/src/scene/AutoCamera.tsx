import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { easing } from 'maath'
import { useAvatarStore } from '../stores/avatarStore'
import { avatarPositions } from './Avatar'

// --- Parametre ---

// Wide orbit (total)
const ORBIT_RADIUS = 16
const ORBIT_HEIGHT = 5
const ORBIT_SPEED = 0.025       // rad/sek
const HEIGHT_VARIATION = 0.8
const RADIUS_VARIATION = 2

// Zoom-inn framing (interaksjoner)
const CLOSE_DISTANCE = 5
const CLOSE_HEIGHT = 2.5
const CLOSE_LOOKAT_Y = 1.6

// Drama-zoom (mob/eliminasjon)
const DRAMA_DISTANCE = 3.5
const DRAMA_HEIGHT = 2.0
const DRAMA_LOOKAT_Y = 1.2
const DRAMA_HOLD_TIME = 4 // sekunder

// Follow-cam (klikk på avatar)
const FOLLOW_DISTANCE = 6
const FOLLOW_HEIGHT = 3.5
const FOLLOW_LOOKAT_Y = 1.0
const FOLLOW_ORBIT_SPEED = Math.PI * 2 / 40  // rad/sek — 40 sek per full runde
const FOLLOW_HEIGHT_WAVE = 0.4   // vertikal bølge for levende kamera
const FOLLOW_DIST_WAVE = 0.5     // avstandsbølge

// Skip-telling
const SKIP_MIN = 2
const SKIP_MAX = 4

// Damping (sekunder)
const SMOOTH_DRIFT = 0.8
const SMOOTH_ZOOM_IN = 2.0
const SMOOTH_WATCHING = 0.5
const SMOOTH_ZOOM_OUT = 2.5
const SMOOTH_FOLLOW = 0.6
const SMOOTH_LOOK = 1.2

const MAX_SPEED_ZOOM = 4
const WATCH_TIMEOUT = 15

// Hjelpevektorer
const _mid = new THREE.Vector3()
const _perp = new THREE.Vector3()
const _camToMid = new THREE.Vector3()
const _lookTarget = new THREE.Vector3()

function randomSkipCount() {
  return SKIP_MIN + Math.floor(Math.random() * (SKIP_MAX - SKIP_MIN + 1))
}

type CameraMode = 'wide' | 'zooming_in' | 'watching' | 'zooming_out' | 'following' | 'drama'

export default function AutoCamera() {
  const { camera } = useThree()

  const lookAtPos = useRef(new THREE.Vector3(0, 1, 0))
  const angleRef = useRef(Math.PI / 2)
  const timeRef = useRef(0)
  const orbitTarget = useRef(new THREE.Vector3(0, ORBIT_HEIGHT, ORBIT_RADIUS))
  const skipCountRef = useRef(randomSkipCount())
  const seenCountRef = useRef(0)
  const trackedIdRef = useRef<string | null>(null)
  const chosenSideRef = useRef(1)
  const modeRef = useRef<CameraMode>('wide')
  const watchTimerRef = useRef(0)
  const knownIdsRef = useRef(new Set<string>())

  // Follow-cam: dampet azimuth-vinkel (lazy orbital rotation)
  const followAzimuthRef = useRef(0)
  const prevFocusedRef = useRef<string | null>(null)

  // Drama-target (mob/eliminasjon)
  const dramaTargetRef = useRef<string | null>(null)
  const dramaTimerRef = useRef(0)
  const prevMobTargetRef = useRef<string | null>(null)
  const prevEliminatedRef = useRef(new Set<string>())

  useFrame((_, rawDelta) => {
    const { autoCameraEnabled, activeInteractions, focusedId, mobTarget, experimentAvatars, roundActive } = useAvatarStore.getState()

    const dt = Math.min(rawDelta, 0.1)
    timeRef.current += dt
    const t = timeRef.current

    // Follow-cam fungerer uavhengig av auto/fri-modus
    // Resten av auto-kamera (orbit, zoom til interaksjoner) krever autoCameraEnabled

    // --- Follow-cam: focusedId har prioritet ---
    if (focusedId && modeRef.current !== 'following') {
      // Bytt til following-modus — init azimuth fra nåværende kameraposisjon
      modeRef.current = 'following'
      trackedIdRef.current = null
      watchTimerRef.current = 0
      const pos = avatarPositions.get(focusedId)
      if (pos) {
        // Start azimuth = vinkelen kameraet allerede er på relativt til avatar
        followAzimuthRef.current = Math.atan2(
          camera.position.x - pos.x,
          camera.position.z - pos.z
        )
      }
    }
    if (!focusedId && modeRef.current === 'following') {
      if (autoCameraEnabled) {
        // Auto: zoom tilbake til orbit
        modeRef.current = 'zooming_out'
        angleRef.current = Math.atan2(camera.position.z, camera.position.x)
      } else {
        // Fri: bare stopp, la OrbitControls ta over
        modeRef.current = 'wide'
      }
    }
    prevFocusedRef.current = focusedId

    // Drama-zoom: mob eller eliminasjon (kun i auto-modus, ikke i follow)
    if (autoCameraEnabled && modeRef.current !== 'following' && modeRef.current !== 'drama') {
      // Ny mob-target
      if (mobTarget && mobTarget !== prevMobTargetRef.current) {
        dramaTargetRef.current = mobTarget
        dramaTimerRef.current = 0
        modeRef.current = 'drama'
        trackedIdRef.current = null
      }
      prevMobTargetRef.current = mobTarget

      // Ny eliminasjon
      if (roundActive && experimentAvatars.size > 0) {
        for (const [id, avatar] of experimentAvatars) {
          if (!avatar.alive && !prevEliminatedRef.current.has(id)) {
            prevEliminatedRef.current.add(id)
            dramaTargetRef.current = id
            dramaTimerRef.current = 0
            modeRef.current = 'drama'
            trackedIdRef.current = null
          }
        }
      }
    }

    // Drama-modus timeout
    if (modeRef.current === 'drama') {
      dramaTimerRef.current += dt
      if (dramaTimerRef.current > DRAMA_HOLD_TIME) {
        modeRef.current = 'zooming_out'
        angleRef.current = Math.atan2(camera.position.z, camera.position.x)
        dramaTargetRef.current = null
      }
    }

    // Endgame — tettere orbit når 3 eller færre gjenlevende
    if (roundActive && autoCameraEnabled && modeRef.current === 'wide') {
      const aliveCount = Array.from(experimentAvatars.values()).filter(a => a.alive).length
      if (aliveCount > 0 && aliveCount <= 3) {
        // Tettere orbit
        const tightRadius = ORBIT_RADIUS * 0.6
        const angle = angleRef.current
        orbitTarget.current.set(
          Math.cos(angle) * tightRadius,
          ORBIT_HEIGHT * 0.7,
          Math.sin(angle) * tightRadius
        )
      }
    }

    // Resten av auto-kamera (orbit, zoom) kun i auto-modus
    if (!autoCameraEnabled && modeRef.current !== 'following' && modeRef.current !== 'drama') return

    // --- Tell nye interaksjoner ---
    for (const [id] of activeInteractions) {
      if (!knownIdsRef.current.has(id)) {
        knownIdsRef.current.add(id)
        if (modeRef.current === 'wide') {
          seenCountRef.current++
        }
      }
    }
    for (const id of knownIdsRef.current) {
      if (!activeInteractions.has(id)) {
        knownIdsRef.current.delete(id)
      }
    }

    // --- Regissør-beslutninger (kun i wide-modus) ---
    if (modeRef.current === 'wide') {
      if (seenCountRef.current >= skipCountRef.current && activeInteractions.size > 0) {
        let bestId: string | null = null
        let bestDist = Infinity
        for (const [id, interaction] of activeInteractions) {
          if (interaction.phase === 'done') continue
          const p1 = avatarPositions.get(interaction.speakerId)
          const p2 = avatarPositions.get(interaction.targetId)
          if (!p1 || !p2) continue
          const mx = (p1.x + p2.x) / 2
          const mz = (p1.z + p2.z) / 2
          const dist = Math.hypot(camera.position.x - mx, camera.position.z - mz)
          if (dist < bestDist) {
            bestDist = dist
            bestId = id
          }
        }

        if (bestId) {
          trackedIdRef.current = bestId
          const interaction = activeInteractions.get(bestId)!
          const p1 = avatarPositions.get(interaction.speakerId)
          const p2 = avatarPositions.get(interaction.targetId)
          if (p1 && p2) {
            _mid.set((p1.x + p2.x) / 2, 0, (p1.z + p2.z) / 2)
            const dx = p2.x - p1.x
            const dz = p2.z - p1.z
            const len = Math.hypot(dx, dz) || 1
            _perp.set(-dz / len, 0, dx / len)
            _camToMid.set(camera.position.x - _mid.x, 0, camera.position.z - _mid.z)
            chosenSideRef.current = (_camToMid.x * _perp.x + _camToMid.z * _perp.z) >= 0 ? 1 : -1
          }
          modeRef.current = 'zooming_in'
          seenCountRef.current = 0
          watchTimerRef.current = 0
        }
      }
    }

    // Tracked interaksjon ferdig/timeout → zoom ut
    if ((modeRef.current === 'zooming_in' || modeRef.current === 'watching') && trackedIdRef.current) {
      watchTimerRef.current += dt
      const interaction = activeInteractions.get(trackedIdRef.current)
      if (!interaction || watchTimerRef.current > WATCH_TIMEOUT) {
        modeRef.current = 'zooming_out'
        skipCountRef.current = randomSkipCount()
        angleRef.current = Math.atan2(camera.position.z, camera.position.x)
        trackedIdRef.current = null
        watchTimerRef.current = 0
      }
    }

    // --- Beregn mål + beveg kamera ---

    if (modeRef.current === 'following' && focusedId) {
      const pos = avatarPositions.get(focusedId)
      if (pos) {
        // Rolig orbit — kameraet lever og beveger seg rundt avataren
        followAzimuthRef.current += FOLLOW_ORBIT_SPEED * dt

        // Subtile bølger i avstand og høyde for organisk bevegelse
        const distWave = Math.sin(t * 0.17) * FOLLOW_DIST_WAVE
        const heightWave = Math.sin(t * 0.11 + 0.7) * FOLLOW_HEIGHT_WAVE
        const currentDist = FOLLOW_DISTANCE + distWave

        // Kameraposisjon fra orbit-vinkel
        orbitTarget.current.set(
          pos.x + Math.sin(followAzimuthRef.current) * currentDist,
          FOLLOW_HEIGHT + heightWave,
          pos.z + Math.cos(followAzimuthRef.current) * currentDist
        )
        _lookTarget.set(pos.x, FOLLOW_LOOKAT_Y, pos.z)
      }

      // Posisjon: medium damping — følger avatarens bevegelse
      easing.damp3(camera.position, orbitTarget.current, 0.4, dt, MAX_SPEED_ZOOM)
      // LookAt: litt tregere — rolig blikk
      easing.damp3(lookAtPos.current, _lookTarget, 0.6, dt)

    } else if (modeRef.current === 'wide') {
      angleRef.current += ORBIT_SPEED * dt
      const angle = angleRef.current
      const rNoise = Math.sin(t * 0.13) * RADIUS_VARIATION + Math.sin(t * 0.07 + 2) * (RADIUS_VARIATION * 0.4)
      const hNoise = Math.sin(t * 0.09) * HEIGHT_VARIATION + Math.sin(t * 0.04 + 1.3) * (HEIGHT_VARIATION * 0.3)
      orbitTarget.current.set(
        Math.cos(angle) * (ORBIT_RADIUS + rNoise),
        ORBIT_HEIGHT + hNoise,
        Math.sin(angle) * (ORBIT_RADIUS + rNoise)
      )
      _lookTarget.set(0, 1, 0)

      easing.damp3(camera.position, orbitTarget.current, SMOOTH_DRIFT, dt)
      easing.damp3(lookAtPos.current, _lookTarget, SMOOTH_LOOK, dt)

    } else if (modeRef.current === 'zooming_in' || modeRef.current === 'watching') {
      const interaction = trackedIdRef.current ? activeInteractions.get(trackedIdRef.current) : null
      if (interaction) {
        const p1 = avatarPositions.get(interaction.speakerId)
        const p2 = avatarPositions.get(interaction.targetId)
        if (p1 && p2) {
          _mid.set((p1.x + p2.x) / 2, 0, (p1.z + p2.z) / 2)
          const dx = p2.x - p1.x
          const dz = p2.z - p1.z
          const len = Math.hypot(dx, dz) || 1
          _perp.set(-dz / len, 0, dx / len)

          orbitTarget.current.copy(_mid).addScaledVector(_perp, CLOSE_DISTANCE * chosenSideRef.current)
          orbitTarget.current.y = CLOSE_HEIGHT

          _lookTarget.copy(_mid)
          _lookTarget.y = CLOSE_LOOKAT_Y
        }
      }

      const smooth = modeRef.current === 'zooming_in' ? SMOOTH_ZOOM_IN : SMOOTH_WATCHING
      easing.damp3(camera.position, orbitTarget.current, smooth, dt, MAX_SPEED_ZOOM)
      easing.damp3(lookAtPos.current, _lookTarget, SMOOTH_LOOK, dt)

      if (modeRef.current === 'zooming_in') {
        const dist = camera.position.distanceTo(orbitTarget.current)
        if (dist < 0.5) {
          modeRef.current = 'watching'
        }
      }

    } else if (modeRef.current === 'drama' && dramaTargetRef.current) {
      // Drama-zoom: tett på en spesifikk avatar (mob-offer, eliminert)
      const pos = avatarPositions.get(dramaTargetRef.current)
      if (pos) {
        // Kamera tett på, litt til siden
        const dramaAngle = Math.atan2(
          camera.position.x - pos.x,
          camera.position.z - pos.z
        )
        orbitTarget.current.set(
          pos.x + Math.sin(dramaAngle) * DRAMA_DISTANCE,
          DRAMA_HEIGHT,
          pos.z + Math.cos(dramaAngle) * DRAMA_DISTANCE
        )
        _lookTarget.set(pos.x, DRAMA_LOOKAT_Y, pos.z)
      }

      easing.damp3(camera.position, orbitTarget.current, SMOOTH_ZOOM_IN, dt, MAX_SPEED_ZOOM)
      easing.damp3(lookAtPos.current, _lookTarget, SMOOTH_LOOK, dt)

    } else if (modeRef.current === 'zooming_out') {
      angleRef.current += ORBIT_SPEED * dt
      const angle = angleRef.current
      const rNoise = Math.sin(t * 0.13) * RADIUS_VARIATION + Math.sin(t * 0.07 + 2) * (RADIUS_VARIATION * 0.4)
      const hNoise = Math.sin(t * 0.09) * HEIGHT_VARIATION + Math.sin(t * 0.04 + 1.3) * (HEIGHT_VARIATION * 0.3)
      orbitTarget.current.set(
        Math.cos(angle) * (ORBIT_RADIUS + rNoise),
        ORBIT_HEIGHT + hNoise,
        Math.sin(angle) * (ORBIT_RADIUS + rNoise)
      )
      _lookTarget.set(0, 1, 0)

      easing.damp3(camera.position, orbitTarget.current, SMOOTH_ZOOM_OUT, dt, MAX_SPEED_ZOOM)
      easing.damp3(lookAtPos.current, _lookTarget, SMOOTH_LOOK, dt)

      const dist = camera.position.distanceTo(orbitTarget.current)
      if (dist < 1) {
        modeRef.current = 'wide'
      }
    }

    camera.lookAt(lookAtPos.current)

    useAvatarStore.getState().setCameraLookAt(
      lookAtPos.current.x, lookAtPos.current.y, lookAtPos.current.z
    )
  })

  return null
}
