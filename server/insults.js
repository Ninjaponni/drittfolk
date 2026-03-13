// Ferdigskrevne fornærmelser med cooldown for DRITTFOLK
// Kuratert pool — ingen LLM nødvendig
// Delt i 3 tiers: mild (hverdagslig), medium (personlig), savage (brutalt)

const INSULTS_MILD = [
  'Kalenderen min har ingen plass til deg.',
  'Du er typen folk husker feil navn på.',
  'Du er den typen menneske pausemusikk ble laget for.',
  'Du er som et møte som kunne vært en epost.',
  'Jeg har sett mer engasjement i en avkjølt suppe.',
  'Du minner om en notifikasjon jeg avviste.',
  'Du er som en oppdatering ingen ba om.',
  'Fuglen utenfor vinduet nevnte ikke deg.',
  'Du rangerer rett under lunken kaffe på engasjement.',
  'Du er bakgrunnsstøyen i andres liv.',
  'Du minner om en epost ingen åpnet.',
  'Til og med skjermsparer er mer underholdende.',
  'Du er typen som gjør heisen stille.',
  'Du er som en bruksanvisning ingen ba om.',
  'Du er typen folk sier "javel" til.',
  'Du minner meg om et ord jeg ikke gidder å slå opp.',
  'Du er som et ubesvart spørsmål ingen stilte.',
  'Du minner om et møte folk glemte å avlyse.',
  'Du kjeder meg.',
  'Regnet er mer velkomment enn deg.',
]

const INSULTS_MEDIUM = [
  'Støvet under sofaen har mer personlighet enn deg.',
  '80-tallet ringte og du ble ikke nevnt.',
  'Du smaker som et valg jeg angrer på.',
  'Dopapir har mer personlighet enn deg.',
  'Jeg kjenner kontorstoler med mer karisma enn deg.',
  'Du minner meg om en ferie som ble avlyst av gode grunner.',
  'Selv autokorrektur hadde gitt opp på deg.',
  'En tom stol hadde gjort mer inntrykk.',
  'Du har energien til en slukket lyspære.',
  'Parkeringsautomaten viser mer følelser enn deg.',
  'Kvitteringen i lommen min har mer verdi.',
  'Du er som en podcast ingen abonnerer på.',
  'Du har personligheten til et utgått gavekort.',
  'Jeg kjenner parkeringsbøter med mer sjarm enn deg.',
  'Du er den typen trivia ingen gidder å huske.',
  'Selv en feilmelding er mer engasjerende.',
  'Ingen la merke til at du kom.',
  'Jeg har sett mer nerve i en våt serviett.',
  'Stolen du sitter på gjør mer inntrykk enn deg.',
  'Du er typen trivia som stopper alle samtaler.',
]

const INSULTS_SAVAGE = [
  'Du lukter som en våt sokk.',
  'Min hund liker deg ikke.',
  'Du ser ut som noen jeg ikke bryr meg om.',
  'Du ble mistet i bakken som barn.',
  'Du er som en melding sendt til feil person – ingen savnet den.',
  'Jeg kjenner utgåtte batterier med mer potensial enn deg.',
  'Du er den typen samtale folk husker som stillhet.',
  'Selv tomme rom har mer atmosfære enn deg.',
  'Du minner meg om en sang jeg skrur av uten å huske den.',
  'Jeg har møtt mellomrom i tekst med mer tilstedeværelse enn deg.',
  'Du er typen som får folk til å sjekke telefonen.',
  'Jeg har sett mer entusiasme i en utløpt yoghurt.',
  'Jeg har allerede glemt deg.',
  'Jeg kommer til å ignorere deg i stillhet.',
  'Du er som skikkelig dårlig reality ingen ser på.',
  'Håper det ikke kommer en sesong 2 av deg.',
  'Spoleralert! Du er en idiot.',
  'Jeg stemmer deg ut.',
]

// Flat liste for bakoverkompatibilitet
const INSULTS = [...INSULTS_MILD, ...INSULTS_MEDIUM, ...INSULTS_SAVAGE]

// Cooldown — samme fornærmelse kan ikke gjenbrukes innen 5 minutter
const COOLDOWN_MS = 5 * 60 * 1000
const cooldownMap = new Map() // fornærmelse → timestamp

// Plukk en tilfeldig fornærmelse som ikke er i cooldown
export function pickInsult() {
  const now = Date.now()
  const available = INSULTS.filter(insult => {
    const lastUsed = cooldownMap.get(insult)
    return !lastUsed || (now - lastUsed) >= COOLDOWN_MS
  })

  if (available.length === 0) return null

  const pick = available[Math.floor(Math.random() * available.length)]
  cooldownMap.set(pick, now)
  return pick
}

// Plukk fornærmelse basert på status (høyere status = tilgang til sterkere tier)
export function pickInsultByWeight(status = 50) {
  const now = Date.now()

  // Velg tier basert på status
  let pool
  if (status >= 70) {
    // Høy status — tilgang til savage
    const r = Math.random()
    if (r < 0.4) pool = INSULTS_SAVAGE
    else if (r < 0.75) pool = INSULTS_MEDIUM
    else pool = INSULTS_MILD
  } else if (status >= 40) {
    // Medium — mest medium
    const r = Math.random()
    if (r < 0.1) pool = INSULTS_SAVAGE
    else if (r < 0.6) pool = INSULTS_MEDIUM
    else pool = INSULTS_MILD
  } else {
    // Lav status — mest mild
    const r = Math.random()
    if (r < 0.6) pool = INSULTS_MILD
    else if (r < 0.9) pool = INSULTS_MEDIUM
    else pool = INSULTS_SAVAGE
  }

  const available = pool.filter(insult => {
    const lastUsed = cooldownMap.get(insult)
    return !lastUsed || (now - lastUsed) >= COOLDOWN_MS
  })

  if (available.length === 0) return pickInsult() // fallback til vanlig pool

  const pick = available[Math.floor(Math.random() * available.length)]
  cooldownMap.set(pick, now)
  return pick
}

