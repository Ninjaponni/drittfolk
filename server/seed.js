import { v4 as uuid } from 'uuid'
import db from './db.js'

const SEED_AVATARS = [
  { name: 'Grete', gender: 'female', language: 'no', personality_type: 'passive_aggressive', hair_color: '#D4A574', top_color: '#C41E3A', pants_color: '#2D2D2D' },
  { name: 'Bjørn', gender: 'male', language: 'no', personality_type: 'aggressive', hair_color: '#2D2D2D', top_color: '#1B4D3E', pants_color: '#2D2D2D' },
  { name: 'Karen', gender: 'female', language: 'en', personality_type: 'arrogant', hair_color: '#FFD700', top_color: '#7C3AED', pants_color: '#2D2D2D' },
  { name: 'Stein', gender: 'male', language: 'no', personality_type: 'sarcastic', hair_color: '#8B4513', top_color: '#2563EB', pants_color: '#2D2D2D' },
  { name: 'Trine', gender: 'female', language: 'no', personality_type: 'dramatic', hair_color: '#C41E3A', top_color: '#EC4899', pants_color: '#2D2D2D' },
  { name: 'Chad', gender: 'male', language: 'en', personality_type: 'narcissist', hair_color: '#FFD700', top_color: '#FF6B35', pants_color: '#2D2D2D' },
  { name: 'Solveig', gender: 'female', language: 'no', personality_type: 'sycophant', hair_color: '#D4A574', top_color: '#1B4D3E', pants_color: '#2D2D2D' },
  { name: 'Terje', gender: 'male', language: 'no', personality_type: 'passive_aggressive', hair_color: '#2D2D2D', top_color: '#C41E3A', pants_color: '#2D2D2D' },
]

// Idempotent seed — sjekker om avatarer finnes
const existing = db.prepare('SELECT COUNT(*) as count FROM avatars').get()
if (existing.count === 0) {
  console.log('Seeder database med', SEED_AVATARS.length, 'avatarer...')
  const insert = db.prepare(`
    INSERT INTO avatars (id, name, gender, language, personality_type, character_model,
      hair_color, top_color, pants_color, position_x, position_z)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  for (const a of SEED_AVATARS) {
    const idx = Math.floor(Math.random() * 9) + 1
    const prefix = a.gender === 'male' ? 'Male' : 'Female'
    const model = `SM_Chr_Developer_${prefix}_${idx.toString().padStart(2, '0')}.glb`
    insert.run(
      uuid(), a.name, a.gender, a.language, a.personality_type, model,
      a.hair_color, a.top_color, a.pants_color,
      (Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60,
    )
  }
  console.log('Seeding ferdig!')
} else {
  console.log('Database har allerede', existing.count, 'avatarer — hopper over seed.')
}
