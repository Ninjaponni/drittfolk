import { useState } from 'react'
import PersonalityPicker from './PersonalityPicker'
import { useAvatarStore } from '../stores/avatarStore'
import type { PersonalityType, CreateAvatarInput } from '../../../shared/types'

interface Props {
  onClose: () => void
}

export default function AvatarMaker({ onClose }: Props) {
  const addAvatar = useAvatarStore((s) => s.addAvatar)
  const avatars = useAvatarStore((s) => s.avatars)
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [gender, setGender] = useState<'male' | 'female'>('male')
  const [personality, setPersonality] = useState<PersonalityType>('sarcastic')
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const nameTaken = name.trim().length > 0 && avatars.some(
    (a) => a.name.toLowerCase() === name.trim().toLowerCase()
  )

  const steps = [
    // 0: Navn
    <div key="name" className="maker-step">
      <label className="maker-label">Hva heter dummingen?</label>
      <input
        className="maker-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Navn..."
        maxLength={20}
        autoFocus
      />
      {nameTaken
        ? <p className="maker-hint" style={{ color: '#e74c3c' }}>Denne dummingen er allerede i scenen</p>
        : <p className="maker-hint">Bruk et kallenavn. Unngå fulle navn som kan identifisere noen.</p>
      }
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
    // 3: E-post (valgfritt)
    <div key="email" className="maker-step">
      <label className="maker-label">Vil du følge med på dummingen din?</label>
      <input
        className="maker-input"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="din@epost.no (valgfritt)"
        autoFocus
      />
      <p className="maker-hint">Legg inn e-post for daglige oppdateringer: hvem fornærmet deg, nemesis-status og MVD-kåring.</p>
    </div>,
  ]

  async function handleSubmit() {
    if (!name.trim()) return
    setSubmitting(true)
    const input: CreateAvatarInput = {
      name: name.trim(),
      gender,
      personality_type: personality,
      email: email.includes('@') ? email.trim() : undefined,
    }
    await addAvatar(input)
    setSubmitting(false)
    onClose()
  }

  const isLast = step === steps.length - 1
  const canNext = step === 0
    ? name.trim().length > 0 && !nameTaken
    : true

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
