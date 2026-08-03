// Duel Engine — Mexican Standoff for Drittfolk
// Erstatter behaviorEngine.js — styrer sirkelposisjonering, duellkø og timing

import { v4 as uuid } from 'uuid'
import db from './db.js'
import { pickInsult } from './insults.js'
import { lineDuration, SERVER_BUFFER } from '../shared/timing.js'
import roundManager from './roundManager.js'

// Personlighets-bonus for terningkast (gjenbruk fra behaviorEngine)
const PERSONALITY_BONUS = {
  aggressive: 2,
  narcissist: 2,
  dramatic: 1,
  sarcastic: 1,
  passive_aggressive: 0,
  arrogant: 0,
  sycophant: -1,
}

const CIRCLE_RADIUS = 8 // meter
const APPROACH_TIME = 3500 // ms — tid til å gå til sentrum
const FACEOFF_TIME = 2000 // ms — spenningspause
const POST_DEATH_DWELL = 3000 // ms — kamera dveler på dødsanimasjon
const POST_DUEL_PAUSE = 3000 // ms — pause mellom dueller
const WINNER_SCREEN_TIME = 20000 // ms — feiring
const RESET_COUNTDOWN = 60 // sekunder
const PRE_ROUND_COUNTDOWN = 5 // sekunder — nedtelling før runde
const DIP_TO_BLACK_TIME = 2000 // ms — fade til/fra svart

let _io = null
let _avatarData = null // Map<id, avatar>
let _states = null // Map<id, state>
let _resetTimer = null
let _fightCount = new Map() // Map<id, antall kamper denne runden> — fairness-tracking

// Eksporter for server.js
export function getAvatarData() { return _avatarData }

// Hent sirkeldata for klienter som kobler til mid-round
export function getCircleState() {
  if (!_states || !_avatarData) return null
  const slots = []
  let totalSlots = 0
  for (const [id, state] of _states.entries()) {
    if (state.slotIndex >= 0) {
      slots.push({ avatarId: id, slotIndex: state.slotIndex })
      totalSlots = Math.max(totalSlots, state.slotIndex + 1)
    }
  }
  if (slots.length === 0) return null
  return { slots, totalSlots }
}

export function registerAvatar(avatar) {
  if (!_states || !_avatarData) return
  _states.set(avatar.id, {
    id: avatar.id,
    position: { x: avatar.position_x || 0, z: avatar.position_z || 0 },
    rotation: Math.random() * Math.PI * 2,
    slotIndex: -1,
  })
  _avatarData.set(avatar.id, avatar)
  console.log(`[DuelEngine] Ny avatar registrert: ${avatar.name}`)

  if (roundManager.isActive()) {
    roundManager.addLateJoiner(avatar)
  }
}

export function removeAvatarFromEngine(id) {
  if (_states) _states.delete(id)
  if (_avatarData) _avatarData.delete(id)
  console.log(`[DuelEngine] Avatar fjernet: ${id}`)
}

export async function startDuelEngine(io) {
  console.log('[DuelEngine] Starter — Mexican Standoff modus')
  _io = io

  const avatars = db.prepare('SELECT * FROM avatars').all()
  _states = new Map()
  _avatarData = new Map()

  for (const avatar of avatars) {
    _states.set(avatar.id, {
      id: avatar.id,
      position: { x: avatar.position_x || 0, z: avatar.position_z || 0 },
      rotation: Math.random() * Math.PI * 2,
      slotIndex: -1,
    })
    _avatarData.set(avatar.id, avatar)
  }

  console.log(`[DuelEngine] ${_states.size} avatarer lastet`)
}

// Beregn sirkelposisjon fra slotIndex
function circlePosition(slotIndex, totalSlots) {
  const angle = (slotIndex / totalSlots) * Math.PI * 2 - Math.PI / 2
  return {
    x: Math.cos(angle) * CIRCLE_RADIUS,
    z: Math.sin(angle) * CIRCLE_RADIUS,
  }
}

