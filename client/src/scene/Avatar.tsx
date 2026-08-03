import { useRef, useCallback, useEffect, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Html } from '@react-three/drei'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { useMovement, MovementState } from '../systems/movement'
import { useAvatarStore } from '../stores/avatarStore'
import {
  IDLE_POOL, WALK_MALE, WALK_FEMALE, INSULT_POOL, randomFrom,
} from '../../../shared/animations'
import type { Avatar as AvatarData } from '../../../shared/types'
import SpeechBubble from './SpeechBubble'

const CIRCLE_RADIUS = 8 // må matche server

// Helse-bar farge basert på om du lever
function healthColor(alive: boolean): string {
  return alive ? '#66bb6a' : '#ef5350'
}

// Overlay med navn
function AvatarOverlay({ name, avatarId }: { name: string; avatarId: string }) {
  const expAvatar = useAvatarStore((s) => s.experimentAvatars.get(avatarId))
  const roundActive = useAvatarStore((s) => s.roundActive)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
      {roundActive && expAvatar && expAvatar.rank <= 3 && (
        <div style={{
          fontSize: '9px',
          fontFamily: 'Inter, system-ui, sans-serif',
          color: expAvatar.rank === 1 ? '#ffd700' : expAvatar.rank === 2 ? '#c0c0c0' : '#cd7f32',
          fontWeight: 700,
          userSelect: 'none',
        }}>
          #{expAvatar.rank}
        </div>
      )}
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
        {name}
      </div>
    </div>
  )
}

// Tekstur per pack
function textureForModel(model: string, variant: number = 1): string {
  const v = String(variant).padStart(2, '0')
  if (model.startsWith('SK_Character_')) return `/models/characters/PolygonCity_Texture_${v}_A.png`
  if (model.startsWith('SK_Chr_Builder_') || model.startsWith('SK_Chr_Inspector_')) return `/models/characters/PolygonConstruction_Texture_${v}_A.png`
  return `/models/characters/PolygonOffice_Texture_${v}_A.png`
}

const CROSSFADE_DURATION = 0.3

// Dying-animasjoner
const DEATH_POOL = [
  'Falling_Back_Death.glb',
  'Falling_Back_Death_2.glb',
  'Falling_Forward_Death.glb',
  'Dying_Backwards.glb',
]

// Manuell weight-blending
interface BlendWeights {
  idle: number
  walk: number
  gesture: number
}

// Globalt register: avatar-id → nåværende posisjon
export const avatarPositions = new Map<string, { x: number; z: number; rotation: number }>()

// Tekstur-cache
const textureCache = new Map<string, Promise<THREE.Texture>>()
function getTexture(path: string): Promise<THREE.Texture> {
  if (!textureCache.has(path)) {
    textureCache.set(path, new Promise((resolve) => {
      new THREE.TextureLoader().load(path, (tex) => {
        tex.flipY = false
        tex.colorSpace = THREE.SRGBColorSpace
        resolve(tex)
      })
    }))
  }
  return textureCache.get(path)!
}

// Animasjons-cache
const clipCache = new Map<string, Promise<THREE.AnimationClip>>()
function getClip(path: string): Promise<THREE.AnimationClip> {
  if (!clipCache.has(path)) {
    clipCache.set(path, new Promise((resolve, reject) => {
      new GLTFLoader().load(path, (gltf) => {
        if (gltf.animations[0]) resolve(gltf.animations[0])
        else reject(new Error(`Ingen animasjon i ${path}`))
      }, undefined, reject)
    }))
  }
  return clipCache.get(path)!
}

// Gradient-skyggetekstur
let _shadowTex: THREE.Texture | null = null
function getShadowTexture(): THREE.Texture {
  if (_shadowTex) return _shadowTex
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  grad.addColorStop(0, 'rgba(0,0,0,0.3)')
  grad.addColorStop(0.5, 'rgba(0,0,0,0.15)')
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, size, size)
  _shadowTex = new THREE.CanvasTexture(canvas)
  return _shadowTex
}

// Scene-cache
const sceneCache = new Map<string, Promise<THREE.Group>>()
function getScene(modelPath: string): Promise<THREE.Group> {
  if (!sceneCache.has(modelPath)) {
    sceneCache.set(modelPath, new Promise((resolve, reject) => {
      new GLTFLoader().load(modelPath, (gltf) => resolve(gltf.scene), undefined, reject)
    }))
  }
  return sceneCache.get(modelPath)!
}

