/**
 * 점수 재기획(SCORE_REDESIGN.md) 본편 화면.
 *
 * 규칙 엔진은 `src/score`의 `ScoreRun`이고, 화면은 기존 인게임 UI를 그대로 쓴다.
 * 전장(배경·프롬·벌레 3D·토큰), 좌상단 HUD·스테이지 진행·시스템 메뉴, 손패(`CardHand`)와 카드 앞면,
 * 문장 체인·지금 배율·집계판, 체력 HUD 모양의 목표 점수판이 모두 원래 전투 화면의 마크업과 CSS다.
 * 잉크 미터 자리는 「남은 기회」가 쓴다(SCORE_REDESIGN §1).
 * 규칙과 수치는 엔진에서만 읽는다. 이 파일은 그리기·입력·연출만 맡는다.
 */
import './score-run.css'
import {
  MAX_LEVEL, PIECES_PER_HEART, SCORE_CARDS, SCORE_FLOORS, SCORE_FORMS, SCORE_RELICS, SCORE_STICKERS, SCORE_WEATHERS,
  card as cardDef, form as formDef, leveled, relic as relicDef, sticker as stickerDef, weather as weatherDef,
} from '@/score/data'
import { contentName, contentRule, getLocale, setScoreLocale, t, type ContentKind, type ScoreLocale } from '@/score/i18n'
import { ScoreRun } from '@/score/run'
import { expectedRoller, pickCost, scoreSentence } from '@/score/scoring'
import {
  ERASER_PRICE, FORGE_SLOTS, HEAL_PRICE, HEART_TRADES, RARITY_BASE_POINTS, RARITY_BONUS, REROLL_PRICE,
  priceWithReceipt, wordPrice, type HeartTradeId, type ShopOffer,
} from '@/score/shop'
import { floorDef } from '@/score/stage'
import { tryoutBaseline, tryoutRelic, tryoutSticker, tryoutWord, type OfferTryout } from '@/score/tryout'
import type { DeckCard, ScoreEmotion, ScoreSlot, ScoreStep, SentencePick, SentenceResult } from '@/score/types'
import { STAT_EMOTIONS } from '@/score/types'
import { currentLocale } from '@/localization'
import { CHARACTER_VISUALS, type CharacterVisualDef } from '@data/characters'
import { stageFor } from '@data/stages'
import { currentFieldLight, currentFieldStage, pickFieldBackground } from '@data/backgrounds'
import { ALL_REWARD_WORDS, EARLY_WORDS } from '@data/earlyWords'
import { ALL_ITEMS } from '@data/items'
import {
  destroyCharacterModels, mountCharacterModel, playCharacterAnimation, suspendCharacterModel,
} from '@views/BattleCharacterModel'
import { TokenActor } from '@views/TokenActor'
import { GameAudio } from '@/audio/GameAudio'
import { BACKGROUNDS, FORGE_HAMMER_ART, INK_UI, ITEM_ART, REWARD_ART, SKILL_ART } from '@/assets'
import { SquareBurst } from '@/ui/SquareBurst'
import { wordCardInnerHtml } from '@/ui/WordCardFace'
import { gameWords, ruleChipsHtml } from '@views/scoreRuleChips'
import { CardHand } from '@/ui/CardHand'
import { emotionIconBadge } from '@/ui/EmotionBadge'
import { icon, itemArt } from '@/ui/Icons'
import { TooltipLayer } from '@/ui/TooltipLayer'
import { openSettingsModal } from '@/ui/SettingsModal'
import type { Emotion, Word } from '@core/types'
import type { TokenLine } from '@/localization/bossToken'

type SelKey = 'subj' | 'adv' | 'verb' | 'subj2' | 'verb2'
type ShopMode =
  | { kind: 'stickerTarget'; offer: ShopOffer; viaTrade: boolean }
  | { kind: 'tradeSticker' }
  | { kind: 'recall' }

export interface ScoreRunViewOpts {
  run: ScoreRun
  onHome: () => void
  onNewRun: () => void
  /** 설정 창의 「기록 초기화」. */
  onResetAll?: () => void
  /** 런이 끝났을 때 한 번. 토큰의 기억(런 종료)은 부르는 쪽이 처리한다. */
  onFinished?: (outcome: 'won' | 'lost', floor: number) => void
  /** 개발 서버 전용 치트 줄을 띄운다. */
  dev?: boolean
}

const MAX_VISIBLE_FOES = 3
/** 마지막 칸을 채운 뒤 문장이 발동하기까지. 그 사이에 단계 칩을 눌러 되돌릴 수 있다. */
const AUTO_WRITE_MS = 650
const TALLY_STEP_MS = 150
const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms))
const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!))
const fmt = (n: number) => Math.round(n).toLocaleString(getLocale())
const fmt2 = (n: number) => (Math.round(n * 100) / 100).toLocaleString(getLocale())
/** 기존 카드·오디오의 감정 이름. 혼돈은 옛 무감정 자리를 쓴다. */
const coreEmotion = (e: ScoreEmotion): Emotion => (e === 'chaos' ? 'neutral' : e)
const baseSlot = (k: SelKey): ScoreSlot => (k === 'subj2' ? 'subj' : k === 'verb2' ? 'verb' : k)

const NAME_INDEX = new Map<string, { kind: ContentKind; id: string }>()
for (const [kind, rows] of [['card', SCORE_CARDS], ['sticker', SCORE_STICKERS], ['relic', SCORE_RELICS], ['weather', SCORE_WEATHERS], ['form', SCORE_FORMS]] as const) {
  for (const r of rows) if (!NAME_INDEX.has(r.name)) NAME_INDEX.set(r.name, { kind, id: r.id })
}

/** 같은 이름의 기존 단어가 있으면 그 원화를 빌린다(한국어 원문 이름으로 잇는다). */
const ART_BY_NAME = new Map<string, string>()
for (const w of [...Object.values(EARLY_WORDS).flat(), ...ALL_REWARD_WORDS]) {
  if (w.art && !ART_BY_NAME.has(w.text)) ART_BY_NAME.set(w.text, w.art)
}
/** 기존 전설 아이템에서 옮겨 온 유물은 그 아이템 그림을 그대로 쓴다(SCORE_REDESIGN §8 이전표). */
const RELIC_ITEM_ART: Record<string, string> = {
  echo: 'echo', retry: 'retry', twinSubj: 'twinSubj', twinVerb: 'twinVerb', ember: 'matchFire', brazier: 'bbq',
  question: 'doubt', beanstalk: 'beanstalk', comma: 'heavyShoe', lead: 'luckCloak',
}

function cardRule(c: DeckCard): string {
  const d = leveled(cardDef(c.cardId), c.level)
  return contentRule('card', c.cardId, { a: d.a, b: d.b, c: d.c, d: d.d })
}
const stickerRule = (id: string) => { const d = stickerDef(id); return contentRule('sticker', id, { a: d.a, b: d.b }) }
const relicRule = (id: string) => { const d = relicDef(id); return contentRule('relic', id, { a: d.a, b: d.b }) }
/** 스탯 이름도 게임 화면의 말로(기본 가산 → 기본 배율). 점수의 두 축은 칩 × 배율. */
const statName = (id: string) => gameWords(contentName('stat', id))
const weatherRule = (id: string) => contentRule('weather', id, { a: weatherDef(id).a })
const formRule = (id: string) => contentRule('form', id, { a: formDef(id).a })

function stepLabel(s: ScoreStep): string {
  if (s.source === 'stat') return t('step_stat')
  if (s.source === 'stage') return t('step_stage')
  if (s.source === 'carry') return t('step_carry')
  const n = Number(s.label.match(/\d+/)?.[0] ?? 0)
  if (s.source === 'resonance') return t('step_resonance', { n })
  if (s.source === 'paint') return t('step_paint', { n })
  const bare = s.label.replace(/^나도: /, '').replace(/ \(두 번 읽기\)$/, '')
  const ref = NAME_INDEX.get(bare)
  return ref ? contentName(ref.kind, ref.id) : s.label
}

function heartsHtml(pieces: number, max: number): string {
  const total = Math.ceil(max / PIECES_PER_HEART)
  let out = ''
  for (let i = 0; i < total; i++) {
    const fill = Math.max(0, Math.min(PIECES_PER_HEART, pieces - i * PIECES_PER_HEART))
    out += `<span class="sr-heart" style="--fill:${(fill / PIECES_PER_HEART) * 100}%"></span>`
  }
  return `<span class="sr-hearts" title="${t('hearts')} ${pieces}/${max}">${out}</span>`
}

/** 15층 안에서 그 층의 벌레 종류. 기존 스테이지 편성표의 종 순서를 그대로 빌린다. */
function speciesFor(floor: number): { ids: string[]; boss?: string } {
  const st = stageFor(floor)
  return st.isBoss ? { ids: st.encounter, boss: st.encounter[0] } : { ids: st.encounter }
}

export class ScoreRunView {
  private run: ScoreRun
  private sel: Partial<Record<SelKey, DeckCard>> = {}
  private slotIndex = 0
  private shopMode: ShopMode | undefined
  private swapMode = false
  private busy = false
  private destroyed = false
  private timers: number[] = []
  private autoWriteTimer = 0
  private token: TokenActor | null = null
  private cardHand: CardHand | null = null
  private handObserver: MutationObserver | null = null
  private tooltips: TooltipLayer | null = null
  /** 손패 카드(Word)의 id → 엔진의 덱 카드. */
  private wordCards = new Map<string, DeckCard>()
  private scene: HTMLElement | null = null
  private sceneFloor = 0
  private foePool = new Map<string, HTMLElement[]>()
  private foeSerial = 0
  /** 이번 스테이지에서 이미 한 토큰 대사(같은 말을 되풀이하지 않는다). */
  private said = new Set<string>()

  constructor(private root: HTMLElement, private opts: ScoreRunViewOpts) {
    this.run = opts.run
    setScoreLocale(currentLocale as ScoreLocale)
    this.root.addEventListener('click', this.onClick)
    this.root.addEventListener('pointerover', this.onOver)
    this.root.addEventListener('pointerout', this.onOut)
    this.render()
  }

  destroy() {
    this.destroyed = true
    this.root.removeEventListener('click', this.onClick)
    this.root.removeEventListener('pointerover', this.onOver)
    this.root.removeEventListener('pointerout', this.onOut)
    this.timers.forEach((id) => clearTimeout(id))
    clearTimeout(this.autoWriteTimer)
    this.teardownScene()
  }

  private later(ms: number, fn: () => void) {
    this.timers.push(window.setTimeout(() => { if (!this.destroyed) fn() }, ms))
  }

  // ── 화면 갈래 ──

