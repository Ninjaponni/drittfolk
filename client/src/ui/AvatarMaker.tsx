import { useState } from 'react'
import ColorPicker from './ColorPicker'
import PersonalityPicker from './PersonalityPicker'
import { useAvatarStore } from '../stores/avatarStore'
import type { PersonalityType, CreateAvatarInput } from '../../../shared/types'

const COLORS = [
  '#2D2D2D', '#8B4513', '#D4A574', '#FFD700', '#FF6B35',
  '#C41E3A', '#1B4D3E', '#2563EB', '#7C3AED', '#EC4899',
]

interface Props {
  onClose: () => void
}

export default function AvatarMaker({ onClose }: Props) {
  const addAvatar = useAvatarStore((s) => s.addAvatar)
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [gender, setGender] = useState<'male' | 'female'>('male')
  const [personality, setPersonality] = useState<PersonalityType>('sarcastic')
  const [hairColor, setHairColor] = useState('#2D2D2D')
  const [topColor, setTopColor] = useState('#2563EB')
  const [pantsColor, setPantsColor] = useState('#2D2D2D')
  const [language, setLanguage] = useState<'no' | 'en'>('no')
  const [submitting, setSubmitting] = useState(false)

  const steps = [
    // 0: Navn
    <div key="name" className="maker-step">
      <label className="maker-label">Hva heter drittfolket?</label>
      <input
        className="maker-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Navn..."
        maxLength={30}
        autoFocus
      />
    </div>,
    // 1: Kjønn
    <div key="gender" className="maker-step">
      <label className="maker-label">Kjønn</label>
      <div className="maker-options">
        <button className={`maker-option ${gender === 'male' ? 'active' : ''}`} onClick={() => setGender('male')}>Mann</button>
        <button className={`maker-option ${gender === 'female' ? 'active' : ''}`} onClick={() => setGender('female')}>Kvinne</button>
      </div>
    </div>,
    // 2: Personlighet
    <div key="personality" className="maker-step">
      <label className="maker-label">Personlighetstype</label>
      <PersonalityPicker value={personality} onChange={setPersonality} />
    </div>,
    // 3: Hårfarge
    <div key="hair" className="maker-step">
      <label className="maker-label">Hårfarge</label>
      <ColorPicker colors={COLORS} value={hairColor} onChange={setHairColor} />
    </div>,
    // 4: Overfarge
    <div key="top" className="maker-step">
      <label className="maker-label">Overdel</label>
      <ColorPicker colors={COLORS} value={topColor} onChange={setTopColor} />
    </div>,
    // 5: Bukse
    <div key="pants" className="maker-step">
      <label className="maker-label">Bukser</label>
      <ColorPicker colors={COLORS} value={pantsColor} onChange={setPantsColor} />
    </div>,
    // 6: Språk
    <div key="lang" className="maker-step">
      <label className="maker-label">Språk for fornærmelser</label>
      <div className="maker-options">
        <button className={`maker-option ${language === 'no' ? 'active' : ''}`} onClick={() => setLanguage('no')}>Norsk</button>
        <button className={`maker-option ${language === 'en' ? 'active' : ''}`} onClick={() => setLanguage('en')}>English</button>
      </div>
    </div>,
  ]

  async function handleSubmit() {
    if (!name.trim()) return
    setSubmitting(true)
    const input: CreateAvatarInput = {
      name: name.trim(),
      gender,
      language,
      personality_type: personality,
      hair_color: hairColor,
      top_color: topColor,
      pants_color: pantsColor,
    }
    await addAvatar(input)
    setSubmitting(false)
    onClose()
  }

  const isLast = step === steps.length - 1
  const canNext = step === 0 ? name.trim().length > 0 : true

  return (
    <div className="maker-overlay" onClick={onClose}>
      <div className="maker-panel" onClick={(e) => e.stopPropagation()}>
        <button className="maker-close" onClick={onClose}>×</button>
        <div className="maker-progress">
          {steps.map((_, i) => (
            <div key={i} className={`maker-dot ${i === step ? 'active' : i < step ? 'done' : ''}`} />
          ))}
        </div>
        {steps[step]}
        <div className="maker-nav">
          {step > 0 && (
            <button className="maker-btn secondary" onClick={() => setStep(step - 1)}>Tilbake</button>
          )}
          {isLast ? (
            <button className="maker-btn primary" onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Sender...' : 'Send inn til arenaen'}
            </button>
          ) : (
            <button className="maker-btn primary" onClick={() => setStep(step + 1)} disabled={!canNext}>
              Neste
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
