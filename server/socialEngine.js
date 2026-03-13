// Sosial dynamikk for eksperimentet
// Håndterer ExperimentAvatar-stats, statusendring, resilience og allianser

import { v4 as uuid } from 'uuid'

// Personlighets-modifikatorer (speilet fra shared/experiment-types.ts)
const PERSONALITY_MODIFIERS = {
  aggressive:        { attack: 1.5, defense: 0.7, allianceTendency: 0.3 },
  narcissist:        { attack: 1.3, defense: 0.5, allianceTendency: 0.2 },
  dramatic:          { attack: 1.0, defense: 1.0, allianceTendency: 0.8 },
  sarcastic:         { attack: 0.8, defense: 1.3, allianceTendency: 0.5 },
  passive_aggressive: { attack: 0.9, defense: 1.1, allianceTendency: 0.7 },
  arrogant:          { attack: 1.2, defense: 0.6, allianceTendency: 0.1 },
  sycophant:         { attack: 0.5, defense: 1.5, allianceTendency: 1.0 },
}

// Allianse-kompatibilitet
const ALLIANCE_COMPATIBILITY = {
  aggressive:        { sycophant: 3, dramatic: 1, narcissist: -2, aggressive: -1, arrogant: -2 },
  narcissist:        { sycophant: 3, passive_aggressive: 1, narcissist: -3, arrogant: -2 },
  dramatic:          { dramatic: 2, passive_aggressive: 2, sarcastic: 1, aggressive: 1 },
  sarcastic:         { sarcastic: 2, passive_aggressive: 1, dramatic: 1, narcissist: -1 },
  passive_aggressive: { dramatic: 2, sarcastic: 1, passive_aggressive: 1, sycophant: 2 },
  arrogant:          { sycophant: 2, arrogant: -3, aggressive: -2, narcissist: -2 },
  sycophant:         { aggressive: 3, narcissist: 3, arrogant: 2, dramatic: 1, sycophant: -1 },
}

// Lag ny ExperimentAvatar
export function createExperimentAvatar(avatar, minutesIn = 0) {
  const resilience = Math.max(25, Math.round(100 * (1 - minutesIn / 20)))
  const status = minutesIn > 0 ? 30 : 50
  return {
    id: avatar.id,
    name: avatar.name,
    personalityType: avatar.personality_type,
    status,
    resilience,
    dominance: 0,
    allianceId: null,
    allianceRole: null,
    enemies: [],
    consecutiveLosses: 0,
    alive: true,
    eliminatedAt: null,
    eliminatedBy: null,
    joinedAt: Date.now(),
    insultCount: 0,
    insultedCount: 0,
  }
}

// Beregn statusendring etter en fornærmelse
// Returnerer { speakerDelta, targetDelta, isMob }
export function calculateStatusChange(speaker, target, recentEvents) {
  const statusGap = target.status - speaker.status
  const mods = PERSONALITY_MODIFIERS[speaker.personalityType] || PERSONALITY_MODIFIERS.dramatic

  let speakerDelta = 0
  let targetDelta = 0

  if (statusGap > 0) {
    // Punch up — stor gevinst for speaker
    speakerDelta = Math.round(3 + (statusGap / 20) * 5) // +3 til +8
    targetDelta = -Math.round(3 + (statusGap / 20) * 3) // -3 til -6
  } else {
    // Punch down — liten gevinst
    speakerDelta = 1
    targetDelta = -Math.round(1 + Math.abs(statusGap) / 50) // -1 til -2
  }

  // Ekstra straff for å være uten allianse
  if (!target.allianceId) {
    targetDelta -= 2
  }

  // Mob-sjekk: 3+ angrep på target innen siste 60 sekunder
  const now = Date.now()
  const recentAttacksOnTarget = recentEvents.filter(e =>
    e.type === 'insult' &&
    e.data.targetId === target.id &&
    now - e.timestamp < 60_000
  )
  const isMob = recentAttacksOnTarget.length >= 2 // dette er 3. angrep

  if (isMob) {
    targetDelta -= 5
  }

  return { speakerDelta, targetDelta, isMob }
}

// Oppdater resilience etter fornærmelse
export function calculateResilienceDamage(target, attackMultiplier = 1) {
  const mods = PERSONALITY_MODIFIERS[target.personalityType] || PERSONALITY_MODIFIERS.dramatic
  const baseDamage = 2 + Math.random() * 3 // 2-5
  return Math.round(baseDamage * attackMultiplier / mods.defense)
}

// Apliser base resilience-drenering (kalles hvert sekund)
export function applyResilienceDrain(avatar, drainPerMin, allianceHealPerMin, allianceSize) {
  if (!avatar.alive) return 0

  const drainPerSec = drainPerMin / 60
  let drain = drainPerSec

  // Allianse-healing
  if (avatar.allianceId && allianceSize > 0) {
    const healPerSec = allianceHealPerMin / 60
    drain -= healPerSec * allianceSize
  }

  // Minst 0 netto drain (allianser kan ikke ØKE resilience)
  drain = Math.max(0, drain)

  avatar.resilience = Math.max(0, avatar.resilience - drain)
  return drain
}

