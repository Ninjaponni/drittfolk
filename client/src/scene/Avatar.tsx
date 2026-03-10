import { useRef, useCallback } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Html } from '@react-three/drei'
import { useMovement, MovementState } from '../systems/movement'
import { useAvatarStore } from '../stores/avatarStore'
import type { Avatar as AvatarData } from '../../../shared/types'

interface AvatarProps {
  data: AvatarData
}

// Placeholder-geometri (kapsel) inntil Synty GLB-er er klare
function PlaceholderCharacter({ hairColor, topColor, pantsColor }: {
  hairColor: string; topColor: string; pantsColor: string
}) {
  return (
    <group>
      {/* Hode */}
      <mesh position={[0, 1.6, 0]} castShadow>
        <sphereGeometry args={[0.2, 16, 16]} />
        <meshStandardMaterial color="#f5d0b0" />
      </mesh>
      {/* Hår */}
      <mesh position={[0, 1.75, 0]}>
        <sphereGeometry args={[0.21, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={hairColor} />
      </mesh>
      {/* Overkropp */}
      <mesh position={[0, 1.15, 0]} castShadow>
        <capsuleGeometry args={[0.22, 0.5, 8, 16]} />
        <meshStandardMaterial color={topColor} />
      </mesh>
      {/* Bukser */}
      <mesh position={[0, 0.5, 0]} castShadow>
        <capsuleGeometry args={[0.18, 0.5, 8, 16]} />
        <meshStandardMaterial color={pantsColor} />
      </mesh>
      {/* Subtil skygge-sirkel */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.01, 0]}>
        <circleGeometry args={[0.4, 16]} />
        <meshBasicMaterial color="#000000" opacity={0.1} transparent />
      </mesh>
    </group>
  )
}

export default function Avatar({ data }: AvatarProps) {
  const groupRef = useRef<THREE.Group>(null!)
  const setFocused = useAvatarStore((s) => s.setFocused)
  const handleClick = useCallback(() => setFocused(data.id), [data.id, setFocused])
  const state = useRef<MovementState>({
    position: new THREE.Vector3(data.position_x, 0, data.position_z),
    target: new THREE.Vector3(data.position_x, 0, data.position_z),
    rotation: Math.random() * Math.PI * 2,
    mode: 'idle',
    timer: Math.random() * 5,
    speed: 0.8 + Math.random() * 0.4,
  })

  const movement = useMovement(state.current)

  useFrame((_, delta) => {
    movement.update(delta)
    const s = state.current
    if (groupRef.current) {
      groupRef.current.position.copy(s.position)
      groupRef.current.rotation.y = s.rotation
    }
  })

  return (
    <group ref={groupRef} position={[data.position_x, 0, data.position_z]} onClick={handleClick}>
      <PlaceholderCharacter
        hairColor={data.hair_color}
        topColor={data.top_color}
        pantsColor={data.pants_color}
      />
      {/* Navn over hodet */}
      <Html position={[0, 2.1, 0]} center style={{ pointerEvents: 'none' }}>
        <div style={{
          background: 'rgba(0,0,0,0.6)',
          color: '#fff',
          padding: '2px 8px',
          borderRadius: '4px',
          fontSize: '11px',
          fontFamily: 'Inter, system-ui, sans-serif',
          whiteSpace: 'nowrap',
          userSelect: 'none',
        }}>
          {data.name}
        </div>
      </Html>
    </group>
  )
}
