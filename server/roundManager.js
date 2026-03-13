// Sentral rundekontroller for sosialt eksperiment
// Håndterer round lifecycle, eskalering, hendelseslogg, elimineringer

import { v4 as uuid } from 'uuid'
import {
  createExperimentAvatar,
  calculateStatusChange,
  calculateResilienceDamage,
  applyResilienceDrain,
  checkAllianceFormation,
  checkAllianceBreaks,
  isBetrayal,
  rankAvatars,
  getModifiers,
} from './socialEngine.js'
import db from './db.js'

const ROUND_DURATION = 10 * 60 * 1000 // 10 minutter
const STATUS_BROADCAST_INTERVAL = 5_000 // hvert 5. sekund
const ALLIANCE_CHECK_INTERVAL = 20_000 // hvert 20. sekund
const DRAIN_INTERVAL = 1_000 // hvert sekund
const PROACTIVE_COMMENTARY_MIN = 15_000 // minst 15s mellom proaktive
const PROACTIVE_COMMENTARY_MAX = 25_000 // maks 25s

// Eskalering — interpoleres lineært
const ESCALATION = {
  interactionProbability: { start: 0.20, end: 0.70 },
  pairCooldownMs:         { start: 90_000, end: 10_000 },
  resilienceDrainPerMin:  { start: 0.5, end: 3.0 },
  allianceHealingPerMin:  { start: 0.5, end: 0.05 },
}

function lerp(a, b, t) {
  return a + (b - a) * Math.max(0, Math.min(1, t))
}

class RoundManager {
  constructor() {
    this.phase = 'idle' // idle | running | endgame | finished
    this.roundId = null
    this.startedAt = null
    this.experimentAvatars = new Map()   // id → ExperimentAvatar
    this.alliances = new Map()           // allianceId → Alliance
    this.eventBuffer = []                // rullende hendelseslogg
    this.io = null
    this.commentaryCallback = null       // settes av behaviorEngine
    this.lastStatusBroadcast = 0
    this.lastAllianceCheck = 0
    this.lastDrain = 0
    this.lastProactiveCommentary = 0
    this.nextProactiveDelay = PROACTIVE_COMMENTARY_MIN
    this.lastReactiveCommentary = 0
    this.eliminationOrder = 0
    this.pendingCommentaryTrigger = null  // kø for neste kommentar-trigger
  }

  // Initialiser med socket.io-instans
  init(io) {
    this.io = io
  }

  // Sett callback for kommentar-generering
  setCommentaryCallback(callback) {
    this.commentaryCallback = callback
  }

  // Start ny runde med alle aktive avatarer
  startRound(avatarDataMap) {
    if (this.phase !== 'idle' && this.phase !== 'finished') {
      console.log('[RoundManager] Kan ikke starte — runde allerede aktiv')
      return null
    }

    this.roundId = uuid()
    this.startedAt = Date.now()
    this.phase = 'running'
    this.experimentAvatars.clear()
    this.alliances.clear()
    this.eventBuffer = []
    this.eliminationOrder = 0
    this.lastStatusBroadcast = Date.now()
    this.lastAllianceCheck = Date.now()
    this.lastDrain = Date.now()
    this.lastProactiveCommentary = Date.now()
    this.lastReactiveCommentary = 0
    this.nextProactiveDelay = PROACTIVE_COMMENTARY_MIN

    // Opprett ExperimentAvatar for alle
    const participants = []
    for (const [id, avatar] of avatarDataMap) {
      const expAvatar = createExperimentAvatar(avatar)
      this.experimentAvatars.set(id, expAvatar)
      participants.push({
        id,
        name: avatar.name,
        personalityType: avatar.personality_type,
      })
    }

    // Lagre i DB
    db.prepare(`
      INSERT INTO rounds (id, started_at, participant_count)
      VALUES (?, datetime('now'), ?)
    `).run(this.roundId, participants.length)

    for (const p of participants) {
      db.prepare(`
        INSERT INTO round_participants (round_id, avatar_id)
        VALUES (?, ?)
      `).run(this.roundId, p.id)
    }

    // Broadcast
    this.io?.emit('round-start', {
      roundId: this.roundId,
      participants,
      duration: ROUND_DURATION / 1000,
    })

    console.log(`[RoundManager] Runde startet: ${this.roundId} med ${participants.length} deltakere`)
    return this.roundId
  }

