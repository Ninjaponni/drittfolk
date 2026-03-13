// Daglig e-post til alle avatarer med e-post
// Kjøres via: node cron/dailyEmail.js (eller crontab kl 08:00)

import { Resend } from 'resend'
import db from '../db.js'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM_EMAIL = 'Dummingene <noreply@drittfolk.no>'

// Hent MVD (Most Valuable Dumming) siste 24t
function getMvdId() {
  const row = db.prepare(`
    SELECT avatar_id, SUM(cnt) as total FROM (
      SELECT speaker_id as avatar_id, COUNT(*) as cnt
      FROM interactions WHERE created_at > datetime('now', '-1 day')
      GROUP BY speaker_id
      UNION ALL
      SELECT target_id as avatar_id, COUNT(*) as cnt
      FROM interactions WHERE created_at > datetime('now', '-1 day')
      GROUP BY target_id
    ) GROUP BY avatar_id ORDER BY total DESC LIMIT 1
  `).get()
  return row?.avatar_id || null
}

// Stats for én avatar siste 24t
function getStats(avatarId) {
  const given24h = db.prepare(`
    SELECT COUNT(*) as cnt FROM interactions
    WHERE speaker_id = ? AND created_at > datetime('now', '-1 day')
  `).get(avatarId)

  const received24h = db.prepare(`
    SELECT COUNT(*) as cnt FROM interactions
    WHERE target_id = ? AND created_at > datetime('now', '-1 day')
  `).get(avatarId)

  const givenTotal = db.prepare(`
    SELECT COUNT(*) as cnt FROM interactions WHERE speaker_id = ?
  `).get(avatarId)

  const receivedTotal = db.prepare(`
    SELECT COUNT(*) as cnt FROM interactions WHERE target_id = ?
  `).get(avatarId)

  // Nemesis siste 24t
  const nemesis = db.prepare(`
    SELECT other_id, name, cnt FROM (
      SELECT
        CASE WHEN speaker_id = ? THEN target_id ELSE speaker_id END as other_id,
        COUNT(*) as cnt
      FROM interactions
      WHERE (speaker_id = ? OR target_id = ?) AND created_at > datetime('now', '-1 day')
      GROUP BY other_id
      ORDER BY cnt DESC LIMIT 1
    ) sub LEFT JOIN avatars ON avatars.id = sub.other_id
  `).get(avatarId, avatarId, avatarId)

  // Siste fornærmelse
  const lastInsult = db.prepare(`
    SELECT dialogue FROM interactions
    WHERE speaker_id = ? ORDER BY created_at DESC LIMIT 1
  `).get(avatarId)

  return {
    given24h: given24h?.cnt || 0,
    received24h: received24h?.cnt || 0,
    givenTotal: givenTotal?.cnt || 0,
    receivedTotal: receivedTotal?.cnt || 0,
    nemesis: nemesis ? { name: nemesis.name, count: nemesis.cnt } : null,
    lastInsult: lastInsult?.dialogue || null,
  }
}

function buildHtml(avatar, stats, isMvd) {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; color: #222;">
      <h2 style="font-weight: 300;">Hei, her er oppdateringen på din dumming ${avatar.name}</h2>

      ${isMvd ? '<p style="background: #ffd700; padding: 12px 16px; border-radius: 8px; font-weight: 500;">Din dumming ble kåret til MVD i dag!</p>' : ''}

      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr><td style="padding: 8px 0; color: #888;">Fornærmelser gitt (24t)</td><td style="text-align: right; font-weight: 500;">${stats.given24h}</td></tr>
        <tr><td style="padding: 8px 0; color: #888;">Fornærmelser gitt (totalt)</td><td style="text-align: right; font-weight: 500;">${stats.givenTotal}</td></tr>
        <tr><td style="padding: 8px 0; color: #888;">Fornærmelser mottatt (24t)</td><td style="text-align: right; font-weight: 500;">${stats.received24h}</td></tr>
        <tr><td style="padding: 8px 0; color: #888;">Fornærmelser mottatt (totalt)</td><td style="text-align: right; font-weight: 500;">${stats.receivedTotal}</td></tr>
        ${stats.nemesis ? `<tr><td style="padding: 8px 0; color: #888;">Erkefiende</td><td style="text-align: right; font-weight: 500;">${stats.nemesis.name} (${stats.nemesis.count}×)</td></tr>` : ''}
      </table>

      ${stats.lastInsult ? `<p style="background: #f5f5f5; padding: 12px 16px; border-radius: 8px; font-style: italic;">"${stats.lastInsult}"</p>` : ''}

      <p style="color: #aaa; font-size: 12px; margin-top: 24px;">— Dummingene</p>
    </div>
  `
}

export async function sendDailyEmails() {
  const avatars = db.prepare("SELECT * FROM avatars WHERE email != ''").all()
  const mvdId = getMvdId()

  console.log(`Sender e-post til ${avatars.length} avatarer...`)

  let sent = 0
  let errors = 0

  for (const avatar of avatars) {
    try {
      const stats = getStats(avatar.id)
      const isMvd = avatar.id === mvdId
      const html = buildHtml(avatar, stats, isMvd)

      await resend.emails.send({
        from: FROM_EMAIL,
        to: avatar.email,
        subject: `Oppdatering: ${avatar.name} i Dummingene`,
        html,
      })
      sent++
      console.log(`  ✓ ${avatar.name} → ${avatar.email}`)
    } catch (err) {
      errors++
      console.error(`  ✗ ${avatar.name}: ${err.message}`)
    }
  }

  console.log(`Ferdig. ${sent} sendt, ${errors} feil.`)
}

// Støtt direkte kjøring: node cron/dailyEmail.js
const isDirectRun = process.argv[1]?.endsWith('dailyEmail.js')
if (isDirectRun) sendDailyEmails()
