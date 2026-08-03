// Forenklet rundekontroller for Mexican Standoff
// Håndterer round lifecycle, elimineringer, hendelseslogg, kommentator

import { v4 as uuid } from 'uuid'
import db from './db.js'

class RoundManager {
  constructor() {
    this.phase = 'idle' // idle | running | finished
    this.roundId = null
    this.startedAt = null
    this.experimentAvatars = new Map()   // id → { id, name, personalityType, alive, eliminatedAt, eliminatedBy }
    this.eventBuffer = []                // rullende hendelseslogg
    this.io = null
    this.commentaryCallback = null
    this.eliminationOrder = 0
    this.currentDuel = null              // { id, avatarA, avatarB, duelNumber, totalDuels, isLastDuel }
    this.duelCount = 0
    this.totalDuels = 0
  }

  init(io) {
    this.io = io
  }

  setCommentaryCallback(callback) {
    this.commentaryCallback = callback
  }

  // Start ny runde
  startRound(avatarDataMap) {
    if (this.phase !== 'idle' && this.phase !== 'finished') {
      console.log('[RoundManager] Kan ikke starte — runde allerede aktiv')
      return null
    }

    this.roundId = uuid()
    this.startedAt = Date.now()
    this.phase = 'running'
    this.experimentAvatars.clear()
    this.eventBuffer = []
    this.eliminationOrder = 0
    this.currentDuel = null
    this.duelCount = 0

    const participants = []
    for (const [id, avatar] of avatarDataMap) {
      this.experimentAvatars.set(id, {
        id,
        name: avatar.name,
        personalityType: avatar.personality_type,
        alive: true,
        eliminatedAt: null,
        eliminatedBy: null,
        joinedAt: Date.now(),
      })
      participants.push({
        id,
        name: avatar.name,
        personalityType: avatar.personality_type,
      })
    }

    this.totalDuels = Math.floor(participants.length / 2)

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
      duration: 0, // ingen fast varighet — runden slutter når 1 gjenstår
    })

    console.log(`[RoundManager] Runde startet: ${this.roundId} med ${participants.length} deltakere`)
    return this.roundId
  }

  // Legg til late joiner
  addLateJoiner(avatar) {
    if (this.phase !== 'running') return null

    this.experimentAvatars.set(avatar.id, {
      id: avatar.id,
      name: avatar.name,
      personalityType: avatar.personality_type,
      alive: true,
      eliminatedAt: null,
      eliminatedBy: null,
      joinedAt: Date.now(),
    })

    db.prepare(`
      INSERT INTO round_participants (round_id, avatar_id)
      VALUES (?, ?)
    `).run(this.roundId, avatar.id)

    db.prepare(`
      UPDATE rounds SET participant_count = participant_count + 1 WHERE id = ?
    `).run(this.roundId)

    this.io?.emit('late-join', {
      avatar: {
        id: avatar.id,
        name: avatar.name,
        personalityType: avatar.personality_type,
      },
    })

    this.triggerReactiveCommentary('late-join')
    console.log(`[RoundManager] Late joiner: ${avatar.name}`)
    return true
  }

  // Sett aktuell duell
  setCurrentDuel(duel) {
    this.currentDuel = duel
    if (duel) this.duelCount++
  }

  // Eliminer avatar
  eliminateAvatar(avatarId, eliminatedById = null) {
    const avatar = this.experimentAvatars.get(avatarId)
    if (!avatar || !avatar.alive) return

    avatar.alive = false
    avatar.eliminatedAt = Date.now()
    avatar.eliminatedBy = eliminatedById

    this.eliminationOrder++
    const aliveCount = this.getAliveCount()
    const rank = aliveCount + 1

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
      },
      description: `${avatar.name} ELIMINERT (plass ${rank}) — tatt av ${eliminator?.name || 'ukjent'}`,
    }
    this.logEvent(event)

    // Oppdater DB
    db.prepare(`
      UPDATE round_participants
      SET final_rank = ?, eliminated_at = datetime('now'), eliminated_by = ?
      WHERE round_id = ? AND avatar_id = ?
    `).run(rank, eliminatedById, this.roundId, avatarId)

    // Broadcast
    this.io?.emit('elimination', {
      avatarId,
      avatarName: avatar.name,
      rank,
      eliminatedBy: eliminatedById,
      eliminatedByName: eliminator?.name || null,
    })

    // Broadcast status
    this.broadcastStatus()

    this.triggerReactiveCommentary('elimination')
    console.log(`[RoundManager] ${avatar.name} eliminert (plass ${rank}), ${aliveCount} gjenstår`)
  }

  // Broadcast status (forenklet — bare alive/dead)
  broadcastStatus() {
    const avatarData = []
    let rank = 1
    // Levende først
    for (const a of this.experimentAvatars.values()) {
      if (a.alive) {
        avatarData.push({ id: a.id, rank: rank++, alive: true, status: 100, resilience: 100, dominance: 0, allianceId: null })
      }
    }
    // Døde
    const dead = Array.from(this.experimentAvatars.values())
      .filter(a => !a.alive)
      .sort((a, b) => (b.eliminatedAt || 0) - (a.eliminatedAt || 0))
    for (const a of dead) {
      avatarData.push({ id: a.id, rank: rank++, alive: false, status: 0, resilience: 0, dominance: 0, allianceId: null })
    }

    this.io?.emit('status-update', { avatars: avatarData })
  }

  // Avslutt runde
  endRound() {
    if (this.phase === 'finished' || this.phase === 'idle') return

    this.phase = 'finished'

    const alive = Array.from(this.experimentAvatars.values()).filter(a => a.alive)
    const winner = alive[0] || null

    if (winner) {
      db.prepare(`
        UPDATE round_participants SET final_rank = 1 WHERE round_id = ? AND avatar_id = ?
      `).run(this.roundId, winner.id)
    }

    db.prepare(`
      UPDATE rounds SET ended_at = datetime('now'), winner_id = ? WHERE id = ?
    `).run(winner?.id || null, this.roundId)

    const rankings = []
    let rank = 1
    for (const a of this.experimentAvatars.values()) {
      if (a.alive) rankings.push({ avatarId: a.id, name: a.name, rank: rank++ })
    }
    const dead = Array.from(this.experimentAvatars.values())
      .filter(a => !a.alive)
      .sort((a, b) => (b.eliminatedAt || 0) - (a.eliminatedAt || 0))
    for (const a of dead) {
      rankings.push({ avatarId: a.id, name: a.name, rank: rank++ })
    }

    this.io?.emit('round-end', {
      roundId: this.roundId,
      winner: winner ? { id: winner.id, name: winner.name } : null,
      rankings,
    })

    this.triggerReactiveCommentary('round-end')
    console.log(`[RoundManager] Runde avsluttet — vinner: ${winner?.name || 'ingen'}`)
  }

  // Logg hendelse
  logEvent(event) {
    this.eventBuffer.push(event)
    // Behold siste 90 sekunder
    const now = Date.now()
    this.eventBuffer = this.eventBuffer.filter(e => now - e.timestamp < 90_000)
  }

  // Trigger reaktiv kommentar
  triggerReactiveCommentary(trigger) {
    const focusIds = this.getFocusIdsForTrigger(trigger)
    if (this.commentaryCallback) {
      this.commentaryCallback(trigger, this.getCommentaryContext(), focusIds)
    }
  }

  // Finn fokus-IDer
  getFocusIdsForTrigger(trigger) {
    if (this.currentDuel) {
      return [this.currentDuel.avatarA, this.currentDuel.avatarB].filter(Boolean)
    }
    const recent = this.eventBuffer.filter(e => Date.now() - e.timestamp < 5000)
    const lastEvent = recent[recent.length - 1]
    if (!lastEvent) return []

    switch (trigger) {
      case 'elimination':
        return [lastEvent.data?.avatarId, lastEvent.data?.eliminatedBy].filter(Boolean)
      case 'duel-result':
        return [lastEvent.data?.speakerId, lastEvent.data?.targetId].filter(Boolean)
      default:
        return []
    }
  }

  // Bygg kontekst for kommentatorene
  getCommentaryContext() {
    const elapsed = Date.now() - (this.startedAt || Date.now())
    const minutes = Math.floor(elapsed / 60_000)
    const seconds = Math.floor((elapsed % 60_000) / 1000)
    const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`

    const aliveCount = this.getAliveCount()
    const totalParticipants = this.experimentAvatars.size

    // Rangliste — enkel for duellformat
    const alive = Array.from(this.experimentAvatars.values()).filter(a => a.alive)
    const rankingLines = alive.map((a, i) =>
      `${i + 1}. ${a.name} (${a.personalityType})`
    )

    // Siste hendelser
    const now = Date.now()
    const recentEvents = this.eventBuffer
      .filter(e => now - e.timestamp < 60_000)
      .map(e => e.description)

    // Duell-info
    const duelInfo = this.currentDuel
      ? `Duell ${this.currentDuel.duelNumber}/${this.currentDuel.totalDuels}`
      : 'Mellom dueller'

    return {
      timeStr,
      totalTime: 'Til siste avatar',
      aliveCount,
      totalParticipants,
      rankings: rankingLines.join('\n'),
      alliances: 'Ingen (Mexican Standoff)',
      recentEvents: recentEvents.join('\n') || 'Ingen hendelser siste minutt',
      phase: this.phase,
      duelInfo,
    }
  }

  getAliveCount() {
    let count = 0
    for (const a of this.experimentAvatars.values()) {
      if (a.alive) count++
    }
    return count
  }

  isEliminated(avatarId) {
    const avatar = this.experimentAvatars.get(avatarId)
    return avatar ? !avatar.alive : false
  }

  isActive() {
    return this.phase === 'running'
  }

  getRoundState() {
    if (!this.isActive()) return null
    return {
      roundId: this.roundId,
      phase: this.phase,
      timeRemaining: 0, // ingen fast varighet
      experimentAvatars: Object.fromEntries(
        Array.from(this.experimentAvatars.entries()).map(([id, a]) => [id, {
          id: a.id,
          name: a.name,
          status: a.alive ? 100 : 0,
          resilience: a.alive ? 100 : 0,
          dominance: 0,
          allianceId: null,
          alive: a.alive,
          rank: 0,
        }])
      ),
      currentDuel: this.currentDuel,
    }
  }

  reset() {
    this.phase = 'idle'
    this.roundId = null
    this.startedAt = null
    this.experimentAvatars.clear()
    this.eventBuffer = []
    this.eliminationOrder = 0
    this.currentDuel = null
    this.duelCount = 0
    this.totalDuels = 0
  }
}

const roundManager = new RoundManager()
export default roundManager