  // Legg til late joiner
  addLateJoiner(avatar) {
    if (this.phase !== 'running' && this.phase !== 'endgame') return null

    const minutesIn = (Date.now() - this.startedAt) / 60_000
    const expAvatar = createExperimentAvatar(avatar, minutesIn)
    this.experimentAvatars.set(avatar.id, expAvatar)

    // Lagre i DB
    db.prepare(`
      INSERT INTO round_participants (round_id, avatar_id)
      VALUES (?, ?)
    `).run(this.roundId, avatar.id)

    // Oppdater deltakertall
    db.prepare(`
      UPDATE rounds SET participant_count = participant_count + 1 WHERE id = ?
    `).run(this.roundId)

    const event = {
      type: 'late-join',
      timestamp: Date.now(),
      data: { avatarId: avatar.id, name: avatar.name, resilience: expAvatar.resilience },
      description: `${avatar.name} har meldt seg inn med ${expAvatar.resilience} resilience`,
    }
    this.logEvent(event)

    this.io?.emit('late-join', {
      avatar: {
        id: avatar.id,
        name: avatar.name,
        personalityType: avatar.personality_type,
        resilience: expAvatar.resilience,
        status: expAvatar.status,
      },
    })

    // Trigger kommentar
    this.triggerReactiveCommentary('late-join')

    console.log(`[RoundManager] Late joiner: ${avatar.name} (resilience: ${expAvatar.resilience})`)
    return expAvatar
  }

  // Hovedtick — kalles fra behaviorEngine sin setInterval
  tick() {
    if (this.phase !== 'running' && this.phase !== 'endgame') return

    const now = Date.now()
    const elapsed = now - this.startedAt
    const progress = elapsed / ROUND_DURATION // 0 → 1

    // Sjekk om runden er over (tid)
    if (elapsed >= ROUND_DURATION) {
      this.endRound()
      return
    }

    // Endgame: 3 eller færre gjenlevende
    const aliveCount = this.getAliveCount()
    if (aliveCount <= 3 && this.phase === 'running') {
      this.phase = 'endgame'
      console.log('[RoundManager] Endgame — 3 eller færre gjenlevende')
    }

    // Endgame: bare 1 igjen → avslutt
    if (aliveCount <= 1) {
      this.endRound()
      return
    }

    // Periodisk resilience-drenering (hvert sekund)
    if (now - this.lastDrain >= DRAIN_INTERVAL) {
      this.drainResilience(progress)
      this.lastDrain = now
    }

    // Periodisk allianse-sjekk (hvert 20. sekund)
    if (now - this.lastAllianceCheck >= ALLIANCE_CHECK_INTERVAL) {
      this.checkAlliances()
      this.lastAllianceCheck = now
    }

    // Periodisk status-broadcast (hvert 5. sekund)
    if (now - this.lastStatusBroadcast >= STATUS_BROADCAST_INTERVAL) {
      this.broadcastStatus()
      this.lastStatusBroadcast = now
    }

    // Proaktiv kommentering (stille perioder)
    if (now - this.lastProactiveCommentary >= this.nextProactiveDelay) {
      if (now - this.lastReactiveCommentary > 15_000) {
        this.triggerProactiveCommentary()
      }
      this.lastProactiveCommentary = now
      this.nextProactiveDelay = PROACTIVE_COMMENTARY_MIN +
        Math.random() * (PROACTIVE_COMMENTARY_MAX - PROACTIVE_COMMENTARY_MIN)
    }

    // Rens gamle events fra buffer (behold siste 90 sekunder)
    this.eventBuffer = this.eventBuffer.filter(e => now - e.timestamp < 90_000)
  }

