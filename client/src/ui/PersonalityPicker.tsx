import { PERSONALITY_LABELS } from '../../../shared/types'
import type { PersonalityType } from '../../../shared/types'

interface Props {
  value: PersonalityType
  onChange: (type: PersonalityType) => void
}

const TYPES: PersonalityType[] = [
  'aggressive', 'passive_aggressive', 'arrogant', 'sarcastic',
  'dramatic', 'sycophant', 'narcissist',
]

export default function PersonalityPicker({ value, onChange }: Props) {
  return (
    <div className="personality-picker">
      {TYPES.map((type) => {
        const info = PERSONALITY_LABELS[type]
        return (
          <button
            key={type}
            className={`personality-option ${value === type ? 'active' : ''}`}
            onClick={() => onChange(type)}
          >
            <span className="personality-name">{info.no}</span>
            <span className="personality-desc">{info.desc_no}</span>
          </button>
        )
      })}
    </div>
  )
}
