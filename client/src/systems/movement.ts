import * as THREE from 'three'

// Forenklet bevegelsessystem for Mexican Standoff
// Bare punkt-til-punkt bevegelse med rotasjon — ingen random walk, ingen separasjon

const ARRIVAL_DISTANCE = 0.3
const ROTATION_SPEED = 4

export interface MovementState {
  position: THREE.Vector3
  target: THREE.Vector3
  rotation: number
  mode: 'idle' | 'walking' | 'interacting'
  timer: number
  speed: number
}

export function useMovement(state: MovementState) {
  return {
    // Gå mot target — returnerer true når fremme
    update(delta: number): boolean {
      if (state.mode === 'interacting' || state.mode === 'idle') return false

      // Walking — beveg mot target
      const dir = new THREE.Vector3().subVectors(state.target, state.position)
      dir.y = 0
      const dist = dir.length()

      if (dist < ARRIVAL_DISTANCE) {
        state.mode = 'idle'
        return true // ankommet
      }

      // Roter mot mål
      const targetAngle = Math.atan2(dir.x, dir.z)
      let angleDiff = targetAngle - state.rotation
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2
      state.rotation += angleDiff * Math.min(1, ROTATION_SPEED * delta)

      // Beveg framover
      const step = Math.min(state.speed * delta, dist)
      dir.normalize().multiplyScalar(step)
      state.position.add(dir)

      return false
    },

    // Sett mål og start gåing
    walkTo(x: number, z: number) {
      state.target.set(x, 0, z)
      state.mode = 'walking'
    },

    // Roter mot et punkt (uten å bevege seg)
    facePoint(x: number, z: number, delta: number) {
      const dx = x - state.position.x
      const dz = z - state.position.z
      const targetAngle = Math.atan2(dx, dz)
      let angleDiff = targetAngle - state.rotation
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2
      state.rotation += angleDiff * Math.min(1, 6 * delta)
    },
  }
}