  // Hent gjeldende eskaleringsverdier
  getEscalation() {
    if (this.phase === 'idle' || this.phase === 'finished') {
      return {
        interactionProbability: 0.35,
        pairCooldownMs: 120_000,
        resilienceDrainPerMin: 0,
        allianceHealingPerMin: 0,
      }
    }
    const progress = (Date.now() - this.startedAt) / ROUND_DURATION
    return {
      interactionProbability: lerp(ESCALATION.interactionProbability.start, ESCALATION.interactionProbability.end, progress),
      pairCooldownMs: lerp(ESCALATION.pairCooldownMs.start, ESCALATION.pairCooldownMs.end, progress),
      resilienceDrainPerMin: lerp(ESCALATION.resilienceDrainPerMin.start, ESCALATION.resilienceDrainPerMin.end, progress),
      allianceHealingPerMin: lerp(ESCALATION.allianceHealingPerMin.start, ESCALATION.allianceHealingPerMin.end, progress),
    }
  }

  // Logg en fornærmelse og oppdater stats
  logInsult(speakerId, targetId) {
    const speaker = this.experimentAvatars.get(speakerId)
    const target = this.experimentAvatars.get(targetId)
    if (!speaker || !target || !speaker.alive || !target.alive) return null

    // Beregn statusendring
    const { speakerDelta, targetDelta, isMob } = calculateStatusChange(
      speaker, target, this.eventBuffer
    )

    // Oppdater status (clamp 0-100)
    speaker.status = Math.max(0, Math.min(100, speaker.status + speakerDelta))
    target.status = Math.max(0, Math.min(100, target.status + targetDelta))

    // Oppdater dominance
    speaker.dominance += 1
    target.dominance -= 1

    // Oppdater tellere
    speaker.insultCount++
    target.insultedCount++
    target.consecutiveLosses++
    speaker.consecutiveLosses = 0

    // Legg til fiende (enveis)
    if (!target.enemies.includes(speakerId)) {
      target.enemies.push(speakerId)
    }

    // Resilience-skade
    const attackMod = getModifiers(speaker.personalityType).attack
    const damage = calculateResilienceDamage(target, attackMod)
    target.resilience = Math.max(0, target.resilience - damage)

    // Forræderangrep?
    const betrayal = isBetrayal(speaker, target)
    if (betrayal) {
      const alliance = this.alliances.get(speaker.allianceId)
      if (alliance) {
        alliance.internalConflict++
      }
    }

    // Logg hendelse
    const event = {
      type: 'insult',
      timestamp: Date.now(),
      data: {
        speakerId, targetId,
        speakerName: speaker.name, targetName: target.name,
        speakerDelta, targetDelta,
        targetResilience: Math.round(target.resilience),
        damage: Math.round(damage),
      },
      description: `${speaker.name} fornærmet ${target.name} → ${target.name} mistet ${Math.round(damage)} resilience (nå: ${Math.round(target.resilience)})`,
    }
    this.logEvent(event)

    if (betrayal) {
      const betrayalEvent = {
        type: 'betrayal',
        timestamp: Date.now(),
        data: { speakerId, targetId, allianceId: speaker.allianceId },
        description: `FORRÆDERANGREP: ${speaker.name} angrep alliert ${target.name}`,
      }
      this.logEvent(betrayalEvent)
      this.triggerReactiveCommentary('betrayal')
    }

    // Mob-hendelse?
    if (isMob) {
      const recentAttackers = this.eventBuffer
        .filter(e => e.type === 'insult' && e.data.targetId === targetId && Date.now() - e.timestamp < 60_000)
        .map(e => e.data.speakerId)
      const uniqueAttackers = [...new Set(recentAttackers)]

      const mobEvent = {
        type: 'mob',
        timestamp: Date.now(),
        data: { targetId, attackerIds: uniqueAttackers, targetName: target.name },
        description: `MOB mot ${target.name} — ${uniqueAttackers.length} angripere siste minutt`,
      }
      this.logEvent(mobEvent)

      this.io?.emit('mob-alert', {
        targetId,
        attackerIds: uniqueAttackers,
      })

      this.triggerReactiveCommentary('mob')
    }

    // Sjekk eliminasjon
    if (target.resilience <= 0) {
      this.eliminateAvatar(targetId, speakerId)
    }

    // Lagre DB-event
    db.prepare(`
      INSERT INTO round_events (id, round_id, event_type, event_data)
      VALUES (?, ?, ?, ?)
    `).run(uuid(), this.roundId, event.type, JSON.stringify(event.data))

    return { speakerDelta, targetDelta, isMob, betrayal }
  }

