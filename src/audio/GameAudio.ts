import { AUDIO } from '@/assets'

type EffectName = 'wordSelect' | 'sentenceComplete' | 'paperAttack'
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

  play(effect: EffectName) {
    const source = this.effects[effect] ?? this.createEffect(effect)
    const voice = source.cloneNode() as HTMLAudioElement
    voice.volume = (effect === 'paperAttack' ? 0.38 : 0.46) * this.masterVolume
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
