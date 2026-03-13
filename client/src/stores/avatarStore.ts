import { create } from 'zustand'
import type { Avatar, AvatarStats, CreateAvatarInput, DialogLine } from '../../../shared/types'
import { fetchAvatars, createAvatar, fetchAvatarStats, deleteAvatar } from '../api/avatars'

// Egne avatarer (lagret i localStorage)
const OWN_KEY = 'drittfolk_own_avatars'
function getOwnIds(): string[] {
  try { return JSON.parse(localStorage.getItem(OWN_KEY) || '[]') } catch { return [] }
}
function addOwnId(id: string) {
  const ids = getOwnIds()
  if (!ids.includes(id)) { ids.push(id); localStorage.setItem(OWN_KEY, JSON.stringify(ids)) }
}
function removeOwnId(id: string) {
  localStorage.setItem(OWN_KEY, JSON.stringify(getOwnIds().filter(i => i !== id)))
}
export function isOwnAvatar(id: string): boolean {
  return getOwnIds().includes(id)
}

// Aktiv interaksjon (klient-side state)
export interface ActiveInteraction {
  id: string
  speakerId: string
  targetId: string
  lines: DialogLine[]
  phase: 'approaching' | 'talking' | 'done'
}

// Eksperiment runde-state
export interface ExperimentAvatarState {
  id: string
  status: number
  dominance: number
  resilience: number
  allianceId: string | null
  rank: number
  alive: boolean
}

export interface CommentaryLine {
  speaker: 'A' | 'B'
  text: string
}

export interface KillFeedEntry {
  id: string
  text: string
  timestamp: number
}

interface AvatarStore {
  avatars: Avatar[]
  focusedId: string | null
  focusedStats: AvatarStats | null
  loading: boolean
  activeInteractions: Map<string, ActiveInteraction>
  autoCameraEnabled: boolean
  cameraLookAt: [number, number, number]

  // Eksperiment runde-state
  roundActive: boolean
  roundId: string | null
  roundTimeRemaining: number
  experimentAvatars: Map<string, ExperimentAvatarState>
  commentaryQueue: Array<{ lines: CommentaryLine[]; trigger: string }>
  currentCommentary: { lines: CommentaryLine[]; trigger: string } | null
  killFeed: KillFeedEntry[]
  mobTarget: string | null

  fetchAvatars: () => Promise<void>
  addAvatar: (input: CreateAvatarInput) => Promise<Avatar>
  addAvatarDirect: (avatar: Avatar) => void
  removeAvatar: (id: string) => Promise<void>
  setFocused: (id: string | null) => void
  updateAvatarPosition: (id: string, x: number, z: number) => void
  toggleAutoCamera: () => void
  setCameraLookAt: (x: number, y: number, z: number) => void

  // Interaksjons-actions
  startInteraction: (id: string, speakerId: string, targetId: string) => void
  setInteractionLines: (id: string, lines: DialogLine[]) => void
  endInteraction: (id: string) => void
  getInteractionForAvatar: (avatarId: string) => ActiveInteraction | null

  // Runde-actions
  setRoundActive: (active: boolean, roundId?: string, duration?: number) => void
  updateRoundTime: (time: number) => void
  updateExperimentAvatars: (avatars: ExperimentAvatarState[]) => void
  addCommentary: (lines: CommentaryLine[], trigger: string) => void
  popCommentary: () => void
  addKillFeedEntry: (text: string) => void
  setMobTarget: (id: string | null) => void
  isAvatarEliminated: (id: string) => boolean
}