// Beregn rotasjon mot sentrum (face innover)
function rotationToCenter(pos) {
  return Math.atan2(-pos.x, -pos.z)
}

// Start en runde — nedtelling, dip-to-black, plasser i sirkel
export function startRound() {
  if (!_avatarData || _avatarData.size < 2) {
    console.log('[DuelEngine] Trenger minst 2 avatarer')
    return null
  }

  if (_resetTimer) {
    clearTimeout(_resetTimer)
    _resetTimer = null
  }

  // Reset fairness-tracking
  _fightCount = new Map()

  const roundId = roundManager.startRound(_avatarData)
  if (!roundId) return null

  // Nedtelling 5...4...3...2...1
  for (let i = PRE_ROUND_COUNTDOWN; i >= 1; i--) {
    setTimeout(() => {
      _io.emit('round-countdown', { count: i })
    }, (PRE_ROUND_COUNTDOWN - i) * 1000)
  }

  // Etter nedtelling: dip-to-black
  setTimeout(() => {
    _io.emit('dip-to-black', { duration: DIP_TO_BLACK_TIME })

    // Midt i svart: sett opp sirkelen
    setTimeout(() => {
      const avatarIds = Array.from(_avatarData.keys())
      const totalSlots = avatarIds.length
      const slots = []

      for (let i = 0; i < avatarIds.length; i++) {
        const id = avatarIds[i]
        const state = _states.get(id)
        if (state) {
          state.slotIndex = i
          const pos = circlePosition(i, totalSlots)
          state.position = pos
          state.rotation = rotationToCenter(pos)
        }
        slots.push({ avatarId: id, slotIndex: i })
      }

      _io.emit('circle-setup', { slots, totalSlots })
      console.log(`[DuelEngine] Sirkel satt opp med ${totalSlots} avatarer`)

      // Vent til fade-tilbake er ferdig, start dueller
      setTimeout(() => runDuelRound(), DIP_TO_BLACK_TIME / 2 + 1000)

    }, DIP_TO_BLACK_TIME / 2) // Halvveis i fade = helt svart

  }, PRE_ROUND_COUNTDOWN * 1000)

  return roundId
}

// Kjør en full runde med dueller
async function runDuelRound() {
  const alive = getAliveAvatarIds()
  if (alive.length <= 1) {
    roundManager.endRound()
    showWinnerScreen()
    return
  }

  // Bygg duellpar — sekvensielt rundt sirkelen
  const pairs = buildDuelPairs(alive)
  const totalDuels = pairs.length

  for (let i = 0; i < pairs.length; i++) {
    // Sjekk om runden fortsatt er aktiv
    if (!roundManager.isActive()) return

    const [avatarA, avatarB] = pairs[i]
    // Sjekk at begge fortsatt lever (kan ha blitt eliminert i mellomtiden)
    if (roundManager.isEliminated(avatarA) || roundManager.isEliminated(avatarB)) continue

    await runDuel(avatarA, avatarB, i + 1, totalDuels)

    // Sjekk om runden er over
    const remaining = getAliveAvatarIds()
    if (remaining.length <= 1) {
      roundManager.endRound()
      showWinnerScreen()
      return
    }
  }

  // Etter alle dueller — sjekk om vi trenger neste runde
  const remaining = getAliveAvatarIds()
  if (remaining.length <= 1) {
    roundManager.endRound()
    showWinnerScreen()
  } else {
    // Flere gjenlevende — kjør neste runde av dueller
    setTimeout(() => runDuelRound(), POST_DUEL_PAUSE)
  }
}

