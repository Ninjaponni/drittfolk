import * as THREE from 'three'

const ARENA_SIZE = 15 // halv bredde — avatarer holder seg innenfor ±15
const MIN_IDLE_TIME = 3
const MAX_IDLE_TIME = 8
const ARRIVAL_DISTANCE = 0.5
const ROTATION_SPEED = 4
const SEPARATION_RADIUS = 1.2  // meter — begynn å dytte unna
const SEPARATION_FORCE = 1.5   // styrke på frastøting

export interface MovementState {
  position: THREE.Vector3
  target: THREE.Vector3
  rotation: number
  mode: 'idle' | 'walking' | 'interacting'
  timer: number
  speed: number
}

function randomTarget(): THREE.Vector3 {
  return new THREE.Vector3(
    (Math.random() - 0.5) * ARENA_SIZE * 2,
    0,
    (Math.random() - 0.5) * ARENA_SIZE * 2,
  )
}

// Separasjon — dytt avatarer fra hverandre så de ikke overlapper
const _sepVec = new THREE.Vector3()
function applySeparation(
  state: MovementState,
  myId: string,
  others: Map<string, { x: number; z: number }>,
  delta: number,
) {
  _sepVec.set(0, 0, 0)
  for (const [id, pos] of others) {
    if (id === myId) continue
    const dx = state.position.x - pos.x
    const dz = state.position.z - pos.z
    const distSq = dx * dx + dz * dz
    if (distSq < SEPARATION_RADIUS * SEPARATION_RADIUS && distSq > 0.001) {
      const dist = Math.sqrt(distSq)
      // Kraftigere frastøting jo nærmere de er
      const strength = (SEPARATION_RADIUS - dist) / SEPARATION_RADIUS
      _sepVec.x += (dx / dist) * strength
      _sepVec.z += (dz / dist) * strength
    }
  }
  if (_sepVec.lengthSq() > 0) {
    _sepVec.normalize().multiplyScalar(SEPARATION_FORCE * delta)
    state.position.add(_sepVec)
  }
}

export function useMovement(state: MovementState) {
  return {
    update(delta: number, myId?: string, others?: Map<string, { x: number; z: number }>) {
      // Separasjon gjelder alltid (også i idle) — unntatt interaksjon
      if (myId && others && state.mode !== 'interacting') {
        applySeparation(state, myId, others, delta)
      }

      if (state.mode === 'interacting') return

      if (state.mode === 'idle') {
        state.timer -= delta
        if (state.timer <= 0) {
          state.target.copy(randomTarget())
          state.mode = 'walking'
        }
        return
      }

      // Walking
      const dir = new THREE.Vector3().subVectors(state.target, state.position)
      dir.y = 0
      const dist = dir.length()

      if (dist < ARRIVAL_DISTANCE) {
        state.mode = 'idle'
        state.timer = MIN_IDLE_TIME + Math.random() * (MAX_IDLE_TIME - MIN_IDLE_TIME)
        return
      }

      // Roter mot mål
      const targetAngle = Math.atan2(dir.x, dir.z)
      let angleDiff = targetAngle - state.rotation
      // Normaliser til [-PI, PI]
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2
      state.rotation += angleDiff * Math.min(1, ROTATION_SPEED * delta)

      // Beveg framover
      const step = Math.min(state.speed * delta, dist)
      dir.normalize().multiplyScalar(step)
      state.position.add(dir)
    },
  }
}