// Beregn sirkelposisjon fra slotIndex
function circlePosition(slotIndex: number, totalSlots: number): { x: number; z: number } {
  const angle = (slotIndex / totalSlots) * Math.PI * 2 - Math.PI / 2
  return {
    x: Math.cos(angle) * CIRCLE_RADIUS,
    z: Math.sin(angle) * CIRCLE_RADIUS,
  }
}

// Beregn rotasjon mot sentrum
function rotationToCenter(pos: { x: number; z: number }): number {
  return Math.atan2(-pos.x, -pos.z)
}

interface AvatarProps {
  data: AvatarData
}

export default function Avatar({ data }: AvatarProps) {
  const groupRef = useRef<THREE.Group>(null!)
  const modelRef = useRef<THREE.Object3D | null>(null)
  const mixerRef = useRef<THREE.AnimationMixer | null>(null)
  const idleActionRef = useRef<THREE.AnimationAction | null>(null)
  const walkActionRef = useRef<THREE.AnimationAction | null>(null)
  const gestureActionRef = useRef<THREE.AnimationAction | null>(null)
  const currentAnimRef = useRef<'idle' | 'walking' | 'gesture'>('idle')
  const targetWeights = useRef<BlendWeights>({ idle: 1, walk: 0, gesture: 0 })
  const setFocused = useAvatarStore((s) => s.setFocused)
  const handleClick = useCallback((e: any) => {
    e.stopPropagation()
    setFocused(data.id)
  }, [data.id, setFocused])

  // Speech bubble
  const [bubbleText, setBubbleText] = useState('')

  // Eliminasjons-state
  const eliminatedRef = useRef(false)
  const dyingAnimPlayed = useRef(false)
  const [isEliminated, setIsEliminated] = useState(false)

  // Duell-state tracking
  const duelRoleRef = useRef<'none' | 'duelist' | 'spectator'>('none')
  const duelPhaseRef = useRef<string>('none')
  const returnToSlotRef = useRef(false)
  const corpseRelocatedRef = useRef(false)

  // Last modell + animasjoner
  useEffect(() => {
    const modelPath = `/models/characters/${data.character_model}`
    const texturePath = textureForModel(data.character_model, data.texture_variant ?? 1)
    const idleAnimPath = `/models/animations/${randomFrom(IDLE_POOL)}`
    const walkFile = data.gender === 'female' ? WALK_FEMALE : WALK_MALE
    const walkAnimPath = `/models/animations/${walkFile}`
    let disposed = false

    Promise.all([
      getScene(modelPath),
      getTexture(texturePath),
      getClip(idleAnimPath),
      getClip(walkAnimPath),
    ]).then(([originalScene, texture, idleClip, walkClip]) => {
      if (disposed) return
      const scene = skeletonClone(originalScene) as THREE.Group
      scene.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh
          mesh.material = new THREE.MeshStandardMaterial({
            map: texture,
            roughness: 0.8,
            metalness: 0,
          })
          mesh.castShadow = true
        }
      })
      if (groupRef.current) {
        groupRef.current.add(scene)
        modelRef.current = scene
      }
      const mixer = new THREE.AnimationMixer(scene)
      const idleAction = mixer.clipAction(idleClip)
      idleAction.setEffectiveWeight(1)
      idleAction.play()
      const walkAction = mixer.clipAction(walkClip)
      walkAction.setEffectiveWeight(0)
      walkAction.play()
      mixerRef.current = mixer
      idleActionRef.current = idleAction
      walkActionRef.current = walkAction
      currentAnimRef.current = 'idle'
    }).catch((err) => {
      console.error(`[Avatar ${data.name}] Lastfeil:`, err)
    })

    return () => {
      disposed = true
      avatarPositions.delete(data.id)
      if (mixerRef.current) mixerRef.current.stopAllAction()
      if (modelRef.current && groupRef.current) groupRef.current.remove(modelRef.current)
    }
  }, [data.character_model, data.name, data.id])

  // Gesture-avspilling
  const playGesture = useCallback((filename: string, loop = false) => {
    const mixer = mixerRef.current
    if (!mixer) return
    const path = `/models/animations/${filename}`
    getClip(path).then((clip) => {
      const newAction = mixer.clipAction(clip)
      const prev = gestureActionRef.current

      if (prev && prev !== newAction) {
        const prevWeight = prev.getEffectiveWeight()
        newAction.reset()
        newAction.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, 1)
        newAction.clampWhenFinished = true
        newAction.setEffectiveWeight(prevWeight)
        newAction.play()
        prev.stop()
      } else if (prev === newAction) {
        newAction.reset()
        newAction.play()
      } else {
        newAction.reset()
        newAction.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, 1)
        newAction.clampWhenFinished = true
        newAction.setEffectiveWeight(0.01)
        newAction.play()
      }

      gestureActionRef.current = newAction
      currentAnimRef.current = 'gesture'
      targetWeights.current = { idle: 0, walk: 0, gesture: 1 }
    }).catch(() => {})
  }, [])

  // Bytt idle-clip
  const swapIdleClip = useCallback(() => {
    const mixer = mixerRef.current
    if (!mixer) return
    const file = randomFrom(IDLE_POOL)
    getClip(`/models/animations/${file}`).then((clip) => {
      const prev = idleActionRef.current
      const prevWeight = prev ? prev.getEffectiveWeight() : 1
      const action = mixer.clipAction(clip)
      if (action === prev) return
      action.reset()
      action.setEffectiveWeight(prevWeight)
      action.play()
      if (prev) prev.stop()
      idleActionRef.current = action
    }).catch(() => {})
  }, [])

  const swapWalkClip = useCallback(() => {
    const mixer = mixerRef.current
    if (!mixer) return
    const file = data.gender === 'female' ? WALK_FEMALE : WALK_MALE
    getClip(`/models/animations/${file}`).then((clip) => {
      const prev = walkActionRef.current
      const prevWeight = prev ? prev.getEffectiveWeight() : 0
      const action = mixer.clipAction(clip)
      if (action !== prev) {
        action.reset()
        action.setEffectiveWeight(prevWeight)
        action.play()
        if (prev) prev.stop()
        walkActionRef.current = action
      }
    }).catch(() => {})
  }, [])

  const stopGesture = useCallback(() => {
    swapIdleClip()
    currentAnimRef.current = 'idle'
    targetWeights.current = { idle: 1, walk: 0, gesture: 0 }
  }, [swapIdleClip])

  const blendToIdle = useCallback(() => {
    if (currentAnimRef.current === 'idle') return
    swapIdleClip()
    currentAnimRef.current = 'idle'
    targetWeights.current = { idle: 1, walk: 0, gesture: 0 }
  }, [swapIdleClip])

  const blendToWalk = useCallback(() => {
    if (currentAnimRef.current === 'walking') return
    swapWalkClip()
    currentAnimRef.current = 'walking'
    targetWeights.current = { idle: 0, walk: 1, gesture: 0 }
  }, [swapWalkClip])

  // Bevegelse
  const baseSpeed = useRef(0.8 + Math.random() * 0.4)
  const state = useRef<MovementState>({
    position: new THREE.Vector3(data.position_x, 0, data.position_z),
    target: new THREE.Vector3(data.position_x, 0, data.position_z),
    rotation: Math.random() * Math.PI * 2,
    mode: 'idle',
    timer: Math.random() * 5,
    speed: baseSpeed.current,
  })
  const movement = useMovement(state.current)

  useFrame((_, delta) => {
    const s = state.current
    const store = useAvatarStore.getState()
    const { circleSlots, totalCircleSlots, currentDuel, roundActive } = store

    // Oppdater globalt posisjonsregister
    avatarPositions.set(data.id, { x: s.position.x, z: s.position.z, rotation: s.rotation })

    // Finn min sirkelplass
    const mySlot = circleSlots.find(slot => slot.avatarId === data.id)

    // Eliminasjons-sjekk
    const isEliminatedNow = store.isAvatarEliminated(data.id)
    if (isEliminatedNow && !eliminatedRef.current) {
      eliminatedRef.current = true
      setIsEliminated(true)
      setBubbleText('')

      if (!dyingAnimPlayed.current) {
        dyingAnimPlayed.current = true
        const deathAnim = DEATH_POOL[Math.floor(Math.random() * DEATH_POOL.length)]
        playGesture(deathAnim, false)
        s.mode = 'idle'
        s.timer = 999999
      }

      // Sett opacity til 0.6
      if (modelRef.current) {
        modelRef.current.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial
            if (mat) {
              mat.transparent = true
              mat.opacity = 0.6
            }
          }
        })
      }
    }

    // Eliminerte avatarer — bare oppdater animasjon
    if (eliminatedRef.current) {
      // Kroppen ligger der den døde — ingen relokering
      if (!corpseRelocatedRef.current && !currentDuel) {
        corpseRelocatedRef.current = true
      }

      if (groupRef.current) {
        groupRef.current.position.copy(s.position)
        groupRef.current.rotation.y = s.rotation
      }

      // Weight-blending for dying-animasjon
      updateWeightBlending(delta)
      mixerRef.current?.update(delta)
      return
    }

    // --- Mexican Standoff logikk ---

    // Fase 1: Gå til sirkelplass når runden starter
    if (roundActive && mySlot && totalCircleSlots > 0) {
      const slotPos = circlePosition(mySlot.slotIndex, totalCircleSlots)

      // Er denne avataren i en aktiv duell?
      const isInDuel = currentDuel && (currentDuel.avatarA === data.id || currentDuel.avatarB === data.id)

      if (isInDuel && currentDuel) {
        const duelPhase = currentDuel.phase

        // Approach — gå mot sentrum
        if (duelPhase === 'approach' && duelPhaseRef.current !== 'approach') {
          duelPhaseRef.current = 'approach'
          duelRoleRef.current = 'duelist'
          movement.walkTo(0, 0)
          blendToWalk()
        }

        // Faceoff — stå stille, face motstander
        if (duelPhase === 'faceoff') {
          duelPhaseRef.current = 'faceoff'
          blendToIdle()
          s.mode = 'idle'
          // Face motstander
          const opponentId = currentDuel.avatarA === data.id ? currentDuel.avatarB : currentDuel.avatarA
          const opponentPos = avatarPositions.get(opponentId)
          if (opponentPos) {
            movement.facePoint(opponentPos.x, opponentPos.z, delta)
          }
        }

        // Insult — speaker viser tekst + gesture, target lytter
        if (duelPhase === 'insult' && duelPhaseRef.current !== 'insult') {
          duelPhaseRef.current = 'insult'

          const interaction = store.activeInteractions.get(currentDuel.id)
          // Sjekk om denne avataren er speaker (via speakerId fra serveren)
          const isSpeaker = interaction?.speakerId === data.id

          if (interaction && interaction.lines.length > 0 && isSpeaker) {
            const line = interaction.lines[0]
            if (line) {
              setBubbleText(line.text)
              playGesture(randomFrom(INSULT_POOL))
            }
          } else {
            // Target — idle, ingen boble
            blendToIdle()
          }
        }

        // Result — vinner eller taper
        if (duelPhase === 'result') {
          if (currentDuel.winnerId === data.id && duelPhaseRef.current !== 'result') {
            duelPhaseRef.current = 'result'
            // Vinner — bare stå
            stopGesture()
          }
          // Taper håndteres av eliminasjonssjekken over
        }

        // Beveg mot sentrum under approach
        if (duelPhase === 'approach' && s.mode === 'walking') {
          const arrived = movement.update(delta)
          if (arrived) {
            blendToIdle()
            s.mode = 'idle'
          }
        }

      } else if (!isInDuel) {
        // Ikke i duell — sørg for at vi er på sirkelplass

        if (returnToSlotRef.current || duelRoleRef.current === 'duelist') {
          // Gå tilbake til sirkelplass etter duell
          if (duelRoleRef.current === 'duelist' && !returnToSlotRef.current) {
            returnToSlotRef.current = true
            setBubbleText('') // Rydd opp boble etter duell
            movement.walkTo(slotPos.x, slotPos.z)
            blendToWalk()
          }

          if (returnToSlotRef.current && s.mode === 'walking') {
            const arrived = movement.update(delta)
            if (arrived) {
              blendToIdle()
              s.mode = 'idle'
              s.rotation = rotationToCenter(slotPos)
              duelRoleRef.current = 'none'
              returnToSlotRef.current = false
              duelPhaseRef.current = 'none'
            }
          }
        } else {
          // Ikke i duell — teleporter til sirkelplass om vi er langt unna, ellers stå stille
          const dx = s.position.x - slotPos.x
          const dz = s.position.z - slotPos.z
          const distToSlot = Math.sqrt(dx * dx + dz * dz)

          if (distToSlot > 0.5 && duelRoleRef.current === 'none') {
            // Teleporter direkte til sirkelplass (skjer under dip-to-black)
            s.position.set(slotPos.x, 0, slotPos.z)
            s.rotation = rotationToCenter(slotPos)
            s.mode = 'idle'
            blendToIdle()
          } else {
            // Allerede på plass — idle, face sentrum
            blendToIdle()
            s.mode = 'idle'

            // Se på duellen (face sentrum)
            if (currentDuel) {
              movement.facePoint(0, 0, delta)
            } else {
              // Langsomt roter mot sentrum
              const targetRot = rotationToCenter(slotPos)
              let diff = targetRot - s.rotation
              while (diff > Math.PI) diff -= Math.PI * 2
              while (diff < -Math.PI) diff += Math.PI * 2
              s.rotation += diff * Math.min(1, 2 * delta)
            }
          }
        }
      }
    } else if (!roundActive) {
      // Utenfor runde — reset alt for ny runde
      duelRoleRef.current = 'none'
      duelPhaseRef.current = 'none'
      returnToSlotRef.current = false
      corpseRelocatedRef.current = false

      // Reset eliminerings-state slik at avatarer kan brukes igjen
      if (eliminatedRef.current) {
        eliminatedRef.current = false
        dyingAnimPlayed.current = false
        setIsEliminated(false)
        stopGesture()
        s.mode = 'idle'
        s.timer = 1

        // Gjenopprett opacity
        if (modelRef.current) {
          modelRef.current.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial
              if (mat) {
                mat.transparent = false
                mat.opacity = 1
              }
            }
          })
        }
      }
    }

    // Oppdater posisjon og rotasjon
    if (groupRef.current) {
      groupRef.current.position.copy(s.position)
      groupRef.current.rotation.y = s.rotation
    }

    // Weight-blending
    updateWeightBlending(delta)
    mixerRef.current?.update(delta)
  })

  // Felles weight-blending funksjon
  function updateWeightBlending(delta: number) {
    const blendSpeed = 1 / CROSSFADE_DURATION
    const blendStep = Math.min(1, blendSpeed * delta)
    const tw = targetWeights.current
    const idle = idleActionRef.current
    const walk = walkActionRef.current
    const gesture = gestureActionRef.current

    let idleW = idle ? THREE.MathUtils.lerp(idle.getEffectiveWeight(), tw.idle, blendStep) : 0
    let walkW = walk ? THREE.MathUtils.lerp(walk.getEffectiveWeight(), tw.walk, blendStep) : 0
    let gestureW = gesture ? THREE.MathUtils.lerp(gesture.getEffectiveWeight(), tw.gesture, blendStep) : 0

    const total = idleW + walkW + gestureW
    if (total > 0.001) {
      idleW /= total; walkW /= total; gestureW /= total
    } else {
      idleW = 1; walkW = 0; gestureW = 0
    }

    if (idle) { idle.enabled = idleW > 0.001; idle.setEffectiveTimeScale(1); idle.setEffectiveWeight(idleW) }
    if (walk) { walk.enabled = walkW > 0.001; walk.setEffectiveTimeScale(1); walk.setEffectiveWeight(walkW) }
    if (gesture) {
      gesture.enabled = gestureW > 0.001; gesture.setEffectiveWeight(gestureW)
      if (tw.gesture === 0 && gestureW < 0.001 && idleW > 0.9) {
        gesture.enabled = false; gesture.stop(); gestureActionRef.current = null
      }
    }
  }

  return (
    <group
      ref={groupRef}
      position={[data.position_x, 0, data.position_z]}
      onClick={handleClick}
      onPointerOver={() => { document.body.style.cursor = 'pointer' }}
      onPointerOut={() => { document.body.style.cursor = '' }}
    >
      {/* Myk gradient-skygge */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.01, 0]}>
        <planeGeometry args={[1.6, 1.6]} />
        <meshBasicMaterial map={getShadowTexture()} transparent depthWrite={false} />
      </mesh>
      {/* Navnelabel — skjules for eliminerte */}
      {!isEliminated && (
        <Html position={[0, 2.1, 0]} center zIndexRange={[50, 50]} style={{ pointerEvents: 'none' }}>
          <AvatarOverlay name={data.name} avatarId={data.id} />
        </Html>
      )}
      {/* Speech bubble */}
      {bubbleText && (
        <SpeechBubble text={bubbleText} position={[0, 2.8, 0]} />
      )}
    </group>
  )
}
