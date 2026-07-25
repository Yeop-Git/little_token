import { AUDIO } from '@/assets'
import type { Emotion } from '@core/types'

type EffectName =
  | 'sentenceComplete'
  | 'paperAttack'
  | 'paper'
  | 'cardHover'
  | 'pencil'
  | 'button'
  | 'resonanceJoy'
  | 'resonanceAnger'
  | 'resonanceSorrow'
  | 'resonancePleasure'
  | 'contextBonus'
type BgmName = 'title' | 'storyEaten' | 'battlePaperPages' | 'battlePaperTaiko' | 'battleHeroicMarch' | 'bossSaltSkater' | 'bossQueenBee' | 'bossElderSpider'
const VOLUME_KEY = 'little-token-master-volume'
const BGM_VOLUME = 0.16

const BGM_TRACK: Record<BgmName, string> = {
  title: AUDIO.bgm,
  storyEaten: AUDIO.battleStoryEatingBugs,
  battlePaperPages: AUDIO.battlePaperPages,
  battlePaperTaiko: AUDIO.battlePaperTaiko,
  battleHeroicMarch: AUDIO.battleHeroicMarch,
  bossSaltSkater: AUDIO.bossSaltSkaterBgm,
  bossQueenBee: AUDIO.bossQueenBeeBgm,
  bossElderSpider: AUDIO.bossElderSpiderBgm,
}

const RESONANCE_EFFECT: Partial<Record<Emotion, EffectName>> = {
  joy: 'resonanceJoy',
  anger: 'resonanceAnger',
  sorrow: 'resonanceSorrow',
  pleasure: 'resonancePleasure',
}

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
  private bgmSource: string | null = null
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

  startBgm(track: BgmName = 'title') {
    const source = BGM_TRACK[track]
    if (!this.bgm || this.bgmSource !== source) {
      this.bgm?.pause()
      this.bgm = new Audio(source)
      this.bgmSource = source
      this.bgm.loop = true
      this.bgm.preload = 'auto'
      this.bgm.volume = BGM_VOLUME * this.masterVolume
    }
    void this.bgm.play().catch(() => undefined)
  }

  playBattleBgm(day: number, bossId?: string) {
    const bossTrack: Record<string, BgmName> = {
      saltSkater: 'bossSaltSkater',
      queenBee: 'bossQueenBee',
      elderSpider: 'bossElderSpider',
    }
    const normalTracks: BgmName[] = ['battlePaperPages', 'battlePaperTaiko', 'battleHeroicMarch']
    this.startBgm(bossTrack[bossId ?? ''] ?? normalTracks[(Math.max(1, day) - 1) % normalTracks.length])
  }

  playResonance(emotions: readonly Emotion[]) {
    const resonant = (Object.keys(RESONANCE_EFFECT) as Emotion[]).find(
      (emotion) => emotions.filter((entry) => entry === emotion).length >= 2,
    )
    const effect = resonant ? RESONANCE_EFFECT[resonant] : undefined
    if (effect) this.play(effect)
  }

  playDefeatBgm() {
    this.startBgm('storyEaten')
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
    if (effect === 'resonanceAnger') {
      // 레퀴엠식 "빠밤"의 첫 두 화음만 남겨, 다음 문장 조립을 가리지 않게 한다.
      window.setTimeout(() => {
        voice.pause()
        voice.currentTime = 0
      }, 1250)
    }
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
    const effectVolume = effect === 'paperAttack'
      ? 0.38
      : effect === 'cardHover'
        ? 0.28
        : effect === 'pencil'
          ? 0.34
          : effect === 'button'
            ? 0.36
            : effect === 'contextBonus'
              ? 0.52
              : effect.startsWith('resonance')
                ? 0.48
                : 0.46
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
