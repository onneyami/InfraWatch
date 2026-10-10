// Короткий двойной бип через Web Audio API — не нужен внешний аудио-файл,
// работает во всех современных браузерах. AudioContext создаётся лениво и
// переиспользуется между вызовами (браузеры ограничивают количество
// одновременно живых контекстов).
let ctx: AudioContext | null = null

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioCtx) return null
    ctx = new AudioCtx()
  }
  return ctx
}

function beep(frequency: number, startTime: number, duration: number, audioCtx: AudioContext) {
  const oscillator = audioCtx.createOscillator()
  const gain = audioCtx.createGain()
  oscillator.connect(gain)
  gain.connect(audioCtx.destination)
  oscillator.frequency.value = frequency
  oscillator.type = 'sine'
  gain.gain.setValueAtTime(0.15, startTime)
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration)
  oscillator.start(startTime)
  oscillator.stop(startTime + duration)
}

export function playAlertSound() {
  const audioCtx = getContext()
  if (!audioCtx) return
  const now = audioCtx.currentTime
  beep(880, now, 0.12, audioCtx)
  beep(660, now + 0.15, 0.15, audioCtx)
}
