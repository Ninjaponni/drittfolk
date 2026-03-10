import { OrbitControls } from '@react-three/drei'
import Arena from './Arena'

export default function Scene() {
  return (
    <>
      {/* Hvit uendelighet — sterkt ambient + mild retningslys */}
      <color attach="background" args={['#ffffff']} />
      <ambientLight intensity={1.2} />
      <directionalLight position={[10, 20, 10]} intensity={0.8} castShadow />

      {/* Subtil skygge-flate (usynlig, bare for shadows) */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[200, 200]} />
        <shadowMaterial opacity={0.08} />
      </mesh>

      <Arena />
      <OrbitControls
        makeDefault
        minDistance={5}
        maxDistance={60}
        maxPolarAngle={Math.PI / 2.2}
        target={[0, 1, 0]}
      />
    </>
  )
}
