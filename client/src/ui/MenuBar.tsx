import { useState } from 'react'
import AvatarMaker from './AvatarMaker'

export default function MenuBar() {
  const [showMaker, setShowMaker] = useState(false)

  return (
    <>
      <header className="menu-bar">
        <span className="menu-title">DRITTFOLK</span>
        <div className="menu-actions">
          <button className="menu-btn" onClick={() => setShowMaker(true)} title="Ny avatar">
            +
          </button>
        </div>
      </header>
      {showMaker && <AvatarMaker onClose={() => setShowMaker(false)} />}
    </>
  )
}
