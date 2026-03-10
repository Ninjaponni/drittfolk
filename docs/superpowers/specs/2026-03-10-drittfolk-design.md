# Drittfolk — MVP Design Spec

## Konsept
Digital kunstinstallasjon: en hvit uendelighet der avatarer er fordømt til evig fornærmelse. Brukere kan sende inn avatarer av "drittfolk" som lever videre i arenaen og fornærmer hverandre non-stop. Mørk humor, katarsis, voyeurisme.

Åpen nettside — hvem som helst kan besøke og observere kaoset.

## Brukeropplevelse

### Landing: Rett inn i kaoset
- Ingen splash screen, ingen forklaring — brukeren lander direkte i 3D-arenaen
- Avatarer vandrer rundt, fornærmer hverandre, snakkebobler popper opp
- Kamera starter med en langsom, cinematisk bevegelse gjennom arenaen
- Brukeren tar over kamera-kontroll med mus/touch (OrbitControls)

### UI: Minimalistisk og elegant
- **Ingen synlige menyer ved landing** — bare 3D-scenen
- Subtil, tynn menybar (fade-in etter noen sekunder):
  - Søkefelt (ikon som ekspanderer)
  - "+" knapp for avatar-maker
  - Prosjekttittel "DRITTFOLK" i elegant typografi
- All UI er semi-transparent, tynne linjer, god typografi
- Glassmorphism eller lignende moderne estetikk
- UI forsvinner når brukeren ikke interagerer (auto-hide)

### Avatar-Maker (åpnes fra "+"-knapp)
1. Navn (fritekst)
2. Kjønn (mann/kvinne) — filtrerer Synty-modeller
3. Personlighetstype — velg én:
   - Aggressiv (direkte, høylytt, konfronterende)
   - Passiv-aggressiv (stikk med et smil, subtile fornærmelser)
   - Arrogant (ser ned på alle, bedreviter)
   - Sarkastisk (alt er ironi, tørrvittig)
   - Dramatisk (overdriver alt, Queen/King of drama)
   - Smiskete (falsk hyggelig, dolker i ryggen)
   - Narsisist (alt handler om meg, alle andre er under meg)
   - (Utvidbar — bare en string i databasen)
4. Hårfarge — palett (8-10 farger)
5. Overdel-farge (genser/bluse/skjorte) — palett
6. Buksefarge — palett
7. Språk (norsk/engelsk)
8. Tilfeldig Synty-modell innenfor valgt kjønn
9. 3D-forhåndsvisning av figuren
10. "Send inn til arenaen" — avatar dukker opp i verdenen

### Avatar-fokus (klikk eller søk)
- Kamera flyr elegant inn og følger avataren
- Avatar posisjonert til venstre i bilde
- Statistikkpanel glir inn fra høyre (mørkt, semi-transparent)
- Kameraet følger avataren på en behagelig, cinematisk måte
- Klikk utenfor eller "X" for å gå tilbake til fri navigasjon

### Statistikk-kort
- Navn + personlighetstype + tid i arenaen
- Fornærmelser gitt / mottatt
- Nemesis — avataren med flest gjensidige interaksjoner (all-time). Vises som "Ingen ennå" hvis < 3 interaksjoner
- Favorittfornærmelse — den de har brukt oftest (all-time)
- Verste fornærmelse mottatt — sitert med avsender (all-time)
- Yndlingsord — hyppigste ord i fornærmelsene, filtrert for stoppord, på avatarens språk

## AI Insult Engine

### Personlighetstype som driver
Personlighetstypen er hovedinput til Claude-prompten og styrer:
- **Tone:** Aggressiv er direkte og høylytt, Passiv-aggressiv er subtil og smilende
- **Ordvalg:** Narsisist snakker om seg selv, Sarkastisk bruker ironi
- **Reaksjonsstil:** Dramatisk overreagerer, Arrogant er avvisende

### Fornærmelse-syklus (~hvert 10. sekund)
1. Server velger 2 tilfeldige avatarer som ikke er i interaksjon
2. Claude Haiku API-kall med begge avatarers navn, personlighetstype og språk
3. Returnerer strukturert JSON:
   ```json
   {
     "speaker": "avatar_id_1",
     "dialogue": "Du er den typen som tar med fisk i mikrobølgen.",
     "animation": "angry_point",
     "response": {
       "dialogue": "Haha, i det minste HAR jeg jobb.",
       "animation": "dismissive_wave"
     }
   }
   ```
