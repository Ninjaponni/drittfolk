import { useRef, useCallback, useEffect, useState, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Html } from '@react-three/drei'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { useMovement, MovementState } from '../systems/movement'
import {
  createInteractionState,
  updateInteraction,
  startInteraction,
  setInteractionLines,
  approachingDone,
  resetInteraction,
} from '../systems/interaction'
import { useAvatarStore } from '../stores/avatarStore'
import {
  DEFAULT_SPEAKER_ANIM, DEFAULT_LISTENER_ANIM, LISTENING_ANIM,
  IDLE_POOL, WALK_MALE, WALK_FEMALE, INSULT_POOL, REACTION_POOL, randomFrom,
} from '../../../shared/animations'
import type { Avatar as AvatarData } from '../../../shared/types'
import SpeechBubble from './SpeechBubble'

// Allianse-farger — fast farge per allianse-ID
const ALLIANCE_COLORS = [
  '#4fc3f7', '#81c784', '#ffb74d', '#e57373', '#ba68c8',
  '#4dd0e1', '#aed581', '#ffd54f', '#ff8a65', '#9575cd',
]
function allianceColor(allianceId: string): string {
  let hash = 0
  for (let i = 0; i < allianceId.length; i++) hash = (hash * 31 + allianceId.charCodeAt(i)) | 0
  return ALLIANCE_COLORS[Math.abs(hash) % ALLIANCE_COLORS.length]
}

// Helse-bar farge basert på resilience
function healthColor(r: number): string {
  if (r > 60) return '#66bb6a'
  if (r > 30) return '#fdd835'
  return '#ef5350'
}

// Overlay med navn, helse-bar og allianse-prikk
function AvatarOverlay({ name, avatarId }: { name: string; avatarId: string }) {
  const expAvatar = useAvatarStore((s) => s.experimentAvatars.get(avatarId))
  const roundActive = useAvatarStore((s) => s.roundActive)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
      {/* Rank for topp 3 */}
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
      {/* Navnelabel med allianse-prikk */}
      <div style={{
        background: 'rgba(0,0,0,0.6)',
        color: '#fff',
        padding: '2px 8px',
        borderRadius: '4px',
        fontSize: '11px',
        fontFamily: 'Inter, system-ui, sans-serif',
        whiteSpace: 'nowrap',
        userSelect: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
      }}>
        {roundActive && expAvatar?.allianceId && (
          <span style={{
            width: '6px', height: '6px', borderRadius: '50%',
            background: allianceColor(expAvatar.allianceId),
            display: 'inline-block', flexShrink: 0,
          }} />
        )}
        {name}
      </div>
      {/* Helse-bar — bare under aktiv runde */}
      {roundActive && expAvatar && (
        <div style={{
          width: '40px', height: '3px',
          background: 'rgba(0,0,0,0.4)',
          borderRadius: '2px',
          overflow: 'hidden',
        }}>
          <div style={{
            width: `${Math.max(0, Math.min(100, expAvatar.resilience))}%`,
            height: '100%',
            background: healthColor(expAvatar.resilience),
            borderRadius: '2px',
            transition: 'width 0.5s ease, background-color 0.5s ease',
            animation: expAvatar.resilience < 10 ? 'healthBlink 0.5s infinite' : 'none',
          }} />
        </div>
      )}
    </div>
  )
}

// Tekstur per pack — matche modellnavn til riktig atlas med fargevariant
function textureForModel(model: string, variant: number = 1): string {
  const v = String(variant).padStart(2, '0')
  if (model.startsWith('SK_Character_')) return `/models/characters/PolygonCity_Texture_${v}_A.png`
  if (model.startsWith('SK_Chr_Builder_') || model.startsWith('SK_Chr_Inspector_')) return `/models/characters/PolygonConstruction_Texture_${v}_A.png`
  return `/models/characters/PolygonOffice_Texture_${v}_A.png`
}

