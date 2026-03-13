// Delt timing-logikk mellom klient og server
// Sikrer at server-timeout alltid matcher klientens faser

// Lesehastighet i tegn per sekund
export const CPS = 14
export const MIN_LINE_DURATION = 1.5
export const MAX_LINE_DURATION = 6

// Faste fasevarigheter
export const FACING_DURATION = 0.5
export const REACTING_DURATION = 1

// Server venter litt lenger enn klienten
export const SERVER_BUFFER = 1

// Beregn varighet fra tekstlengde
export function lineDuration(str) {
  return Math.max(MIN_LINE_DURATION, Math.min(MAX_LINE_DURATION, str.length / CPS))
}

// Total server-timeout for en interaksjon (i ms)
export function serverTimeout(insultText, replyText) {
  return (FACING_DURATION + lineDuration(insultText) + lineDuration(replyText) + REACTING_DURATION + SERVER_BUFFER) * 1000
}
