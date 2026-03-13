// Behavior Engine — "Hive Mind" for Dummingene
// Erstatter insultEngine.js — styrer all avatar-oppførsel server-side

import { v4 as uuid } from 'uuid'
import db from './db.js'
import { pickInsult } from './insults.js'
import { createAvatarState, updateAvatar, distanceBetween, setApproaching, setNemesisTarget, biasTowardAlliance } from './movement.js'
import { serverTimeout } from '../shared/timing.js'
import roundManager from './roundManager.js'

// Offerets svar — tilfeldig valgt, ingen LLM nødvendig
const COMEBACKS = [
  'Takk', 'Notert', 'Fascinerende', 'Greit', 'Jaha', 'Mm',
  'Interessant', 'Vel', 'Ok da', 'Skjønner', 'Videre', 'Og?',
  'Javel', 'Søtt', 'Rørende', 'Flott', 'Herlig', 'Snakk for deg selv',
  'Takk for det', 'Det var noe', 'Godt å vite', 'Spennende liv du lever',
  'Var det alt?', 'Har du det bra?', 'Beklager å høre det', 'Stakkars deg',
  'Vi er ferdige her', 'Neste', 'Uansett', 'Jeg skal tenke på det',
]

const TICK_RATE = 4 // Hz — 250ms mellom ticks
const PROXIMITY_THRESHOLD = 2.0 // meter — nærhet for interaksjon
let INTERACTION_PROBABILITY = 0.35 // 35% sjanse per tick per par — overskrives av roundManager
let PAIR_COOLDOWN_MS = 2 * 60 * 1000 // 2 minutter mellom samme par — overskrives av roundManager
const NEMESIS_CHANCE = 0.25 // 25% sjanse for å oppsøke nemesis
const NEMESIS_MIN_INTERACTIONS = 3 // minimum interaksjoner for nemesis

// Newborn-konstanter
const NEWBORN_RECEIVE_WINDOW = 30_000  // 30s — motta fornærmelse
const NEWBORN_SPEAK_WINDOW = 60_000    // 60s — gi fornærmelse
const NEWBORN_PROBABILITY = 0.95       // nesten garantert interaksjon

// Personlighets-bonus for terningkast
const PERSONALITY_BONUS = {
  aggressive: 2,
  narcissist: 2,
  dramatic: 1,
  sarcastic: 1,
  passive_aggressive: 0,
  arrogant: 0,
  sycophant: -1,
}

// Registrer ny avatar i motoren (kalles fra routes/avatars.js)
let _states = null
let _avatarData = null

// Eksporter for roundManager
export function getAvatarData() { return _avatarData }

export function registerAvatar(avatar) {
  if (!_states || !_avatarData) return
  const state = createAvatarState(avatar)
  state.registeredAt = Date.now()
  state.hasReceivedInsult = false
  state.hasGivenInsult = false
  _states.set(avatar.id, state)
  _avatarData.set(avatar.id, avatar)
  console.log(`[BehaviorEngine] Ny avatar registrert: ${avatar.name}`)

  // Legg til som late joiner hvis runde er aktiv
  if (roundManager.isActive()) {
    roundManager.addLateJoiner(avatar)
  }

  // Velkomstkomité — send nærmeste ledige avatar mot nykommeren
  scheduleWelcomeCommittee(avatar.id, state)
}

// Finn nærmeste ledige avatar og send den mot nykommeren
function scheduleWelcomeCommittee(newbornId, newbornState) {
  let closestId = null
  let closestDist = Infinity

  for (const [id, state] of _states) {
    if (id === newbornId) continue
    if (state.mode !== 'idle' && state.mode !== 'walking') continue

    const dx = state.position.x - newbornState.position.x
    const dz = state.position.z - newbornState.position.z
    const dist = Math.sqrt(dx * dx + dz * dz)
    if (dist < closestDist) {
      closestDist = dist
      closestId = id
    }
  }

  if (!closestId) return

  const greeterState = _states.get(closestId)
  const greeterData = _avatarData.get(closestId)
  const newbornData = _avatarData.get(newbornId)
  if (!greeterState) return

  setNemesisTarget(greeterState, newbornState)
  console.log(`[BehaviorEngine] Velkomstkomite: ${greeterData?.name} → ${newbornData?.name}`)
}

export function removeAvatarFromEngine(id) {
  if (_states) _states.delete(id)
  if (_avatarData) _avatarData.delete(id)
  console.log(`[BehaviorEngine] Avatar fjernet: ${id}`)
}

