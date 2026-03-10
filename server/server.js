import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import avatarRoutes from './routes/avatars.js'
import { startInsultEngine } from './insultEngine.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 3001

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: { origin: '*' },
})

app.use(express.json())

// API-routes
app.use('/api/avatars', avatarRoutes)

// Serve statisk frontend i produksjon
const clientDist = join(__dirname, '..', 'client', 'dist')
app.use(express.static(clientDist))
// Express 5: wildcard bruker {*path} syntaks
app.get('{*path}', (req, res) => {
  res.sendFile(join(clientDist, 'index.html'))
})

// WebSocket
io.on('connection', (socket) => {
  console.log('[WS] Klient tilkoblet:', socket.id)
  socket.on('disconnect', () => {
    console.log('[WS] Klient frakoblet:', socket.id)
  })
})

// Kjør seed ved oppstart (idempotent)
import('./seed.js').then(() => {
  // Start insult engine etter seed
  if (process.env.ANTHROPIC_API_KEY) {
    startInsultEngine(io)
  } else {
    console.log('[InsultEngine] ANTHROPIC_API_KEY ikke satt — kjører uten AI-fornærmelser')
  }
})

httpServer.listen(PORT, () => {
  console.log(`[Drittfolk] Server kjører på http://localhost:${PORT}`)
})

// Eksporter io for bruk i routes om nødvendig
export { io }
