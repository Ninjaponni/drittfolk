import { create } from 'zustand'
import type { Avatar, AvatarStats, CreateAvatarInput } from '../../../shared/types'
import { fetchAvatars, createAvatar, fetchAvatarStats } from '../api/avatars'

interface AvatarStore {
  avatars: Avatar[]
  focusedId: string | null
  focusedStats: AvatarStats | null
  loading: boolean

  fetchAvatars: () => Promise<void>
  addAvatar: (input: CreateAvatarInput) => Promise<Avatar>
  setFocused: (id: string | null) => void
  updateAvatarPosition: (id: string, x: number, z: number) => void
}

export const useAvatarStore = create<AvatarStore>((set, get) => ({
  avatars: [],
  focusedId: null,
  focusedStats: null,
  loading: false,

  fetchAvatars: async () => {
    set({ loading: true })
    const avatars = await fetchAvatars()
    set({ avatars, loading: false })
  },

  addAvatar: async (input) => {
    const avatar = await createAvatar(input)
    set((s) => ({ avatars: [...s.avatars, avatar] }))
    return avatar
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
}))
