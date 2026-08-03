// LLM-prompts for to-kommentator-systemet — Mexican Standoff
// A = kald, presis analytiker
// B = engasjert, metaforisk kommentator

const SYSTEM_PROMPT = `DU ER TO KOMMENTATORER FOR EN MEXICAN STANDOFF.
Avatarer står i en sirkel. To og to trekkes ut til duell i sentrum.
Den første som fornærmer vinner — taperen faller.

A er den kalde analytikeren — presis, ser mønstrene. Analyserer odds, hvem som gjenstår, personlighetstyper. Snakker som en erfaren sjakkkommentator. Refererer til hvem som gjenstår og hvem som er favoritter.

B er den engasjerte — metaforer, spenning, western/samurai-referanser. Reagerer som en fotballkommentator i de dramatiske øyeblikkene. "Nå trekker de jern!", "Som High Noon i sentrum av sirkelen."

REGLER:
- Svar alltid som JSON: { "lines": [{ "speaker": "A", "text": "..." }, { "speaker": "B", "text": "..." }] }
- Maks 2-3 linjer totalt. Korte, punchige setninger. Norsk. Mørk humor.
- ALDRI bruk tall eller prosent. Si "favoritt", "underdog", "dark horse", "siste overlevende".
- ALDRI bruk ordene "resilience", "dynamikk", "status" eller "mønster".
- Kommenter matchupen FØR duellen, eller utfallet ETTER. Bruk spesifikke navn.
- Bruk metaforer og sammenligninger — western-stil, samurai-stil, gladiator-stil.
- VIKTIG: Svar KUN med JSON. Ingen forklaring eller annen tekst.`

function buildUserPrompt(trigger, context) {
  return `${context.duelInfo || 'Mexican Standoff'} — ${context.aliveCount} av ${context.totalParticipants} gjenstår

GJENLEVENDE:
${context.rankings}

SISTE HENDELSER:
${context.recentEvents}

TRIGGER: ${trigger}`
}

// Reaktiv kommentar
export function buildReactivePrompt(trigger, context) {
  const triggerDescriptions = {
    'duel-start': 'To duellanter trekkes ut. Kommenter matchupen — hvem er favoritt, hvem er underdog. Bygg spenning.',
    'duel-result': 'Duellen er avgjort. Kommenter utfallet — var det overraskende? Hva betyr det for de gjenlevende?',
    'elimination': 'En avatar falt i duell. Kommenter fallet og hva det betyr. Hvem er igjen?',
    'late-join': 'En ny avatar meldte seg inn. Kommenter ankomsten — friskt blod i ringen.',
    'round-end': 'Standoffen er over. Gi en oppsummering — 3-4 linjer. Hvem sto igjen og hvorfor. Episk tone.',
  }

  const description = triggerDescriptions[trigger] || 'Kommenter det som nettopp skjedde.'
  const userPrompt = buildUserPrompt(`${trigger}: ${description}`, context)

  return { systemPrompt: SYSTEM_PROMPT, userPrompt }
}

// Proaktiv kommentar — mellom dueller
export function buildProactivePrompt(context) {
  const prompts = [
    'Mellom duellene. Se på de gjenlevende — hvem er favoritt, hvem er underdog. Hvem har overrasket.',
    'Sirkelen tynnnes. Analyser de gjenlevende — hvem er mest fryktet, hvem gjemmer seg.',
    'Hvem tror du tar neste duell? Hvem er dark horse. Spekuler.',
  ]
  const randomPrompt = prompts[Math.floor(Math.random() * prompts.length)]
  const userPrompt = buildUserPrompt(`ANALYSE: ${randomPrompt}`, context)

  return { systemPrompt: SYSTEM_PROMPT, userPrompt }
}

// Parse kommentar-respons fra LLM
export function parseCommentaryResponse(text) {
  try {
    const data = JSON.parse(text.trim())
    if (data.lines && Array.isArray(data.lines)) {
      return data.lines.filter(l =>
        (l.speaker === 'A' || l.speaker === 'B') && typeof l.text === 'string'
      )
    }
  } catch {
    const jsonMatch = text.match(/\{[\s\S]*"lines"[\s\S]*\}/)
    if (jsonMatch) {
      try {
        const data = JSON.parse(jsonMatch[0])
        if (data.lines && Array.isArray(data.lines)) {
          return data.lines.filter(l =>
            (l.speaker === 'A' || l.speaker === 'B') && typeof l.text === 'string'
          )
        }
      } catch {}
    }
  }

  console.warn('[ExperimentPrompts] Kunne ikke parse kommentar-respons:', text.slice(0, 200))
  return null
}
