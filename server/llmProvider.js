// LLM-provider med fallback-kjede: Ollama → Gemini → Haiku
// Prøver billigst/raskest først, faller tilbake til sky-API

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434'
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gemma3:12b'

let ollamaAvailable = null // null = ikke sjekket, true/false
let geminiClient = null
let anthropicClient = null

// Sjekk om Ollama kjører
async function checkOllama() {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(2000) })
    ollamaAvailable = res.ok
  } catch {
    ollamaAvailable = false
  }
  return ollamaAvailable
}

// Initialiser tilgjengelige providere
async function initProviders() {
  await checkOllama()
  if (ollamaAvailable) {
    console.log(`[LLM] Ollama tilgjengelig (${OLLAMA_MODEL}) — bruker lokalt`)
  }

  if (process.env.GEMINI_API_KEY) {
    const { GoogleGenerativeAI } = await import('@google/generative-ai')
    geminiClient = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    console.log('[LLM] Gemini Flash tilgjengelig — fallback #1')
  }

  if (process.env.ANTHROPIC_API_KEY) {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    anthropicClient = new Anthropic()
    console.log('[LLM] Claude Haiku tilgjengelig — fallback #2')
  }

  if (!ollamaAvailable && !geminiClient && !anthropicClient) {
    console.warn('[LLM] Ingen LLM-provider tilgjengelig! Sett OLLAMA, GEMINI_API_KEY eller ANTHROPIC_API_KEY')
  }
}

// Generer dialog — prøver providere i rekkefølge
async function generate(systemPrompt, userPrompt) {
  // Re-sjekk Ollama med jevne mellomrom (kan startes/stoppes)
  if (ollamaAvailable === null || ollamaAvailable === false) {
    await checkOllama()
  }

  // 1. Prøv Ollama (gratis, lokal)
  if (ollamaAvailable) {
    try {
      return await generateOllama(systemPrompt, userPrompt)
    } catch (err) {
      console.warn('[LLM] Ollama feilet:', err.message)
      ollamaAvailable = false
    }
  }

  // 2. Prøv Gemini Flash (fallback)
  if (geminiClient) {
    try {
      return await generateGemini(systemPrompt, userPrompt)
    } catch (err) {
      console.warn('[LLM] Gemini feilet:', err.message)
    }
  }

  // 3. Prøv Claude Haiku (dyrere, men pålitelig)
  if (anthropicClient) {
    try {
      return await generateHaiku(systemPrompt, userPrompt)
    } catch (err) {
      console.warn('[LLM] Haiku feilet:', err.message)
    }
  }

  return null
}

// Ollama — lokal modell
async function generateOllama(systemPrompt, userPrompt) {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      stream: false,
      options: {
        temperature: 1.0,
        top_k: 64,
        top_p: 0.95,
        repeat_penalty: 1.3,
        num_predict: 100,
      },
    }),
    signal: AbortSignal.timeout(15000),
  })

  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`)
  const data = await res.json()
  return data.message?.content || ''
}

// Gemini Flash
async function generateGemini(systemPrompt, userPrompt) {
  const model = geminiClient.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: systemPrompt,
    generationConfig: {
      thinkingConfig: { thinkingBudget: 0 },
    },
  })
  const result = await model.generateContent(userPrompt)
  return result.response.text()
}

// Claude Haiku
async function generateHaiku(systemPrompt, userPrompt) {
  const response = await anthropicClient.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  })
  return response.content[0]?.text || ''
}

// Periodisk re-sjekk av Ollama (hvert 30. sekund)
setInterval(() => {
  if (!ollamaAvailable) checkOllama()
}, 30_000)

// Kø-system for å unngå parallelle LLM-kall
let llmBusy = false
const llmQueue = []

async function queuedGenerate(systemPrompt, userPrompt) {
  return new Promise((resolve, reject) => {
    const task = async () => {
      try {
        const result = await generate(systemPrompt, userPrompt)
        resolve(result)
      } catch (err) {
        reject(err)
      } finally {
        llmBusy = false
        processQueue()
      }
    }

    if (!llmBusy) {
      llmBusy = true
      task()
    } else {
      // Dropp eldre oppgaver i køen (behold bare siste)
      llmQueue.length = 0
      llmQueue.push(task)
    }
  })
}

function processQueue() {
  if (llmQueue.length > 0 && !llmBusy) {
    llmBusy = true
    const task = llmQueue.shift()
    task()
  }
}

// Generer kommentar fra to-kommentator-systemet
async function generateCommentary(trigger, context) {
  // Lazy-import for å unngå sirkulær avhengighet
  const { buildReactivePrompt, buildProactivePrompt, parseCommentaryResponse } =
    await import('./experimentPrompts.js')

  let systemPrompt, userPrompt

  if (trigger === 'analysis') {
    const prompts = buildProactivePrompt(context)
    systemPrompt = prompts.systemPrompt
    userPrompt = prompts.userPrompt
  } else {
    const prompts = buildReactivePrompt(trigger, context)
    systemPrompt = prompts.systemPrompt
    userPrompt = prompts.userPrompt
  }

  const response = await queuedGenerate(systemPrompt, userPrompt)
  if (!response) return null

  return parseCommentaryResponse(response)
}

// Init providers ved oppstart
initProviders()

export { initProviders, generate, generateCommentary, queuedGenerate }