  private render() {
    if (this.destroyed) return
    const phase = this.run.phase
    if (phase === 'battle') {
      if (!this.scene || this.sceneFloor !== this.run.floor) this.mountBattle()
      else this.paintBattle()
      return
    }
    this.teardownScene()
    this.root.setAttribute('data-theme', 'day')
    let html = ''
    if (phase === 'shop') html = this.shopHtml()
    else if (phase === 'forge') html = this.forgeHtml()
    else html = this.endHtml()
    const scroller = this.root.querySelector<HTMLElement>('.sr-paper-scroll')
    const keep = scroller?.scrollTop ?? 0
    this.root.querySelector('.sr-screen')?.remove()
    this.root.insertAdjacentHTML('beforeend', html)
    const next = this.root.querySelector<HTMLElement>('.sr-paper-scroll')
    if (next && phase === 'shop') next.scrollTop = keep
  }

  private teardownScene() {
    if (!this.scene) return
    clearTimeout(this.autoWriteTimer)
    this.handObserver?.disconnect()
    this.handObserver = null
    this.cardHand?.destroy()
    this.cardHand = null
    this.tooltips?.destroy()
    this.tooltips = null
    this.token?.destroy()
    this.token = null
    destroyCharacterModels(this.scene)
    this.foePool.forEach((pool) => pool.forEach((el) => destroyCharacterModels(el)))
    this.foePool.clear()
    this.scene.remove()
    this.scene = null
    this.sceneFloor = 0
  }

  // ── 전투 ──

  private mountBattle() {
    this.teardownScene()
    this.root.querySelector('.sr-screen')?.remove()
    const floor = this.run.floor
    const sp = speciesFor(floor)
    const isBoss = !!sp.boss
    const st = stageFor(floor)
    const bg = pickFieldBackground(floor, isBoss, sp.boss)
    this.root.setAttribute('data-theme', st.field.theme)
    GameAudio.playBattleBgm(floor, sp.boss)
    const light = currentFieldLight()
    const stage = currentFieldStage()
    this.sel = {}
    this.slotIndex = 0
    this.swapMode = false
    this.said.clear()
    this.root.insertAdjacentHTML('beforeend', `
      <div class="scene battle score-battle"${isBoss ? ' data-boss="true"' : ''} data-weather="${st.field.weather}" style="background-image:url(${bg.prev ?? bg.next});--actor-bottom:${stage.bottom}px;--player-left:${stage.playerLeft ?? 290}px;--sun-x:${(light.sunX * 100).toFixed(1)}%;--sun-y:${(light.sunY * 100).toFixed(1)}%;--sun-color:#${light.keyColor.toString(16).padStart(6, '0')};--sun-strength:${light.sunStrength};--model-grade-hue:${light.gradeHue}deg">
        ${bg.prev ? `<div class="field-swap" aria-hidden="true" style="background-image:url(${bg.next})"></div>` : ''}
        <div class="vignette"></div>
        <div class="weather-wash"></div>
        <div class="field-clarity" aria-hidden="true"></div>
        <div class="field-sun" aria-hidden="true"></div>
        <div class="storybook-grade" aria-hidden="true"></div>
        <div class="hud-top">
          <div class="hud-left-stack">
            <div class="hud-left-status">
              <div class="inspiration-wallet glass" id="sr-money" role="img" tabindex="0"></div>
              <div class="grade-badge glass" id="sr-tears" role="img" tabindex="0"></div>
              <div class="hud-player-stats glass" id="stats"></div>
            </div>
            <aside class="relic-strip" id="relic-strip"></aside>
          </div>
          <div class="hud-status">
            <div class="hud-status-bar">
              ${this.stageProgressHtml()}
              <div class="hud-actions glass">
                <button type="button" data-act="settings" aria-label="${t('settings')}" data-tooltip="${t('settings')}">${icon('settings')}</button>
                <button type="button" data-act="home" aria-label="${t('home')}" data-tooltip="${t('home')}">${icon('home')}</button>
              </div>
            </div>
            <div class="effect-log" id="log"></div>
          </div>
        </div>
        <section class="boss-health-hud sr-goal-hud" id="sr-goal"></section>
        <div class="stage-area" id="pbox">
          <div class="chain-rail" id="chain"></div>
          <div class="mult-now" id="mult-now" aria-live="polite"></div>
          <div id="actors"></div>
        </div>
        <div class="slot-step" id="steps"></div>
        <div class="ink-meter sr-chance-meter" id="ink-meter" role="img" tabindex="0"></div>
        <div class="word-zone">
          <div class="card-table">
            <div class="card-hand" id="card-hand"></div>
            <button class="draw-deck" id="draw-deck" type="button" hidden></button>
          </div>
        </div>
        <aside class="info-dock detail-idle" id="detail" aria-live="polite"></aside>
        ${this.opts.dev ? `<div class="sr-dev"><b>DEV</b><button type="button" data-act="devClear">클리어</button><button type="button" data-act="devMoney">돈 +50</button><button type="button" data-act="devHeal">하트 회복</button></div>` : ''}
        <div class="sr-banner" hidden></div>
        <div id="overlay"></div>
      </div>`)
    const scene = this.root.querySelector<HTMLElement>('.scene.score-battle')!
    this.scene = scene
    this.sceneFloor = floor
    this.tooltips = new TooltipLayer(scene)
    const actors = scene.querySelector<HTMLElement>('#actors')!
    actors.insertAdjacentHTML('beforeend', this.playerHtml())
    const you = actors.querySelector<HTMLElement>('.actor.you')!
    // 보스전은 카드 뒤에서 보스를 올려다보는 원래 구도 그대로 프롬이 등을 돌린다.
    mountCharacterModel(you, isBoss ? { ...CHARACTER_VISUALS.player, modelYaw: Math.PI } : CHARACTER_VISUALS.player)
    this.token = new TokenActor(scene.querySelector<HTMLElement>('.stage-area')!)
    this.token.attachTo(you)
    playCharacterAnimation(you, 'walk')
    this.later(1100, () => playCharacterAnimation(you, 'idle'))
    this.cardHand = new CardHand({
      handRoot: scene.querySelector<HTMLElement>('#card-hand')!,
      deckButton: scene.querySelector<HTMLButtonElement>('#draw-deck')!,
      onConfirm: (word) => this.onCardConfirm(word),
      onPreview: (word) => this.renderDetail(word),
      onPreviewEnd: () => this.renderDetail(null),
    })
    // 손패는 카드 앞면을 공용 함수로 그리고 다시 그릴 때 설명을 글자로 덮는다. 카드가 붙을 때마다 설명을 칩으로 바꿔 끼운다.
    const handRoot = scene.querySelector<HTMLElement>('#card-hand')!
    this.handObserver = new MutationObserver(() => this.decorateHand())
    this.handObserver.observe(handRoot, { childList: true })
    this.syncFoes(true)
    this.paintBattle()
    this.later(900, () => {
      this.token?.wake()
      if (isBoss) this.sayOnce('boss', t('tokenBoss'), 'warn')
      else if (floor === 1) this.sayOnce('start', t('tokenStart'))
    })
  }

  private playerHtml(): string {
    const v = CHARACTER_VISUALS.player
    return `<div class="actor you" data-character="player">
      <div class="shadow"></div>
      <div class="model-shell" data-model-status="${v.model3d ? 'preparing-3d' : 'fallback-2d'}">
        <img class="battle-sprite" src="${v.portrait2d}" alt="">
      </div>
    </div>`
  }

  /** 상단 오른쪽 스테이지 진행 — 원래 전투 HUD의 마크업을 점수 재기획 15층 표에 맞춰 그린다. */
  private stageProgressHtml(): string {
    const floor = this.run.floor
    const total = SCORE_FLOORS.length
    const bosses = SCORE_FLOORS.filter((f) => f.boss)
    const next = bosses.find((f) => f.floor >= floor) ?? bosses[bosses.length - 1]
    const bossName = next ? this.visualFor(next.boss).name : t('boss')
    const remaining = next ? Math.max(0, next.floor - floor) : 0
    const copy = remaining === 0 ? t('bossNow', { boss: bossName }) : t('toBoss', { boss: bossName, n: remaining })
    const marks = bosses.map((f, i) => `<span class="stage-progress-boss-point${i === bosses.length - 1 ? ' is-last' : ''}" style="--boss-at:${(f.floor / total) * 100}%" aria-hidden="true">
        <i class="stage-progress-boss${floor >= f.floor ? ' passed' : ''}">${icon('skull')}</i>
        <span class="stage-progress-boss-label"><b>${f.floor}</b> ${esc(this.visualFor(f.boss).name)}</span>
      </span>`).join('')
    return `<div class="stage-progress-slot">
      <section class="stage-progress glass" role="img" tabindex="0" aria-label="${esc(`${t('floor', { n: floor })} / ${total}. ${copy}`)}">
        <span class="stage-progress-summary"><i aria-hidden="true">✦</i><b>${t('floor', { n: floor })}<em>/${total}</em></b></span>
        <span class="stage-progress-detail" aria-hidden="true">
          <span class="stage-progress-copy"><small>${esc(contentName('form', this.run.stage.plan.formId))}</small><b>${esc(copy)}</b></span>
          <span class="stage-progress-track">
            <i class="stage-progress-fill" style="width:${Math.min(100, (floor / total) * 100)}%"></i>
            <span class="stage-progress-boss-layer">${marks}</span>
          </span>
        </span>
      </section>
    </div>`
  }

  /** 남은 점수를 벌레 수로 읽는다. 맨 앞 벌레만 깎인 체력을 보인다. */
  private bugState() {
    const st = this.run.stage
    const hp = floorDef(this.run.floor).hp
    const left = Math.max(0, st.plan.target - st.scored)
    const count = Math.ceil(left / hp)
    const frontHp = count > 0 ? left - (count - 1) * hp : 0
    return { hp, left, count, frontHp }
  }

  private visualFor(id: string): CharacterVisualDef {
    return CHARACTER_VISUALS[id as CharacterVisualDef['id']] ?? CHARACTER_VISUALS.moth
  }

  private foeHtml(id: string, boss: boolean): string {
    const v = this.visualFor(id)
    return `<div class="actor foe${boss ? ' boss' : ''}" data-species="${id}" data-character="${v.id}">
      <div class="nameplate glass">
        <div class="row"><span class="nm"></span><span class="hpn"></span></div>
        <div class="hp-row"><div class="hpbar foe"><div class="fill"></div></div></div>
      </div>
      <div class="shadow"></div>
      <div class="model-shell" data-model-status="${v.model3d ? 'preparing-3d' : 'fallback-2d'}">
        <img class="battle-sprite" src="${v.portrait2d}" alt="">
      </div>
    </div>`
  }