  // Eliminer en avatar
  eliminateAvatar(avatarId, eliminatedById = null) {
    const avatar = this.experimentAvatars.get(avatarId)
    if (!avatar || !avatar.alive) return

    avatar.alive = false
    avatar.resilience = 0
    avatar.eliminatedAt = Date.now()
    avatar.eliminatedBy = eliminatedById

    this.eliminationOrder++
    const aliveCount = this.getAliveCount()
    const rank = aliveCount + 1 // rangering = antall gjenlevende + 1

    const eliminator = eliminatedById ? this.experimentAvatars.get(eliminatedById) : null

    const event = {
      type: 'elimination',
      timestamp: Date.now(),
      data: {
        avatarId,
        avatarName: avatar.name,
        rank,
        eliminatedBy: eliminatedById,
        eliminatedByName: eliminator?.name || null,
        survivalTime: Math.round((avatar.eliminatedAt - avatar.joinedAt) / 1000),
      },
      description: `${avatar.name} ELIMINERT (plass ${rank}) — ${eliminator ? `tatt av ${eliminator.name}` : 'utmattet'}`,
    }
    this.logEvent(event)

    // Oppdater DB
    db.prepare(`
      UPDATE round_participants
      SET final_rank = ?, final_status = ?, eliminated_at = datetime('now'), eliminated_by = ?
      WHERE round_id = ? AND avatar_id = ?
    `).run(rank, avatar.status, eliminatedById, this.roundId, avatarId)

    // Broadcast
    this.io?.emit('elimination', {
      avatarId,
      avatarName: avatar.name,
      rank,
      eliminatedBy: eliminatedById,
      eliminatedByName: eliminator?.name || null,
    })

    // Sjekk om allianser brytes pga eliminasjon
    this.checkAlliances()

    // Trigger kommentar (høyeste prioritet)
    this.triggerReactiveCommentary('elimination')

    console.log(`[RoundManager] ${avatar.name} eliminert (plass ${rank}), ${aliveCount} gjenstår`)

    // Sjekk om runden er over
    if (aliveCount <= 1) {
      this.endRound()
    }
  }

  // Resilience-drenering
  drainResilience(progress) {
    const esc = this.getEscalation()
    const aliveAvatars = Array.from(this.experimentAvatars.values()).filter(a => a.alive)

    for (const avatar of aliveAvatars) {
      const allianceSize = avatar.allianceId
        ? (this.alliances.get(avatar.allianceId)?.members.length || 0) - 1
        : 0

      applyResilienceDrain(avatar, esc.resilienceDrainPerMin, esc.allianceHealingPerMin, allianceSize)

      // Sjekk eliminasjon ved drenering
      if (avatar.resilience <= 0) {
        this.eliminateAvatar(avatar.id)
      }
    }

    // Tempo-korreksjon: sørg for at eliminasjoner skjer i riktig tempo
    // Mål: ~60% eliminert ved 70% av runden
    const expectedDeadRatio = Math.min(1, progress * 0.85)
    const totalCount = this.experimentAvatars.size
    const deadCount = totalCount - this.getAliveCount()
    const actualDeadRatio = deadCount / totalCount

    if (actualDeadRatio < expectedDeadRatio - 0.15 && progress > 0.3) {
      // Bak skjema — ekstra drenering
      for (const avatar of aliveAvatars) {
        if (!avatar.alive) continue
        avatar.resilience = Math.max(0, avatar.resilience - 0.5)
        if (avatar.resilience <= 0) {
          this.eliminateAvatar(avatar.id)
        }
      }
    }
  }

