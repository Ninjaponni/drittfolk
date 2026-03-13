import cron from 'node-cron'
import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import avatarRoutes from './routes/avatars.js'
import { startBehaviorEngine, getAvatarData } from './behaviorEngine.js'
import roundManager from './roundManager.js'
import { generateCommentary } from './llmProvider.js'
import db from './db.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 3001

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: { origin: '*' },
})

app.use(express.json())

// API-routes — MÅ komme FØR catch-all
app.use('/api/avatars', avatarRoutes)

// Runde-routes
app.post('/api/rounds/start', (req, res) => {
  const avatarData = getAvatarData()
  if (!avatarData || avatarData.size === 0) {
    return res.status(400).json({ error: 'Ingen avatarer registrert' })
  }
  const roundId = roundManager.startRound(avatarData)
  if (!roundId) {
    return res.status(409).json({ error: 'Runde allerede aktiv' })
  }
  res.json({ roundId })
})

app.get('/api/rounds/current', (req, res) => {
  const state = roundManager.getRoundState()
  res.json(state)
})

app.get('/api/rounds/:id', (req, res) => {
  const round = db.prepare('SELECT * FROM rounds WHERE id = ?').get(req.params.id)
  if (!round) return res.status(404).json({ error: 'Ikke funnet' })

  const participants = db.prepare(
    'SELECT rp.*, a.name FROM round_participants rp JOIN avatars a ON a.id = rp.avatar_id WHERE rp.round_id = ? ORDER BY rp.final_rank ASC'
  ).all(req.params.id)

  res.json({ ...round, participants })
})

// Serve statisk frontend i produksjon
const clientDist = join(__dirname, '..', 'client', 'dist')
app.use(express.static(clientDist))
// Express 5: wildcard bruker {*path} syntaks — MÅ komme ETTER alle API-routes
app.get('{*path}', (req, res) => {
  res.sendFile(join(clientDist, 'index.html'))
})

// WebSocket
io.on('connection', (socket) => {
  console.log('[WS] Klient tilkoblet:', socket.id)

  // Send gjeldende runde-state til nye klienter
  const roundState = roundManager.getRoundState()
  if (roundState) {
    socket.emit('round-state', roundState)
  }

  socket.on('disconnect', () => {
    console.log('[WS] Klient frakoblet:', socket.id)
  })
})

// Initialiser roundManager med io og kommentar-callback
roundManager.init(io)
roundManager.setCommentaryCallback(async (trigger, context) => {
  try {
    const commentary = await generateCommentary(trigger, context)
    if (commentary && commentary.length > 0) {
      io.emit('commentary', { lines: commentary, trigger })
    }
  } catch (err) {
    console.warn('[Commentary] Feil ved generering:', err.message)
  }
})

// Kjør seed ved oppstart (idempotent), deretter behavior engine
import('./seed.js').then(() => {
  startBehaviorEngine(io)
})

httpServer.listen(PORT, () => {
  console.log(`[Drittfolk] Server kjører på http://localhost:${PORT}`)
})

// Daglig e-post kl 08:00
cron.schedule('0 8 * * *', async () => {
  console.log('[Cron] Sender daglige e-poster...')
  const { sendDailyEmails } = await import('./cron/dailyEmail.js')
  await sendDailyEmails()
})

// Eksporter io for bruk i routes om nødvendig
export { io }