  private acquireFoe(id: string, boss: boolean): HTMLElement {
    const pool = this.foePool.get(id)
    const pooled = pool?.pop()
    const el = pooled ?? (() => {
      const tpl = document.createElement('template')
      tpl.innerHTML = this.foeHtml(id, boss).trim()
      return tpl.content.firstElementChild as HTMLElement
    })()
    el.getAnimations().forEach((a) => a.cancel())
    el.classList.remove('dying', 'fast', 'hit', 'lunge')
    el.dataset.serial = String(++this.foeSerial)
    mountCharacterModel(el, this.visualFor(id))
    return el
  }

  private releaseFoe(el: HTMLElement) {
    el.getAnimations().forEach((a) => a.cancel())
    el.classList.remove('dying', 'fast', 'hit', 'lunge')
    delete el.dataset.rank
    suspendCharacterModel(el)
    el.remove()
    const id = el.dataset.species ?? 'moth'
    const pool = this.foePool.get(id) ?? []
    pool.push(el)
    this.foePool.set(id, pool)
  }

  /** 레일 앞 세 마리를 남은 벌레 수에 맞춘다. 새로 드러난 벌레는 뒷자리에서 걸어 들어온다. */
  private syncFoes(entering = false) {
    const host = this.scene?.querySelector<HTMLElement>('#actors')
    if (!host) return
    const sp = speciesFor(this.run.floor)
    const { hp, count, frontHp } = this.bugState()
    const isBoss = !!sp.boss
    const visible = isBoss ? (count > 0 ? 1 : 0) : Math.min(MAX_VISIBLE_FOES, count)
    const stage = currentFieldStage()
    const live = [...host.querySelectorAll<HTMLElement>('.actor.foe:not(.dying)')]
    while (live.length > visible) this.releaseFoe(live.pop()!)
    while (live.length < visible) {
      const rank = live.length
      const id = isBoss ? sp.boss! : sp.ids[(this.foeSerial + rank) % sp.ids.length]
      const el = this.acquireFoe(id, isBoss)
      if (isBoss) {
        // 보스는 원래 보스전처럼 무대 정중앙, 길 안쪽에 선다.
        el.style.right = 'auto'
        el.style.left = '50%'
        el.style.translate = 'calc(-50% + var(--boss-stage-offset-x, 0px)) 0'
        el.style.bottom = '24px'
      } else {
        el.style.left = 'auto'
        el.style.right = `${stage.railRight - (entering ? rank + 3 : MAX_VISIBLE_FOES) * stage.railGap}px`
      }
      el.style.opacity = entering ? '0' : '1'
      host.append(el)
      void el.offsetWidth
      playCharacterAnimation(el, 'walk')
      const walker = el
      this.later(entering ? 2100 : 520, () => { if (walker.isConnected && !walker.classList.contains('dying')) playCharacterAnimation(walker, 'idle') })
      live.push(el)
    }
    live.forEach((el, rank) => {
      if (!isBoss) {
        el.style.right = `${stage.railRight - rank * stage.railGap}px`
        el.style.bottom = `${stage.bottom}px`
        el.style.translate = 'none'
      }
      el.style.zIndex = String(40 - rank)
      el.style.opacity = '1'
      el.dataset.rank = String(rank)
      el.classList.toggle('front', rank === 0)
      el.classList.toggle('target', rank === 0)
      el.querySelector<HTMLElement>('.nm')!.textContent = this.visualFor(el.dataset.species ?? '').name
      const cur = rank === 0 ? frontHp : hp
      el.querySelector<HTMLElement>('.hpn')!.textContent = `${fmt(cur)}/${fmt(hp)}`
      el.querySelector<HTMLElement>('.hpbar .fill')!.style.width = `${Math.max(0, Math.min(100, (cur / hp) * 100))}%`
    })
    let badge = host.querySelector<HTMLElement>('.enemy-overflow-count')
    const waiting = isBoss ? 0 : count - visible
    if (waiting > 0) {
      if (!badge) {
        host.insertAdjacentHTML('beforeend', `<div class="enemy-overflow-count" role="status"><svg viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="24" cy="26" rx="10" ry="14" fill="currentColor" fill-opacity=".16"/><path d="M19 14c0-5 10-5 10 0M14 21 8 17M34 21l6-4M14 29l-7 2M34 29l7 2M17 37l-5 5M31 37l5 5M24 16v24"/></svg><b></b><span></span></div>`)
        badge = host.querySelector<HTMLElement>('.enemy-overflow-count')!
      }
      badge.querySelector('b')!.textContent = `× ${fmt(waiting)}`
      badge.querySelector('span')!.textContent = t('enemiesLeft', { n: fmt(count) })
    } else badge?.remove()
  }

  private paintBattle() {
    const scene = this.scene
    if (!scene) return
    const run = this.run
    const st = run.stage
    const ctx = st.ctx
    // 좌상단: 돈 · 눈물 · 하트와 감정 스탯
    scene.querySelector('#sr-money')!.innerHTML = `<span class="inspiration-mark" aria-hidden="true">●</span>
      <span class="inspiration-wallet-copy"><small>${t('money')}</small><b>${run.money}</b></span>`
    scene.querySelector('#sr-tears')!.innerHTML = `<span class="clear-reward-mark" aria-hidden="true">◆</span>
      <span class="clear-reward-copy"><small>${t('tears')}</small><b>${fmt2(ctx.tears)}</b></span>`
    const stat = (glyph: string, label: string, value: string) =>
      `<div class="hud-stat" role="img" tabindex="0" aria-label="${esc(`${label} ${value}`)}" data-tooltip="${esc(`${label} ${value}`)}"><span class="si">${icon(glyph)}</span><b>${value}</b></div>`
    scene.querySelector('#stats')!.innerHTML = `${heartsHtml(run.pieces, run.maxPieces)}${run.guard ? `<span class="sr-guard">◈${run.guard}</span>` : ''}
      ${stat('sword', statName('anger'), fmt2(run.stats.anger))}
      ${stat('shield', statName('sorrow'), fmt2(run.stats.sorrow))}
      ${stat('cross', statName('joy'), fmt2(run.stats.joy))}
      ${stat('clover', statName('pleasure'), fmt2(run.stats.pleasure))}`
    this.paintRelicStrip()
    this.paintGoal()
    this.paintChances()
    this.paintSteps()
    this.paintChain()
    this.showCurrentSlot()
  }

  private paintRelicStrip() {
    const strip = this.scene?.querySelector<HTMLElement>('#relic-strip')
    if (!strip) return
    const relics = this.run.relics
    strip.hidden = !relics.length
    strip.innerHTML = relics.length ? `<div class="relic-strip-head"><span>${t('relics')}</span><b>${relics.length}/${this.run.relicSlots}</b></div>
      <div class="relic-icons">${relics.map((id) => {
        const art = ALL_ITEMS[RELIC_ITEM_ART[id] ?? '']?.art
        const tip = `${contentName('relic', id)}\n${relicRule(id)}`
        return `<span class="relic-icon sr-relic-icon k-${relicDef(id).kind}" role="img" tabindex="0" aria-label="${esc(tip)}" data-tooltip="${esc(tip)}">${art ? itemArt(art) : `<b class="sr-relic-glyph">${esc(contentName('relic', id).slice(0, 2))}</b>`}</span>`
      }).join('')}</div>` : ''
  }

  /** 목표 점수판 — 원래 보스 체력 HUD 모양이다. 점수가 오를수록 남은 벌레(체력)가 깎인다. */
  private paintGoal() {
    const host = this.scene?.querySelector<HTMLElement>('#sr-goal')
    if (!host) return
    const st = this.run.stage
    const plan = st.plan
    const left = Math.max(0, plan.target - st.scored)
    const sp = speciesFor(this.run.floor)
    const title = sp.boss ? this.visualFor(sp.boss).name : t('target')
    const chips = [
      `<span class="sr-rule-chip form" data-tooltip="${esc(formRule(plan.formId))}" tabindex="0"><b>${esc(contentName('form', plan.formId))}</b>${ruleChipsHtml(formRule(plan.formId))}</span>`,
      ...plan.weatherIds.map((id) => `<span class="sr-rule-chip w-${weatherDef(id).kind}" data-tooltip="${esc(weatherRule(id))}" tabindex="0"><b>${esc(contentName('weather', id))}</b>${ruleChipsHtml(weatherRule(id))}</span>`),
      ...(st.ctx.weakness ? [`<span class="sr-rule-chip w-bonus"><b>${t('weakness', { name: t(`emotion_${st.ctx.weakness}`) })}</b></span>`] : []),
    ].join('')
    host.innerHTML = `
      <div class="boss-health-heading">
        <span class="boss-health-kicker"><span class="boss-health-mark">${sp.boss ? 'BOSS' : esc(t('score'))}</span></span>
        <span class="boss-health-title"><b class="nm">${esc(title)}</b><em class="boss-health-stage">${t('floor', { n: this.run.floor })}</em></span>
        <span class="hpn"><b>${fmt(st.scored)}</b> / ${fmt(plan.target)}</span>
      </div>
      <div class="hp-row"><div class="hpbar foe"><div class="fill" style="width:${Math.max(0, Math.min(100, (left / plan.target) * 100))}%"></div></div></div>
      <div class="boss-badge-row sr-rule-row">${chips}</div>`
  }

  /** 잉크 미터 자리에 「남은 기회」를 같은 병 그림으로 그린다(SCORE_REDESIGN §1). */
  private paintChances() {
    const meter = this.scene?.querySelector<HTMLElement>('#ink-meter')
    if (!meter) return
    const ctx = this.run.stage.ctx
    const total = ctx.chancesTotal
    const left = Math.max(0, ctx.chancesLeft)
    const pick = this.currentPick()
    const preview = pick && left > 0 ? Math.min(left, pickCost(pick)) : 0
    const vials = Array.from({ length: total }, (_, i) => {
      const cls = i < left - preview ? 'is-free-filled' : i < left ? 'is-preview-spend' : 'is-free-spent'
      return `<span class="ink-meter-vial ${cls}"><img src="${INK_UI.bottle}" alt=""></span>`
    }).join('')
    const over = ctx.chancesLeft <= 0
    meter.style.setProperty('--ink-fill', `${(left / Math.max(10, total)) * 100}%`)
    meter.classList.toggle('is-empty', left <= 0)
    meter.classList.toggle('is-low', left === 1)
    meter.classList.toggle('is-overdrawn', over)
    meter.setAttribute('aria-label', over ? t('overtime') : t('chances', { n: left, total }))
    meter.dataset.tooltip = over ? t('overtime') : t('chances', { n: left, total })
    meter.dataset.tipPlace = 'above'
    meter.innerHTML = `<span class="ink-meter-vials" aria-hidden="true">${vials}</span>
      <span class="ink-meter-copy"><small>${t('chanceLabel')}</small><b><span>${left}</span><i>/</i><span>${total}</span></b></span>
      ${over ? `<em class="ink-meter-overdraw">${t('overtime')}</em>` : ''}`
  }