const CROSSFADE_DURATION = 0.3
const APPROACH_DISTANCE = 0.5

// Dying-animasjoner for eliminasjon
const DEATH_POOL = [
  'Falling_Back_Death.glb',
  'Falling_Back_Death_2.glb',
  'Falling_Forward_Death.glb',
  'Dying_Backwards.glb',
]

// Manuell weight-blending — unngår crossFadeTo som forårsaker T-pose
interface BlendWeights {
  idle: number
  walk: number
  gesture: number
}

// Globalt register: avatar-id → nåværende posisjon (oppdateres av useFrame)
// Brukes for å finne partnerens faktiske posisjon ved interaksjonsstart
export const avatarPositions = new Map<string, { x: number; z: number; rotation: number }>()

// Tekstur-cache per pack
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

// Delt animasjons-cache
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

// Gradient-skyggetekstur — myk radial fade fra sentrum
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

// Cache for GLTF-scener
const sceneCache = new Map<string, Promise<THREE.Group>>()
function getScene(modelPath: string): Promise<THREE.Group> {
  if (!sceneCache.has(modelPath)) {
    sceneCache.set(modelPath, new Promise((resolve, reject) => {
      new GLTFLoader().load(modelPath, (gltf) => resolve(gltf.scene), undefined, reject)
    }))
  }
  return sceneCache.get(modelPath)!
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
  // Mål-vekter — useFrame interpolerer faktiske vekter mot disse
  const targetWeights = useRef<BlendWeights>({ idle: 1, walk: 0, gesture: 0 })
  const setFocused = useAvatarStore((s) => s.setFocused)
  const handleClick = useCallback((e: any) => {
    e.stopPropagation()
    setFocused(data.id)
  }, [data.id, setFocused])

  // Interaksjons-state (ref — oppdateres i useFrame)
  const interactionRef = useRef(createInteractionState())

  // Speech bubble — useState for re-render
  const [bubbleText, setBubbleText] = useState('')

  // Eliminasjons-state
  const eliminatedRef = useRef(false)
  const dyingAnimPlayed = useRef(false)
  const [isEliminated, setIsEliminated] = useState(false)

  // Last modell + animasjoner
  useEffect(() => {
    const modelPath = `/models/characters/${data.character_model}`
    const texturePath = textureForModel(data.character_model, data.texture_variant ?? 1)
    // Tilfeldig idle/walk fra poolene — alle konvertert med FBX2glTF
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

  // Forrige reaksjonsanimasjon — unngå to like på rad
  const lastReactionRef = useRef('')

  // Spill gesture-animasjon (lazy-load fra fil)
  // Bruker manuell weight-blending — ALDRI crossFadeTo (forårsaker T-pose)
  const playGesture = useCallback((filename: string, loop = false) => {
    const mixer = mixerRef.current
    if (!mixer) return
    const path = `/models/animations/${filename}`
    getClip(path).then((clip) => {
      const newAction = mixer.clipAction(clip)
      const prev = gestureActionRef.current

      if (prev && prev !== newAction) {
        // Overfør vekten fra forrige gesture til ny
        const prevWeight = prev.getEffectiveWeight()
        newAction.reset()
        newAction.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, 1)
        newAction.clampWhenFinished = true
        newAction.setEffectiveWeight(prevWeight)
        newAction.play()
        // Stopp forrige ETTER ny er startet — atomisk bytte
        prev.stop()
      } else if (prev === newAction) {
        // Samme clip — bare reset
        newAction.reset()
        newAction.play()
      } else {
        // Første gesture — start med litt weight så normalisering fyller opp
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

  // Bytt idle/walk-clip til en ny tilfeldig fra poolen
  const swapIdleClip = useCallback(() => {
    const mixer = mixerRef.current
    if (!mixer) return
    const file = randomFrom(IDLE_POOL)
    getClip(`/models/animations/${file}`).then((clip) => {
      const prev = idleActionRef.current
      const prevWeight = prev ? prev.getEffectiveWeight() : 1
      const action = mixer.clipAction(clip)
      if (action === prev) return // samme clip — ingenting å bytte
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
      state.current.speed = baseSpeed.current
    }).catch(() => {})
  }, [])

  // Tilbake til idle fra gesture — sett mål-vekter, useFrame gjør resten
  const stopGesture = useCallback(() => {
    swapIdleClip() // ny tilfeldig idle hver gang
    currentAnimRef.current = 'idle'
    targetWeights.current = { idle: 1, walk: 0, gesture: 0 }
  }, [swapIdleClip])

  // Glatte overganger — bare sett mål-vekter
  const blendToIdle = useCallback(() => {
    if (currentAnimRef.current === 'idle') return
    swapIdleClip() // ny tilfeldig idle
    currentAnimRef.current = 'idle'
    targetWeights.current = { idle: 1, walk: 0, gesture: 0 }
  }, [swapIdleClip])

  const blendToWalk = useCallback(() => {
    if (currentAnimRef.current === 'walking') return
    swapWalkClip() // ny tilfeldig walk
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

  // Lytt etter interaksjons-events fra store
  const getInteraction = useAvatarStore((s) => s.getInteractionForAvatar)

  useFrame((_, delta) => {
    const s = state.current
    const interaction = interactionRef.current
    const storeInteraction = getInteraction(data.id)

    // Oppdater globalt posisjonsregister
    avatarPositions.set(data.id, { x: s.position.x, z: s.position.z, rotation: s.rotation })

    // Eliminasjons-sjekk
    const isEliminatedNow = useAvatarStore.getState().isAvatarEliminated(data.id)
    if (isEliminatedNow && !eliminatedRef.current) {
      eliminatedRef.current = true
      setIsEliminated(true)
      setBubbleText('')

      // Spill dying-animasjon
      if (!dyingAnimPlayed.current) {
        dyingAnimPlayed.current = true
        const deathAnim = DEATH_POOL[Math.floor(Math.random() * DEATH_POOL.length)]
        playGesture(deathAnim, false)

        // Frys i siste frame etter animasjonen — gesture er allerede clampWhenFinished
        s.mode = 'idle'
        s.timer = 999999 // Aldri start ny vandring
      }

      // Sett opacity til 0.6 for eliminerte
      if (modelRef.current) {
        modelRef.current.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh
            const mat = mesh.material as THREE.MeshStandardMaterial
            if (mat) {
              mat.transparent = true
              mat.opacity = 0.6
            }
          }
        })
      }
    }

    // Skip all interaksjonslogikk for eliminerte
    if (eliminatedRef.current) {
      // Enkel ragdoll-push fra levende avatarer
      for (const [otherId, otherPos] of avatarPositions) {
        if (otherId === data.id) continue
        const otherEliminated = useAvatarStore.getState().isAvatarEliminated(otherId)
        if (otherEliminated) continue

        const dx = s.position.x - otherPos.x
        const dz = s.position.z - otherPos.z
        const dist = Math.sqrt(dx * dx + dz * dz)
        if (dist < 0.5 && dist > 0.01) {
          // Dytt ragdollen litt
          const pushForce = (0.5 - dist) * 0.3 * delta
          s.position.x += (dx / dist) * pushForce
          s.position.z += (dz / dist) * pushForce
        }
      }

      // Oppdater posisjon
      if (groupRef.current) {
        groupRef.current.position.copy(s.position)
        groupRef.current.rotation.y = s.rotation
      }

      // Weight-blending for dying-animasjon — same logikk som hovud-blokka
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
        idleW /= total
        walkW /= total
        gestureW /= total
      } else {
        idleW = 1; walkW = 0; gestureW = 0
      }

      if (idle) { idle.enabled = idleW > 0.001; idle.setEffectiveTimeScale(1); idle.setEffectiveWeight(idleW) }
      if (walk) { walk.enabled = walkW > 0.001; walk.setEffectiveTimeScale(1); walk.setEffectiveWeight(walkW) }
      if (gesture) { gesture.enabled = gestureW > 0.001; gesture.setEffectiveWeight(gestureW) }

      mixerRef.current?.update(delta)
      return
    }

    // Synkroniser med store — start approaching
    if (storeInteraction && interaction.phase === 'none') {
      const partnerId = storeInteraction.speakerId === data.id
        ? storeInteraction.targetId : storeInteraction.speakerId

      // Beregn midtpunkt — begge avatarer går mot midten
      const partnerPos = avatarPositions.get(partnerId)
      if (partnerPos) {
        const midX = (s.position.x + partnerPos.x) / 2
        const midZ = (s.position.z + partnerPos.z) / 2
        const dx = partnerPos.x - s.position.x
        const dz = partnerPos.z - s.position.z
        const len = Math.sqrt(dx * dx + dz * dz) || 1
        const offset = 0.2
        // Gå mot midtpunktet, men stopp litt på "min" side
        const targetX = midX - (dx / len) * offset
        const targetZ = midZ - (dz / len) * offset
        startInteraction(interaction, storeInteraction.id, partnerId, targetX, targetZ)
        // Lagre partnerens posisjon for facing-rotasjon
        interaction.partnerPosition = { x: partnerPos.x, z: partnerPos.z }
        s.mode = 'interacting'
      }
    }

    // Dialoglinjer mottatt
    if (storeInteraction && storeInteraction.lines.length > 0 && interaction.lines.length === 0) {
      setInteractionLines(interaction, storeInteraction.lines)
    }

    // Interaksjon avsluttet fra server
    if (!storeInteraction && interaction.phase !== 'none') {
      resetInteraction(interaction)
      stopGesture()
      s.mode = 'idle'
      s.timer = 1 + Math.random() * 3
      setBubbleText('')
    }

    // Approaching — beveg mot approach-target (midtpunktet)
    if (interaction.phase === 'approaching' && interaction.approachTarget) {
      const dx = interaction.approachTarget.x - s.position.x
      const dz = interaction.approachTarget.z - s.position.z
      const dist = Math.sqrt(dx * dx + dz * dz)

      if (dist < APPROACH_DISTANCE) {
        approachingDone(interaction)
        blendToIdle()
        s.mode = 'interacting'
      } else {
        // Gå mot partner
        const targetAngle = Math.atan2(dx, dz)
        let angleDiff = targetAngle - s.rotation
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2
        s.rotation += angleDiff * Math.min(1, 4 * delta)

        const step = Math.min(s.speed * delta, dist)
        s.position.x += (dx / dist) * step
        s.position.z += (dz / dist) * step
        blendToWalk()
      }
    }

    // Facing — roter mot partner
    if (interaction.phase === 'facing' && interaction.partnerPosition) {
      const dx = interaction.partnerPosition.x - s.position.x
      const dz = interaction.partnerPosition.z - s.position.z
      const targetAngle = Math.atan2(dx, dz)
      let angleDiff = targetAngle - s.rotation
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2
      s.rotation += angleDiff * Math.min(1, 6 * delta)
    }

    // Oppdater interaksjonsfaser
    if (interaction.phase !== 'none' && interaction.phase !== 'approaching') {
      const update = updateInteraction(interaction, delta)

      if (update.type === 'line_start') {
        const line = interaction.lines[update.lineIndex]
        if (line) {
          const isSpeaker = storeInteraction?.speakerId === data.id
          const isMyLine = (line.speaker === 'speaker' && isSpeaker) || (line.speaker === 'target' && !isSpeaker)

          if (update.lineIndex === 0) {
            // Fornærmelsen — speaker snakker, target står stille
            if (isMyLine) {
              setBubbleText(line.text)
              playGesture(randomFrom(INSULT_POOL))
            } else {
              setBubbleText('')
              stopGesture()
            }
          } else {
            // Comeback — target reagerer, speaker til idle
            if (isMyLine) {
              setBubbleText(line.text)
              // Tilfeldig reaksjon, men aldri to like på rad
              let pick = randomFrom(REACTION_POOL)
              if (pick === lastReactionRef.current && REACTION_POOL.length > 1) {
                pick = randomFrom(REACTION_POOL.filter(a => a !== lastReactionRef.current))
              }
              lastReactionRef.current = pick
              playGesture(pick)
            } else {
              setBubbleText('')
              stopGesture()
            }
          }
        }
      }

      if (update.type === 'all_lines_done') {
        setBubbleText('')
      }

      if (update.type === 'done') {
        stopGesture()
        s.mode = 'idle'
        s.timer = 1 + Math.random() * 3
        setBubbleText('')
      }
    }

    // Vanlig bevegelse (bare når ikke i interaksjon)
    if (interaction.phase === 'none') {
      // Filtrer ut eliminerte avatarer fra separasjon — døde skal ikke blokkere levende
      const livePositions = new Map<string, { x: number; z: number; rotation: number }>()
      for (const [id, pos] of avatarPositions) {
        if (!useAvatarStore.getState().isAvatarEliminated(id)) {
          livePositions.set(id, pos)
        }
      }
      movement.update(delta, data.id, livePositions)

      const idle = idleActionRef.current
      const walk = walkActionRef.current
      if (idle && walk && currentAnimRef.current !== 'gesture') {
        const shouldWalk = s.mode === 'walking'
        if (shouldWalk && currentAnimRef.current !== 'walking') {
          blendToWalk()
        } else if (!shouldWalk && currentAnimRef.current === 'walking') {
          blendToIdle()
        }
      }
    }

    // Oppdater posisjon og rotasjon
    if (groupRef.current) {
      groupRef.current.position.copy(s.position)
      groupRef.current.rotation.y = s.rotation
    }

    // Manuell weight-blending — interpoler mot mål-vekter hvert frame
    // VIKTIG: Total weight MÅ alltid være 1.0, ellers blander mixeren med T-pose (bind pose)
    const blendSpeed = 1 / CROSSFADE_DURATION
    const blendStep = Math.min(1, blendSpeed * delta)
    const tw = targetWeights.current

    const idle = idleActionRef.current
    const walk = walkActionRef.current
    const gesture = gestureActionRef.current

    let idleW = idle ? THREE.MathUtils.lerp(idle.getEffectiveWeight(), tw.idle, blendStep) : 0
    let walkW = walk ? THREE.MathUtils.lerp(walk.getEffectiveWeight(), tw.walk, blendStep) : 0
    let gestureW = gesture ? THREE.MathUtils.lerp(gesture.getEffectiveWeight(), tw.gesture, blendStep) : 0

    // Normaliser slik at total weight alltid er 1.0 — forhindrer T-pose
    const total = idleW + walkW + gestureW
    if (total > 0.001) {
      idleW /= total
      walkW /= total
      gestureW /= total
    } else {
      idleW = 1
      walkW = 0
      gestureW = 0
    }

    if (idle) {
      idle.enabled = idleW > 0.001
      idle.setEffectiveTimeScale(1)
      idle.setEffectiveWeight(idleW)
    }
    if (walk) {
      walk.enabled = walkW > 0.001
      walk.setEffectiveTimeScale(1)
      walk.setEffectiveWeight(walkW)
    }
    if (gesture) {
      gesture.enabled = gestureW > 0.001
      gesture.setEffectiveWeight(gestureW)
      // Rydd opp gesture først når idle har tatt over (forhindrer T-pose gap)
      if (tw.gesture === 0 && gestureW < 0.001 && idleW > 0.9) {
        gesture.enabled = false
        gesture.stop()
        gestureActionRef.current = null
      }
    }

    mixerRef.current?.update(delta)
  })

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
      {/* Navnelabel + helse-bar — skjules for eliminerte */}
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
