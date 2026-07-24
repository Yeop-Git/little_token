import { AUDIO } from '@/assets'

type EffectName = 'wordSelect' | 'sentenceComplete' | 'paperAttack'

/** A small, dependency-free audio layer for the menu and battle feedback. */
class GameAudioController {
  private bgm: HTMLAudioElement | null = null
  private effects: Partial<Record<EffectName, HTMLAudioElement>> = {}

  startBgm() {
    if (!this.bgm) {
      this.bgm = new Audio(AUDIO.bgm)
      this.bgm.loop = true
      this.bgm.preload = 'auto'
      this.bgm.volume = 0.16
    }
    void this.bgm.play().catch(() => undefined)
  }

  play(effect: EffectName) {
    const source = this.effects[effect] ?? this.createEffect(effect)
    const voice = source.cloneNode() as HTMLAudioElement
    voice.volume = effect === 'paperAttack' ? 0.38 : 0.46
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