  // ── 문장 조립: 기존 손패(CardHand)를 칸 순서대로 연다 ──

  private slotOrder(): SelKey[] {
    const ctx = this.run.stage.ctx
    const relics = this.run.relics
    const drowsy = ctx.weatherIds.includes('drowsy')
    return [
      'subj', ...(relics.includes('twinSubj') ? ['subj2' as const] : []),
      ...(drowsy ? [] : ['adv' as const]),
      'verb', ...(relics.includes('twinVerb') ? ['verb2' as const] : []),
    ]
  }

  /** 겹주어·겹동사의 둘째 칸은 비워 둬도 문장이 된다. */
  private requiredKeys(): SelKey[] {
    return this.slotOrder().filter((k) => k !== 'subj2' && k !== 'verb2')
  }

  private currentPick(): SentencePick | undefined {
    const s = this.sel
    if (this.requiredKeys().some((k) => !s[k])) return undefined
    return { subj: s.subj!, adv: s.adv, verb: s.verb!, subj2: s.subj2, verb2: s.verb2 }
  }

  /** 지금 고른 칸들과 함께 놓을 수 있는 문장들. */
  private compatiblePicks(sel = this.sel): SentencePick[] {
    const keys = Object.keys(sel) as SelKey[]
    return this.run.handPicks().filter((p) => keys.every((k) => !sel[k] || (p[k]?.uid ?? -1) === sel[k]!.uid))
  }

  private toWord(c: DeckCard, key: SelKey): Word {
    const d = cardDef(c.cardId)
    const name = contentName('card', c.cardId)
    const sticker = c.sticker ? ` ${contentName('sticker', c.sticker)}` : ''
    const rule = cardRule(c) + (c.sticker ? ` · ${stickerRule(c.sticker)}` : '')
    const id = `sc-${c.uid}-${key}`
    this.wordCards.set(id, c)
    return {
      id,
      text: `${name}${sticker}`,
      slot: baseSlot(key),
      tags: [],
      emotion: coreEmotion(d.emotion),
      // 카드 왼쪽 위 잉크 배지 자리는 동사의 기회 비용을 보인다. 주어·수식어는 0.
      inkCost: d.slot === 'verb' ? d.cost : 0,
      note: rule,
      level: c.level + 1,
      rarity: c.level >= 2 ? 'epic' : c.level === 1 ? 'rare' : 'common',
      art: ART_BY_NAME.get(d.name),
    }
  }

  private unavailableReason(c: DeckCard, key: SelKey): string | null {
    if (this.compatiblePicks({ ...this.sel, [key]: c }).length) return null
    const hand = this.run.stage.hand
    const drowsy = this.run.stage.ctx.weatherIds.includes('drowsy')
    const slot = baseSlot(key)
    const probe: SentencePick = {
      subj: slot === 'subj' ? c : this.sel.subj ?? hand.subj.hand[0],
      adv: drowsy ? undefined : slot === 'adv' ? c : this.sel.adv ?? hand.adv.hand[0],
      verb: slot === 'verb' ? c : this.sel.verb ?? hand.verb.hand[0],
    }
    return this.run.validate(probe).reason || t('reason_noFit')
  }

  private showCurrentSlot() {
    const hand = this.cardHand
    if (!hand || this.run.phase !== 'battle') return
    const order = this.slotOrder()
    const key = order[Math.min(this.slotIndex, order.length - 1)]
    const slot = baseSlot(key)
    const other = key === 'subj2' ? this.sel.subj : key === 'verb2' ? this.sel.verb : key === 'subj' ? this.sel.subj2 : key === 'verb' ? this.sel.verb2 : undefined
    const cards = this.run.stage.hand[slot].hand.filter((c) => c !== other)
    const words = cards.map((c) => this.toWord(c, key))
    const chosen = this.sel[key] ? words[cards.indexOf(this.sel[key]!)] : undefined
    hand.showSlot(key, words, chosen, (word) => {
      if (this.swapMode) return null
      const c = this.wordCards.get(word.id)
      return c ? this.unavailableReason(c, key) : null
    })
    hand.setInputEnabled(!this.busy)
  }

  private decorateHand() {
    this.scene?.querySelectorAll<HTMLElement>('#card-hand .word-card').forEach((btn) => {
      const note = btn.querySelector<HTMLElement>('.card-note-text')
      const uid = Number(btn.dataset.instanceId?.match(/sc-(\d+)-/)?.[1])
      const c = this.run.deck.find((x) => x.uid === uid)
      if (!note || !c || btn.classList.contains('blocked')) return
      note.innerHTML = ruleChipsHtml(cardRule(c)) + (c.sticker ? ruleChipsHtml(stickerRule(c.sticker)) : '')
    })
  }

  private onCardConfirm(word: Word) {
    if (this.busy || this.run.phase !== 'battle') return
    const c = this.wordCards.get(word.id)
    if (!c) return
    const order = this.slotOrder()
    const key = order[this.slotIndex]
    if (this.swapMode) {
      this.run.swap(baseSlot(key), c)
      this.swapMode = false
      this.cardHand?.resetTurn()
      this.paintBattle()
      return
    }
    this.sel[key] = c
    this.slotIndex = Math.min(order.length, this.slotIndex + 1)
    this.renderDetail(null)
    this.paintChain()
    this.paintChances()
    this.paintSteps()
    if (this.currentPick() && this.slotIndex >= order.length) {
      clearTimeout(this.autoWriteTimer)
      this.autoWriteTimer = window.setTimeout(() => void this.write(), AUTO_WRITE_MS)
      return
    }
    this.showCurrentSlot()
  }

  /** 단계 칩: 끝낸 칸을 누르면 그 칸부터 다시 고르고, 비워 둬도 되는 둘째 칸은 건너뛴다. */
  private jumpToSlot(index: number) {
    if (this.busy) return
    clearTimeout(this.autoWriteTimer)
    const order = this.slotOrder()
    if (index <= this.slotIndex) {
      order.slice(index).forEach((k) => { delete this.sel[k] })
      this.slotIndex = index
    } else {
      const skipped = order.slice(this.slotIndex, index)
      if (skipped.some((k) => k !== 'subj2' && k !== 'verb2' && !this.sel[k])) return
      this.slotIndex = index
      if (index >= order.length && this.currentPick()) {
        this.paintBattle()
        this.autoWriteTimer = window.setTimeout(() => void this.write(), AUTO_WRITE_MS)
        return
      }
    }
    this.paintBattle()
  }

  private paintSteps() {
    const host = this.scene?.querySelector<HTMLElement>('#steps')
    if (!host) return
    const order = this.slotOrder()
    const steps = order.map((k, i) => {
      const active = i === this.slotIndex
      const done = !!this.sel[k]
      const optional = k === 'subj2' || k === 'verb2'
      const canJump = !this.busy && (done || (optional && active))
      const target = done ? i : i + 1
      return `<button type="button" class="step ${active ? 'active' : done ? 'done' : ''}${canJump ? ' rewindable' : ''}" data-act="step" data-i="${target}" ${canJump ? '' : 'disabled'}><b>${i + 1}</b> ${t(`slot_${k}`).replace(/\s*\(.*\)$/, '')}</button>`
    }).join('<span class="sep">·</span>')
    const swap = this.run.stage.swapsLeft > 0 && !this.busy
      ? `<span class="sep">·</span><button type="button" class="step sr-swap${this.swapMode ? ' active' : ''}" data-act="swapMode">${this.swapMode ? t('swapHint') : t('swap', { n: this.run.stage.swapsLeft })}</button>` : ''
    host.innerHTML = steps + swap
  }

  /** 상단 발광 체인과 그 아래 「지금 배율」 — 원래 전투의 두 겹을 그대로 쓴다. */
  private paintChain() {
    const scene = this.scene
    if (!scene) return
    const chain = scene.querySelector<HTMLElement>('#chain')!
    const order = this.slotOrder()
    const picked = order.filter((k) => this.sel[k])
    chain.innerHTML = picked.map((k) => {
      const c = this.sel[k]!
      const d = cardDef(c.cardId)
      return `<span class="chain-word emotion-${coreEmotion(d.emotion)}">
        <b class="cw-text">${esc(contentName('card', c.cardId))}${c.sticker ? esc(contentName('sticker', c.sticker)) : ''}</b>
        ${d.slot === 'verb' ? `<span class="cw-cost" style="--ink-cost-badge-image:url('${INK_UI.costBadge}')">${d.cost}</span>` : ''}
        <em class="cw-note buff">${esc(t(`emotion_${d.emotion}`))}</em>
      </span>`
    }).join('')
    chain.classList.toggle('has-sentence', picked.length > 0)
    chain.classList.toggle('sentence-ready', !!this.currentPick())
    const host = scene.querySelector<HTMLElement>('#mult-now')!
    if (!picked.length) {
      host.innerHTML = ''
      host.className = 'mult-now'
      return
    }
    const ctx = this.run.stage.ctx
    const pick = this.currentPick()
    let chips = 0
    let mult = 1
    let label = t('preview')
    let total = 0
    if (pick && this.run.validate(pick).ok) {
      const res = scoreSentence(pick, ctx, this.run.loadout, expectedRoller, 1)
      chips = res.chips
      mult = res.mult * res.amp
      total = this.run.preview(pick)
    } else {
      // 아직 칸이 남았으면 지금 고른 단어로 닿을 수 있는 가장 센 문장을 보인다.
      let best = -1
      for (const p of this.compatiblePicks()) {
        const v = this.run.preview(p)
        if (v <= best) continue
        best = v
        const res = scoreSentence(p, ctx, this.run.loadout, expectedRoller, 1)
        chips = res.chips
        mult = res.mult * res.amp
      }
      label = t('bestPreview')
      total = Math.max(0, best)
    }
    // 칩 × 배율 = 예상 점수. 세 덩어리를 칩으로 갈라 숫자끼리 붙어 읽히지 않게 한다.
    host.className = `mult-now landed sr-mult-now${mult >= 2 ? ' hot' : ''}`
    host.innerHTML = `<span class="sr-mn-part chips"><small>${t('chips')}</small><b>${fmt2(chips)}</b></span>
      <span class="sr-mn-op">×</span>
      <span class="sr-mn-part mult"><small>${t('mult')}</small><b>${fmt2(mult)}</b></span>
      <span class="sr-mn-op">=</span>
      <span class="sr-mn-part total"><small>${esc(label)}</small><b>${fmt(total)}</b></span>`
  }

