import { useEffect, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import type { Avatar, InteractionStartEvent, InteractionLinesEvent, InteractionEndEvent } from '../../../shared/types'
import { useAvatarStore } from '../stores/avatarStore'

export function useWebSocket() {
  const socketRef = useRef<Socket | null>(null)
  const startInteraction = useAvatarStore((s) => s.startInteraction)
  const setInteractionLines = useAvatarStore((s) => s.setInteractionLines)
  const endInteraction = useAvatarStore((s) => s.endInteraction)

  useEffect(() => {
    const socket = io({ transports: ['websocket'] })
    socketRef.current = socket

    // Eksisterende interaksjons-events
    socket.on('interaction-start', (event: InteractionStartEvent) => {
      startInteraction(event.id, event.speakerId, event.targetId)
    })

    socket.on('interaction-lines', (event: InteractionLinesEvent) => {
      setInteractionLines(event.id, event.lines)
    })

    socket.on('interaction-end', (event: InteractionEndEvent) => {
      endInteraction(event.id)
    })

    // Nye avatarer
    socket.on('new-avatar', (avatar: Avatar) => {
      useAvatarStore.getState().addAvatarDirect(avatar)
    })

    // --- Eksperiment runde-events ---

    socket.on('round-start', (event: { roundId: string; participants: any[]; duration: number }) => {
      const store = useAvatarStore.getState()
      store.setRoundActive(true, event.roundId, event.duration)
      store.addKillFeedEntry(`Runde startet — ${event.participants.length} deltakere`)
    })

    socket.on('round-end', (event: { roundId: string; winner: { id: string; name: string } | null }) => {
      const store = useAvatarStore.getState()
      store.addKillFeedEntry(event.winner
        ? `Runde over — ${event.winner.name} vant`
        : 'Runde over — ingen vinner')
      // Sett roundActive false etter kort delay slik at kommentarer vises
      setTimeout(() => store.setRoundActive(false), 15_000)
    })

    socket.on('status-update', (event: { avatars: any[] }) => {
      useAvatarStore.getState().updateExperimentAvatars(event.avatars)
    })

    socket.on('alliance-formed', (event: { allianceId: string; members: any[] }) => {
      useAvatarStore.getState().addKillFeedEntry(
        `Allianse dannet: ${event.members.map((m: any) => m.id).join(', ')}`
      )
    })

    socket.on('alliance-broken', (event: { allianceId: string; reason: string }) => {
      useAvatarStore.getState().addKillFeedEntry(`Allianse oppløst: ${event.reason}`)
    })

    socket.on('elimination', (event: {
      avatarId: string; avatarName: string; rank: number;
      eliminatedByName: string | null
    }) => {
      const store = useAvatarStore.getState()
      const byText = event.eliminatedByName ? ` av ${event.eliminatedByName}` : ''
      store.addKillFeedEntry(`${event.avatarName} eliminert${byText} (plass ${event.rank})`)
    })

    socket.on('commentary', (event: { lines: Array<{ speaker: 'A' | 'B'; text: string }>; trigger: string }) => {
      useAvatarStore.getState().addCommentary(event.lines, event.trigger)
    })

    socket.on('mob-alert', (event: { targetId: string; attackerIds: string[] }) => {
      useAvatarStore.getState().setMobTarget(event.targetId)
      // Reset etter 5 sekunder
      setTimeout(() => useAvatarStore.getState().setMobTarget(null), 5_000)
    })

    socket.on('late-join', (event: { avatar: any }) => {
      useAvatarStore.getState().addKillFeedEntry(
        `${event.avatar.name} meldt inn (resilience: ${event.avatar.resilience})`
      )
    })

    // Runde-state for klienter som kobler til mid-round
    socket.on('round-state', (state: any) => {
      if (state) {
        const store = useAvatarStore.getState()
        store.setRoundActive(true, state.roundId, state.timeRemaining)
      }
    })

    // Timer — oppdater hvert sekund
    const timerInterval = setInterval(() => {
      const store = useAvatarStore.getState()
      if (store.roundActive && store.roundTimeRemaining > 0) {
        store.updateRoundTime(store.roundTimeRemaining - 1)
      }
    }, 1000)

    return () => {
      socket.disconnect()
      clearInterval(timerInterval)
    }
  }, []) // bevisst tom deps

  return socketRef
}
