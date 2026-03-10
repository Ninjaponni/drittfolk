import { Canvas } from '@react-three/fiber'
import Scene from './scene/Scene'
import MenuBar from './ui/MenuBar'
import StatsPanel from './ui/StatsPanel'
import SearchBar from './ui/SearchBar'
import { useAutoHide } from './hooks/useAutoHide'
import './ui/styles/ui.css'

export default function App() {
  const uiVisible = useAutoHide(8000)

  return (
    <>
      <Canvas
        camera={{ position: [0, 8, 20], fov: 50 }}
        style={{ position: 'fixed', inset: 0 }}
      >
        <Scene />
      </Canvas>
      <div style={{ opacity: uiVisible ? 1 : 0, transition: 'opacity 0.5s ease' }}>
        <MenuBar />
        <SearchBar />
      </div>
      <StatsPanel />
    </>
  )
}