  // Allianse-sjekk (dannelse og oppløsning)
  checkAlliances() {
    // Sjekk oppløsning først
    const brokenAlliances = checkAllianceBreaks(this.experimentAvatars, this.alliances)
    for (const broken of brokenAlliances) {
      const event = {
        type: 'alliance-broken',
        timestamp: Date.now(),
        data: { allianceId: broken.allianceId, reason: broken.reason },
        description: `Allianse oppløst: ${broken.reason}`,
      }
      this.logEvent(event)

      this.io?.emit('alliance-broken', {
        allianceId: broken.allianceId,
        reason: broken.reason,
      })

      this.triggerReactiveCommentary('alliance-broken')
    }

    // Sjekk dannelse
    const newAlliances = checkAllianceFormation(this.experimentAvatars, this.alliances)
    for (const alliance of newAlliances) {
      const memberNames = alliance.members.map(id => this.experimentAvatars.get(id)?.name || '?')

      const event = {
        type: 'alliance-formed',
        timestamp: Date.now(),
        data: { allianceId: alliance.id, members: alliance.members, memberNames },
        description: `Allianse dannet: [${memberNames.join(', ')}]`,
      }
      this.logEvent(event)

      this.io?.emit('alliance-formed', {
        allianceId: alliance.id,
        members: alliance.members.map(id => ({
          id,
          role: this.experimentAvatars.get(id)?.allianceRole || 'member',
        })),
      })

      this.triggerReactiveCommentary('alliance-formed')
    }
  }

  // Broadcast status til klienter
  broadcastStatus() {
    const ranked = rankAvatars(this.experimentAvatars)
    const avatarData = ranked.map((a, i) => ({
      id: a.id,
      status: Math.round(a.status),
      dominance: a.dominance,
      resilience: Math.round(a.resilience),
      allianceId: a.allianceId,
      rank: i + 1,
      alive: a.alive,
    }))

    this.io?.emit('status-update', { avatars: avatarData })
  }

  // Avslutt runde
  endRound() {
    if (this.phase === 'finished' || this.phase === 'idle') return

    this.phase = 'finished'
    const ranked = rankAvatars(this.experimentAvatars)

    // Sett vinneren (rank 1)
    const winner = ranked.find(a => a.alive) || ranked[0]
    if (winner) {
      db.prepare(`
        UPDATE round_participants SET final_rank = 1, final_status = ? WHERE round_id = ? AND avatar_id = ?
      `).run(winner.status, this.roundId, winner.id)
    }

    // Oppdater runde i DB
    db.prepare(`
      UPDATE rounds SET ended_at = datetime('now'), winner_id = ? WHERE id = ?
    `).run(winner?.id || null, this.roundId)

    const rankings = ranked.map((a, i) => ({
      avatarId: a.id,
      name: a.name,
      rank: i + 1,
      finalStatus: Math.round(a.status),
      eliminatedAt: a.eliminatedAt,
    }))

    // Broadcast rundeavslutning (kommentar legges til async)
    this.io?.emit('round-end', {
      roundId: this.roundId,
      winner: winner ? { id: winner.id, name: winner.name } : null,
      rankings,
      summary: [],
    })

    // Trigger oppsummerings-kommentar
    this.triggerReactiveCommentary('round-end')

    console.log(`[RoundManager] Runde avsluttet — vinner: ${winner?.name || 'ingen'}`)
  }

  // Logg hendelse til eventBuffer
  logEvent(event) {
    this.eventBuffer.push(event)
  }

  // Trigger reaktiv kommentar (noe dramatisk skjedde)
  triggerReactiveCommentary(trigger) {
    this.lastReactiveCommentary = Date.now()
    this.lastProactiveCommentary = Date.now() // reset proaktiv timer

    if (this.commentaryCallback) {
      this.commentaryCallback(trigger, this.getCommentaryContext())
    }
  }