export async function startBehaviorEngine(io) {
  console.log('[BehaviorEngine] Starter — tick-rate:', TICK_RATE, 'Hz')

  // Hent alle avatarer fra DB og lag states
  const avatars = db.prepare('SELECT * FROM avatars').all()
  const states = new Map() // id → AvatarState
  const avatarData = new Map() // id → DB avatar data
  _states = states
  _avatarData = avatarData

  for (const avatar of avatars) {
    states.set(avatar.id, createAvatarState(avatar))
    avatarData.set(avatar.id, avatar)
  }

  console.log(`[BehaviorEngine] ${states.size} avatarer lastet`)

  // Aktive interaksjoner
  const activeInteractions = new Map() // interactionId → { speakerId, targetId, phase }
  // Par-cooldowns
  const pairCooldowns = new Map() // "id1:id2" → timestamp

  // Hoved-tick loop
  const tickInterval = 1000 / TICK_RATE
  let lastTick = Date.now()

  setInterval(() => {
    const now = Date.now()
    const delta = (now - lastTick) / 1000
    lastTick = now

    // Oppdater eskaleringsverdier fra roundManager
    if (roundManager.isActive()) {
      const esc = roundManager.getEscalation()
      INTERACTION_PROBABILITY = esc.interactionProbability
      PAIR_COOLDOWN_MS = esc.pairCooldownMs
      roundManager.tick()
    } else {
      INTERACTION_PROBABILITY = 0.35
      PAIR_COOLDOWN_MS = 2 * 60 * 1000
    }

    // Oppdater alle avatarer
    for (const [id, state] of states) {
      // Skip eliminerte avatarer
      if (roundManager.isActive() && roundManager.isEliminated(id)) continue

      const result = updateAvatar(state, delta)

      // Sjekk om approaching-avatar har ankommet
      if (result === 'arrived') {
        handleArrival(id, state, states, activeInteractions, io, avatarData)
      }

      // Nemesis-oppsøking når avatar starter ny vandring
      if (result === 'started_walking' && Math.random() < NEMESIS_CHANCE) {
        tryNemesisSeek(id, state, states, avatarData)
      }
    }

    // Flock-bevegelse — allierte dras mot hverandre
    if (roundManager.isActive()) {
      for (const [id, state] of states) {
        if (roundManager.isEliminated(id)) continue
        const expAvatar = roundManager.experimentAvatars.get(id)
        if (!expAvatar?.allianceId) continue
        const alliance = roundManager.alliances.get(expAvatar.allianceId)
        if (!alliance) continue
        // Samle posisjoner til andre levende alliansemedlemmer
        const allyStates = alliance.members
          .filter(mid => mid !== id && !roundManager.isEliminated(mid))
          .map(mid => states.get(mid))
          .filter(Boolean)
        if (allyStates.length > 0) {
          biasTowardAlliance(state, allyStates)
        }
      }
    }

    // Nærhetsjekk — finn potensielle interaksjoner
    checkProximity(states, avatarData, activeInteractions, pairCooldowns, io, now)
  }, tickInterval)
}

