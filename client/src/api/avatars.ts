import type { Avatar, AvatarStats, CreateAvatarInput } from '../../../shared/types'

const BASE = '/api'

export async function fetchAvatars(search?: string): Promise<Avatar[]> {
  const params = search ? `?search=${encodeURIComponent(search)}` : ''
  const res = await fetch(`${BASE}/avatars${params}`)
  if (!res.ok) throw new Error('Feil ved henting av avatarer')
  return res.json()
}

export async function createAvatar(input: CreateAvatarInput): Promise<Avatar> {
  const res = await fetch(`${BASE}/avatars`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) throw new Error('Feil ved oppretting av avatar')
  return res.json()
}

export interface MvdData {
  id: string
  name: string
  interaction_count: number
  last_insult: string | null
}

export async function fetchMVD(): Promise<MvdData | null> {
  const res = await fetch(`${BASE}/avatars/mvd`)
  if (!res.ok) throw new Error('Feil ved henting av MVD')
  return res.json()
}

export async function deleteAvatar(id: string): Promise<void> {
  const res = await fetch(`${BASE}/avatars/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Feil ved sletting av avatar')
}

export async function fetchAvatarStats(id: string): Promise<AvatarStats> {
  const res = await fetch(`${BASE}/avatars/${id}/stats`)
  if (!res.ok) throw new Error('Feil ved henting av statistikk')
  return res.json()
}