// Sjekk allianse-kompatibilitet mellom to avatarer
export function allianceScore(avatarA, avatarB, allExperimentAvatars) {
  const compatibility = ALLIANCE_COMPATIBILITY[avatarA.personalityType]?.[avatarB.personalityType] || 0

  // Felles fiender bonus (+3 per)
  const commonEnemies = avatarA.enemies.filter(e => avatarB.enemies.includes(e))
  const enemyBonus = commonEnemies.length * 3

  // Statusgap-straff
  const statusGap = Math.abs(avatarA.status - avatarB.status)
  const statusPenalty = statusGap / 20

  // Personlighets-tendens (snitt av begges allianse-tendens)
  const tendencyA = PERSONALITY_MODIFIERS[avatarA.personalityType]?.allianceTendency || 0.5
  const tendencyB = PERSONALITY_MODIFIERS[avatarB.personalityType]?.allianceTendency || 0.5
  const tendencyBonus = (tendencyA + tendencyB)

  return compatibility + enemyBonus + tendencyBonus - statusPenalty
}

// Sjekk og dann allianser (kalles hvert 20. sekund)
// Returnerer array av nye allianser dannet
export function checkAllianceFormation(experimentAvatars, existingAlliances) {
  const newAlliances = []
  const aliveAvatars = Array.from(experimentAvatars.values()).filter(a => a.alive && !a.allianceId)

  if (aliveAvatars.length < 2) return newAlliances

  // Finn beste par
  let bestPair = null
  let bestScore = -Infinity

  for (let i = 0; i < aliveAvatars.length; i++) {
    for (let j = i + 1; j < aliveAvatars.length; j++) {
      const score = allianceScore(aliveAvatars[i], aliveAvatars[j], experimentAvatars)
      if (score > bestScore && score > 5) {
        bestScore = score
        bestPair = [aliveAvatars[i], aliveAvatars[j]]
      }
    }
  }

  if (bestPair) {
    const [a, b] = bestPair
    const allianceId = uuid()

    // Leder = høyest dominans (sycophant kan aldri lede)
    let leaderId
    if (a.personalityType === 'sycophant') leaderId = b.id
    else if (b.personalityType === 'sycophant') leaderId = a.id
    else leaderId = a.dominance >= b.dominance ? a.id : b.id

    a.allianceId = allianceId
    a.allianceRole = a.id === leaderId ? 'leader' : 'member'
    b.allianceId = allianceId
    b.allianceRole = b.id === leaderId ? 'leader' : 'member'

    const alliance = {
      id: allianceId,
      members: [a.id, b.id],
      leaderId,
      formedAt: Date.now(),
      internalConflict: 0,
    }
    existingAlliances.set(allianceId, alliance)

    newAlliances.push(alliance)
  }

  // Sjekk om noen kan joine en eksisterende allianse (maks 3)
  for (const [allianceId, alliance] of existingAlliances) {
    if (alliance.members.length >= 3) continue

    let bestCandidate = null
    let bestCandidateScore = -Infinity

    for (const avatar of aliveAvatars) {
      if (avatar.allianceId) continue
      // Sjekk score mot alle medlemmer
      let totalScore = 0
      for (const memberId of alliance.members) {
        const member = experimentAvatars.get(memberId)
        if (member) totalScore += allianceScore(avatar, member, experimentAvatars)
      }
      const avgScore = totalScore / alliance.members.length
      if (avgScore > bestCandidateScore && avgScore > 5) {
        bestCandidateScore = avgScore
        bestCandidate = avatar
      }
    }

    if (bestCandidate) {
      bestCandidate.allianceId = allianceId
      bestCandidate.allianceRole = 'member'
      alliance.members.push(bestCandidate.id)
    }
  }

  return newAlliances
}

// Sjekk om allianser skal brytes
// Returnerer array av brukne allianser med grunn
export function checkAllianceBreaks(experimentAvatars, alliances) {
  const brokenAlliances = []

  for (const [allianceId, alliance] of alliances) {
    let shouldBreak = false
    let reason = ''

    // Leder eliminert
    const leader = experimentAvatars.get(alliance.leaderId)
    if (!leader || !leader.alive) {
      shouldBreak = true
      reason = `Lederen ${leader?.name || 'ukjent'} ble eliminert`
    }

    // Intern konflikt
    if (alliance.internalConflict > 3) {
      shouldBreak = true
      reason = 'For mange interne konflikter'
    }

    // Alle unntatt én eliminert
    const aliveMembers = alliance.members.filter(id => {
      const a = experimentAvatars.get(id)
      return a && a.alive
    })
    if (aliveMembers.length < 2) {
      shouldBreak = true
      reason = 'For få gjenlevende medlemmer'
    }

    if (shouldBreak) {
      // Frigjør alle medlemmer
      for (const memberId of alliance.members) {
        const member = experimentAvatars.get(memberId)
        if (member) {
          member.allianceId = null
          member.allianceRole = null
        }
      }
      alliances.delete(allianceId)
      brokenAlliances.push({ allianceId, reason })
    }
  }

  return brokenAlliances
}

// Sjekk om en interaksjon er et forræderangrep (alliert mot alliert)
export function isBetrayal(speaker, target) {
  return speaker.allianceId && speaker.allianceId === target.allianceId
}

// Ranger avatarer etter status (levende først, deretter eliminerte i omvendt rekkefølge)
export function rankAvatars(experimentAvatars) {
  const avatars = Array.from(experimentAvatars.values())
  const alive = avatars.filter(a => a.alive).sort((a, b) => b.status - a.status)
  const dead = avatars.filter(a => !a.alive).sort((a, b) => (b.eliminatedAt || 0) - (a.eliminatedAt || 0))
  return [...alive, ...dead]
}

// Hent modifikatorer for en personlighetstype
export function getModifiers(personalityType) {
  return PERSONALITY_MODIFIERS[personalityType] || PERSONALITY_MODIFIERS.dramatic
}
