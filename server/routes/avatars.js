import { Router } from 'express'
import { v4 as uuid } from 'uuid'
import db from '../db.js'

const router = Router()

// Tilfeldig posisjon i arenaen
function randomPos() {
  return (Math.random() - 0.5) * 60
}

// Tilfeldig Synty-modell basert på kjønn
function randomModel(gender) {
  const count = 9
  const idx = Math.floor(Math.random() * count) + 1
  const pad = idx.toString().padStart(2, '0')
  const prefix = gender === 'male' ? 'Male' : 'Female'
  return `SM_Chr_Developer_${prefix}_${pad}.glb`
}

// GET /api/avatars — liste (med valgfritt søk)
router.get('/', (req, res) => {
  const search = req.query.search
  let avatars
  if (search) {
    avatars = db.prepare('SELECT * FROM avatars WHERE name LIKE ? ORDER BY created_at DESC')
      .all(`%${search}%`)
  } else {
    avatars = db.prepare('SELECT * FROM avatars ORDER BY created_at DESC').all()
  }
  res.json(avatars)
})

// GET /api/avatars/:id
router.get('/:id', (req, res) => {
  const avatar = db.prepare('SELECT * FROM avatars WHERE id = ?').get(req.params.id)
  if (!avatar) return res.status(404).json({ error: 'Ikke funnet' })
  res.json(avatar)
})

// GET /api/avatars/:id/stats — computed statistikk
router.get('/:id/stats', (req, res) => {
  const id = req.params.id
  const avatar = db.prepare('SELECT * FROM avatars WHERE id = ?').get(id)
  if (!avatar) return res.status(404).json({ error: 'Ikke funnet' })

  // Nemesis: mest gjensidige interaksjoner (min 3)
  const nemesisRow = db.prepare(`
    SELECT other_id, name, cnt FROM (
      SELECT
        CASE WHEN speaker_id = ? THEN target_id ELSE speaker_id END as other_id,
        COUNT(*) as cnt
      FROM interactions
      WHERE speaker_id = ? OR target_id = ?
      GROUP BY other_id
      HAVING cnt >= 3
      ORDER BY cnt DESC
      LIMIT 1
    ) sub
    LEFT JOIN avatars ON avatars.id = sub.other_id
  `).get(id, id, id)

  // Favorittfornærmelse (oftest brukt av denne avataren)
  const favInsult = db.prepare(`
    SELECT dialogue, COUNT(*) as cnt FROM interactions
    WHERE speaker_id = ?
    GROUP BY dialogue ORDER BY cnt DESC LIMIT 1
  `).get(id)

  // Verste mottatt
  const worstReceived = db.prepare(`
    SELECT dialogue, a.name as from_name FROM interactions i
    JOIN avatars a ON a.id = i.speaker_id
    WHERE i.target_id = ?
    ORDER BY LENGTH(i.dialogue) DESC LIMIT 1
  `).get(id)

  // Yndlingsord — enkel ordtelling
  const allDialogues = db.prepare(`
    SELECT dialogue FROM interactions WHERE speaker_id = ?
  `).all(id)

  const stopwords = avatar.language === 'no'
    ? new Set(['og', 'i', 'er', 'det', 'en', 'et', 'å', 'på', 'du', 'jeg', 'som', 'har', 'med', 'for', 'den', 'til', 'av', 'at', 'ikke', 'var', 'men', 'om', 'han', 'hun', 'de', 'vi', 'kan', 'meg', 'deg', 'seg', 'sin', 'sitt', 'sine', 'min', 'mitt', 'mine', 'din', 'ditt', 'dine', 'så', 'da', 'her', 'der', 'nå'])
    : new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'shall', 'can', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'about', 'like', 'through', 'after', 'over', 'between', 'out', 'that', 'this', 'it', 'i', 'you', 'he', 'she', 'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'its', 'our', 'their', 'and', 'but', 'or', 'so', 'if', 'not', 'no', 'just'])

  const wordCount = {}
  for (const row of allDialogues) {
    const words = row.dialogue.toLowerCase().replace(/[^a-zA-ZæøåÆØÅ\s]/g, '').split(/\s+/)
    for (const w of words) {
      if (w.length > 2 && !stopwords.has(w)) {
        wordCount[w] = (wordCount[w] || 0) + 1
      }
    }
  }
  const favWord = Object.entries(wordCount).sort((a, b) => b[1] - a[1])[0]

  res.json({
    nemesis: nemesisRow ? { name: nemesisRow.name, count: nemesisRow.cnt } : null,
    favorite_insult: favInsult?.dialogue || null,
    worst_received: worstReceived ? { text: worstReceived.dialogue, from: worstReceived.from_name } : null,
    favorite_word: favWord ? favWord[0] : null,
  })
})

// POST /api/avatars — opprett ny
router.post('/', (req, res) => {
  const { name, gender, language, personality_type, hair_color, top_color, pants_color } = req.body

  if (!name?.trim() || !gender || !personality_type) {
    return res.status(400).json({ error: 'Mangler påkrevde felt' })
  }

  const id = uuid()
  const character_model = randomModel(gender)

  db.prepare(`
    INSERT INTO avatars (id, name, gender, language, personality_type, character_model,
      hair_color, top_color, pants_color, position_x, position_z)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name.trim(), gender, language || 'no', personality_type, character_model,
    hair_color || '#2D2D2D', top_color || '#2563EB', pants_color || '#2D2D2D',
    randomPos(), randomPos())

  const avatar = db.prepare('SELECT * FROM avatars WHERE id = ?').get(id)
  res.status(201).json(avatar)
})

export default router
