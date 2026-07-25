import { AUDIO } from '@/assets'
import type { Emotion } from '@core/types'
import { Howl, Howler } from 'howler'

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
  | 'swordHit'
  | 'enemyAttack1'
  | 'enemyAttack2'
  | 'heal'
  | 'shield'
  | 'cutscene'
  | 'win'
  | 'hover'
  | 'gameOver'
type BgmName = 'title' | 'storyEaten' | 'battlePaperPages' | 'battlePaperTaiko' | 'battleHeroicMarch' | 'bossSaltSkater' | 'bossQueenBee' | 'bossElderSpider'
const VOLUME_KEY = 'little-token-master-volume'
const BGM_VOLUME = 0.16
const EFFECT_VOLUME: Record<EffectName, number> = {
  sentenceComplete: 0.46,
  paperAttack: 0.38,
  paper: 0.46,
  cardHover: 0.28,
  pencil: 0.34,
  button: 0.36,
  resonanceJoy: 0.48,
  resonanceAnger: 0.48,
  resonanceSorrow: 0.48,
  resonancePleasure: 0.48,
  contextBonus: 0.52,
  swordHit: 0.54,
  enemyAttack1: 0.48,
  enemyAttack2: 0.48,
  heal: 0.46,
  shield: 0.5,
  cutscene: 0.52,
  win: 0.5,
  hover: 0.24,
  gameOver: 0.54,
}
const BATTLE_EFFECTS = Object.keys(EFFECT_VOLUME) as EffectName[]
const UI_EFFECTS: EffectName[] = ['button', 'cardHover', 'hover']
const BUFFERED_BATTLE_EFFECTS = BATTLE_EFFECTS.filter((effect) => effect !== 'pencil')

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

/**
 * 긴 BGM은 HTML5 스트리밍, 짧은 효과음은 Howler의 Web Audio 버퍼·보이스 풀로
 * 재생한다. 같은 파일을 클릭마다 복제·디코딩하지 않고 다음 전투 소리만 예열한다.
 */
class GameAudioController {
  private bgms = new Map<BgmName, Howl>()
  private currentBgmName: BgmName | null = null
  private preparedBgmName: BgmName | null = null
  private effects = new Map<EffectName, Howl>()
  private loads = new WeakMap<Howl, Promise<void>>()
  private failedLoads = new WeakSet<Howl>()
  private pencilVoice: number | null = null
  private pencilStopTimer: number | null = null
  private lastUiHoverAt = 0
  private buttonSoundsInstalled = false
  private streamsUnlocked = false
  private masterVolume = savedVolume()

  constructor() {
    Howler.volume(this.masterVolume)
  }

  getVolume() {
    return this.masterVolume
  }

  setVolume(volume: number) {
    this.masterVolume = Math.max(0, Math.min(1, volume))
    Howler.volume(this.masterVolume)
    try {
      localStorage.setItem(VOLUME_KEY, String(this.masterVolume))
    } catch {
      // 저장소가 막혀 있어도 현재 재생에는 반영한다.
    }
  }

  startBgm(track: BgmName = 'title') {
    if (this.currentBgmName !== track) {
      const previous = this.currentBgmName
      this.currentBgmName = track
      if (previous) {
        this.bgms.get(previous)?.stop()
        if (previous !== this.preparedBgmName) this.releaseBgm(previous)
      }
      if (this.preparedBgmName === track) this.preparedBgmName = null
    }
    const bgm = this.getBgm(track)
    if (!bgm.playing()) bgm.play()
  }

  playBattleBgm(day: number, bossId?: string) {
    this.startBgm(this.battleTrack(day, bossId))
  }

  /** 첫 UI 입력 전에 작은 공용 효과음만 백그라운드에서 준비한다. */
  preloadUiAudio() {
    return Promise.all(UI_EFFECTS.map((effect) => this.load(this.getEffect(effect)))).then(() => undefined)
  }