  /** 오른쪽 상세 패널 — 원래 단어 상세와 같은 자리·같은 껍데기. */
  private renderDetail(word: Word | null) {
    const host = this.scene?.querySelector<HTMLElement>('#detail')
    if (!host) return
    const c = word ? this.wordCards.get(word.id) : undefined
    if (!word || !c) {
      host.className = 'info-dock detail-idle'
      host.innerHTML = ''
      return
    }
    const d = cardDef(c.cardId)
    const emotion = coreEmotion(d.emotion)
    const art = word.art ? SKILL_ART[word.art] : undefined
    host.className = `info-dock glass word-detail mood-attack emotion-${emotion}`
    host.innerHTML = `
      ${art ? `<div class="wd-art"><img src="${art}" alt="" /><span class="wd-art-tint" aria-hidden="true"></span></div>` : ''}
      <div class="wd-scrim" aria-hidden="true"></div>
      <div class="wd-body">
        <div class="wd-title-row">${emotionIconBadge(emotion, 'wd-emotion')}<div class="wd-name">${esc(contentName('card', c.cardId))}</div></div>
        <div class="wd-grade">✦ ${t(`slot_${d.slot}`)} · ${t(`emotion_${d.emotion}`)}${c.level ? ` · ${'★'.repeat(c.level)}` : ''}</div>
        <div class="wd-values">${d.slot === 'verb' ? `<div class="v flat">${t('cost', { n: d.cost })}</div>` : ''}<div class="v sr-rule-v">${ruleChipsHtml(cardRule(c))}</div>
          ${c.sticker ? `<div class="v sr-rule-v"><b class="rc rc-sticker">${esc(contentName('sticker', c.sticker))}</b> ${ruleChipsHtml(stickerRule(c.sticker))}</div>` : ''}</div>
      </div>`
  }

  private sayOnce(key: string, text: string, tone: TokenLine['tone'] = 'calm') {
    if (this.said.has(key)) return
    this.said.add(key)
    this.token?.say({ text, tone })
  }

  private async write() {
    const pick = this.currentPick()
    const run = this.run
    if (!pick || this.busy || !run.validate(pick).ok) return
    this.busy = true
    this.cardHand?.setInputEnabled(false)
    this.paintSteps()
    const before = this.bugState()
    const piecesBefore = run.pieces + run.guard
    const moneyBefore = run.money
    const emotions = [pick.subj, pick.adv, pick.verb].filter((c): c is DeckCard => !!c).map((c) => coreEmotion(cardDef(c.cardId).emotion))
    const res = run.play(pick)
    const cleared = run.phase === 'shop' || run.phase === 'won'
    const hurt = piecesBefore - (run.pieces + run.guard)
    GameAudio.playSentenceComplete(emotions)
    if (hurt > 0) this.playerHurt(hurt)
    this.scene?.classList.add('sr-tallying')
    const tally = await this.playTally(res)
    await this.playAttack(before, res)
    tally?.classList.remove('parked')
    tally?.classList.add('out')
    this.scene?.classList.remove('sr-tallying')
    this.later(340, () => tally?.remove())
    if (this.destroyed) return
    this.sel = {}
    this.slotIndex = 0
    this.cardHand?.resetTurn()
    this.syncFoes()
    if (res.score >= Math.max(30, run.stage.plan.target * 0.6)) this.sayOnce('big', t('tokenBigHit'), 'relief')
    if (cleared) {
      this.paintGoal()
      this.token?.feel(run.stage.plan.boss ? 'bossDown' : 'enemyKilled')
      await this.showClear(run.money - moneyBefore)
      this.busy = false
      return
    }
    if (run.phase === 'lost') {
      this.token?.feel('runLost')
      GameAudio.playDefeatBgm()
      const you = this.scene?.querySelector<HTMLElement>('.actor.you')
      if (you) playCharacterAnimation(you, 'defeat')
      this.opts.onFinished?.('lost', run.floor)
      this.later(1400, () => this.render())
      return
    }
    run.rescueHand()
    this.busy = false
    const ctx = run.stage.ctx
    if (ctx.chancesLeft <= 0) this.sayOnce('overtime', t('tokenOvertime'), 'warn')
    else if (ctx.chancesLeft === 1) this.sayOnce('last', t('tokenLast'))
    this.paintBattle()
  }

  private playerHurt(pieces: number) {
    const you = this.scene?.querySelector<HTMLElement>('.actor.you')
    if (!you) return
    this.token?.feel('playerHurt')
    you.classList.remove('hit')
    void you.offsetWidth
    you.classList.add('hit')
    this.pop(you, `♥ -${pieces}`, 'hurt')
    GameAudio.playEnemyAttack(1)
  }

  /**
   * 원래 전투의 집계판(칩 × 배율 → 총합 롤업)을 그대로 띄운다. 엔진의 롤업 단계(§0 폭발)를
   * 칩이 오른 단계와 배율이 오른 단계로 나눠 차례로 꽂는다. 화면 아무 곳이나 누르면 빨리 넘긴다.
   */
  private async playTally(res: SentenceResult): Promise<HTMLElement | null> {
    const pbox = this.scene?.querySelector<HTMLElement>('#pbox')
    if (!pbox) return null
    const el = document.createElement('div')
    el.className = 'tally dmg'
    el.innerHTML = `
      <div class="tally-slots">
        <div class="tally-cell"><div class="tally-box base"><span class="tl">${t('chips')}</span><b>0</b></div></div>
        <div class="tally-x">×</div>
        <div class="tally-cell"><div class="tally-box mult"><span class="tl">${t('mult')}</span><b>1.00</b></div></div>
      </div>
      <div class="tally-feed tally-flat-feed"></div>
      <div class="tally-phase" aria-hidden="true"><i></i><span>${t('mult')}</span><i></i></div>
      <div class="tally-feed tally-mult-feed"></div>
      <div class="tally-total"></div>`
    pbox.appendChild(el)
    requestAnimationFrame(() => el.classList.add('in'))
    let fast = matchMedia('(prefers-reduced-motion: reduce)').matches
    const skip = () => { fast = true }
    this.root.addEventListener('pointerdown', skip, true)
    const baseBox = el.querySelector<HTMLElement>('.tally-box.base')!
    const multBox = el.querySelector<HTMLElement>('.tally-box.mult')!
    const flatFeed = el.querySelector<HTMLElement>('.tally-flat-feed')!
    const multFeed = el.querySelector<HTMLElement>('.tally-mult-feed')!
    const chip = (feed: HTMLElement, text: string, cls: string) => {
      const s = document.createElement('span')
      s.className = `tally-chip ${cls}`
      s.textContent = text
      feed.appendChild(s)
      while (feed.children.length > 6) feed.removeChild(feed.firstChild!)
    }
    const bump = (box: HTMLElement) => { box.classList.remove('bump'); void box.offsetWidth; box.classList.add('bump') }
    await sleep(120)
    let chips = 0
    let mult = 1
    let rising = false
    for (const s of res.steps) {
      const label = stepLabel(s)
      if (Math.abs(s.chips - chips) > 0.001) {
        chip(flatFeed, `${label} ${s.chips > chips ? '+' : ''}${fmt2(s.chips - chips)}`, 'dmg')
        chips = s.chips
        baseBox.querySelector('b')!.textContent = fmt2(chips)
        bump(baseBox)
      }
      if (Math.abs(s.mult - mult) > 0.001) {
        if (!rising) { rising = true; el.classList.add('mult-rising'); GameAudio.playMultiplierRise() }
        const ratio = mult > 0 ? s.mult / mult : s.mult
        chip(multFeed, `${label} ×${fmt2(ratio)}`, s.source === 'resonance' || s.source === 'paint' ? 'combo' : 'buff')
        mult = s.mult
        multBox.querySelector('b')!.textContent = fmt2(mult)
        bump(multBox)
      }
      if (!fast) await sleep(TALLY_STEP_MS)
      if (this.destroyed) return null
    }
    if (res.amp !== 1) {
      chip(multFeed, `${t('step_amp')} ×${fmt2(res.amp)}`, 'buff')
      mult *= res.amp
      multBox.querySelector('b')!.textContent = fmt2(mult)
    }
    if (res.crit) {
      chip(multFeed, `${t('crit')}! ×${fmt2(res.critMult)}`, 'combo')
      mult *= res.critMult
      multBox.querySelector('b')!.textContent = fmt2(mult)
      bump(multBox)
    }
    el.classList.remove('mult-rising')
    if (!fast) await sleep(260)
    const total = el.querySelector<HTMLElement>('.tally-total')!
    const steps = fast ? 1 : 5
    for (let i = 1; i <= steps; i++) {
      total.textContent = fmt(res.score * (1 - Math.pow(1 - i / steps, 2)))
      total.classList.remove('tick')
      void total.offsetWidth
      total.classList.add('tick')
      el.classList.toggle('hot1', res.score >= this.run.stage.plan.target * 0.25)
      el.classList.toggle('hot2', res.score >= this.run.stage.plan.target * 0.5)
      el.classList.toggle('hot3', res.score >= this.run.stage.plan.target)
      if (!fast) await sleep(60)
    }
    total.textContent = fmt(res.score)
    total.classList.add('slam')
    await sleep(fast ? 120 : 320)
    this.root.removeEventListener('pointerdown', skip, true)
    el.classList.add('parked')
    return el
  }

  private async playAttack(before: ReturnType<ScoreRunView['bugState']>, res: SentenceResult) {
    const scene = this.scene
    if (!scene) return
    const you = scene.querySelector<HTMLElement>('.actor.you')
    const after = this.bugState()
    const killed = Math.max(0, before.count - after.count)
    const foes = [...scene.querySelectorAll<HTMLElement>('#actors .actor.foe:not(.dying)')]
    if (you) {
      playCharacterAnimation(you, 'attack')
      you.classList.remove('lunge')
      void you.offsetWidth
      you.classList.add('lunge')
      this.later(460, () => { you.classList.remove('lunge'); playCharacterAnimation(you, 'idle') })
    }
    await sleep(190)
    const front = foes[0]
    if (front) this.pop(front, `-${fmt(res.score)}`, res.crit ? 'crit' : 'dmg')
    const isBoss = !!speciesFor(this.run.floor).boss
    const deaths = isBoss ? (after.count === 0 ? foes.slice(0, 1) : []) : foes.slice(0, Math.min(killed, foes.length))
    deaths.forEach((el, i) => {
      GameAudio.playSwordHit(i)
      playCharacterAnimation(el, 'defeat')
      el.classList.add('dying')
      if (killed > 3) el.classList.add('fast')
    })
    if (!deaths.length && front) {
      GameAudio.playSwordHit(0)
      front.classList.remove('hit')
      void front.offsetWidth
      front.classList.add('hit')
    }
    if (killed > 0) this.token?.feel('enemyKilled')
    this.paintGoal()
    await sleep(deaths.length ? 620 : 360)
    deaths.forEach((el) => { if (el.isConnected) this.releaseFoe(el) })
  }

