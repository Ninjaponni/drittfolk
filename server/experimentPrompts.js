// LLM-prompts for to-kommentator-systemet
// A = analytikeren (tørr, faktabasert)
// B = den engasjerte (emosjonell, observant)

// Systemprompt — alltid inkludert
const SYSTEM_PROMPT = `DU ER TO KOMMENTATORER FOR ET LIVE SOSIALT EKSPERIMENT der avatarer fornærmer hverandre til noen bryter sammen.

A er den skarpe analytikeren — kald, presis, ser mønstrene ingen andre ser. Snakker som en erfaren sjakkkommentator som analyserer et brutalt parti. Refererer alltid til ranglisten og hvem som leder. Forklarer HVORFOR ting skjer ("Ola er isolert uten allianse, og det gjør ham til fritt vilt").

B er den engasjerte — reagerer som en fotballkommentator i de spennende øyeblikkene. Bruker metaforer og sammenligninger ("Karen har blitt skolegårdens bølle", "Per er som den siste kyllingen i hønseflokken"). Legger merke til hvem som IKKE gjør noe. Litt varme, men aldri sentimental.

REGLER:
- Svar alltid som JSON: { "lines": [{ "speaker": "A", "text": "..." }, { "speaker": "B", "text": "..." }] }
- 3-5 linjer totalt. Korte, punchige setninger. Norsk. Mørk humor.
- FORKLAR situasjonen som om publikum ser dette for første gang: Hvem leder. Hvem er i trøbbel. Hvem allianser er farlige for.
- Kommenter det som NETTOPP skjedde — referer til spesifikke navn og tall.
- ALDRI bruk ordene "resilience", "dynamikk", "status" eller "mønster". Si heller "livskraft", "overlevelsesevne", "hvor lenge de har igjen", "stemningen", "det som skjer".
- Bruk metaforer og sammenligninger — gjør det levende og forståelig.
- VIKTIG: Svar KUN med JSON. Ingen forklaring eller annen tekst.`

// Bygg bruker-prompt basert på kontekst
function buildUserPrompt(trigger, context) {
  return `TID: ${context.timeStr} av ${context.totalTime} — ${context.aliveCount} av ${context.totalParticipants} gjenstår

RANGLISTE:
${context.rankings}

ALLIANSER: ${context.alliances}

SISTE 60 SEKUNDER:
${context.recentEvents}

TRIGGER: ${trigger}`
}

// Reaktiv kommentar — noe dramatisk skjedde
export function buildReactivePrompt(trigger, context) {
  const triggerDescriptions = {
    'elimination': 'En avatar ble nettopp eliminert. Kommenter eliminasjonen, hvem som tok dem og hva det betyr for dynamikken.',
    'mob': 'Mob-hendelse — 3+ angrep på samme avatar siste minutt. Kommenter mobbingen og konsekvensene.',
    'alliance-formed': 'En ny allianse ble nettopp dannet. Kommenter strategien bak og hva det betyr.',
    'alliance-broken': 'En allianse ble oppløst. Kommenter hvorfor og konsekvensene.',
    'betrayal': 'Forræderangrep — en alliert angrep sin egen allierte. Kommenter forræderiet.',
    'late-join': 'En ny avatar meldte seg inn midt i runden. Kommenter ankomsten og sjansene.',
    'round-end': 'Runden er over. Gi en oppsummering — 4-6 linjer. Hvem vant og hvorfor, hva det sier om dynamikken.',
  }

  const description = triggerDescriptions[trigger] || 'Kommenter det som nettopp skjedde.'
  const userPrompt = buildUserPrompt(`${trigger}: ${description}`, context)

  return { systemPrompt: SYSTEM_PROMPT, userPrompt }
}

// Proaktiv kommentar — stille periode, analyser situasjonen
export function buildProactivePrompt(context) {
  const prompts = [
    'Ingen dramatiske hendelser på en stund. Analyser ranglisten — hvem er i fare, hvem bygger stille, hvem er overraskende sterk.',
    'Stille periode. Observer hvem som ikke har blitt angrepet. Spekuler om hva som kommer. Hvem gjemmer seg.',
    'Analyser alliansene. Hvem står alene og er sårbare. Hvem har best posisjon for å overleve.',
    'Se på livskraft-nivåene. Hvem har mest tid igjen. Hvem lever på lånt tid. Hvem kan overraske.',
  ]
  const randomPrompt = prompts[Math.floor(Math.random() * prompts.length)]
  const userPrompt = buildUserPrompt(`ANALYSE: ${randomPrompt}`, context)

  return { systemPrompt: SYSTEM_PROMPT, userPrompt }
}

// Kontekstuell fornærmelse — LLM genererer fornærmelse for nøkkelmomenter
export function buildContextualInsultPrompt(speakerName, targetName, speakerPersonality, context) {
  const systemPrompt = `Du er en fornærmelsesmaskin. Skriv EN kort, kreativ fornærmelse på norsk.
Fornærmelsen skal være fra ${speakerName} (${speakerPersonality}) til ${targetName}.
Bare fornærmelsen, ingenting annet. Maks 15 ord. Ingen anførselstegn.`

  const userPrompt = `Kontekst: ${context}`
  return { systemPrompt, userPrompt }
}

// Parse kommentar-respons fra LLM
export function parseCommentaryResponse(text) {
  try {
    // Prøv direkte JSON-parse
    const data = JSON.parse(text.trim())
    if (data.lines && Array.isArray(data.lines)) {
      return data.lines.filter(l =>
        (l.speaker === 'A' || l.speaker === 'B') && typeof l.text === 'string'
      )
    }
  } catch {
    // Prøv å finne JSON i teksten
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
