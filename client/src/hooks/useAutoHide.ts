import { useState, useEffect, useRef } from 'react'

export function useAutoHide(delay = 5000) {
  const [visible, setVisible] = useState(true)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    function reset() {
      setVisible(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setVisible(false), delay)
    }

    reset()
    window.addEventListener('mousemove', reset)
    window.addEventListener('touchstart', reset)
    window.addEventListener('keydown', reset)

    return () => {
      clearTimeout(timer.current)
      window.removeEventListener('mousemove', reset)
      window.removeEventListener('touchstart', reset)
      window.removeEventListener('keydown', reset)
    }
  }, [delay])

  return visible
}
