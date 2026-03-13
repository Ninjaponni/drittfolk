// Server-side bevegelsessimulering — speiler client/src/systems/movement.ts
// Brukes av behaviorEngine for nærhetsjekk

const ARENA_SIZE = 15
const MIN_IDLE_TIME = 3
const MAX_IDLE_TIME = 8
const ARRIVAL_DISTANCE = 0.5
const ROTATION_SPEED = 4

// Lag en ny avatar-state basert på DB-data
export function createAvatarState(avatar) {
  return {
    id: avatar.id,
    position: { x: avatar.position_x || 0, y: 0, z: avatar.position_z || 0 },
    target: { x: avatar.position_x || 0, y: 0, z: avatar.position_z || 0 },
    rotation: Math.random() * Math.PI * 2,
    mode: 'idle', // 'idle' | 'walking' | 'approaching' | 'interacting'
    timer: Math.random() * 5,
    speed: 0.8 + Math.random() * 0.4,
    // Interaksjonsdata
    partnerId: null,
    approachTarget: null, // { x, z } — brukes i approaching-modus
    // Newborn-tracking
    registeredAt: null,
    hasReceivedInsult: true,  // default true — overstyrres for nye avatarer
    hasGivenInsult: true,
  }
}

function randomTarget() {
  return {
    x: (Math.random() - 0.5) * ARENA_SIZE * 2,
    y: 0,
    z: (Math.random() - 0.5) * ARENA_SIZE * 2,
  }
}

// Oppdater én avatar — returnerer true hvis den byttet til idle (for nemesis-sjekk)
export function updateAvatar(state, delta) {
  if (state.mode === 'interacting') return false

  if (state.mode === 'approaching' && state.approachTarget) {
    // Gå mot interaksjonspartner
    const dx = state.approachTarget.x - state.position.x
    const dz = state.approachTarget.z - state.position.z
    const dist = Math.sqrt(dx * dx + dz * dz)

    if (dist < 0.5) {
      // Nær nok — klar for interaksjon
      return 'arrived'
    }

    // Roter mot mål
    const targetAngle = Math.atan2(dx, dz)
    let angleDiff = targetAngle - state.rotation
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2
    state.rotation += angleDiff * Math.min(1, ROTATION_SPEED * delta)

    // Beveg framover
    const step = Math.min(state.speed * delta, dist)
    const len = Math.sqrt(dx * dx + dz * dz)
    state.position.x += (dx / len) * step
    state.position.z += (dz / len) * step
    return false
  }

  if (state.mode === 'idle') {
    state.timer -= delta
    if (state.timer <= 0) {
      state.target = randomTarget()
      state.mode = 'walking'
      return 'started_walking' // signaliser at vi kan vurdere nemesis
    }
    return false
  }

  // Walking
  const dx = state.target.x - state.position.x
  const dz = state.target.z - state.position.z
  const dist = Math.sqrt(dx * dx + dz * dz)

  if (dist < ARRIVAL_DISTANCE) {
    state.mode = 'idle'
    state.timer = MIN_IDLE_TIME + Math.random() * (MAX_IDLE_TIME - MIN_IDLE_TIME)
    return false
  }

  // Roter mot mål
  const targetAngle = Math.atan2(dx, dz)
  let angleDiff = targetAngle - state.rotation
  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2
  state.rotation += angleDiff * Math.min(1, ROTATION_SPEED * delta)

  // Beveg framover
  const step = Math.min(state.speed * delta, dist)
  const len = Math.sqrt(dx * dx + dz * dz)
  state.position.x += (dx / len) * step
  state.position.z += (dz / len) * step
  return false
}

// Avstand mellom to avatarer
export function distanceBetween(a, b) {
  const dx = a.position.x - b.position.x
  const dz = a.position.z - b.position.z
  return Math.sqrt(dx * dx + dz * dz)
}

// Sett avatar til å nærme seg et punkt
export function setApproaching(state, targetPos) {
  state.mode = 'approaching'
  state.approachTarget = { x: targetPos.x, z: targetPos.z }
}

// Sett avatar til å oppsøke en annen avatar
export function setNemesisTarget(state, nemesisState) {
  state.target = { x: nemesisState.position.x, y: 0, z: nemesisState.position.z }
  state.mode = 'walking'
}

// Bias bevegelse mot allianse-centroid (flock-bevegelse)
export function biasTowardAlliance(state, allianceMembers) {
  if (!allianceMembers || allianceMembers.length === 0) return
  if (state.mode !== 'walking' && state.mode !== 'idle') return

  // Beregn centroid av allierte
  let cx = 0, cz = 0
  for (const member of allianceMembers) {
    cx += member.position.x
    cz += member.position.z
  }
  cx /= allianceMembers.length
  cz /= allianceMembers.length

  // Blend target med centroid (30% mot alliansen)
  if (state.mode === 'walking') {
    state.target.x = state.target.x * 0.7 + cx * 0.3
    state.target.z = state.target.z * 0.7 + cz * 0.3
  }
}
