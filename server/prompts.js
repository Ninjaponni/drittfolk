import { VALID_ANIMATION_IDS } from './shared-animations.js'

const PERSONALITY_PROMPTS = {
  aggressive: 'Du er direkte, høylytt og konfronterende. Du sier ting rett ut uten filter.',
  passive_aggressive: 'Du er subtil og stikker med et smil. Fornærmelsene dine er pakket inn i falsk vennlighet.',
  arrogant: 'Du ser ned på alle. Alt du sier utstråler at du er bedre enn alle andre.',
  sarcastic: 'Alt du sier er gjennomsyret av ironi og tørrvittighet. Du bruker sarkasme som våpen.',
  dramatic: 'Du overdriver alt. Alt er verdens undergang eller den største triumf. Drama er ditt native tongue.',
  sycophant: 'Du er falskt hyggelig og dolker folk i ryggen. Komplimentene dine er forgiftede.',
  narcissist: 'Alt handler om deg. Du klarer ikke å snakke om andre uten å snu det tilbake til deg selv.',
}

const PERSONALITY_PROMPTS_EN = {
  aggressive: 'You are direct, loud, and confrontational. You say things straight without any filter.',
  passive_aggressive: 'You are subtle and stab with a smile. Your insults are wrapped in fake friendliness.',
  arrogant: 'You look down on everyone. Everything you say radiates that you are better than everyone else.',
  sarcastic: 'Everything you say drips with irony and dry wit. You use sarcasm as a weapon.',
  dramatic: 'You exaggerate everything. Everything is the end of the world or the greatest triumph.',
  sycophant: 'You are fake nice and stab people in the back. Your compliments are poisoned.',
  narcissist: 'Everything is about you. You cannot talk about others without turning it back to yourself.',
}

export function buildPrompt(speaker, target) {
  // Velg språk basert på taleren
  const lang = speaker.language || 'no'
  const prompts = lang === 'en' ? PERSONALITY_PROMPTS_EN : PERSONALITY_PROMPTS

  const systemPrompt = lang === 'en'
    ? `You are generating dialogue for a dark humor art installation called "DRITTFOLK" where avatars insult each other. The insults should be creative, absurd, and darkly funny — never genuinely hateful, racist, sexist, or targeting real vulnerabilities. Think playground insults meets Oscar Wilde.

You must respond with valid JSON only, no other text.

Available animations: ${VALID_ANIMATION_IDS.join(', ')}`

    : `Du genererer dialog for en kunstinstallasjon med mørk humor kalt "DRITTFOLK" der avatarer fornærmer hverandre. Fornærmelsene skal være kreative, absurde og mørkt morsomme — aldri genuint hatefulle, rasistiske, sexistiske, eller rettet mot ekte sårbarheter. Tenk lekeplassfornærmelser møter Oscar Wilde.

Du MÅ svare med gyldig JSON og ingenting annet.

Tilgjengelige animasjoner: ${VALID_ANIMATION_IDS.join(', ')}`

  const speakerPrompt = prompts[speaker.personality_type] || prompts.sarcastic
  const targetPrompt = prompts[target.personality_type] || prompts.sarcastic

  const userPrompt = lang === 'en'
    ? `Speaker: "${speaker.name}" (${speaker.personality_type}). ${speakerPrompt}
Target: "${target.name}" (${target.personality_type}). ${targetPrompt}

Generate a short insult exchange. The speaker says something first, then the target responds.
Keep each line under 120 characters.

Respond with this exact JSON format:
{
  "dialogue": "What the speaker says",
  "speaker_animation": "animation_id",
  "response": "What the target responds",
  "target_animation": "animation_id"
}`
    : `Taler: "${speaker.name}" (${speaker.personality_type}). ${speakerPrompt}
Mål: "${target.name}" (${target.personality_type}). ${targetPrompt}

Generer en kort fornærmelses-utveksling. Taleren sier noe først, så svarer målet.
Hold hver replikk under 120 tegn.

Svar med dette eksakte JSON-formatet:
{
  "dialogue": "Det taleren sier",
  "speaker_animation": "animasjons_id",
  "response": "Det målet svarer",
  "target_animation": "animasjons_id"
}`

  return { systemPrompt, userPrompt }
}