// Bygg duellpar — tilfeldig trekning med fairness
// Alle må kjempe én gang før noen kjemper to ganger
function buildDuelPairs(aliveIds) {
  // Finn minste antall kamper blant gjenlevende
  const minFights = Math.min(...aliveIds.map(id => _fightCount.get(id) || 0))

  // Prioriter de som har færrest kamper
  const priority = aliveIds.filter(id => (_fightCount.get(id) || 0) === minFights)
  const rest = aliveIds.filter(id => (_fightCount.get(id) || 0) > minFights)

  // Bland prioritetslisten tilfeldig
  for (let i = priority.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [priority[i], priority[j]] = [priority[j], priority[i]]
  }

  // Bland resten tilfeldig
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]]
  }

  // Sett sammen: prioritet først, deretter rest
  const pool = [...priority, ...rest]

  const pairs = []
  const used = new Set()

  for (let i = 0; i < pool.length; i++) {
    if (used.has(pool[i])) continue
    for (let j = i + 1; j < pool.length; j++) {
      if (used.has(pool[j])) continue
      pairs.push([pool[i], pool[j]])
      used.add(pool[i])
      used.add(pool[j])
      // Oppdater kampteller
      _fightCount.set(pool[i], (_fightCount.get(pool[i]) || 0) + 1)
      _fightCount.set(pool[j], (_fightCount.get(pool[j]) || 0) + 1)
      break
    }
  }

  // Oddetall: siste uten partner får bye
  for (const id of pool) {
    if (!used.has(id)) {
      console.log(`[DuelEngine] ${_avatarData.get(id)?.name} får bye`)
    }
  }

  return pairs
}