  private pop(target: HTMLElement, text: string, cls: string) {
    const scene = this.scene
    if (!scene) return
    const host = scene.getBoundingClientRect()
    const r = target.getBoundingClientRect()
    const scale = host.width / Math.max(1, scene.offsetWidth) || 1
    const el = document.createElement('div')
    el.className = `sr-pop ${cls}`
    el.textContent = text
    el.style.left = `${(r.left + r.width / 2 - host.left) / scale}px`
    el.style.top = `${(r.top + r.height * 0.25 - host.top) / scale}px`
    scene.append(el)
    this.later(1300, () => el.remove())
  }

  private async showClear(earned: number) {
    const banner = this.scene?.querySelector<HTMLElement>('.sr-banner')
    if (!banner) return
    const won = this.run.phase === 'won'
    this.scene?.classList.add('sr-cleared')
    banner.hidden = false
    banner.innerHTML = `<div class="sr-banner-box">
      <h2>${t('stageClear')}</h2>
      <p>${t('earned', { n: earned })}</p>
      <button type="button" class="sr-write" data-act="${won ? 'toEnd' : 'toShop'}">${won ? t('won') : t('goShop')}</button>
    </div>`
    this.sayOnce('clear', t('tokenClear'), 'relief')
    const you = this.scene?.querySelector<HTMLElement>('.actor.you')
    if (you) playCharacterAnimation(you, 'victory1')
    if (won) this.opts.onFinished?.('won', this.run.floor)
  }

  // ── 상점 — 원래 보스 영감 상점(RewardView 상점 모드)의 마크업과 CSS를 그대로 쓴다 ──

  private dockMode: 'detail' | 'bag' | 'relics' = 'bag'

  private relicArtHtml(id: string): string {
    const art = ALL_ITEMS[RELIC_ITEM_ART[id] ?? '']?.art
    return art ? itemArt(art) : `<b class="sr-relic-glyph">${esc(contentName('relic', id).slice(0, 2))}</b>`
  }

  private offerRarity(o: ShopOffer): string {
    if (o.kind === 'item') return o.rarity
    if (o.kind === 'relic') return ['rare', 'epic', 'legendary'][Math.max(0, Math.min(2, relicDef(o.id).tier - 1))]
    if (o.kind === 'sticker') return 'rare'
    return o.upgradeUid != null ? 'rare' : 'common'
  }

  private offerInfo(o: ShopOffer): { name: string; rule: string; kind: string; type: string; emotion?: Emotion; bg: string; tryout?: OfferTryout } {
    const run = this.run
    const base = tryoutBaseline(run.deck, run.loadout)
    if (o.kind === 'word') {
      const d = cardDef(o.id)
      const owned = o.upgradeUid != null ? run.deck.find((c) => c.uid === o.upgradeUid) : undefined
      const probe: DeckCard = owned ? { ...owned, level: Math.min(MAX_LEVEL, owned.level + 1) } : { uid: -1, cardId: o.id, level: 0 }
      const art = ART_BY_NAME.get(d.name)
      return {
        name: contentName('card', o.id), rule: cardRule(probe), kind: owned ? `${t('upgrade')} ${'★'.repeat(probe.level)}` : t('kind_word'),
        type: `${t(`slot_${d.slot}`).replace(/\s*\(.*\)$/, '')} · ${t(`emotion_${d.emotion}`)}${d.cost > 1 ? ` · ${t('cost', { n: d.cost })}` : ''}`,
        emotion: coreEmotion(d.emotion),
        bg: art ? `<div class="rp-bg"><img src="${SKILL_ART[art]}" alt="" /></div>` : `<div class="rp-bg noart word-noart" aria-hidden="true"><span class="rp-word-mark">${esc(contentName('card', o.id))}</span></div>`,
        tryout: tryoutWord(base, run.deck, run.loadout, o.id, o.upgradeUid),
      }
    }
    if (o.kind === 'sticker') {
      const d = stickerDef(o.id)
      return {
        name: contentName('sticker', o.id), rule: stickerRule(o.id), kind: t('kind_sticker'), type: t(`slot_${d.slot}`).replace(/\s*\(.*\)$/, ''),
        bg: `<div class="rp-bg noart word-noart" aria-hidden="true"><span class="rp-word-mark">${esc(contentName('sticker', o.id))}</span></div>`,
        tryout: tryoutSticker(base, run.deck, run.loadout, o.id, d.slot),
      }
    }
    if (o.kind === 'relic') {
      return {
        name: contentName('relic', o.id), rule: relicRule(o.id), kind: t('kind_relic'), type: t('relics'),
        bg: `<div class="rp-bg noart"><span class="rp-icon">${this.relicArtHtml(o.id)}</span></div>`,
        tryout: run.relics.length < run.relicSlots ? tryoutRelic(base, run.loadout, o.id) : undefined,
      }
    }
    const item = Object.values(ALL_ITEMS).find((it) => it.rarity === o.rarity && ITEM_ART[it.art])
    return {
      name: `${t('item')} · ${t(`rarity_${o.rarity}`)}`,
      rule: t('itemRule', { n: 3 + RARITY_BONUS[o.rarity] + RARITY_BASE_POINTS[o.rarity] + run.pledge }),
      kind: t('item'), type: t('forge'),
      bg: item ? `<div class="rp-bg"><img src="${ITEM_ART[item.art]}" alt="" /></div>` : `<div class="rp-bg noart"><span class="rp-icon">${itemArt('gift')}</span></div>`,
    }
  }

  private tryoutLine(tr: OfferTryout | undefined): string {
    if (!tr) return ''
    return Math.round(tr.to) > Math.round(tr.from)
      ? `<span class="sr-tryout up">${t('tryout', { from: fmt(tr.from), to: fmt(tr.to) })}</span>`
      : `<span class="sr-tryout">${t('tryoutNone')}</span>`
  }

  private offerHtml(o: ShopOffer, i: number): string {
    const run = this.run
    const info = this.offerInfo(o)
    const rarity = this.offerRarity(o)
    const can = o.kind === 'sticker' ? { ok: o.price <= run.money } : run.canBuy(o)
    const picking = this.shopMode?.kind === 'tradeSticker' && o.kind === 'sticker'
    const reason = can.ok ? '' : o.price > run.money ? t('reason_noMoney') : o.kind === 'relic' ? t('reason_relicFull') : ''
    const kindCls = o.kind === 'word' ? `is-word ${o.upgradeUid != null ? 'is-reinforce' : 'is-new'}` : 'is-item'
    const nameLen = [...info.name.replace(/\s/g, '')].length
    return `<div class="reward-choice">
      <div class="reward-pick ${o.kind === 'word' ? 'mood-attack' : 'buff'}${info.emotion ? ` emotion-${info.emotion}` : ''} rarity-${rarity} ${kindCls}${nameLen >= 8 ? ' has-long-name' : nameLen >= 6 ? ' has-medium-name' : ''}${can.ok || picking ? '' : ' is-unaffordable'}${picking ? ' detailing' : ''}"
        data-act="buy" data-i="${i}" role="button" tabindex="0" aria-label="${esc(`${info.name}, ${info.rule}, ${t('price', { n: o.price })}`)}">
        ${info.bg}
        <span class="rp-tint" aria-hidden="true"></span>
        <span class="rp-veil" aria-hidden="true"></span>
        <span class="rp-foil" aria-hidden="true"></span>
        <span class="reward-card-sticker ${o.kind === 'word' && o.upgradeUid != null ? 'is-reinforce' : 'is-new'}" aria-hidden="true">${esc(info.kind)}</span>
        <span class="rp-unavailable" aria-hidden="true"><b>${esc(reason || t('reason_noMoney'))}</b></span>
        <div class="rp-foot">
          <div class="rp-name">${esc(info.name)}</div>
          <div class="rp-effect"><span class="rp-effect-copy">${ruleChipsHtml(info.rule)}</span></div>
        </div>
      </div>
      <div class="reward-kindline rarity-${rarity}">
        <span class="reward-type-label">${esc(info.type)}</span>
        <span class="reward-kind-cost"><i aria-hidden="true">●</i>${t('price', { n: o.price })}</span>
      </div>
    </div>`
  }

  private offerDetailHtml(o: ShopOffer): string {
    const info = this.offerInfo(o)
    return `<div class="wd-title-row">${info.emotion ? emotionIconBadge(info.emotion, 'wd-emotion') : ''}<div class="wd-name">${esc(info.name)}</div></div>
      <div class="wd-grade">✦ ${esc(info.kind)} · ${esc(info.type)}</div>
      <div class="wd-values"><div class="v sr-rule-v">${ruleChipsHtml(info.rule)}</div><div class="v flat">${t('price', { n: o.price })}</div></div>
      ${info.tryout ? `<div class="wd-inf">${this.tryoutLine(info.tryout)}</div>` : ''}`
  }

  private bagHtml(): string {
    const run = this.run
    const mode = this.shopMode
    const targetMode = mode?.kind === 'stickerTarget' || mode?.kind === 'recall'
    const targetSlot = mode?.kind === 'stickerTarget' && mode.offer.kind === 'sticker' ? stickerDef(mode.offer.id).slot : undefined
    const groups = (['subj', 'adv', 'verb'] as ScoreSlot[]).map((slot) => {
      const rows = run.deck.filter((c) => cardDef(c.cardId).slot === slot).map((c) => {
        const d = cardDef(c.cardId)
        const isTarget = mode?.kind === 'stickerTarget' ? slot === targetSlot : mode?.kind === 'recall' ? c.level < MAX_LEVEL && !!d.grow : false
        const ops = targetMode ? '' : `<span class="sr-bag-ops">
          <button type="button" data-act="sellWord" data-uid="${c.uid}">${t('sell', { n: Math.floor(wordPrice(d.cost) / 2) })}</button>
          <button type="button" data-act="eraseWord" data-uid="${c.uid}">${t('erase', { n: priceWithReceipt(ERASER_PRICE, run.relics) })}</button></span>`
        return `<div class="sr-dock-card e-${d.emotion}${targetMode ? (isTarget ? ' is-target' : ' is-off') : ''}" ${isTarget ? `data-act="target" data-uid="${c.uid}" role="button" tabindex="0"` : ''}>
          <div class="sr-dock-card-head"><span class="sr-emo-tag e-${d.emotion}">${t(`emotion_${d.emotion}`)}</span><b>${esc(contentName('card', c.cardId))}${c.sticker ? ` <em>${esc(contentName('sticker', c.sticker))}</em>` : ''}</b>${c.level ? `<i>${'★'.repeat(c.level)}</i>` : ''}${d.slot === 'verb' && d.cost > 1 ? `<small>${t('cost', { n: d.cost })}</small>` : ''}</div>
          <span class="sr-dock-card-rule">${ruleChipsHtml(cardRule(c))}${c.sticker ? ruleChipsHtml(stickerRule(c.sticker)) : ''}</span>
          ${ops}
        </div>`
      }).join('')
      return `<section class="sr-dock-group"><h3>${t(`slot_${slot}`)}</h3>${rows}</section>`
    }).join('')
    return `<div class="rd-deck-head"><span>${t('bag')} · ${t('deck')}</span><b>${run.deck.length}</b></div>${groups}${this.statsHtml()}`
  }

