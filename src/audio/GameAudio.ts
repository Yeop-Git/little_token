import { AUDIO } from '@/assets'

type EffectName = 'sentenceComplete' | 'paperAttack' | 'paper' | 'cardHover' | 'pencil' | 'button'
const VOLUME_KEY = 'little-token-master-volume'
const BGM_VOLUME = 0.16

const savedVolume = () => {
  try {
    const raw = localStorage.getItem(VOLUME_KEY)
    if (raw == null) return 1
    const value = Number(raw)
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1
  } catch {
    return 1
  }
}

/** A small, dependency-free audio layer for the menu and battle feedback. */
class GameAudioController {
  private bgm: HTMLAudioElement | null = null
  private effects: Partial<Record<EffectName, HTMLAudioElement>> = {}
  private pencilVoice: HTMLAudioElement | null = null
  private pencilStopTimer: number | null = null
  private lastCardHoverAt = 0
  private buttonSoundsInstalled = false
  private masterVolume = savedVolume()

  getVolume() {
    return this.masterVolume
  }

  setVolume(volume: number) {
    this.masterVolume = Math.max(0, Math.min(1, volume))
    if (this.bgm) this.bgm.volume = BGM_VOLUME * this.masterVolume
    try {
      localStorage.setItem(VOLUME_KEY, String(this.masterVolume))
    } catch {
      // 저장소가 막혀 있어도 현재 재생에는 반영한다.
    }
  }

  startBgm() {
    if (!this.bgm) {
      this.bgm = new Audio(AUDIO.bgm)
      this.bgm.loop = true
      this.bgm.preload = 'auto'
      this.bgm.volume = BGM_VOLUME * this.masterVolume
    }
    void this.bgm.play().catch(() => undefined)
  }

  installButtonSounds() {
    if (this.buttonSoundsInstalled) return
    this.buttonSoundsInstalled = true
    document.addEventListener('click', (event) => {
      const target = event.target
      const button = target instanceof Element ? target.closest<HTMLButtonElement>('button') : null
      if (!button || button.matches('.word-card')) return
      this.play('button')
    }, true)
  }

  play(effect: EffectName) {
    if (effect === 'cardHover') {
      const now = performance.now()
      if (now - this.lastCardHoverAt < 70) return
      this.lastCardHoverAt = now
    }
    const source = this.effects[effect] ?? this.createEffect(effect)
    const voice = source.cloneNode() as HTMLAudioElement
    if (effect === 'pencil') {
      if (this.pencilStopTimer != null) window.clearTimeout(this.pencilStopTimer)
      this.pencilVoice?.pause()
      this.pencilVoice = voice
      voice.addEventListener('ended', () => {
        if (this.pencilVoice !== voice) return
        this.pencilVoice = null
        if (this.pencilStopTimer != null) window.clearTimeout(this.pencilStopTimer)
        this.pencilStopTimer = null
      }, { once: true })
      this.pencilStopTimer = window.setTimeout(() => {
        if (this.pencilVoice === voice) {
          voice.pause()
          voice.currentTime = 0
          this.pencilVoice = null
        }
        this.pencilStopTimer = null
      }, 1000)
    }
    const effectVolume = effect === 'paperAttack' ? 0.38 : effect === 'cardHover' ? 0.28 : effect === 'pencil' ? 0.34 : effect === 'button' ? 0.36 : 0.46
    voice.volume = effectVolume * this.masterVolume
    void voice.play().catch(() => undefined)
  }

  private createEffect(effect: EffectName) {
    const source = new Audio(AUDIO[effect])
    source.preload = 'auto'
    this.effects[effect] = source
    return source
  }
}

export const GameAudio = new GameAudioController()