// Sjekk nærhet mellom alle avatarer
function checkProximity(states, avatarData, activeInteractions, pairCooldowns, io, now) {
  const stateArray = Array.from(states.entries())
  const maxConcurrent = Math.max(1, Math.floor(stateArray.length / 5))
  const currentCount = activeInteractions.size

  if (currentCount >= maxConcurrent) return

  for (let i = 0; i < stateArray.length; i++) {
    const [idA, stateA] = stateArray[i]
    if (stateA.mode === 'interacting' || stateA.mode === 'approaching') continue
    // Skip eliminerte avatarer
    if (roundManager.isActive() && roundManager.isEliminated(idA)) continue

    for (let j = i + 1; j < stateArray.length; j++) {
      const [idB, stateB] = stateArray[j]
      if (stateB.mode === 'interacting' || stateB.mode === 'approaching') continue
      // Skip eliminerte avatarer
      if (roundManager.isActive() && roundManager.isEliminated(idB)) continue

      const dist = distanceBetween(stateA, stateB)
      if (dist >= PROXIMITY_THRESHOLD) continue

      // Sjekk om noen av de to er newborn
      const stateAObj = stateA
      const stateBObj = stateB
      const ageA = stateAObj.registeredAt ? now - stateAObj.registeredAt : Infinity
      const ageB = stateBObj.registeredAt ? now - stateBObj.registeredAt : Infinity
      const hasNewborn = ageA < NEWBORN_RECEIVE_WINDOW || ageB < NEWBORN_RECEIVE_WINDOW
        || ageA < NEWBORN_SPEAK_WINDOW || ageB < NEWBORN_SPEAK_WINDOW

      // Sjekk cooldown — hopp over for newborn-par
      const pairKey = [idA, idB].sort().join(':')
      const lastInteraction = pairCooldowns.get(pairKey) || 0
      if (!hasNewborn && now - lastInteraction < PAIR_COOLDOWN_MS) continue

      // Sannsynlighetssjekk — boosted for newborn
      const probability = hasNewborn ? NEWBORN_PROBABILITY : INTERACTION_PROBABILITY
      if (Math.random() > probability) continue

      // Sjekk kapasitet
      if (activeInteractions.size >= maxConcurrent) return

      // Terningkast — hvem snakker først?
      const avatarA = avatarData.get(idA)
      const avatarB = avatarData.get(idB)
      if (!avatarA || !avatarB) continue

      const { speaker, target } = rollForSpeaker(avatarA, avatarB, states)
      const speakerState = states.get(speaker.id)
      const targetState = states.get(target.id)

      // Start interaksjon — begge går mot midtpunktet
      const interactionId = uuid()
      const midpoint = {
        x: (speakerState.position.x + targetState.position.x) / 2,
        z: (speakerState.position.z + targetState.position.z) / 2,
      }
      // Offset litt fra midtpunktet slik at de stopper face-to-face
      const dx = targetState.position.x - speakerState.position.x
      const dz = targetState.position.z - speakerState.position.z
      const len = Math.sqrt(dx * dx + dz * dz) || 1
      const offset = 0.2 // halvt approach-avstand
      setApproaching(speakerState, { x: midpoint.x - (dx / len) * offset, z: midpoint.z - (dz / len) * offset })
      setApproaching(targetState, { x: midpoint.x + (dx / len) * offset, z: midpoint.z + (dz / len) * offset })
      speakerState.partnerId = target.id
      targetState.partnerId = speaker.id

      activeInteractions.set(interactionId, {
        speakerId: speaker.id,
        targetId: target.id,
        phase: 'approaching',
        arrivedCount: 0,
      })

      // Sett cooldown med en gang
      pairCooldowns.set(pairKey, now)

      io.emit('interaction-start', {
        id: interactionId,
        speakerId: speaker.id,
        targetId: target.id,
      })

      console.log(`[BehaviorEngine] Interaksjon startet: ${speaker.name} → ${target.name}`)
      break // bare ett par per tick
    }
  }
}

// Når en approaching-avatar ankommer
function handleArrival(avatarId, state, states, activeInteractions, io, avatarData) {
  // Finn interaksjonen denne avataren er del av
  for (const [interactionId, interaction] of activeInteractions) {
    if (interaction.speakerId !== avatarId && interaction.targetId !== avatarId) continue
    if (interaction.phase !== 'approaching') continue

    interaction.arrivedCount++

    // Begge må ha ankommet
    if (interaction.arrivedCount < 2) {
      state.mode = 'interacting'
      return
    }

    // Begge er fremme — sett begge til interacting
    state.mode = 'interacting'
    const otherState = states.get(
      interaction.speakerId === avatarId ? interaction.targetId : interaction.speakerId
    )
    if (otherState) otherState.mode = 'interacting'

    interaction.phase = 'talking'

    // Generer dialog via Claude
    const speaker = avatarData.get(interaction.speakerId)
    const target = avatarData.get(interaction.targetId)
    if (!speaker || !target) return

    generateDialogue(interactionId, speaker, target, interaction, states, activeInteractions, io)
    return
  }
}