  private relicDockHtml(): string {
    const run = this.run
    const sh = run.shop!
    const cells = Array.from({ length: run.relicSlots }, (_, i) => {
      const id = run.relics[i]
      if (!id) return `<div class="sr-dock-relic empty">${t('relicEmpty')}</div>`
      return `<div class="sr-dock-relic k-${relicDef(id).kind}">
        <span class="sr-dock-relic-art">${this.relicArtHtml(id)}</span>
        <span class="sr-dock-relic-copy"><b>${esc(contentName('relic', id))}</b><small>${ruleChipsHtml(relicRule(id))}</small></span>
        <span class="sr-bag-ops">
          <button type="button" data-act="relicLeft" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="${t('moveLeft')}">◀</button>
          <button type="button" data-act="relicRight" data-i="${i}" ${i >= run.relics.length - 1 ? 'disabled' : ''} aria-label="${t('moveRight')}">▶</button>
          <button type="button" data-act="relicSell" data-i="${i}">${t('sell', { n: Math.floor(relicDef(id).price / 2) })}</button>
        </span>
      </div>`
    }).join('')
    const trades = (Object.keys(HEART_TRADES) as HeartTradeId[]).map((id) => {
      const can = run.canTrade(id)
      return `<button type="button" class="sr-dock-trade" data-act="trade" data-id="${id}" ${can.ok ? '' : 'disabled'} title="${esc(can.reason ?? '')}">
        <b>${t(`trade_${id}`)}</b><span>${t(`trade_${id}_rule`)}</span><em>♥ ${t('pieces', { n: HEART_TRADES[id].pieces })}</em></button>`
    }).join('')
    const haggle = sh.haggle ? `<section class="sr-dock-group"><h3>${t('haggleChoose')}</h3>${sh.haggle.map((id) => `<button type="button" class="sr-dock-relic k-${relicDef(id).kind}" data-act="haggle" data-id="${id}">
        <span class="sr-dock-relic-art">${this.relicArtHtml(id)}</span><span class="sr-dock-relic-copy"><b>${esc(contentName('relic', id))}</b><small>${ruleChipsHtml(relicRule(id))}</small></span></button>`).join('')}</section>` : ''
    return `${haggle}<div class="rd-deck-head"><span>${t('relics')}</span><b>${run.relics.length}/${run.relicSlots}</b></div>
      <p class="sr-dock-hint">${t('relicOrderHint')}</p>${cells}
      <div class="rd-deck-head"><span>${t('heartTrade')}</span><b>${heartsHtml(run.pieces, run.maxPieces)}</b></div>
      <p class="sr-dock-hint">${t('heartTradeHint')}</p><div class="sr-dock-trades">${trades}</div>`
  }

  private shopHtml(): string {
    const run = this.run
    const sh = run.shop!
    const mode = this.shopMode
    if (mode) this.dockMode = 'bag'
    if (sh.haggle) this.dockMode = 'relics'
    const next = sh.forecast[0]
    const forecast = sh.forecast.map((p) => `<span class="sr-forecast-chip"><b>${t('floor', { n: p.floor })}${p.boss ? ` · ${t('boss')}` : ''}</b> ${esc(contentName('form', p.formId))} · ${t('target')} ${fmt(p.target)}${p.weatherIds.map((id) => ` · <em class="w-${weatherDef(id).kind}" data-tooltip="${esc(weatherRule(id))}">${esc(contentName('weather', id))}</em>`).join('')}</span>`).join('')
    const banner = mode?.kind === 'stickerTarget' ? t('chooseTarget') : mode?.kind === 'recall' ? t('chooseRecall') : mode?.kind === 'tradeSticker' ? t('trade_sticker_rule') : ''
    const healPrice = priceWithReceipt(HEAL_PRICE, run.relics)
    const dock = this.dockMode === 'relics' ? this.relicDockHtml() : this.bagHtml()
    return `<div class="scene reward-scene reward-shop-scene sr-screen sr-shop" style="background-image:url(${BACKGROUNDS.bg001})">
      <div class="reward-stage">
        <div class="reward-card reward-shop-card skip-entrance">
          <img class="reward-shop-art" src="${REWARD_ART.shop}" alt="" aria-hidden="true" />
          <header class="reward-head">
            <div class="k">${t('floor', { n: run.floor })} ${t('stageClear')} · ${t('shop')}</div>
            <div class="t hand">${t('shopTitle')}</div>
            <div class="shop-row-guide sr-forecast-row"><span class="sr-forecast-label">${t('forecast')}</span>${forecast}</div>
            <div class="reward-wallet">
              <span class="inspiration-mark" aria-hidden="true">●</span>
              <span class="reward-wallet-balance"><small>${t('money')}</small><b>${run.money}</b></span>
              <span class="reward-wallet-earned">${heartsHtml(run.pieces, run.maxPieces)}${run.guard ? ` ◈${run.guard}` : ''}</span>
            </div>
          </header>
          <div class="reward-system-message sr-mode-message" role="status" ${banner ? '' : 'hidden'}>${banner} <button type="button" data-act="cancel">${t('cancel')}</button></div>
          <div class="reward-grid sr-shop-grid">${sh.stock.map((o, i) => this.offerHtml(o, i)).join('')}</div>
        </div>
        <div class="reward-side">
          <aside class="info-dock glass reward-dock deck-overview sr-shop-dock" id="rdetail" aria-live="polite">${dock}</aside>
          <div class="sr-shop-tabs">
            <button class="reward-deck${this.dockMode === 'bag' ? ' on' : ''}" type="button" data-act="dockBag">${t('bag')} <b>${run.deck.length}</b></button>
            <button class="reward-deck${this.dockMode === 'relics' ? ' on' : ''}" type="button" data-act="dockRelics">${t('relics')} · ${t('heartTrade')}</button>
          </div>
          <button class="reward-refresh" type="button" data-act="reroll" ${sh.freeRerolls > 0 || run.money >= REROLL_PRICE ? '' : 'disabled'}><img src="${REWARD_ART.refresh}" alt="" aria-hidden="true" />${sh.freeRerolls > 0 ? t('rerollFree', { n: sh.freeRerolls }) : t('reroll', { n: REROLL_PRICE })}</button>
          <button class="reward-refresh" type="button" data-act="heal" ${run.money >= healPrice && run.pieces < run.maxPieces ? '' : 'disabled'}>♥ ${t('heal', { n: healPrice })}</button>
          <button class="reward-skip" type="button" data-act="leave"><img src="${REWARD_ART.exit}" alt="" aria-hidden="true" /><span>${t('leave')}${next ? ` · ${t('floor', { n: next.floor })}` : ''}</span></button>
        </div>
      </div>
    </div>`
  }

  private statsHtml(): string {
    const s = this.run.stats
    const rows: [string, string][] = [
      ...STAT_EMOTIONS.map((e): [string, string] => [statName(e), fmt2(s[e])]),
      [statName('baseChips'), fmt2(s.baseChips)], [statName('baseAdd'), `+${fmt2(s.baseAdd)}`],
      [statName('crit'), `+${Math.round(s.crit * 100)}%`], [statName('startTears'), fmt2(s.startTears)],
      [statName('amp'), `+${Math.round(s.amp * 100)}%`], [statName('allowance'), fmt2(s.allowance)],
      [statName('luck'), fmt2(s.luck)], [statName('freeReroll'), fmt2(s.freeReroll)],
    ]
    return `<div class="sr-stats"><h3>${t('stats')}</h3>${rows.map(([k, v]) => `<span>${esc(k)} <b>${v}</b></span>`).join('')}</div>`
  }

  // ── 재련 — 원래 아이템 제련 화면(ItemExclaimView)의 마크업·망치 연출을 그대로 쓴다 ──

