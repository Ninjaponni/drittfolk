// Klient-side interaksjonshåndtering
// CPS-basert fasemaskin — varighet beregnes fra tekstlengde

import type { DialogLine } from '../../../shared/types'
import { FACING_DURATION, REACTING_DURATION, MIN_LINE_DURATION, lineDuration } from '../../../shared/timing'

export type InteractionPhase = 'none' | 'approaching' | 'facing' | 'talking' | 'reacting' | 'finished'

export interface InteractionState {
  phase: InteractionPhase
  interactionId: string | null
  partnerId: string | null
  approachTarget: { x: number; z: number } | null
  partnerPosition: { x: number; z: number } | null
  lines: DialogLine[]
  currentLineIndex: number
  timer: number
}

export function createInteractionState(): InteractionState {
  return {
    phase: 'none',
    interactionId: null,
    partnerId: null,
    approachTarget: null,
    partnerPosition: null,
    lines: [],
    currentLineIndex: -1,
    timer: 0,
  }
}

export function updateInteraction(state: InteractionState, delta: number): InteractionUpdate {
  if (state.phase === 'none' || state.phase === 'approaching' || state.phase === 'finished') {
    return { type: 'idle' }
  }

  state.timer -= delta

  if (state.phase === 'facing') {
    if (state.timer <= 0) {
      state.phase = 'talking'
      state.currentLineIndex = 0
      const line = state.lines[0]
      state.timer = line ? lineDuration(line.text) : MIN_LINE_DURATION
      return { type: 'line_start', lineIndex: 0 }
    }
    return { type: 'facing' }
  }

  if (state.phase === 'talking') {
    if (state.timer <= 0) {
      const next = state.currentLineIndex + 1
      if (next < state.lines.length) {
        state.currentLineIndex = next
        const line = state.lines[next]
        state.timer = line ? lineDuration(line.text) : MIN_LINE_DURATION
        return { type: 'line_start', lineIndex: next }
      }
      state.phase = 'reacting'
      state.timer = REACTING_DURATION
      return { type: 'all_lines_done' }
    }
    return { type: 'talking', lineIndex: state.currentLineIndex }
  }

  if (state.phase === 'reacting') {
    if (state.timer <= 0) {
      state.phase = 'finished'
      return { type: 'done' }
    }
    return { type: 'reacting' }
  }

  return { type: 'idle' }
}

export function startInteraction(
  state: InteractionState,
  interactionId: string,
  partnerId: string,
  approachX: number,
  approachZ: number,
) {
  state.phase = 'approaching'
  state.interactionId = interactionId
  state.partnerId = partnerId
  state.approachTarget = { x: approachX, z: approachZ }
  state.lines = []
  state.currentLineIndex = -1
  state.timer = 0
}

// Linjer mottatt — start facing hvis allerede på plass
export function setInteractionLines(state: InteractionState, lines: DialogLine[]) {
  state.lines = lines
  if (state.phase !== 'approaching') {
    state.phase = 'facing'
    state.timer = FACING_DURATION
  }
}

// Ankommet — start facing hvis linjer er klare
export function approachingDone(state: InteractionState) {
  if (state.lines.length > 0) {
    state.phase = 'facing'
    state.timer = FACING_DURATION
  }
}

export function resetInteraction(state: InteractionState) {
  state.phase = 'none'
  state.interactionId = null
  state.partnerId = null
  state.approachTarget = null
  state.partnerPosition = null
  state.lines = []
  state.currentLineIndex = -1
  state.timer = 0
}

export type InteractionUpdate =
  | { type: 'idle' }
  | { type: 'facing' }
  | { type: 'line_start'; lineIndex: number }
  | { type: 'talking'; lineIndex: number }
  | { type: 'all_lines_done' }
  | { type: 'reacting' }
  | { type: 'done' }