// Kjør én duell
function runDuel(avatarAId, avatarBId, duelNumber, totalDuels) {
  return new Promise((resolve) => {
    const duelId = uuid()
    const avatarA = _avatarData.get(avatarAId)
    const avatarB = _avatarData.get(avatarBId)
    const isLastDuel = (getAliveAvatarIds().length <= 3)

    console.log(`[DuelEngine] Duell ${duelNumber}/${totalDuels}: ${avatarA?.name} vs ${avatarB?.name}${isLastDuel ? ' (CINEMATIC)' : ''}`)

    // Oppdater roundManager med aktuell duell
    roundManager.setCurrentDuel({
      id: duelId,
      avatarA: avatarAId,
      avatarB: avatarBId,
      duelNumber,
      totalDuels,
      isLastDuel,
    })

    // 1. Emit duel-start (med navn og personlighetstype for VS-kort)
    _io.emit('duel-start', {
      id: duelId,
      avatarA: avatarAId,
      avatarB: avatarBId,
      nameA: avatarA?.name || '?',
      nameB: avatarB?.name || '?',
      personalityA: avatarA?.personality_type || 'aggressive',
      personalityB: avatarB?.personality_type || 'aggressive',
      duelNumber,
      totalDuels,
      isLastDuel,
    })

    // 2. Vent approach-animasjon
    setTimeout(() => {
      // 3. Faceoff — spenningspause
      _io.emit('duel-faceoff', { id: duelId })

      setTimeout(() => {
        // 4. Rull vinner
        const { speaker: winner, target: loser } = rollForSpeaker(avatarA, avatarB)

        // 5. Generer fornærmelse
        let insultText = pickInsult()
        if (!insultText) insultText = 'Du er patetisk.'

        // Navn-injeksjon
        if (Math.random() < 0.7 && !insultText.toLowerCase().includes(loser.name.toLowerCase())) {
          insultText = insultText.replace(/[.!?]*$/, '') + `, ${loser.name}.`
        }

        // Emit fornærmelse (KUN én linje — ingen comeback)
        // Inkluder speakerId slik at klienten vet hvem som snakker
        _io.emit('interaction-lines', {
          id: duelId,
          speakerId: winner.id,
          lines: [{ speaker: 'speaker', text: insultText, tone: 'aggressive' }],
        })

        // Lagre i DB
        try {
          const dbId = uuid()
          db.prepare(`
            INSERT INTO interactions (id, speaker_id, target_id, dialogue, response_dialogue, speaker_animation, target_animation)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(dbId, winner.id, loser.id, insultText, '', 'talking', 'death')

          db.prepare(`UPDATE avatars SET stats_insults_given = stats_insults_given + 1, last_interaction_at = datetime('now') WHERE id = ?`).run(winner.id)
          db.prepare(`UPDATE avatars SET stats_insults_received = stats_insults_received + 1, last_interaction_at = datetime('now') WHERE id = ?`).run(loser.id)
        } catch (err) {
          console.warn('[DuelEngine] DB-feil under duell:', err.message)
        }

        // Logg hendelse
        roundManager.logEvent({
          type: 'insult',
          timestamp: Date.now(),
          data: { speakerId: winner.id, targetId: loser.id, speakerName: winner.name, targetName: loser.name },
          description: `${winner.name} fornærmet ${loser.name} i duell`,
        })

        // 6. Vent dialog-varighet
        const dialogMs = lineDuration(insultText) * 1000 + SERVER_BUFFER * 1000

        setTimeout(() => {
          // 7. Emit duell-resultat
          _io.emit('duel-result', {
            id: duelId,
            winnerId: winner.id,
            loserId: loser.id,
          })

          // 8. Eliminer taper
          const aliveCount = getAliveAvatarIds().length
          const rank = aliveCount // rank = antall gjenlevende (inkl. denne)
          roundManager.eliminateAvatar(loser.id, winner.id)

          // 9. Vent — kamera dveler på dødsanimasjon
          setTimeout(() => {
            // 10. Duel-end — kamera klipper til total, kropp teleporteres
            _io.emit('duel-end', { id: duelId })
            roundManager.setCurrentDuel(null)

            // Trigger kommentar etter duellen
            roundManager.triggerReactiveCommentary('duel-result')

            // 11. Vent for vinner å gå tilbake + pause
            setTimeout(() => {
              resolve()
            }, APPROACH_TIME + POST_DUEL_PAUSE)

          }, POST_DEATH_DWELL)

        }, dialogMs)

      }, FACEOFF_TIME)

    }, APPROACH_TIME)
  })
}

// Vektet terningkast — hvem vinner
function rollForSpeaker(avatarA, avatarB) {
  const bonus = (personality) => PERSONALITY_BONUS[personality] || 0
  const revengeA = getRevengeBonus(avatarA.id, avatarB.id)
  const revengeB = getRevengeBonus(avatarB.id, avatarA.id)

  const rollA = Math.floor(Math.random() * 6) + 1 + bonus(avatarA.personality_type) + revengeA
  const rollB = Math.floor(Math.random() * 6) + 1 + bonus(avatarB.personality_type) + revengeB

  if (rollA >= rollB) {
    return { speaker: avatarA, target: avatarB }
  }
  return { speaker: avatarB, target: avatarA }
}

function getRevengeBonus(victimId, aggressorId) {
  const row = db.prepare(`
    SELECT COUNT(*) as count FROM interactions
    WHERE speaker_id = ? AND target_id = ?
  `).get(aggressorId, victimId)
  return Math.min(3, Math.floor((row?.count || 0) / 3))
}

// Hent gjenlevende avatar-IDer
function getAliveAvatarIds() {
  const alive = []
  for (const id of _avatarData.keys()) {
    if (!roundManager.isEliminated(id)) {
      alive.push(id)
    }
  }
  return alive
}

// Vinner-skjerm + auto-reset
function showWinnerScreen() {
  console.log('[DuelEngine] Vinner-skjerm — 20s feiring')

  setTimeout(() => {
    console.log(`[DuelEngine] Reset-nedtelling: ${RESET_COUNTDOWN}s`)
    _io.emit('round-reset', { countdown: RESET_COUNTDOWN })

    _resetTimer = setTimeout(() => {
      console.log('[DuelEngine] Auto-start ny runde')
      roundManager.reset()
      startRound()
    }, RESET_COUNTDOWN * 1000)

  }, WINNER_SCREEN_TIME)
}