  private forgeHtml(): string {
    const run = this.run
    const f = run.forge!
    const slot = FORGE_SLOTS[f.step]
    const points = 1 + f.bonus[f.step]
    const item = Object.values(ALL_ITEMS).find((it) => it.rarity === f.rarity && ITEM_ART[it.art])
    const art = item ? ITEM_ART[item.art] : undefined
    const steps = FORGE_SLOTS.map((s, i) => `<span class="step ${i === f.step ? 'active' : i < f.step ? 'done' : ''}"><b>${i + 1}</b> ${t(`forge_${s}`)}${f.bonus[i] ? ` +${f.bonus[i]}` : ''}</span>`).join('<span class="sep">·</span>')
    const chain = FORGE_SLOTS.map((s, i) => {
      const p = f.picked[i]
      return p ? `<span class="chain-word">${esc(statName(p.id))}</span>` : `<span class="chain-ghost">${t(`forge_${s}`)}</span>`
    }).join(' ')
    const s = run.stats
    const statRows: [string, string][] = [
      ...STAT_EMOTIONS.map((e): [string, string] => [e, fmt2(s[e])]),
      ['baseChips', fmt2(s.baseChips)], ['baseAdd', `+${fmt2(s.baseAdd)}`], ['crit', `+${Math.round(s.crit * 100)}%`],
      ['amp', `+${Math.round(s.amp * 100)}%`], ['mind', `${run.pieces}/${s.mind}`], ['allowance', fmt2(s.allowance)],
    ]
    const choices = f.choices[f.step].map((st) => {
      const word: Word = {
        id: `forge-${slot}-${st.id}`, text: statName(st.id), slot, tags: [], emotion: 'neutral',
        note: contentRule('stat', st.id, { p: st.perPoint * points }), rarity: f.rarity,
      }
      return `<button type="button" class="word-cell iforge-word-card word-card mood-buff rarity-${f.rarity}${f.bonus[f.step] ? ' rarity-boosted' : ''}" style="--card-x:0px;--card-z:1" data-act="forge" data-id="${st.id}">
        ${wordCardInnerHtml(word, { note: `<span class="item-card-main-stat">${ruleChipsHtml(word.note)}</span>`, footer: t(`forge_${slot}`), artUrl: art, hideMeta: true, overlay: f.bonus[f.step] ? `<span class="item-card-bonuses"><span class="rarity-bonus">${t('forgePoints', { n: points })}</span></span>` : '' })}
      </button>`
    }).join('')
    return `<div class="scene item-scene sr-screen sr-forge-scene" style="background-image:url(${BACKGROUNDS.bg001})">
      <div class="slot-step iforge-steps">${steps}</div>
      <div class="iforge">
        <div class="iforge-chain" id="chain">${chain}</div>
        <div class="iforge-top">
          <div class="iforge-illust glass${art ? ' has-art' : ''}">
            ${art ? `<img class="iforge-illust-art" src="${art}" alt="" aria-hidden="true">` : `<div class="art">${itemArt('gift')}</div>`}
            <div class="iforge-enchantment" id="forge-core" aria-hidden="true">
              <i class="forge-orbit orbit-a"></i><i class="forge-orbit orbit-b"></i><span class="forge-core-mark">✦</span><span class="forge-sparks"></span>
            </div>
            <img class="forge-hammer" src="${FORGE_HAMMER_ART}" alt="" aria-hidden="true">
            <span class="forge-impact-word" aria-hidden="true">쾅!</span>
            <div class="iforge-illust-copy">
              <div class="glint">✦ ${t('forge')} ✦</div>
              <div class="iname">${t('item')} · ${t(`rarity_${f.rarity}`)}</div>
              <div class="grade">${f.baseStat ? esc(t('forgeBase', { name: statName(f.baseStat), n: RARITY_BASE_POINTS[f.rarity] * 3 })) : ''}</div>
            </div>
          </div>
          <div class="iforge-stats glass">
            <div class="dock-title">${t('stats')}</div>
            <div class="stat-list" id="stats">${statRows.map(([id, v]) => `<div class="stat" data-stat="${id}"><span class="sl">${esc(statName(id))}</span><span class="sv">${v}</span></div>`).join('')}</div>
          </div>
        </div>
        <div class="iforge-complete" id="forge-complete" aria-live="polite"><span>✦</span><b>${t('forgeDone')}</b><em>${t('forgeSub')}</em><span>✦</span></div>
        <div class="iforge-choose">
          <div class="word-row" id="egrid">${choices}</div>
          <div class="iforge-choose-title"><b>${t(`forge_${slot}`)}</b><span>${t('forgeSub')}</span></div>
        </div>
      </div>
    </div>`
  }

  /** 고른 카드 한 장에 망치 한 번. 연출이 끝나면 엔진에 반영하고 다음 마디(또는 상점)로 간다. */
  private async forgePick(statId: string) {
    if (this.busy) return
    this.busy = true
    const scene = this.root.querySelector<HTMLElement>('.item-scene')
    const panel = scene?.querySelector<HTMLElement>('.iforge-illust')
    const core = scene?.querySelector<HTMLElement>('#forge-core')
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    const step = this.run.forge?.step ?? 0
    scene?.querySelectorAll<HTMLElement>('.word-cell').forEach((b) => b.classList.toggle('picked', b.dataset.id === statId))
    if (panel && core && scene) {
      panel.classList.add('forge-hammering')
      await sleep(reduced ? 20 : 220)
      GameAudio.playForgeHit(step)
      core.classList.add('impact')
      panel.classList.add('forge-impact')
      scene.classList.add('forge-screen-hit')
      await sleep(reduced ? 60 : 380)
    }
    this.run.forgeChoose(statId)
    const done = this.run.phase !== 'forge'
    if (done && scene) {
      scene.classList.add('is-forged')
      scene.querySelector('#forge-complete')?.classList.add('show')
      await sleep(reduced ? 200 : 700)
    }
    this.busy = false
    if (!this.destroyed) this.render()
  }

  private endHtml(): string {
    const run = this.run
    const softlocked = run.events[run.events.length - 1]?.kind === 'softlock'
    const msg = run.phase === 'won' ? t('won') : softlocked ? t('softlock') : t('lost', { n: run.floor })
    return `<div class="scene reward-scene sr-screen sr-end ${run.phase}" style="background-image:url(${BACKGROUNDS.bg001})">
      <div class="reward-stage">
        <div class="reward-card skip-entrance sr-end-card">
          <header class="reward-head">
            <div class="k">${t('floor', { n: run.floor })} · ${t('seed', { n: run.seed })}</div>
            <div class="t hand">${msg}</div>
          </header>
          ${this.statsHtml()}
          <div class="reward-controls sr-end-ops">
            <button type="button" class="reward-refresh" data-act="newRun">${t('restart')}</button>
            <button type="button" class="reward-skip" data-act="home"><span>${t('toTitle')}</span></button>
          </div>
        </div>
      </div>
    </div>`
  }

  // ── 입력 ──

  /** 상점 물건에 올리면 오른쪽 상세 패널이 그 물건의 규칙·써 보기를 보인다. 떠나면 가방으로 돌아온다. */
  private onOver = (ev: PointerEvent) => {
    const pick = (ev.target as HTMLElement).closest<HTMLElement>('.reward-pick[data-act="buy"]')
    const dock = this.root.querySelector<HTMLElement>('.sr-shop-dock')
    const o = pick ? this.run.shop?.stock[Number(pick.dataset.i)] : undefined
    if (!pick || !dock || !o || this.shopMode) return
    dock.className = 'info-dock glass reward-dock sr-shop-dock'
    dock.innerHTML = this.offerDetailHtml(o)
    this.root.querySelectorAll('.reward-pick.detailing').forEach((p) => p.classList.remove('detailing'))
    pick.classList.add('detailing')
  }

  private onOut = (ev: PointerEvent) => {
    const pick = (ev.target as HTMLElement).closest<HTMLElement>('.reward-pick[data-act="buy"]')
    if (!pick || (ev.relatedTarget instanceof Node && pick.contains(ev.relatedTarget))) return
    const dock = this.root.querySelector<HTMLElement>('.sr-shop-dock')
    if (!dock || this.shopMode || this.run.phase !== 'shop') return
    pick.classList.remove('detailing')
    dock.className = 'info-dock glass reward-dock deck-overview sr-shop-dock'
    dock.innerHTML = this.dockMode === 'relics' ? this.relicDockHtml() : this.bagHtml()
  }

  private onClick = (ev: MouseEvent) => {
    const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-act]')
    if (!el || el.hasAttribute('disabled') || !this.root.contains(el)) return
    const act = el.dataset.act!
    const run = this.run
    const i = Number(el.dataset.i)
    const uid = Number(el.dataset.uid)
    if (act === 'home') { this.opts.onHome(); return }
    if (act === 'newRun') { this.opts.onNewRun(); return }
    if (act === 'settings') {
      openSettingsModal(this.scene ?? this.root, { onResetAll: () => (this.opts.onResetAll ?? this.opts.onHome)() })
      return
    }
    // 클리어 쪽지: 엔진은 이미 상점(또는 완주)으로 넘어가 있고 전장만 남아 있다.
    if (act === 'toShop' || act === 'toEnd') { this.render(); return }
    if (run.phase === 'battle' && this.scene) {
      if (this.busy) return
      switch (act) {
        case 'step': this.jumpToSlot(i); return
        case 'swapMode': this.swapMode = !this.swapMode; this.cardHand?.resetTurn(); break
        case 'devClear': clearTimeout(this.autoWriteTimer); run.forceClear(); this.busy = true; void this.showClear(0).then(() => { this.busy = false }); return
        case 'devMoney': run.money += 50; break
        case 'devHeal': run.pieces = run.maxPieces; break
        default: return
      }
      if (run.phase === 'battle') run.rescueHand()
      this.paintBattle()
      return
    }
    if (this.busy) return
    switch (act) {
      case 'dockBag': this.dockMode = 'bag'; break
      case 'dockRelics': this.dockMode = 'relics'; break
      case 'forge': void this.forgePick(el.dataset.id!); return
      case 'buy': {
        const o = run.shop?.stock[i]
        const before = run.shop?.stock.length ?? 0
        this.clickBuy(i)
        if (o && (run.shop?.stock.length ?? 0) < before) {
          // 원래 상점처럼 산 카드에 연필 도장을 찍고 금빛 조각을 터뜨린 뒤 다시 그린다.
          GameAudio.play('pencil')
          SquareBurst.playOn(el, 'gold', { count: 18, spread: 92, duration: 480 })
          el.classList.add('is-owned')
          this.busy = true
          this.later(380, () => { this.busy = false; this.render() })
          return
        }
        break
      }
      case 'target': this.clickTarget(uid); break
      case 'cancel': this.shopMode = undefined; break
      case 'reroll': run.reroll(); break
      case 'heal': run.heal(); break
      case 'leave': this.shopMode = undefined; run.leaveShop(); break
      case 'sellWord': run.sell(uid); break
      case 'eraseWord': run.erase(uid); break
      case 'relicLeft': run.moveRelic(i, i - 1); break
      case 'relicRight': run.moveRelic(i, i + 1); break
      case 'relicSell': run.sellRelic(i); break
      case 'trade': this.clickTrade(el.dataset.id as HeartTradeId); break
      case 'haggle': run.chooseHaggle(el.dataset.id!); break
      default: return
    }
    if (run.phase === 'battle') run.rescueHand()
    this.render()
  }

  private clickBuy(i: number) {
    const o = this.run.shop?.stock[i]
    if (!o) return
    if (this.shopMode?.kind === 'tradeSticker') {
      if (o.kind === 'sticker') this.shopMode = { kind: 'stickerTarget', offer: o, viaTrade: true }
      return
    }
    if (o.kind === 'sticker') { this.shopMode = { kind: 'stickerTarget', offer: o, viaTrade: false }; return }
    this.run.buy(o)
  }

  private clickTarget(uid: number) {
    const mode = this.shopMode
    if (mode?.kind === 'stickerTarget') {
      if (mode.viaTrade) this.run.trade('sticker', { offer: mode.offer, targetUid: uid })
      else this.run.buy(mode.offer, { targetUid: uid })
    } else if (mode?.kind === 'recall') this.run.trade('recall', { targetUid: uid })
    this.shopMode = undefined
  }

  private clickTrade(id: HeartTradeId) {
    if (id === 'sticker') this.shopMode = { kind: 'tradeSticker' }
    else if (id === 'recall') this.shopMode = { kind: 'recall' }
    else this.run.trade(id)
  }
}
