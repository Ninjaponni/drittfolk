// Typer for sosialt eksperiment — runder, elimineringer, kommentatorer

import type { PersonalityType } from './types'

// Rundestatus
export type RoundPhase = 'idle' | 'running' | 'endgame' | 'finished'

// ExperimentAvatar — in-memory under en runde
export interface ExperimentAvatar {
  id: string
  name: string
  personalityType: PersonalityType
  status: number          // 0-100, sosial makt
  resilience: number      // tåleevne, eliminert ved 0
  dominance: number       // netto makt
  allianceId: string | null
  allianceRole: 'leader' | 'member' | null
  enemies: string[]       // enveisfiender
  consecutiveLosses: number
  alive: boolean
  eliminatedAt: number | null    // tidsstempel
  eliminatedBy: string | null    // avatar-id
  joinedAt: number               // tidsstempel — for late joiners
  insultCount: number            // fornærmelser gitt denne runden
  insultedCount: number          // fornærmelser mottatt denne runden
}

// Personlighets-modifikatorer
export interface PersonalityModifiers {
  attack: number        // angreps-multiplikator
  defense: number       // forsvar-multiplikator
  allianceTendency: number  // 0-1, sannsynlighet for alliansebygging
}

export const PERSONALITY_MODIFIERS: Record<PersonalityType, PersonalityModifiers> = {
  aggressive:        { attack: 1.5, defense: 0.7, allianceTendency: 0.3 },
  narcissist:        { attack: 1.3, defense: 0.5, allianceTendency: 0.2 },
  dramatic:          { attack: 1.0, defense: 1.0, allianceTendency: 0.8 },
  sarcastic:         { attack: 0.8, defense: 1.3, allianceTendency: 0.5 },
  passive_aggressive: { attack: 0.9, defense: 1.1, allianceTendency: 0.7 },
  arrogant:          { attack: 1.2, defense: 0.6, allianceTendency: 0.1 },
  sycophant:         { attack: 0.5, defense: 1.5, allianceTendency: 1.0 },
}

// Allianse
export interface Alliance {
  id: string
  members: string[]     // avatar-id-er (maks 3)
  leaderId: string
  formedAt: number
  internalConflict: number  // brytes ved > 3
}

// Eskaleringskurve — interpoleres lineært over 15 min
export interface EscalationParams {
  interactionProbability: number  // 0.20 → 0.70
  pairCooldownMs: number          // 90s → 10s
  resilienceDrainPerMin: number   // 0.5 → 3.0
  allianceHealingPerMin: number   // 0.5 → 0.05
}

export const ESCALATION_START: EscalationParams = {
  interactionProbability: 0.20,
  pairCooldownMs: 90_000,
  resilienceDrainPerMin: 0.5,
  allianceHealingPerMin: 0.5,
}

export const ESCALATION_END: EscalationParams = {
  interactionProbability: 0.70,
  pairCooldownMs: 10_000,
  resilienceDrainPerMin: 3.0,
  allianceHealingPerMin: 0.05,
}

// Hendelsestyper for eventBuffer
export type ExperimentEventType =
  | 'insult'
  | 'elimination'
  | 'alliance-formed'
  | 'alliance-broken'
  | 'mob'
  | 'betrayal'       // alliert angriper alliert
  | 'late-join'
  | 'alliance-rejected'

export interface ExperimentEvent {
  type: ExperimentEventType
  timestamp: number
  data: Record<string, any>
  description: string   // menneskelesbar beskrivelse for kommentatorene
}

// Kommentar fra to-kommentator-systemet
export interface CommentaryLine {
  speaker: 'A' | 'B'
  text: string
}

export interface Commentary {
  lines: CommentaryLine[]
  trigger: string   // hva som trigget kommentaren
}

// Rundeoppsummering
export interface RoundSummary {
  roundId: string
  duration: number        // sekunder
  participantCount: number
  winnerId: string | null
  winnerName: string | null
  rankings: Array<{
    avatarId: string
    name: string
    rank: number
    finalStatus: number
    eliminatedAt: number | null
  }>
  commentary: CommentaryLine[]
}

// WebSocket events (server → client)
export interface RoundStartEvent {
  roundId: string
  participants: Array<{ id: string; name: string; personalityType: PersonalityType }>
  duration: number   // sekunder (900 = 15 min)
}

export interface RoundEndEvent {
  roundId: string
  winner: { id: string; name: string } | null
  rankings: RoundSummary['rankings']
  summary: CommentaryLine[]
}

export interface StatusUpdateEvent {
  avatars: Array<{
    id: string
    status: number
    dominance: number
    resilience: number
    allianceId: string | null
    rank: number
    alive: boolean
  }>
}

export interface AllianceFormedEvent {
  allianceId: string
  members: Array<{ id: string; role: 'leader' | 'member' }>
}

export interface AllianceBrokenEvent {
  allianceId: string
  reason: string
}

export interface EliminationEvent {
  avatarId: string
  avatarName: string
  rank: number
  eliminatedBy: string | null
  eliminatedByName: string | null
}

export interface CommentaryEvent {
  lines: CommentaryLine[]
  trigger: string
}

export interface MobAlertEvent {
  targetId: string
  attackerIds: string[]
}

export interface LateJoinEvent {
  avatar: {
    id: string
    name: string
    personalityType: PersonalityType
    resilience: number
    status: number
  }
}

// Allianse-kompatibilitet mellom personlighetstyper
// Positiv = kompatibel, negativ = inkompatibel
export const ALLIANCE_COMPATIBILITY: Record<PersonalityType, Partial<Record<PersonalityType, number>>> = {
  aggressive:        { sycophant: 3, dramatic: 1, narcissist: -2, aggressive: -1, arrogant: -2 },
  narcissist:        { sycophant: 3, passive_aggressive: 1, narcissist: -3, arrogant: -2 },
  dramatic:          { dramatic: 2, passive_aggressive: 2, sarcastic: 1, aggressive: 1 },
  sarcastic:         { sarcastic: 2, passive_aggressive: 1, dramatic: 1, narcissist: -1 },
  passive_aggressive: { dramatic: 2, sarcastic: 1, passive_aggressive: 1, sycophant: 2 },
  arrogant:          { sycophant: 2, arrogant: -3, aggressive: -2, narcissist: -2 },
  sycophant:         { aggressive: 3, narcissist: 3, arrogant: 2, dramatic: 1, sycophant: -1 },
}

// Insult-tiers
export type InsultTier = 'mild' | 'medium' | 'savage'