  /** 현재 스테이지에서 쓸 BGM 한 곡과 효과음 풀을 전투 리소스와 함께 예열한다. */
  preloadBattleAudio(day: number, bossId?: string) {
    const track = this.battleTrack(day, bossId)
    if (this.preparedBgmName && this.preparedBgmName !== track && this.preparedBgmName !== this.currentBgmName) {
      this.releaseBgm(this.preparedBgmName)
    }
    this.preparedBgmName = track
    const buffered = BUFFERED_BATTLE_EFFECTS.map((effect) => this.load(this.getEffect(effect)))
    if (!this.streamsUnlocked) return Promise.all(buffered).then(() => undefined)
    return Promise.all([...buffered, ...this.preloadPreparedStreams()]).then(() => undefined)
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

  /** 배율 칩이 연달아 붙는 순간의 슬롯머신식 점수 카운트업. */
  playMultiplierRise() {
    if (this.masterVolume <= 0 || !Howler.usingWebAudio) return
    const ctx = Howler.ctx
    void ctx.resume().catch(() => undefined)
    const now = ctx.currentTime
    const ticks = [330, 370, 415, 466, 523, 587, 659, 740, 831, 932, 1047, 1175]
    for (const [index, frequency] of ticks.entries()) {
      const start = now + index * 0.06
      const oscillator = ctx.createOscillator()
      const gain = ctx.createGain()
      oscillator.type = 'square'
      oscillator.frequency.setValueAtTime(frequency, start)
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.07, start + 0.06)
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.05 * this.masterVolume, start + 0.005)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.068)
      oscillator.connect(gain).connect(ctx.destination)
      oscillator.start(start)
      oscillator.stop(start + 0.075)
    }
    const bell = ctx.createOscillator()
    const bellGain = ctx.createGain()
    const bellStart = now + ticks.length * 0.06
    bell.type = 'triangle'
    bell.frequency.setValueAtTime(1318.51, bellStart)
    bellGain.gain.setValueAtTime(0.0001, bellStart)
    bellGain.gain.exponentialRampToValueAtTime(0.12 * this.masterVolume, bellStart + 0.008)
    bellGain.gain.exponentialRampToValueAtTime(0.0001, bellStart + 0.22)
    bell.connect(bellGain).connect(ctx.destination)
    bell.start(bellStart)
    bell.stop(bellStart + 0.24)
  }

  installButtonSounds() {
    if (this.buttonSoundsInstalled) return
    this.buttonSoundsInstalled = true
    void this.preloadUiAudio()
    document.addEventListener('click', (event) => {
      if (!this.streamsUnlocked) {
        // Howler가 같은 클릭에서 브라우저 오디오 잠금을 먼저 해제한 뒤 스트림을 만든다.
        this.streamsUnlocked = true
        void Promise.all(this.preloadPreparedStreams())
      }
      const target = event.target
      // 단어 카드를 포함해 실제 클릭이 닿는 모든 입력면에 공용 피드백을 준다.
      // 비활성 요소와 소리를 명시적으로 끈 연출만 제외한다.
      if (!(target instanceof Element) || target.closest(':disabled, [aria-disabled="true"], [data-click-sound="none"]')) return
      this.play('button')
    }, true)
    // pointerenter는 버블링하지 않는다. pointerover를 위임하되 같은 버튼의 자식
    // 사이를 움직인 경우는 걸러, 버튼 하나에 hover가 한 번만 들리게 한다.
    document.addEventListener('pointerover', (event) => {
      const target = event.target
      const card = target instanceof Element
        ? target.closest<HTMLElement>('.word-card, .word-cell, .reward-pick, .discard-pick, .deck-hover-card, .draw-deck, .codex-selectable[data-detail-kind="word"]')
        : null
      if (card) {
        if (event.relatedTarget instanceof Node && card.contains(event.relatedTarget)) return
        this.play('cardHover')
        return
      }
      const interactive = target instanceof Element
        ? target.closest<HTMLElement>('button, [role="button"]')
        : null
      if (!interactive || interactive.matches(':disabled, [aria-disabled="true"]')) return
      if (event.relatedTarget instanceof Node && interactive.contains(event.relatedTarget)) return
      this.play('hover')
    }, true)
  }

  /** 한 공격 연쇄의 0-based 타격 순서. 여섯 번째부터는 1.5배속을 유지한다. */
  playSwordHit(hitIndex: number) {
    const source = this.getEffect('swordHit')
    const voice = source.play()
    source.volume(EFFECT_VOLUME.swordHit, voice)
    source.rate(Math.min(1.5, 1 + Math.max(0, hitIndex) * 0.1), voice)
  }

  playEnemyAttack(animationStage = 1) {
    // 기본 공격은 1번, 강화된 2·3단계 공격은 더 긴 2번 소리를 쓴다.
    this.play(animationStage > 1 ? 'enemyAttack2' : 'enemyAttack1')
  }

  play(effect: EffectName) {
    if (effect === 'hover') {
      const now = performance.now()
      if (now - this.lastUiHoverAt < 55) return
      this.lastUiHoverAt = now
    }
    const source = this.getEffect(effect)
    const voice = source.play()
    source.volume(EFFECT_VOLUME[effect], voice)
    if (effect === 'resonanceAnger') {
      // 레퀴엠식 "빠밤"의 첫 두 화음만 남겨, 다음 문장 조립을 가리지 않게 한다.
      window.setTimeout(() => {
        source.stop(voice)
      }, 1250)
    }
    if (effect === 'pencil') {
      if (this.pencilStopTimer != null) window.clearTimeout(this.pencilStopTimer)
      if (this.pencilVoice != null) source.stop(this.pencilVoice)
      this.pencilVoice = voice
      this.pencilStopTimer = window.setTimeout(() => {
        if (this.pencilVoice === voice) {
          source.stop(voice)
          this.pencilVoice = null
        }
        this.pencilStopTimer = null
      }, 1000)
    }
  }

  private battleTrack(day: number, bossId?: string): BgmName {
    const bossTrack: Record<string, BgmName> = {
      mantis: 'bossSaltSkater',
      queenBee: 'bossQueenBee',
      elderSpider: 'bossElderSpider',
    }
    const normalTracks: BgmName[] = ['battlePaperPages', 'battlePaperTaiko', 'battleHeroicMarch']
    return bossTrack[bossId ?? ''] ?? normalTracks[(Math.max(1, day) - 1) % normalTracks.length]
  }

  private getBgm(track: BgmName) {
    const cached = this.bgms.get(track)
    if (cached && !this.failedLoads.has(cached)) return cached
    if (cached) {
      cached.unload()
      this.bgms.delete(track)
    }
    const bgm = new Howl({
      src: [BGM_TRACK[track]],
      html5: true,
      preload: 'metadata',
      loop: true,
      volume: BGM_VOLUME,
      pool: 1,
    })
    bgm.on('loaderror', () => this.failedLoads.add(bgm))
    this.bgms.set(track, bgm)
    return bgm
  }

  private releaseBgm(track: BgmName) {
    this.bgms.get(track)?.unload()
    this.bgms.delete(track)
  }

  private getEffect(effect: EffectName) {
    const cached = this.effects.get(effect)
    if (cached && !this.failedLoads.has(cached)) return cached
    if (cached) {
      cached.unload()
      this.effects.delete(effect)
    }
    // 48초 원본에서 1초만 쓰는 연필 소리는 전체 PCM 디코딩을 피한다.
    const streams = effect === 'pencil'
    const source = new Howl({
      src: [AUDIO[effect]],
      html5: streams,
      preload: streams ? 'metadata' : true,
      volume: EFFECT_VOLUME[effect],
      pool: effect === 'cardHover' || effect === 'hover' || effect === 'swordHit' ? 8 : effect === 'pencil' ? 1 : 5,
    })
    source.on('loaderror', () => this.failedLoads.add(source))
    this.effects.set(effect, source)
    return source
  }

  private preloadPreparedStreams(): Promise<void>[] {
    const streams = [this.load(this.getEffect('pencil'))]
    if (this.preparedBgmName) streams.push(this.load(this.getBgm(this.preparedBgmName)))
    return streams
  }

  private load(source: Howl): Promise<void> {
    if (source.state() === 'loaded') return Promise.resolve()
    const cached = this.loads.get(source)
    if (cached) return cached
    const pending = new Promise<void>((resolve) => {
      const finish = (failed: boolean) => {
        source.off('load', onLoad)
        source.off('loaderror', onLoadError)
        if (failed) {
          // Howler는 일부 오류에서 state를 loading으로 남긴다. 같은 인스턴스에 load를
          // 다시 걸면 이벤트가 오지 않으므로 다음 getEffect/getBgm에서 통째로 교체한다.
          this.failedLoads.add(source)
          this.loads.delete(source)
        }
        resolve()
      }
      const onLoad = () => finish(false)
      const onLoadError = () => finish(true)
      source.once('load', onLoad)
      // 오디오 하나가 막혀도 전투 진입 전체를 소프트락시키지 않는다.
      source.once('loaderror', onLoadError)
      if (source.state() === 'unloaded') source.load()
    })
    this.loads.set(source, pending)
    return pending
  }
}

export const GameAudio = new GameAudioController()
