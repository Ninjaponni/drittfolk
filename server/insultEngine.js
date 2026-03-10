import Anthropic from '@anthropic-ai/sdk'
import { v4 as uuid } from 'uuid'
import db from './db.js'
import { buildPrompt } from './prompts.js'
import { VALID_ANIMATION_IDS } from './shared-animations.js'

const INTERVAL_MS = 10_000 // 10 sekunder mellom fornærmelser
const COOLDOWN_MS = 30_000 // 30s cooldown per avatar

const client = new Anthropic()
const lastUsed = new Map() // avatar_id → timestamp

export function startInsultEngine(io) {
  console.log('[InsultEngine] Starter — intervall:', INTERVAL_MS / 1000, 's')

  setInterval(async () => {
    try {
      await generateInsult(io)
    } catch (err) {
      console.error('[InsultEngine] Feil:', err.message)
    }
  }, INTERVAL_MS)
}

async function generateInsult(io) {
  // Hent alle avatarer
  const avatars = db.prepare('SELECT * FROM avatars').all()
  if (avatars.length < 2) return

  // Filtrer bort de som ble brukt nylig
  const now = Date.now()
  const available = avatars.filter(a => {
    const last = lastUsed.get(a.id) || 0
    return now - last > COOLDOWN_MS
  })

  if (available.length < 2) return

  // Velg tilfeldig par
  const shuffled = available.sort(() => Math.random() - 0.5)
  const speaker = shuffled[0]
  const target = shuffled[1]

  // Marker som brukt
  lastUsed.set(speaker.id, now)
  lastUsed.set(target.id, now)

  // Generer fornærmelse med Claude
  const { systemPrompt, userPrompt } = buildPrompt(speaker, target)

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  })

  const text = response.content[0]?.text || ''

  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    console.warn('[InsultEngine] Ugyldig JSON fra Claude:', text.slice(0, 100))
    return
  }

  // Valider animasjoner — fallback til 'talking'/'idle'
  const speakerAnim = VALID_ANIMATION_IDS.includes(parsed.speaker_animation)
    ? parsed.speaker_animation : 'talking'
  const targetAnim = VALID_ANIMATION_IDS.includes(parsed.target_animation)
    ? parsed.target_animation : 'idle'

  // Lagre i DB
  const interactionId = uuid()
  db.prepare(`
    INSERT INTO interactions (id, speaker_id, target_id, dialogue, response_dialogue, speaker_animation, target_animation)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(interactionId, speaker.id, target.id, parsed.dialogue || '', parsed.response || '', speakerAnim, targetAnim)

  // Oppdater stats
  db.prepare('UPDATE avatars SET stats_insults_given = stats_insults_given + 1, last_interaction_at = datetime("now") WHERE id = ?')
    .run(speaker.id)
  db.prepare('UPDATE avatars SET stats_insults_received = stats_insults_received + 1, last_interaction_at = datetime("now") WHERE id = ?')
    .run(target.id)

  // Broadcast til alle klienter
  const event = {
    speakerId: speaker.id,
    targetId: target.id,
    dialogue: parsed.dialogue || '',
    responseDialogue: parsed.response || '',
    speakerAnimation: speakerAnim,
    targetAnimation: targetAnim,
  }

  io.emit('insult', event)
  console.log(`[InsultEngine] ${speaker.name} → ${target.name}: "${(parsed.dialogue || '').slice(0, 60)}"`)
}
