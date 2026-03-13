import { Router } from 'express'
import { v4 as uuid } from 'uuid'
import db from '../db.js'
import { registerAvatar, removeAvatarFromEngine } from '../behaviorEngine.js'

const router = Router()

// Tilfeldig posisjon i arenaen
function randomPos() {
  return (Math.random() - 0.5) * 25
}

// Smart spawn — velg posisjon med størst min-avstand til eksisterende avatarer
function smartSpawnPos(existingAvatars) {
  const MIN_SPAWN_DISTANCE = 2.0
  let bestPos = { x: randomPos(), z: randomPos() }
  let bestMinDist = 0

  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = { x: randomPos(), z: randomPos() }
    let minDist = Infinity
    for (const a of existingAvatars) {
      const dx = candidate.x - a.position_x
      const dz = candidate.z - a.position_z
      const dist = Math.sqrt(dx * dx + dz * dz)
      if (dist < minDist) minDist = dist
    }
    if (minDist > bestMinDist) {
      bestMinDist = minDist
      bestPos = candidate
    }
    if (bestMinDist >= MIN_SPAWN_DISTANCE) break
  }
  return bestPos
}

// Synty-modeller — Office, City og Construction (alle har identisk skjelett: Pelvis/spine_01, 48 joints)
// Shops-pakken har annet skjelett (Root/Hips, 50 joints) og er IKKE kompatibel
const MODELS = {
  male: [
    // Office
    'SK_Chr_Boss_Male_01.glb', 'SK_Chr_Business_Male_01.glb', 'SK_Chr_Business_Male_02.glb',
    'SK_Chr_Business_Male_03.glb', 'SK_Chr_Business_Male_04.glb', 'SK_Chr_Cleaner_Male_01.glb',
    'SK_Chr_Developer_Male_01.glb', 'SK_Chr_Developer_Male_02.glb', 'SK_Chr_Security_Male_01.glb',
    // City
    'SK_Character_BusinessMan_Shirt.glb', 'SK_Character_BusinessMan_Suit.glb',
    'SK_Character_Male_Hoodie.glb', 'SK_Character_Male_Jacket.glb', 'SK_Character_Male_Police.glb',
    // Construction
    'SK_Chr_Builder_Male_01.glb', 'SK_Chr_Builder_Harness_01.glb', 'SK_Chr_Builder_HighVis_01.glb',
    'SK_Chr_Builder_Overalls_01.glb', 'SK_Chr_Builder_Raincoat_01.glb', 'SK_Chr_Builder_Singlet_01.glb',
    'SK_Chr_Inspector_Male_01.glb',
  ],
  female: [
    // Office
    'SK_Chr_Boss_Female_01.glb', 'SK_Chr_Business_Female_01.glb', 'SK_Chr_Business_Female_02.glb',
    'SK_Chr_Business_Female_03.glb', 'SK_Chr_Business_Female_04.glb', 'SK_Chr_Cleaner_Female_01.glb',
    'SK_Chr_Developer_Female_01.glb', 'SK_Chr_Developer_Female_02.glb', 'SK_Chr_Security_Female_01.glb',
    // City
    'SK_Character_BusinessWoman.glb', 'SK_Character_Female_Coat.glb',
    'SK_Character_Female_Jacket.glb', 'SK_Character_Female_Police.glb',
    // Construction
    'SK_Chr_Builder_Female_01.glb', 'SK_Chr_Inspector_Female_01.glb',
  ],
}

// Velg unik modell+variant-kombinasjon — unngår duplikater i scenen
function pickUniqueModelAndVariant(gender) {
  const used = new Set(
    db.prepare('SELECT character_model, texture_variant FROM avatars')
      .all()
      .map(r => `${r.character_model}:${r.texture_variant}`)
  )

  // Shufflet kopi av modell-listen
  const models = [...(MODELS[gender] || MODELS.male)]
  for (let i = models.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [models[i], models[j]] = [models[j], models[i]]
  }

  // Pass 1: ubrukt modell med standardvariant
  for (const m of models) {
    if (!used.has(`${m}:1`)) return { model: m, variant: 1 }
  }

  // Pass 2: ubrukt modell+variant-kombinasjon (variant 2–4)
  for (const m of models) {
    for (let v = 2; v <= 4; v++) {
      if (!used.has(`${m}:${v}`)) return { model: m, variant: v }
    }
  }

  // Fallback: tilfeldig (alle 144 tatt)
  return {
    model: models[Math.floor(Math.random() * models.length)],
    variant: Math.ceil(Math.random() * 4)
  }
}

