/**
 * 점수 재기획(SCORE_REDESIGN.md) 본편 화면.
 *
 * `/score.html` 시험판의 규칙 엔진(`src/score`의 `ScoreRun`)을 그대로 몰고, 그 위에 기존 전장
 * (배경·프롬·벌레 3D 배우·토큰)과 그림일기풍 상점·재련 화면을 얹는다.
 * 규칙과 수치는 전부 엔진에서 읽는다. 이 파일은 그리기·입력·연출만 맡는다.
 */
import './score-run.css'
import {
  MAX_LEVEL, PIECES_PER_HEART, SCORE_CARDS, SCORE_FORMS, SCORE_RELICS, SCORE_STICKERS, SCORE_WEATHERS,
  card as cardDef, form as formDef, leveled, relic as relicDef, sticker as stickerDef, weather as weatherDef,
} from '@/score/data'
import { contentName, contentRule, getLocale, setScoreLocale, t, type ContentKind, type ScoreLocale } from '@/score/i18n'
import { ScoreRun } from '@/score/run'
import { critInfo, expectedRoller, pickCost, scoreSentence } from '@/score/scoring'
import {
  ERASER_PRICE, FORGE_SLOTS, HEAL_PRICE, HEART_TRADES, RARITY_BASE_POINTS, RARITY_BONUS, REROLL_PRICE,
  priceWithReceipt, wordPrice, type HeartTradeId, type ShopOffer,
} from '@/score/shop'
import { floorDef, type StagePlan } from '@/score/stage'
import { tryoutBaseline, tryoutRelic, tryoutSticker, tryoutWord, type OfferTryout } from '@/score/tryout'
import type { DeckCard, ScoreEmotion, ScoreSlot, ScoreStep, SentencePick, SentenceResult } from '@/score/types'
import { STAT_EMOTIONS } from '@/score/types'
import { currentLocale } from '@/localization'
import { CHARACTER_VISUALS, type CharacterVisualDef } from '@data/characters'
import { stageFor } from '@data/stages'
import { currentFieldLight, currentFieldStage, pickFieldBackground } from '@data/backgrounds'
import {
  destroyCharacterModels, mountCharacterModel, playCharacterAnimation, suspendCharacterModel,
} from '@views/BattleCharacterModel'
import { TokenActor } from '@views/TokenActor'
import { GameAudio } from '@/audio/GameAudio'
import type { Emotion } from '@core/types'
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
  /** 런이 끝났을 때 한 번. 토큰의 기억(런 종료)은 부르는 쪽이 처리한다. */
  onFinished?: (outcome: 'won' | 'lost', floor: number) => void
  /** 개발 서버 전용 치트 줄을 띄운다. */
  dev?: boolean
}

const MAX_VISIBLE_FOES = 3
const ROLLUP_STEP_MS = 230
const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms))
const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!))
const fmt = (n: number) => Math.round(n).toLocaleString(getLocale())
const fmt2 = (n: number) => (Math.round(n * 100) / 100).toLocaleString(getLocale())
/** 기존 오디오의 감정 이름. 혼돈은 옛 무감정 자리를 쓴다. */
const audioEmotion = (e: ScoreEmotion): Emotion => (e === 'chaos' ? 'neutral' : e)

const NAME_INDEX = new Map<string, { kind: ContentKind; id: string }>()
for (const [kind, rows] of [['card', SCORE_CARDS], ['sticker', SCORE_STICKERS], ['relic', SCORE_RELICS], ['weather', SCORE_WEATHERS], ['form', SCORE_FORMS]] as const) {
  for (const r of rows) if (!NAME_INDEX.has(r.name)) NAME_INDEX.set(r.name, { kind, id: r.id })
}