4. Animasjonsnavn velges fra fast bibliotek (30-40+ Mixamo-animasjoner)
5. WebSocket pusher interaksjonen til alle klienter
6. Stats oppdateres i databasen

### Rate limiting
- Serveren velger et nytt par hvert ~10. sekund (global ticker)
- En avatar kan ikke bli valgt som speaker igjen før minimum 30s etter sist
- Flere interaksjoner kan være aktive samtidig (ulike par)

### Animasjon-fallback
- Claude velger fra en definert liste med animasjonsnavn
- Hvis AI returnerer et ugyldig navn → fallback til `idle`
- Listen med gyldige animasjoner sendes som del av prompten

### Interaksjonsformat
- Alltid 1-til-1 (to avatarer)
- Snakkebobler med tekst, ingen lyd
- Speaker-boble vises først, respons etter ~2s
- Bobler fader ut etter 5s
- Begge kan være synlige samtidig en kort periode

## 3D Scene

### Arena
- Hvit uendelighet — ingen gulv, ingen vegger
- Figurene "svever" i hvitt tomrom (evt. subtil soft shadow under føttene)
- Lys: soft ambient + mild directional for shadows
- Logisk arena-størrelse: ~100×100 enheter, avatarer spawner tilfeldig innenfor
- Enkel collision avoidance: avatarer holder minimum 2 enheter avstand
- Når to avatarer matches for interaksjon, går de mot hverandre til ~3 enheter avstand

### Avatarer
- Synty Polygon Office Pack (18 modeller, FBX → GLB)
- Farge-customisering: hår, overdel, bukse via material-tinting
- Vandrer sakte rundt (idle-bevegelse) når ikke i interaksjon
- Går mot hverandre når interaksjon starter

### Animasjoner
- Delte animasjoner (Mixamo "Without Skin") — én fil per animasjon, brukes av alle
- 30-40+ animasjoner: idle, walk, gestures, reaksjoner, følelser
- Three.js AnimationMixer per avatar-instans
- Claude velger animasjonsnavn fra komplett liste

### Snakkebobler
- drei Html-overlay forankret over avatarens hode
- CSS-stylet: clean, hvit boble med subtil skygge
- Fader inn/ut med smooth animasjon

## Teknisk arkitektur

### Frontend
- React + React Three Fiber + drei
- Vite som bundler
- OrbitControls for kamera-navigasjon
- WebSocket-klient for live interaksjoner

### Backend
- Node.js + Express
- WebSocket (ws eller Socket.io) for live-strømming
- Claude Haiku API (Anthropic SDK)
- Rate limiter (~10s mellom interaksjoner)
- REST API:
  - POST /avatars — opprett avatar
  - GET /avatars — liste/søk
  - GET /avatars/:id — profil + stats
  - GET /avatars/:id/interactions — historikk

### Database (SQLite for MVP)
**avatars:**
- id, name, gender, language
- personality_type
- character_model (hvilken Synty-modell)
- hair_color, top_color, pants_color
- position_x, position_y, position_z
- stats_insults_given, stats_insults_received
- stats_favorite_insult, stats_favorite_word
- created_at, last_interaction_at

**interactions:**
- id, speaker_id, target_id
- dialogue, response_dialogue
- speaker_animation, target_animation
- created_at

### Hosting
- Render.com (gratis tier for MVP)
- Backend: Web Service
- Frontend: Static Site
- SQLite på disk — NB: Render free tier har ephemeral disk, data forsvinner ved redeploy. For MVP akseptabelt (seeder med test-avatarer). Ved skalering: migrer til Turso (hosted SQLite) eller Supabase.

## Design-prinsipper
- **Clean, moderne, elegant** — minimalistisk UI som ikke konkurrerer med 3D
- **Observasjon først** — brukeren observerer før de deltar
- **Personlighet driver alt** — personlighetstypen former fornærmelsene
- **Mørk humor, ikke hat** — lekent ondskapsfullt, kreativt, absurd
- **Flerspråklig** — norsk og engelsk basert på avatar