  // Trigger proaktiv kommentar (stille periode)
  triggerProactiveCommentary() {
    if (this.commentaryCallback) {
      this.commentaryCallback('analysis', this.getCommentaryContext())
    }
  }

  // Bygg kontekst for kommentatorene
  getCommentaryContext() {
    const elapsed = Date.now() - this.startedAt
    const minutes = Math.floor(elapsed / 60_000)
    const seconds = Math.floor((elapsed % 60_000) / 1000)
    const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`

    const ranked = rankAvatars(this.experimentAvatars)
    const totalParticipants = this.experimentAvatars.size
    const aliveCount = this.getAliveCount()

    // Rangliste-tekst
    const rankingLines = ranked.filter(a => a.alive).map((a, i) => {
      const allianceStr = a.allianceId ? `, allianse: ${this.getAllianceMemberNames(a.allianceId)}` : ', ALENE'
      const warningStr = a.resilience < 15 ? ' ⚠️' : ''
      return `${i + 1}. ${a.name} (${a.personalityType}) — status: ${Math.round(a.status)}, resilience: ${Math.round(a.resilience)}${allianceStr}${warningStr}`
    })

    // Allianser
    const allianceLines = []
    for (const [, alliance] of this.alliances) {
      const names = alliance.members.map(id => this.experimentAvatars.get(id)?.name || '?')
      allianceLines.push(`[${names.join('+')}]`)
    }

    // Siste 60 sekunder av hendelser
    const now = Date.now()
    const recentEvents = this.eventBuffer
      .filter(e => now - e.timestamp < 60_000)
      .map(e => {
        const t = new Date(e.timestamp)
        const ts = `${String(t.getMinutes()).padStart(2, '0')}:${String(t.getSeconds()).padStart(2, '0')}`
        return `${ts} — ${e.description}`
      })

    return {
      timeStr,
      totalTime: '10:00',
      aliveCount,
      totalParticipants,
      rankings: rankingLines.join('\n'),
      alliances: allianceLines.join(', ') || 'Ingen',
      recentEvents: recentEvents.join('\n') || 'Ingen hendelser siste minutt',
      phase: this.phase,
    }
  }

  // Hent allianse-medlemsnavn
  getAllianceMemberNames(allianceId) {
    const alliance = this.alliances.get(allianceId)
    if (!alliance) return '?'
    return alliance.members.map(id => this.experimentAvatars.get(id)?.name || '?').join('+')
  }

  // Hent antall gjenlevende
  getAliveCount() {
    let count = 0
    for (const a of this.experimentAvatars.values()) {
      if (a.alive) count++
    }
    return count
  }

  // Er en avatar eliminert?
  isEliminated(avatarId) {
    const avatar = this.experimentAvatars.get(avatarId)
    return avatar ? !avatar.alive : false
  }

  // Er runde aktiv?
  isActive() {
    return this.phase === 'running' || this.phase === 'endgame'
  }

  // Hent runde-state for nye klienter
  getRoundState() {
    if (!this.isActive()) return null

    const elapsed = Date.now() - this.startedAt
    return {
      roundId: this.roundId,
      phase: this.phase,
      timeRemaining: Math.max(0, (ROUND_DURATION - elapsed) / 1000),
      experimentAvatars: Object.fromEntries(
        Array.from(this.experimentAvatars.entries()).map(([id, a]) => [id, {
          id: a.id,
          name: a.name,
          status: Math.round(a.status),
          resilience: Math.round(a.resilience),
          dominance: a.dominance,
          allianceId: a.allianceId,
          alive: a.alive,
          rank: 0, // fylles inn under broadcast
        }])
      ),
      alliances: Object.fromEntries(this.alliances),
    }
  }

  // Reset for ny runde
  reset() {
    this.phase = 'idle'
    this.roundId = null
    this.startedAt = null
    this.experimentAvatars.clear()
    this.alliances.clear()
    this.eventBuffer = []
    this.eliminationOrder = 0
  }
}

// Singleton
const roundManager = new RoundManager()
export default roundManager
