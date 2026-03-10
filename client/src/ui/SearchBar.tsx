import { useState, useRef, useEffect } from 'react'
import { useAvatarStore } from '../stores/avatarStore'

export default function SearchBar() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Array<{ id: string; name: string }>>([])
  const [open, setOpen] = useState(false)
  const avatars = useAvatarStore((s) => s.avatars)
  const setFocused = useAvatarStore((s) => s.setFocused)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      return
    }
    const q = query.toLowerCase()
    setResults(avatars.filter((a) => a.name.toLowerCase().includes(q)).slice(0, 8))
  }, [query, avatars])

  function handleSelect(id: string) {
    setFocused(id)
    setQuery('')
    setOpen(false)
  }

  return (
    <div className="search-bar">
      <input
        ref={inputRef}
        className="search-input"
        type="text"
        placeholder="Søk etter avatar..."
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
      />
      {open && results.length > 0 && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 240,
          background: 'rgba(255,255,255,0.95)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(0,0,0,0.08)',
          borderRadius: 8,
          marginTop: 4,
          overflow: 'hidden',
        }}>
          {results.map((r) => (
            <button
              key={r.id}
              style={{
                display: 'block',
                width: '100%',
                padding: '8px 16px',
                border: 'none',
                background: 'transparent',
                textAlign: 'left',
                fontFamily: 'Inter, system-ui, sans-serif',
                fontSize: 13,
                cursor: 'pointer',
              }}
              onMouseDown={() => handleSelect(r.id)}
            >
              {r.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