// Generer dialog fra ferdigskrevet pool (ingen LLM)
function generateDialogue(interactionId, speaker, target, interaction, states, activeInteractions, io) {
  let insultText = pickInsult()

  if (!insultText) {
    // Alle 58 i cooldown — svært usannsynlig, men håndtert
    finishInteraction(interactionId, states, activeInteractions, io)
    return
  }

  // Navn-injeksjon (~70% sjanse) — legg til targetnavnet på slutten
  if (Math.random() < 0.7 && !insultText.toLowerCase().includes(target.name.toLowerCase())) {
    insultText = insultText.replace(/[.!?]*$/, '') + `, ${target.name}.`
  }

  // Offeret velger et tilfeldig svar fra ferdig liste
  const reply = COMEBACKS[Math.floor(Math.random() * COMEBACKS.length)]

  const validatedLines = [
    { speaker: 'speaker', text: insultText },
    { speaker: 'target', text: reply },
  ]

  // Broadcast dialoglinjer
  io.emit('interaction-lines', {
    id: interactionId,
    lines: validatedLines,
  })

  // Lagre i DB
  const dbId = uuid()
  db.prepare(`
    INSERT INTO interactions (id, speaker_id, target_id, dialogue, response_dialogue, speaker_animation, target_animation)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(dbId, speaker.id, target.id, insultText, reply, 'talking', 'idle')

  // Oppdater stats
  db.prepare(`UPDATE avatars SET stats_insults_given = stats_insults_given + 1, last_interaction_at = datetime('now') WHERE id = ?`)
    .run(speaker.id)
  db.prepare(`UPDATE avatars SET stats_insults_received = stats_insults_received + 1, last_interaction_at = datetime('now') WHERE id = ?`)
    .run(target.id)

  // Marker newborn-flagg
  const speakerState = states.get(speaker.id)
  const targetState = states.get(target.id)
  if (speakerState) speakerState.hasGivenInsult = true
  if (targetState) targetState.hasReceivedInsult = true

  // Logg til roundManager hvis runde er aktiv
  if (roundManager.isActive()) {
    roundManager.logInsult(speaker.id, target.id)
  }

  console.log(`[BehaviorEngine] ${speaker.name} → ${target.name}: "${insultText.slice(0, 60)}"`)

  // CPS-basert timeout — matcher klientens dynamiske varighet
  const dialogDuration = serverTimeout(insultText, reply)
  setTimeout(() => {
    finishInteraction(interactionId, states, activeInteractions, io)
  }, dialogDuration)
}

// Avslutt interaksjon — sett avatarer tilbake til idle
function finishInteraction(interactionId, states, activeInteractions, io) {
  const interaction = activeInteractions.get(interactionId)
  if (!interaction) return

  const speakerState = states.get(interaction.speakerId)
  const targetState = states.get(interaction.targetId)

  if (speakerState) {
    speakerState.mode = 'idle'
    speakerState.timer = 1 + Math.random() * 3
    speakerState.partnerId = null
    speakerState.approachTarget = null
  }

  if (targetState) {
    targetState.mode = 'idle'
    targetState.timer = 1 + Math.random() * 3
    targetState.partnerId = null
    targetState.approachTarget = null
  }

  activeInteractions.delete(interactionId)

  io.emit('interaction-end', { id: interactionId })
}

// Vektet terningkast — hvem snakker først
function rollForSpeaker(avatarA, avatarB, states) {
  const bonus = (personality) => PERSONALITY_BONUS[personality] || 0

  // Hent hevnlyst (antall fornærmelser mottatt fra motparten)
  const revengeA = getRevengeBonus(avatarA.id, avatarB.id)
  const revengeB = getRevengeBonus(avatarB.id, avatarA.id)

  // Newborn speaker-boost: avatarer mellom 30-60s som ikke har gitt fornærmelse
  const now = Date.now()
  const newbornBonus = (id) => {
    const state = states?.get(id)
    if (!state?.registeredAt) return 0
    const age = now - state.registeredAt
    if (age >= NEWBORN_RECEIVE_WINDOW && age < NEWBORN_SPEAK_WINDOW && !state.hasGivenInsult) return 5
    return 0
  }

  const rollA = Math.floor(Math.random() * 6) + 1 + bonus(avatarA.personality_type) + revengeA + newbornBonus(avatarA.id)
  const rollB = Math.floor(Math.random() * 6) + 1 + bonus(avatarB.personality_type) + revengeB + newbornBonus(avatarB.id)

  if (rollA >= rollB) {
    return { speaker: avatarA, target: avatarB }
  }
  return { speaker: avatarB, target: avatarA }
}

// Hevnlyst-bonus: +1 per 3 fornærmelser mottatt, maks +3
function getRevengeBonus(victimId, aggressorId) {
  const row = db.prepare(`
    SELECT COUNT(*) as count FROM interactions
    WHERE speaker_id = ? AND target_id = ?
  `).get(aggressorId, victimId)
  return Math.min(3, Math.floor((row?.count || 0) / 3))
}

// Nemesis-oppsøking — 25% sjanse når avatar starter ny vandring
function tryNemesisSeek(avatarId, state, states, avatarData) {
  // Finn nemesis (avataren med flest gjensidige interaksjoner)
  const row = db.prepare(`
    SELECT
      CASE WHEN speaker_id = ? THEN target_id ELSE speaker_id END as other_id,
      COUNT(*) as count
    FROM interactions
    WHERE speaker_id = ? OR target_id = ?
    GROUP BY other_id
    ORDER BY count DESC
    LIMIT 1
  `).get(avatarId, avatarId, avatarId)

  if (!row || row.count < NEMESIS_MIN_INTERACTIONS) return

  const nemesisState = states.get(row.other_id)
  if (!nemesisState) return
  if (nemesisState.mode === 'interacting' || nemesisState.mode === 'approaching') return

  const nemesis = avatarData.get(row.other_id)
  setNemesisTarget(state, nemesisState)
  console.log(`[BehaviorEngine] ${avatarData.get(avatarId)?.name} oppsøker nemesis ${nemesis?.name}`)
}
