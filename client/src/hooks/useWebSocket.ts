import { useEffect, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import type { Avatar, InteractionLinesEvent } from '../../../shared/types'
import { useAvatarStore } from '../stores/avatarStore'

export function useWebSocket() {
  const socketRef = useRef<Socket | null>(null)
  const setInteractionLines = useAvatarStore((s) => s.setInteractionLines)

  useEffect(() => {
    const socket = io({ transports: ['websocket'] })
    socketRef.current = socket

    // Dialoglinjer — brukes under dueller for fornærmelsen
    socket.on('interaction-lines', (event: InteractionLinesEvent & { speakerId?: string }) => {
      const store = useAvatarStore.getState()
      const duel = store.currentDuel
      if (duel && event.id === duel.id) {
        // Bruk speakerId fra event for å vite hvem som snakker
        const speakerId = event.speakerId || duel.avatarA
        const targetId = speakerId === duel.avatarA ? duel.avatarB : duel.avatarA
        store.startInteraction(event.id, speakerId, targetId)
        setInteractionLines(event.id, event.lines)
        store.setDuelPhase('insult')
      }
    })

    // Nye avatarer
    socket.on('new-avatar', (avatar: Avatar) => {
      useAvatarStore.getState().addAvatarDirect(avatar)
    })

    // --- Mexican Standoff events ---

    // Nedtelling før runde
    socket.on('round-countdown', (event: { count: number }) => {
      useAvatarStore.getState().setStandoffCountdown(event.count)
    })

    // Dip-to-black overgang
    socket.on('dip-to-black', (event: { duration: number }) => {
      const store = useAvatarStore.getState()
      store.setStandoffCountdown(null) // Fjern nedtelling
      store.setDipToBlack(true)
      // Fade tilbake etter halve varigheten + litt ekstra
      setTimeout(() => store.setDipToBlack(false), event.duration)
    })

    socket.on('circle-setup', (event: { slots: Array<{ avatarId: string; slotIndex: number }>; totalSlots: number }) => {
      useAvatarStore.getState().setCircleSetup(event.slots, event.totalSlots)
    })

    socket.on('duel-start', (event: {
      id: string; avatarA: string; avatarB: string;
      nameA: string; nameB: string;
      personalityA: string; personalityB: string;
      duelNumber: number; totalDuels: number; isLastDuel: boolean
    }) => {
      const store = useAvatarStore.getState()
      store.setDuelStart({
        id: event.id,
        avatarA: event.avatarA,
        avatarB: event.avatarB,
        phase: 'approach',
        duelNumber: event.duelNumber,
        totalDuels: event.totalDuels,
        isLastDuel: event.isLastDuel,
      })

      // VS-kort med navn og personlighetstype
      store.setVsCard({
        nameA: event.nameA,
        nameB: event.nameB,
        personalityA: event.personalityA,
        personalityB: event.personalityB,
      })

      store.addKillFeedEntry(`Duell ${event.duelNumber}: ${event.nameA} vs ${event.nameB}`)
    })

    socket.on('duel-faceoff', (event: { id: string }) => {
      const store = useAvatarStore.getState()
      store.setVsCard(null) // Fjern VS-kort når faceoff starter
      store.setDuelPhase('faceoff')
    })

    socket.on('duel-result', (event: { id: string; winnerId: string; loserId: string }) => {
      const store = useAvatarStore.getState()
      store.setDuelResult(event.winnerId, event.loserId)

      const winnerName = store.avatars.find(a => a.id === event.winnerId)?.name || '?'
      const loserName = store.avatars.find(a => a.id === event.loserId)?.name || '?'
      store.addKillFeedEntry(`${winnerName} tok ut ${loserName}`)
    })

    socket.on('duel-end', (event: { id: string }) => {
      const store = useAvatarStore.getState()
      // Avslutt interaksjon
      store.endInteraction(event.id)
      store.clearDuel()
    })

    // --- Eksisterende runde-events ---

    socket.on('round-start', (event: { roundId: string; participants: any[]; duration: number }) => {
      const store = useAvatarStore.getState()
      store.setRoundActive(true, event.roundId, event.duration)
      store.addKillFeedEntry(`Mexican Standoff — ${event.participants.length} deltakere`)
    })

    socket.on('round-end', (event: { roundId: string; winner: { id: string; name: string } | null }) => {
      const store = useAvatarStore.getState()
      store.setRoundWinner(event.winner || null)
      // Sett roundActive false etter 20s slik at vinner-skjerm vises
      setTimeout(() => store.setRoundActive(false), 20_000)
    })

    socket.on('round-reset', (event: { countdown: number }) => {
      const store = useAvatarStore.getState()
      store.setResetCountdown(event.countdown)
      store.addKillFeedEntry(`Ny runde om ${event.countdown}s`)
    })

    socket.on('status-update', (event: { avatars: any[] }) => {
      useAvatarStore.getState().updateExperimentAvatars(event.avatars)
    })

    socket.on('elimination', (event: {
      avatarId: string; avatarName: string; rank: number;
      eliminatedByName: string | null
    }) => {
      const store = useAvatarStore.getState()
      const byText = event.eliminatedByName ? ` av ${event.eliminatedByName}` : ''
      store.addKillFeedEntry(`${event.avatarName} eliminert${byText} (plass ${event.rank})`)
    })

    socket.on('commentary', (event: { lines: Array<{ speaker: 'A' | 'B'; text: string }>; trigger: string; focusIds?: string[] }) => {
      useAvatarStore.getState().addCommentary(event.lines, event.trigger, event.focusIds)
    })

    socket.on('late-join', (event: { avatar: any }) => {
      useAvatarStore.getState().addKillFeedEntry(`${event.avatar.name} meldt inn`)
    })

    // Runde-state for klienter som kobler til mid-round
    socket.on('round-state', (state: any) => {
      if (state) {
        const store = useAvatarStore.getState()
        store.setRoundActive(true, state.roundId, state.timeRemaining)

        // Sett eliminerings-state slik at døde avatarer vises korrekt
        if (state.experimentAvatars) {
          const avatarArray = Object.values(state.experimentAvatars) as any[]
          store.updateExperimentAvatars(avatarArray)
        }

        if (state.currentDuel) {
          store.setDuelStart({
            ...state.currentDuel,
            phase: 'approach',
          })
        }
      }
    })

    return () => {
      socket.disconnect()
    }
  }, []) // bevisst tom deps

  return socketRef
}