function cardRule(c: DeckCard): string {
  const d = leveled(cardDef(c.cardId), c.level)
  return contentRule('card', c.cardId, { a: d.a, b: d.b, c: d.c, d: d.d })
}
const stickerRule = (id: string) => { const d = stickerDef(id); return contentRule('sticker', id, { a: d.a, b: d.b }) }
const relicRule = (id: string) => { const d = relicDef(id); return contentRule('relic', id, { a: d.a, b: d.b }) }
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
  private shopMode: ShopMode | undefined
  private swapMode = false
  private busy = false
  private destroyed = false
  private timers: number[] = []
  private token: TokenActor | null = null
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
    this.render()
  }

  destroy() {
    this.destroyed = true
    this.root.removeEventListener('click', this.onClick)
    this.timers.forEach((id) => clearTimeout(id))
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
    this.root.querySelector('.sr-paper')?.remove()
    this.root.insertAdjacentHTML('beforeend', html)
    const next = this.root.querySelector<HTMLElement>('.sr-paper-scroll')
    if (next && phase === 'shop') next.scrollTop = keep
  }

  private teardownScene() {
    if (!this.scene) return
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
    this.root.querySelector('.sr-paper')?.remove()
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
    this.swapMode = false
    this.said.clear()
    this.root.insertAdjacentHTML('beforeend', `
      <div class="scene battle score-battle" data-weather="${st.field.weather}" style="background-image:url(${bg.prev ?? bg.next});--actor-bottom:${stage.bottom}px;--player-left:${stage.playerLeft ?? 290}px;--sun-x:${(light.sunX * 100).toFixed(1)}%;--sun-y:${(light.sunY * 100).toFixed(1)}%;--sun-color:#${light.keyColor.toString(16).padStart(6, '0')};--sun-strength:${light.sunStrength};--model-grade-hue:${light.gradeHue}deg">
        ${bg.prev ? `<div class="field-swap" aria-hidden="true" style="background-image:url(${bg.next})"></div>` : ''}
        <div class="vignette"></div>
        <div class="weather-wash"></div>
        <div class="field-clarity" aria-hidden="true"></div>
        <div class="field-sun" aria-hidden="true"></div>
        <div class="storybook-grade" aria-hidden="true"></div>
        <div class="stage-area" id="pbox"><div id="actors"></div></div>
        <header class="sr-top"></header>
        <div class="sr-relics"></div>
        <section class="sr-board" aria-live="polite"></section>
        <section class="sr-hand" aria-label="${t('deck')}"></section>
        ${this.opts.dev ? `<div class="sr-dev"><b>DEV</b><button data-act="devClear">클리어</button><button data-act="devMoney">돈 +50</button><button data-act="devHeal">하트 회복</button></div>` : ''}
        <div class="sr-banner" hidden></div>
      </div>`)
    this.scene = this.root.querySelector<HTMLElement>('.scene.score-battle')
    this.sceneFloor = floor
    const actors = this.scene!.querySelector<HTMLElement>('#actors')!
    actors.insertAdjacentHTML('beforeend', this.playerHtml())
    const you = actors.querySelector<HTMLElement>('.actor.you')!
    mountCharacterModel(you, CHARACTER_VISUALS.player)
    const area = this.scene!.querySelector<HTMLElement>('.stage-area')!
    this.token = new TokenActor(area)
    this.token.attachTo(you)
    playCharacterAnimation(you, 'walk')
    this.later(1100, () => playCharacterAnimation(you, 'idle'))
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
    return `<div class="actor foe${boss ? ' sr-boss' : ''}" data-species="${id}">
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
      el.style.left = 'auto'
      el.style.right = `${stage.railRight - (entering ? rank + 3 : MAX_VISIBLE_FOES) * stage.railGap}px`
      el.style.opacity = entering ? '0' : '1'
      host.append(el)
      void el.offsetWidth
      playCharacterAnimation(el, 'walk')
      const walker = el
      this.later(entering ? 2100 : 520, () => { if (walker.isConnected && !walker.classList.contains('dying')) playCharacterAnimation(walker, 'idle') })
      live.push(el)
    }
    const st = this.run.stage
    live.forEach((el, rank) => {
      el.style.right = `${stage.railRight - rank * stage.railGap}px`
      el.style.bottom = `${stage.bottom}px`
      el.style.zIndex = String(40 - rank)
      el.style.opacity = '1'
      el.dataset.rank = String(rank)
      el.classList.toggle('front', rank === 0)
      el.querySelector<HTMLElement>('.nm')!.textContent = this.visualFor(el.dataset.species ?? '').name
      let cur = hp
      let max = hp
      if (isBoss) { cur = Math.max(0, st.plan.target - st.scored); max = st.plan.target }
      else if (rank === 0) cur = frontHp
      el.querySelector<HTMLElement>('.hpn')!.textContent = `${fmt(cur)}/${fmt(max)}`
      el.querySelector<HTMLElement>('.hpbar .fill')!.style.width = `${Math.max(0, Math.min(100, (cur / max) * 100))}%`
    })
    let badge = host.querySelector<HTMLElement>('.sr-bug-count')
    const waiting = isBoss ? 0 : count - visible
    if (waiting > 0) {
      if (!badge) {
        host.insertAdjacentHTML('beforeend', '<div class="sr-bug-count" role="status"><b></b></div>')
        badge = host.querySelector<HTMLElement>('.sr-bug-count')!
      }
      badge.querySelector('b')!.textContent = `+${fmt(waiting)}`
    } else badge?.remove()
  }

  private paintBattle() {
    if (!this.scene) return
    this.scene.querySelector('.sr-top')!.innerHTML = this.topHtml()
    this.scene.querySelector('.sr-relics')!.innerHTML = this.relicStripHtml()
    this.scene.querySelector('.sr-board')!.innerHTML = this.boardHtml()
    this.scene.querySelector('.sr-hand')!.innerHTML = this.handHtml()
  }

  private topHtml(): string {
    const run = this.run
    const st = run.stage
    const ctx = st.ctx
    const plan = st.plan
    const bugs = this.bugState()
    const pct = Math.min(100, (st.scored / plan.target) * 100)
    const overtime = ctx.chancesLeft <= 0
    const pips = Array.from({ length: ctx.chancesTotal }, (_, i) => `<i class="sr-pip${i < ctx.chancesLeft ? ' on' : ''}"></i>`).join('')
    const chips = [
      `<span class="sr-chip form" title="${esc(formRule(plan.formId))}"><b>${esc(contentName('form', plan.formId))}</b><small>${esc(formRule(plan.formId))}</small></span>`,
      ...plan.weatherIds.map((id) => `<span class="sr-chip weather w-${weatherDef(id).kind}" title="${esc(weatherRule(id))}"><b>${esc(contentName('weather', id))}</b><small>${esc(weatherRule(id))}</small></span>`),
    ].join('')
    return `
      <div class="sr-floor glass">
        <strong>${t('floor', { n: run.floor })}${plan.boss ? ` · <em>${t('boss')}</em>` : ''}</strong>
        <div class="sr-chips">${chips}</div>
      </div>
      <div class="sr-goal glass">
        <div class="sr-goal-bar"><i style="width:${pct}%"></i><span><small>${t('score')}</small> <b>${fmt(st.scored)}</b> / ${fmt(plan.target)}</span></div>
        <div class="sr-goal-info">
          <span>${t('enemiesLeft', { n: fmt(bugs.count) })}</span>
          <span class="sr-chances${overtime ? ' over' : ''}">${overtime ? t('overtime') : `${t('chances', { n: ctx.chancesLeft, total: ctx.chancesTotal })} ${pips}`}</span>
          <span>${t('tears')} <b>${fmt2(ctx.tears)}</b></span>
          ${ctx.weakness ? `<span>${t('weakness', { name: t(`emotion_${ctx.weakness}`) })}</span>` : ''}
        </div>
      </div>
      <div class="sr-res glass">
        ${heartsHtml(run.pieces, run.maxPieces)}
        ${run.guard ? `<span class="sr-guard" title="${t('guard')}">◈ ${run.guard}</span>` : ''}
        <span class="sr-money" title="${t('money')}">● ${run.money}</span>
        <button type="button" class="sr-icon-btn" data-act="home">${t('home')}</button>
      </div>`
  }

  private relicStripHtml(editable = false): string {
    const run = this.run
    const cells: string[] = []
    for (let i = 0; i < run.relicSlots; i++) {
      const id = run.relics[i]
      if (!id) { cells.push(`<div class="sr-relic empty">${t('relicEmpty')}</div>`); continue }
      cells.push(`<div class="sr-relic k-${relicDef(id).kind}" title="${esc(relicRule(id))}">
        <b>${esc(contentName('relic', id))}</b><small>${esc(relicRule(id))}</small>
        ${editable ? `<span class="sr-relic-ops">
          <button type="button" data-act="relicLeft" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="${t('moveLeft')}">◀</button>
          <button type="button" data-act="relicSell" data-i="${i}">${t('sell', { n: Math.floor(relicDef(id).price / 2) })}</button>
          <button type="button" data-act="relicRight" data-i="${i}" ${i >= run.relics.length - 1 ? 'disabled' : ''} aria-label="${t('moveRight')}">▶</button>
        </span>` : ''}
      </div>`)
    }
    return `<span class="sr-relics-label">${t('relics')}</span>${cells.join('')}`
  }

  private currentPick(): SentencePick | undefined {
    const drowsy = this.run.stage.ctx.weatherIds.includes('drowsy')
    const s = this.sel
    if (!s.subj || !s.verb || (!s.adv && !drowsy)) return undefined
    return { subj: s.subj, adv: s.adv, verb: s.verb, subj2: s.subj2, verb2: s.verb2 }
  }

  private compatiblePicks(picks: SentencePick[], skip?: SelKey): SentencePick[] {
    const same = (p: SentencePick, k: SelKey, c: DeckCard | undefined) => (p[k]?.uid ?? -1) === (c?.uid ?? -1)
    return picks.filter((p) => (['subj', 'adv', 'verb', 'subj2', 'verb2'] as SelKey[]).every((k) => k === skip || !this.sel[k] || same(p, k, this.sel[k])))
  }

  private boardHtml(): string {
    const run = this.run
    const ctx = run.stage.ctx
    const twinS = run.relics.includes('twinSubj')
    const twinV = run.relics.includes('twinVerb')
    const keys = ['subj', ...(twinS ? ['subj2'] : []), 'adv', 'verb', ...(twinV ? ['verb2'] : [])] as SelKey[]
    const drowsy = ctx.weatherIds.includes('drowsy')
    const slots = keys.map((k) => {
      const c = this.sel[k]
      const locked = k === 'adv' && drowsy
      return `<button type="button" class="sr-slot${c ? ` filled e-${cardDef(c.cardId).emotion}` : ''}${locked ? ' locked' : ''}" data-act="unslot" data-key="${k}" ${c ? '' : 'disabled'}>
        <small>${t(`slot_${k}`)}${locked ? ` · ${t('slotLocked')}` : ''}</small><b>${c ? esc(contentName('card', c.cardId)) : '…'}</b></button>`
    }).join('')
    const picks = run.handPicks()
    const pick = this.currentPick()
    const valid = pick ? run.validate(pick) : undefined
    let preview = `<p class="sr-preview-hint">${t('pickAll')}</p>`
    if (pick && valid?.ok) {
      const res = scoreSentence(pick, ctx, run.loadout, expectedRoller, 1)
      const ci = critInfo(pick, ctx, run.loadout)
      preview = `<p class="sr-preview-line"><span class="sr-chipval">${fmt2(res.chips)}</span><i>×</i><span class="sr-multval">${fmt2(res.mult * res.amp)}</span><i>=</i><strong>${fmt(run.preview(pick))}</strong>
        <small>${t('critChance', { p: Math.round(ci.chance * 100) })} ×${fmt2(ci.mult)}</small></p>`
    } else if (pick && valid && !valid.ok) {
      preview = `<p class="sr-preview-hint bad">${esc(valid.reason ?? '')}</p>`
    } else if (Object.values(this.sel).some(Boolean)) {
      const best = Math.max(0, ...this.compatiblePicks(picks).map((p) => run.preview(p)))
      preview = `<p class="sr-preview-hint">${t('preview')} ≤ <b>${fmt(best)}</b></p>`
    }
    const overtime = ctx.chancesLeft <= 0
    const cost = pick ? pickCost(pick) : 1
    const writeLabel = overtime ? t('writeOvertime') : t('writeCost', { n: cost })
    const swap = run.stage.swapsLeft > 0
      ? `<button type="button" class="sr-btn${this.swapMode ? ' on' : ''}" data-act="swapMode">${this.swapMode ? t('swapHint') : t('swap', { n: run.stage.swapsLeft })}</button>` : ''
    return `<div class="sr-slots">${slots}</div>
      <div class="sr-board-row">
        <div class="sr-preview">${preview}</div>
        <div class="sr-board-ops">${swap}<button type="button" class="sr-write" data-act="write" ${pick && valid?.ok && !this.busy ? '' : 'disabled'}>${writeLabel}</button></div>
      </div>`
  }

  private wordCardHtml(c: DeckCard, opts: { act?: string; cls?: string; extra?: string; reason?: string } = {}): string {
    const d = cardDef(c.cardId)
    const stars = c.level ? `<span class="sr-lv" title="${t('level', { n: c.level })}">${'★'.repeat(c.level)}</span>` : ''
    const cost = d.slot === 'verb' && d.cost > 1 ? `<span class="sr-cost">${t('cost', { n: d.cost })}</span>` : ''
    const sticker = c.sticker ? `<span class="sr-sticker">${esc(contentName('sticker', c.sticker))}</span>` : ''
    return `<button type="button" class="sr-card e-${d.emotion} ${opts.cls ?? ''}" ${opts.act ? `data-act="${opts.act}"` : ''} data-uid="${c.uid}" data-slot="${d.slot}" ${opts.reason ? `title="${esc(opts.reason)}"` : ''}>
      <span class="sr-card-top"><i class="sr-emo">${t(`emotion_${d.emotion}`)}</i>${cost}${stars}</span>
      <b class="sr-card-name">${esc(contentName('card', c.cardId))}${sticker}</b>
      <span class="sr-card-rule">${esc(cardRule(c))}</span>
      ${c.sticker ? `<span class="sr-card-rule sticker">${esc(stickerRule(c.sticker))}</span>` : ''}
      ${opts.extra ?? ''}
    </button>`
  }

  private handHtml(): string {
    const run = this.run
    const st = run.stage
    const picks = run.handPicks()
    const drowsy = st.ctx.weatherIds.includes('drowsy')
    const chosen = (['subj', 'adv', 'verb'] as SelKey[]).map((k) => this.sel[k]).filter((c): c is DeckCard => !!c)
    const chosenEmotions = chosen.map((c) => cardDef(c.cardId).emotion)
    const pairEmotion = chosenEmotions.length === 2 && chosenEmotions[0] === chosenEmotions[1] ? chosenEmotions[0] : undefined
    const group = (slot: ScoreSlot) => {
      const locked = slot === 'adv' && drowsy
      const cards = st.hand[slot].hand.map((c) => {
        const d = cardDef(c.cardId)
        const isSel = this.sel[slot] === c || (slot === 'subj' && this.sel.subj2 === c) || (slot === 'verb' && this.sel.verb2 === c)
        const usable = !locked && picks.some((p) => [p.subj, p.adv, p.verb, p.subj2, p.verb2].includes(c))
        const fits = usable && this.compatiblePicks(picks, slot).some((p) => p[slot] === c || p.subj2 === c || p.verb2 === c)
        let reason = ''
        if (!usable && !locked) {
          const probe: SentencePick = {
            subj: slot === 'subj' ? c : st.hand.subj.hand[0], adv: drowsy ? undefined : slot === 'adv' ? c : st.hand.adv.hand[0],
            verb: slot === 'verb' ? c : st.hand.verb.hand[0],
          }
          reason = run.validate(probe).reason ?? ''
        }
        const linked = !isSel && chosenEmotions.includes(d.emotion)
        const more = !isSel && pairEmotion === d.emotion && !this.sel[slot]
        const cls = [isSel ? 'sel' : '', fits || isSel ? '' : 'off', linked ? 'linked' : '', this.swapMode ? 'swappable' : ''].join(' ')
        return this.wordCardHtml(c, { act: 'hand', cls, reason, extra: more ? `<em class="sr-one-more">${t('oneMore')}</em>` : '' })
      }).join('')
      return `<div class="sr-group${locked ? ' locked' : ''}"><h3>${t(`slot_${slot}`)}${locked ? ` · ${t('slotLocked')}` : ''}</h3><div class="sr-group-cards">${cards}</div></div>`
    }
    return `${group('subj')}${group('adv')}${group('verb')}`
  }

  private sayOnce(key: string, text: string, tone: TokenLine['tone'] = 'calm') {
    if (this.said.has(key)) return
    this.said.add(key)
    this.token?.say({ text, tone })
  }

  private clickHand(uid: number, slot: ScoreSlot) {
    const st = this.run.stage
    const c = st.hand[slot].hand.find((x) => x.uid === uid)
    if (!c) return
    if (this.swapMode) {
      this.run.swap(slot, c)
      this.swapMode = false
      this.sel = {}
      return
    }
    const run = this.run
    const twin: SelKey | undefined = slot === 'subj' && run.relics.includes('twinSubj') ? 'subj2' : slot === 'verb' && run.relics.includes('twinVerb') ? 'verb2' : undefined
    if (this.sel[slot] === c) { this.sel[slot] = twin ? this.sel[twin] : undefined; if (twin) this.sel[twin] = undefined; return }
    if (twin && this.sel[twin] === c) { this.sel[twin] = undefined; return }
    if (twin && this.sel[slot] && !this.sel[twin]) { this.sel[twin] = c; return }
    this.sel[slot] = c
  }

  private async write() {
    const pick = this.currentPick()
    const run = this.run
    if (!pick || this.busy || !run.validate(pick).ok) return
    this.busy = true
    const before = this.bugState()
    const piecesBefore = run.pieces + run.guard
    const moneyBefore = run.money
    const words = [pick.subj, pick.subj2, pick.adv, pick.verb, pick.verb2].filter((c): c is DeckCard => !!c).map((c) => contentName('card', c.cardId)).join(' ')
    const emotions = [pick.subj, pick.adv, pick.verb].filter((c): c is DeckCard => !!c).map((c) => audioEmotion(cardDef(c.cardId).emotion))
    const res = run.play(pick)
    const cleared = run.phase === 'shop' || run.phase === 'won'
    const hurt = piecesBefore - (run.pieces + run.guard)
    this.sel = {}
    this.swapMode = false
    GameAudio.playSentenceComplete(emotions)
    // 손패·문장판은 정산이 끝날 때까지 잠근다. 위쪽 점수판은 정산 뒤에 맞춘다.
    this.scene?.querySelector('.sr-hand')?.classList.add('is-locked')
    if (hurt > 0) this.playerHurt(hurt)
    await this.playRollup(words, res)
    await this.playAttack(before, res)
    if (this.destroyed) return
    this.syncFoes()
    this.paintBattle()
    this.scene?.querySelector('.sr-hand')?.classList.remove('is-locked')
    if (res.score >= Math.max(30, run.stage.plan.target * 0.6)) this.sayOnce('big', t('tokenBigHit'), 'relief')
    if (cleared) {
      this.token?.feel(run.stage.plan.boss ? 'bossDown' : 'enemyKilled')
      await this.showClear(run.money - moneyBefore)
      this.busy = false
      return
    }
    this.busy = false
    if (run.phase === 'lost') {
      this.token?.feel('runLost')
      GameAudio.playDefeatBgm()
      const you = this.scene?.querySelector<HTMLElement>('.actor.you')
      if (you) playCharacterAnimation(you, 'defeat')
      this.opts.onFinished?.('lost', run.floor)
      this.later(900, () => this.render())
      return
    }
    run.rescueHand()
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

  private async playRollup(words: string, res: SentenceResult) {
    const board = this.scene?.querySelector<HTMLElement>('.sr-board')
    if (!board) return
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    board.innerHTML = `<div class="sr-rollup">
      <p class="sr-rollup-words">${esc(words)}</p>
      <ol class="sr-rollup-steps"></ol>
      <p class="sr-rollup-now"><span class="sr-chipval">0</span><i>×</i><span class="sr-multval">1</span></p>
      <p class="sr-rollup-total" hidden></p>
    </div>`
    const list = board.querySelector<HTMLElement>('.sr-rollup-steps')!
    const chipEl = board.querySelector<HTMLElement>('.sr-rollup-now .sr-chipval')!
    const multEl = board.querySelector<HTMLElement>('.sr-rollup-now .sr-multval')!
    let skip = reduced
    const onSkip = () => { skip = true }
    board.addEventListener('click', onSkip, { once: true })
    for (const s of res.steps) {
      list.insertAdjacentHTML('beforeend', `<li class="s-${s.source}"><span>${esc(stepLabel(s))}</span><em>${fmt2(s.chips)} × ${fmt2(s.mult)}</em></li>`)
      list.scrollTop = list.scrollHeight
      chipEl.textContent = fmt2(s.chips)
      multEl.textContent = fmt2(s.mult)
      if (!skip) {
        GameAudio.play('wordSelect')
        await sleep(ROLLUP_STEP_MS)
      }
      if (this.destroyed) return
    }
    const total = board.querySelector<HTMLElement>('.sr-rollup-total')!
    total.hidden = false
    total.classList.toggle('crit', res.crit)
    total.innerHTML = `${res.crit ? `<em>${t('crit')}! ×${fmt2(res.critMult)}</em> ` : ''}${t('scored', { n: fmt(res.score) })}`
    if (res.crit || res.score >= 100) GameAudio.playMultiplierRise()
    board.removeEventListener('click', onSkip)
    await sleep(skip ? 250 : 650)
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
    this.scene?.querySelector('.sr-hand')?.classList.add('is-hidden')
    this.scene?.querySelector('.sr-board')?.classList.add('is-hidden')
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

  // ── 상점 ──

  private forecastCard(p: StagePlan): string {
    return `<div class="sr-forecast-card">
      <b>${t('floor', { n: p.floor })}${p.boss ? ` · ${t('boss')}` : ''}</b>
      <span>${esc(contentName('form', p.formId))} · ${t('target')} ${fmt(p.target)}</span>
      ${p.weatherIds.map((id) => `<span class="sr-chip weather w-${weatherDef(id).kind}"><b>${esc(contentName('weather', id))}</b><small>${esc(weatherRule(id))}</small></span>`).join('')}
    </div>`
  }

  private tryoutLine(tr: OfferTryout | undefined): string {
    if (!tr) return ''
    return Math.round(tr.to) > Math.round(tr.from)
      ? `<span class="sr-tryout up">${t('tryout', { from: fmt(tr.from), to: fmt(tr.to) })}</span>`
      : `<span class="sr-tryout">${t('tryoutNone')}</span>`
  }

  private paperHead(): string {
    const run = this.run
    return `<header class="sr-paper-head">
      <strong>${t('floor', { n: run.floor })}</strong>
      <span class="sr-paper-res">${heartsHtml(run.pieces, run.maxPieces)}
        ${run.guard ? `<span class="sr-guard">◈ ${run.guard}</span>` : ''}
        <span class="sr-money">● ${run.money}</span>
        <button type="button" class="sr-icon-btn" data-act="home">${t('home')}</button></span>
    </header>`
  }

  private shopHtml(): string {
    const run = this.run
    const sh = run.shop!
    const lo = run.loadout
    const base = tryoutBaseline(run.deck, lo)
    const mode = this.shopMode
    const offerCard = (o: ShopOffer) => {
      let title = ''
      let rule = ''
      let cls = ''
      let tag = ''
      let tr: OfferTryout | undefined
      if (o.kind === 'word') {
        const d = cardDef(o.id)
        const owned = o.upgradeUid != null ? run.deck.find((c) => c.uid === o.upgradeUid) : undefined
        const probe: DeckCard = owned ? { ...owned, level: Math.min(MAX_LEVEL, owned.level + 1) } : { uid: -1, cardId: o.id, level: 0 }
        title = contentName('card', o.id)
        rule = cardRule(probe)
        cls = `e-${d.emotion}`
        tag = `${t(`slot_${d.slot}`)} · ${t(`emotion_${d.emotion}`)}${d.cost > 1 ? ` · ${t('cost', { n: d.cost })}` : ''}${owned ? ` · ${t('upgrade')} ${'★'.repeat(probe.level)}` : ''}`
        tr = tryoutWord(base, run.deck, lo, o.id, o.upgradeUid)
      } else if (o.kind === 'sticker') {
        const d = stickerDef(o.id)
        title = contentName('sticker', o.id)
        rule = stickerRule(o.id)
        cls = 'offer-sticker'
        tag = t(`slot_${d.slot}`)
        tr = tryoutSticker(base, run.deck, lo, o.id, d.slot)
      } else if (o.kind === 'relic') {
        title = contentName('relic', o.id)
        rule = relicRule(o.id)
        cls = `offer-relic k-${relicDef(o.id).kind}`
        tr = run.relics.length < run.relicSlots ? tryoutRelic(base, lo, o.id) : undefined
      } else {
        title = `${t('item')} · ${t(`rarity_${o.rarity}`)}`
        rule = t('itemRule', { n: 3 + RARITY_BONUS[o.rarity] + RARITY_BASE_POINTS[o.rarity] + run.pledge })
        cls = `offer-item r-${o.rarity}`
      }
      const can = o.kind === 'sticker' ? { ok: o.price <= run.money, reason: t('reason_noMoney') } : run.canBuy(o)
      const picking = mode?.kind === 'tradeSticker' && o.kind === 'sticker'
      const reason = can.ok ? '' : o.price > run.money ? t('reason_noMoney') : o.kind === 'relic' ? t('reason_relicFull') : (can.reason ?? '')
      return `<div class="sr-offer ${cls}${picking ? ' pickable' : ''}">
        ${tag ? `<small class="sr-offer-tag">${esc(tag)}</small>` : ''}
        <b>${esc(title)}</b><span class="sr-offer-rule">${esc(rule)}</span>${this.tryoutLine(tr)}
        <button type="button" data-act="buy" data-i="${sh.stock.indexOf(o)}" ${can.ok || picking ? '' : 'disabled'} title="${esc(reason)}">${picking ? t('trade_sticker') : `${t('buy')} · ${t('price', { n: o.price })}`}</button>
      </div>`
    }
    const store = (title: string, offers: ShopOffer[]) => `<div class="sr-store"><h3>${title}</h3><div class="sr-offers">${offers.map(offerCard).join('') || '—'}</div></div>`
    const targetMode = mode?.kind === 'stickerTarget' || mode?.kind === 'recall'
    const targetSlot = mode?.kind === 'stickerTarget' && mode.offer.kind === 'sticker' ? stickerDef(mode.offer.id).slot : undefined
    const bag = (['subj', 'adv', 'verb'] as ScoreSlot[]).map((slot) => {
      const cards = run.deck.filter((c) => cardDef(c.cardId).slot === slot).map((c) => {
        const d = cardDef(c.cardId)
        const isTarget = mode?.kind === 'stickerTarget' ? slot === targetSlot : mode?.kind === 'recall' ? c.level < MAX_LEVEL && !!d.grow : false
        const ops = targetMode ? '' : `<span class="sr-bag-ops">
          <span role="button" data-act="sellWord" data-uid="${c.uid}">${t('sell', { n: Math.floor(wordPrice(d.cost) / 2) })}</span>
          <span role="button" data-act="eraseWord" data-uid="${c.uid}">${t('erase', { n: priceWithReceipt(ERASER_PRICE, run.relics) })}</span></span>`
        return this.wordCardHtml(c, { act: isTarget ? 'target' : undefined, cls: targetMode ? (isTarget ? 'target' : 'off') : 'bagged', extra: ops })
      }).join('')
      return `<div class="sr-bag-col"><h3>${t(`slot_${slot}`)}</h3>${cards}</div>`
    }).join('')
    const trades = (Object.keys(HEART_TRADES) as HeartTradeId[]).map((id) => {
      const can = run.canTrade(id)
      return `<button type="button" class="sr-trade" data-act="trade" data-id="${id}" ${can.ok ? '' : 'disabled'} title="${esc(can.reason ?? '')}">
        <b>${t(`trade_${id}`)}</b><span>${t(`trade_${id}_rule`)}</span><em>♥ ${t('pieces', { n: HEART_TRADES[id].pieces })}</em></button>`
    }).join('')
    const healPrice = priceWithReceipt(HEAL_PRICE, run.relics)
    const banner = mode?.kind === 'stickerTarget' ? t('chooseTarget') : mode?.kind === 'recall' ? t('chooseRecall') : mode?.kind === 'tradeSticker' ? t('trade_sticker_rule') : ''
    return `<div class="scene sr-paper sr-shop">
      ${this.paperHead()}
      <div class="sr-paper-scroll">
        <div class="sr-shop-grid">
          <div class="sr-shop-main">
            <h2>${t('shop')}</h2>
            <div class="sr-forecast"><h3>${t('forecast')}</h3>${sh.forecast.map((p) => this.forecastCard(p)).join('')}</div>
            ${banner ? `<p class="sr-mode-banner">${banner} <button type="button" data-act="cancel">${t('cancel')}</button></p>` : ''}
            ${sh.haggle ? `<div class="sr-store haggle"><h3>${t('haggleChoose')}</h3><div class="sr-offers">${sh.haggle.map((id) => `<div class="sr-offer offer-relic k-${relicDef(id).kind}">
              <b>${esc(contentName('relic', id))}</b><span class="sr-offer-rule">${esc(relicRule(id))}</span><button type="button" data-act="haggle" data-id="${id}">${t('buy')}</button></div>`).join('')}</div></div>` : ''}
            ${store(t('store_words'), sh.stock.filter((o) => o.kind === 'word'))}
            ${store(t('store_stickers'), sh.stock.filter((o) => o.kind === 'sticker' || o.kind === 'item'))}
            ${store(t('store_relics'), sh.stock.filter((o) => o.kind === 'relic'))}
            <div class="sr-shop-ops">
              <button type="button" data-act="reroll" ${sh.freeRerolls > 0 || run.money >= REROLL_PRICE ? '' : 'disabled'}>${sh.freeRerolls > 0 ? t('rerollFree', { n: sh.freeRerolls }) : t('reroll', { n: REROLL_PRICE })}</button>
              <button type="button" data-act="heal" ${run.money >= healPrice && run.pieces < run.maxPieces ? '' : 'disabled'}>${t('heal', { n: healPrice })}</button>
              <button type="button" class="sr-write" data-act="leave">${t('leave')}</button>
            </div>
            <div class="sr-store"><h3>${t('heartTrade')}</h3><p class="sr-hint">${t('heartTradeHint')}</p><div class="sr-trades">${trades}</div></div>
          </div>
          <div class="sr-shop-side">
            <div class="sr-relic-row">${this.relicStripHtml(true)}</div>
            <p class="sr-hint">${t('relicOrderHint')}</p>
            <h2>${t('bag')} · ${t('deck')}</h2>
            <div class="sr-bag">${bag}</div>
            ${this.statsHtml()}
          </div>
        </div>
      </div>
    </div>`
  }

  private statsHtml(): string {
    const s = this.run.stats
    const rows: [string, string][] = [
      ...STAT_EMOTIONS.map((e): [string, string] => [contentName('stat', e), fmt2(s[e])]),
      [contentName('stat', 'baseChips'), fmt2(s.baseChips)], [contentName('stat', 'baseAdd'), `+${fmt2(s.baseAdd)}`],
      [contentName('stat', 'crit'), `+${Math.round(s.crit * 100)}%`], [contentName('stat', 'startTears'), fmt2(s.startTears)],
      [contentName('stat', 'amp'), `+${Math.round(s.amp * 100)}%`], [contentName('stat', 'allowance'), fmt2(s.allowance)],
      [contentName('stat', 'luck'), fmt2(s.luck)], [contentName('stat', 'freeReroll'), fmt2(s.freeReroll)],
    ]
    return `<div class="sr-stats"><h3>${t('stats')}</h3>${rows.map(([k, v]) => `<span>${esc(k)} <b>${v}</b></span>`).join('')}</div>`
  }

  // ── 재련 ──

  private forgeHtml(): string {
    const f = this.run.forge!
    const slot = FORGE_SLOTS[f.step]
    const points = 1 + f.bonus[f.step]
    const steps = FORGE_SLOTS.map((s, i) => `<span class="${i === f.step ? 'on' : i < f.step ? 'done' : ''}">${t(`forge_${s}`)}${f.bonus[i] ? ` +${f.bonus[i]}` : ''}</span>`).join('<i>→</i>')
    const choices = f.choices[f.step].map((s) => `<button type="button" class="sr-forge-choice" data-act="forge" data-id="${s.id}">
      <b>${esc(contentName('stat', s.id))}</b><span>${esc(contentRule('stat', s.id, { p: s.perPoint * points }))}</span><em>${t('forgePoints', { n: points })}</em></button>`).join('')
    return `<div class="scene sr-paper sr-forge-scene">
      ${this.paperHead()}
      <div class="sr-paper-scroll">
        <section class="sr-forge r-${f.rarity}">
          <h2>${t('forge')} · ${t(`rarity_${f.rarity}`)}</h2>
          ${f.baseStat ? `<p>${t('forgeBase', { name: contentName('stat', f.baseStat), n: RARITY_BASE_POINTS[f.rarity] * 3 })}</p>` : ''}
          <p class="sr-forge-steps">${steps}</p>
          <h3>${t(`forge_${slot}`)}</h3>
          <div class="sr-forge-choices">${choices}</div>
          ${this.statsHtml()}
        </section>
      </div>
    </div>`
  }

  private endHtml(): string {
    const run = this.run
    const softlocked = run.events[run.events.length - 1]?.kind === 'softlock'
    const msg = run.phase === 'won' ? t('won') : softlocked ? t('softlock') : t('lost', { n: run.floor })
    return `<div class="scene sr-paper sr-end ${run.phase}">
      <div class="sr-paper-scroll">
        <section class="sr-end-box">
          <h2>${msg}</h2>
          <p>${t('floor', { n: run.floor })} · ${t('seed', { n: run.seed })}</p>
          ${this.statsHtml()}
          <div class="sr-end-ops">
            <button type="button" class="sr-write" data-act="newRun">${t('restart')}</button>
            <button type="button" data-act="home">${t('toTitle')}</button>
          </div>
        </section>
      </div>
    </div>`
  }

  // ── 입력 ──

  private onClick = (ev: MouseEvent) => {
    const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-act]')
    if (!el || el.hasAttribute('disabled') || !this.root.contains(el)) return
    const act = el.dataset.act!
    const run = this.run
    const i = Number(el.dataset.i)
    const uid = Number(el.dataset.uid)
    if (act === 'home') { this.opts.onHome(); return }
    if (act === 'newRun') { this.opts.onNewRun(); return }
    // 클리어 쪽지: 엔진은 이미 상점(또는 완주)으로 넘어가 있고 전장만 남아 있다.
    if (act === 'toShop' || act === 'toEnd') { this.render(); return }
    if (run.phase === 'battle' && this.scene) {
      if (this.busy) return
      switch (act) {
        case 'hand': this.clickHand(uid, el.dataset.slot as ScoreSlot); break
        case 'unslot': {
          const key = el.dataset.key as SelKey
          this.sel[key] = undefined
          break
        }
        case 'swapMode': this.swapMode = !this.swapMode; break
        case 'write': void this.write(); return
        case 'devClear': run.forceClear(); this.busy = true; void this.showClear(0).then(() => { this.busy = false }); return
        case 'devMoney': run.money += 50; break
        case 'devHeal': run.pieces = run.maxPieces; break
        default: return
      }
      if (run.phase === 'battle') run.rescueHand()
      this.paintBattle()
      return
    }
    switch (act) {
      case 'buy': this.clickBuy(i); break
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
      case 'forge': run.forgeChoose(el.dataset.id!); GameAudio.playForgeHit(); break
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