export const useAvatarStore = create<AvatarStore>((set, get) => ({
  avatars: [],
  focusedId: null,
  focusedStats: null,
  loading: false,
  activeInteractions: new Map(),
  autoCameraEnabled: true,
  cameraLookAt: [0, 1, 0] as [number, number, number],

  // Eksperiment runde-state
  roundActive: false,
  roundId: null,
  roundTimeRemaining: 0,
  experimentAvatars: new Map(),
  commentaryQueue: [],
  currentCommentary: null,
  killFeed: [],
  mobTarget: null,

  toggleAutoCamera: () => {
    set((s) => ({ autoCameraEnabled: !s.autoCameraEnabled }))
  },

  setCameraLookAt: (x, y, z) => {
    set({ cameraLookAt: [x, y, z] })
  },

  fetchAvatars: async () => {
    set({ loading: true })
    const avatars = await fetchAvatars()
    set({ avatars, loading: false })
  },

  addAvatar: async (input) => {
    const avatar = await createAvatar(input)
    addOwnId(avatar.id)
    set((s) => ({ avatars: [...s.avatars, avatar], focusedId: avatar.id, focusedStats: null }))
    return avatar
  },

  removeAvatar: async (id) => {
    await deleteAvatar(id)
    removeOwnId(id)
    set((s) => ({
      avatars: s.avatars.filter(a => a.id !== id),
      focusedId: s.focusedId === id ? null : s.focusedId,
      focusedStats: s.focusedId === id ? null : s.focusedStats,
    }))
  },

  addAvatarDirect: (avatar) => {
    // Legg til uten API-kall (fra WebSocket-broadcast)
    const exists = get().avatars.some(a => a.id === avatar.id)
    if (!exists) {
      set((s) => ({ avatars: [...s.avatars, avatar] }))
    }
  },

  setFocused: async (id) => {
    set({ focusedId: id, focusedStats: null })
    if (id) {
      const stats = await fetchAvatarStats(id)
      set({ focusedStats: stats })
    }
  },

  updateAvatarPosition: (id, x, z) => {
    set((s) => ({
      avatars: s.avatars.map((a) =>
        a.id === id ? { ...a, position_x: x, position_z: z } : a
      ),
    }))
  },

  startInteraction: (id, speakerId, targetId) => {
    const interactions = new Map(get().activeInteractions)
    interactions.set(id, {
      id,
      speakerId,
      targetId,
      lines: [],
      phase: 'approaching',
    })
    set({ activeInteractions: interactions })
  },

  setInteractionLines: (id, lines) => {
    const interactions = new Map(get().activeInteractions)
    const interaction = interactions.get(id)
    if (interaction) {
      interaction.lines = lines
      interaction.phase = 'talking'
      set({ activeInteractions: interactions })
    }
  },

  endInteraction: (id) => {
    const interactions = new Map(get().activeInteractions)
    interactions.delete(id)
    set({ activeInteractions: interactions })
  },

  getInteractionForAvatar: (avatarId) => {
    for (const interaction of get().activeInteractions.values()) {
      if (interaction.speakerId === avatarId || interaction.targetId === avatarId) {
        return interaction
      }
    }
    return null
  },

  // Runde-actions
  setRoundActive: (active, roundId, duration) => {
    set({
      roundActive: active,
      roundId: roundId || null,
      roundTimeRemaining: duration || 0,
      ...(active ? {} : {
        experimentAvatars: new Map(),
        killFeed: [],
        currentCommentary: null,
        commentaryQueue: [],
        mobTarget: null,
      }),
    })
  },

  updateRoundTime: (time) => set({ roundTimeRemaining: time }),

  updateExperimentAvatars: (avatars) => {
    const map = new Map<string, ExperimentAvatarState>()
    for (const a of avatars) map.set(a.id, a)
    set({ experimentAvatars: map })
  },

  addCommentary: (lines, trigger) => {
    const current = get().currentCommentary
    if (current) {
      // Kø — legg til bak
      set({ commentaryQueue: [...get().commentaryQueue, { lines, trigger }] })
    } else {
      set({ currentCommentary: { lines, trigger } })
    }
  },

  popCommentary: () => {
    const queue = [...get().commentaryQueue]
    const next = queue.shift() || null
    set({ currentCommentary: next, commentaryQueue: queue })
  },

  addKillFeedEntry: (text) => {
    const entry: KillFeedEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      text,
      timestamp: Date.now(),
    }
    set({ killFeed: [...get().killFeed.slice(-20), entry] })
  },

  setMobTarget: (id) => set({ mobTarget: id }),

  isAvatarEliminated: (id) => {
    const expAvatar = get().experimentAvatars.get(id)
    return expAvatar ? !expAvatar.alive : false
  },
}))
