import { useState } from 'react'
import AvatarMaker from './AvatarMaker'
import { VERSION } from '../version'

export default function MenuBar() {
  const [showMaker, setShowMaker] = useState(false)

  return (
    <>
      <header className="menu-bar">
        <span className="menu-title">DUMMINGENE <span className="menu-version">v{VERSION}</span></span>
        <div className="menu-actions">
          <button className="menu-btn" onClick={() => setShowMaker(true)} title="Lag din egen dumming">
            +
          </button>
        </div>
      </header>
      {showMaker && <AvatarMaker onClose={() => setShowMaker(false)} />}
    </>
  )
}
