import * as THREE from 'three'

const ARENA_SIZE = 40 // halv bredde — avatarer holder seg innenfor ±40
const MIN_IDLE_TIME = 3
const MAX_IDLE_TIME = 8
const ARRIVAL_DISTANCE = 0.5
const ROTATION_SPEED = 4

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

export function useMovement(state: MovementState) {
  return {
    update(delta: number) {
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