// Fargepalett for tilfeldig tildeling
const COLORS = [
  '#2D2D2D', '#8B4513', '#D4A574', '#FFD700', '#FF6B35',
  '#C41E3A', '#1B4D3E', '#2563EB', '#7C3AED', '#EC4899',
]

function randomColor() {
  return COLORS[Math.floor(Math.random() * COLORS.length)]
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

// GET /api/avatars/mvd — Most Valuable Dumming (siste 24t)
router.get('/mvd', (req, res) => {
  const mvdRow = db.prepare(`
    SELECT avatar_id, name, cnt FROM (
      SELECT avatar_id, SUM(cnt) as cnt FROM (
        SELECT speaker_id as avatar_id, COUNT(*) as cnt
        FROM interactions WHERE created_at > datetime('now', '-1 day')
        GROUP BY speaker_id
        UNION ALL
        SELECT target_id as avatar_id, COUNT(*) as cnt
        FROM interactions WHERE created_at > datetime('now', '-1 day')
        GROUP BY target_id
      ) GROUP BY avatar_id
      ORDER BY cnt DESC LIMIT 1
    ) sub
    LEFT JOIN avatars ON avatars.id = sub.avatar_id
  `).get()

  if (!mvdRow) {
    return res.json(null)
  }

  const lastInsult = db.prepare(`
    SELECT dialogue FROM interactions
    WHERE speaker_id = ? OR target_id = ?
    ORDER BY created_at DESC LIMIT 1
  `).get(mvdRow.avatar_id, mvdRow.avatar_id)

  res.json({
    id: mvdRow.avatar_id,
    name: mvdRow.name,
    interaction_count: mvdRow.cnt,
    last_insult: lastInsult?.dialogue || null,
  })
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

  // Verste mottatt — siste fornærmelse fra nemesis
  const worstReceived = nemesisRow ? db.prepare(`
    SELECT dialogue, a.name as from_name FROM interactions i
    JOIN avatars a ON a.id = i.speaker_id
    WHERE i.target_id = ? AND i.speaker_id = ?
    ORDER BY i.created_at DESC LIMIT 1
  `).get(id, nemesisRow.other_id) : null

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
  const { name, gender, personality_type, email } = req.body

  if (!name?.trim() || !gender || !personality_type) {
    return res.status(400).json({ error: 'Mangler påkrevde felt' })
  }

  if (email && !email.includes('@')) {
    return res.status(400).json({ error: 'Ugyldig e-postformat' })
  }

  const id = uuid()
  const { model: character_model, variant: texture_variant } = pickUniqueModelAndVariant(gender)

  // Smart spawn — finn posisjon med god avstand til eksisterende avatarer
  const existingAvatars = db.prepare('SELECT position_x, position_z FROM avatars').all()
  const spawnPos = smartSpawnPos(existingAvatars)

  db.prepare(`
    INSERT INTO avatars (id, name, gender, language, personality_type, character_model, texture_variant,
      hair_color, top_color, pants_color, email, position_x, position_z)
    VALUES (?, ?, ?, 'no', ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name.trim(), gender, personality_type, character_model, texture_variant,
    randomColor(), randomColor(), randomColor(), email?.trim() || '',
    spawnPos.x, spawnPos.z)

  const avatar = db.prepare('SELECT * FROM avatars WHERE id = ?').get(id)

  // Registrer i behaviorEngine så den deltar i interaksjoner
  registerAvatar(avatar)

  res.status(201).json(avatar)
})

// DELETE /api/avatars/:id — slett avatar
router.delete('/:id', (req, res) => {
  const avatar = db.prepare('SELECT * FROM avatars WHERE id = ?').get(req.params.id)
  if (!avatar) return res.status(404).json({ error: 'Ikke funnet' })

  // Slett interaksjoner og avatar
  db.prepare('DELETE FROM interactions WHERE speaker_id = ? OR target_id = ?').run(avatar.id, avatar.id)
  db.prepare('DELETE FROM avatars WHERE id = ?').run(avatar.id)

  // Fjern fra behaviorEngine
  removeAvatarFromEngine(avatar.id)

  res.json({ ok: true })
})

export default router
