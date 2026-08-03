// Overlegg for Mexican Standoff — nedtelling, dip-to-black, VS-kort
import { useAvatarStore } from '../stores/avatarStore'
import { PERSONALITY_LABELS, PersonalityType } from '../../../shared/types'

export default function StandoffOverlay() {
  const standoffCountdown = useAvatarStore((s) => s.standoffCountdown)
  const dipToBlack = useAvatarStore((s) => s.dipToBlack)
  const vsCard = useAvatarStore((s) => s.vsCard)

  return (
    <>
      {/* Nedtelling før runde */}
      {standoffCountdown !== null && (
        <div className="standoff-countdown-overlay">
          <div className="standoff-countdown-label">Ny runde starter om</div>
          <div className="standoff-countdown-number" key={standoffCountdown}>
            {standoffCountdown}
          </div>
        </div>
      )}

      {/* Dip-to-black */}
      <div className={`standoff-dip-to-black ${dipToBlack ? 'active' : ''}`} />

      {/* VS-kort under approach */}
      {vsCard && (
        <div className="standoff-vs-overlay" key={`${vsCard.nameA}-${vsCard.nameB}`}>
          <div className="standoff-vs-card">
            <div className="standoff-vs-fighter left">
              <div className="standoff-vs-name">{vsCard.nameA}</div>
              <div className="standoff-vs-personality">
                {PERSONALITY_LABELS[vsCard.personalityA as PersonalityType]?.no || vsCard.personalityA}
              </div>
            </div>
            <div className="standoff-vs-divider">VS</div>
            <div className="standoff-vs-fighter right">
              <div className="standoff-vs-name">{vsCard.nameB}</div>
              <div className="standoff-vs-personality">
                {PERSONALITY_LABELS[vsCard.personalityB as PersonalityType]?.no || vsCard.personalityB}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
