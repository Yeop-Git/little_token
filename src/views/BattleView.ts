/**
 * 전투 뷰 v4 — 배경 일러스트 위 쉐이더틱 UI.
 *  · 상단: 완성 중인 문장(체인) 그림자 강조
 *  · 중앙 하단: 단어를 가로 배치(효과별 무드 색). 전부 채우면 자동 완성(반짝 후 발동)
 *  · 되돌리기: 하단 중앙 회색 연한 글자, 한 단계씩 되돌림
 *  · 좌측: 스탯표 + 단어장(전체 덱 오버레이) 버튼
 *  · 우측: 정보 패널 — "해당 단어"만의 효과/수치(누적 아님) 또는 가방 아이템 정보
 *  · 가방: 오버레이 대신, 하단 단어 영역이 내려가고 아이템 목록이 올라오는 토글
 */

import { compile, matchCombos, sentenceTokens } from '@core/compiler'
import { conflictReason, pruneConflicts } from '@core/validator'
import type { Selection, Tables, Word, FieldDef } from '@core/types'
import { RARITY_LABEL } from '@core/types'
import { TABLES } from '@data/tables'
import { ENEMIES } from '@data/enemies'
import {
  allDead,
  aliveIdx,
  applyIntent,
  enemyTurn,
  frontIdx,
  makeEnemy,
  type BattleState,
} from '@/sim/reference'
import { BACKGROUNDS } from '@/assets'
import { weatherIcon } from './sprites'
import { icon, itemArt } from '@/ui/Icons'
import { SquareBurst } from '@/ui/SquareBurst'
import { defaultPlayer, STAT_META, type PlayerState, type OwnedItem } from '@core/player'
import { STAT_LABEL, type StatKey } from '@data/items'
import { CHARACTER_VISUALS, type CharacterVisualDef } from '@data/characters'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface Opts {
  field: FieldDef
  encounter: string[]
  onWin: () => void
  player?: PlayerState
  tables?: Tables
  hpMult?: number
  atkMult?: number
}

type Mood = 'attack' | 'guard' | 'heal' | 'gamble' | 'sacrifice' | 'buff'
const STAT_ORDER: StatKey[] = ['atk', 'guard', 'heal', 'luck']

export class BattleView {
  private t: Tables = TABLES
  private field: FieldDef
  private onWin: () => void
  private player: PlayerState
  private state: BattleState
  private sel: Selection = {}
  private slotIndex = 0
  private target = 0
  private busy = false
  private over = false
  private bagMode = false
  private timers: number[] = []
  private hand: Record<string, Word[]> = {} // 슬롯별로 이번 턴에 보이는 단어(최대 3)

  constructor(private root: HTMLElement, opts: Opts) {
    this.field = opts.field
    this.onWin = opts.onWin
    this.t = opts.tables ?? TABLES
    this.player = opts.player ?? defaultPlayer()
    const atkMult = opts.atkMult ?? this.field.enemyAtkMult ?? 1
    const enemies = opts.encounter.map((id) => makeEnemy(ENEMIES[id], atkMult, opts.hpMult ?? 1))
    // 체력 스탯 = 최대 체력.
    const maxHp = this.player.stats.hp
    this.state = { playerHp: maxHp, playerMax: maxHp, guard: 0, turn: 1, enemies, pending: null }
    this.target = aliveIdx(this.state)[0] ?? 0
    this.mount()
  }

  destroy() {
    this.timers.forEach((t) => clearTimeout(t))
  }

  private mount() {
    this.root.innerHTML = `
      <div class="scene battle" data-weather="${this.field.weather}" style="background-image:url(${BACKGROUNDS.bg001})">
        <div class="vignette"></div>
        <div class="weather-wash"></div>

        <div class="hud-top">
          <div class="hud-date" id="f-date"></div>
          <div class="hud-title glass"><div class="t" id="f-title"></div><div class="s" id="f-desc"></div></div>
          <div class="hud-weather"><span id="f-weather"></span></div>
        </div>
        <div class="turn-badge glass">턴 <b id="turn">1</b></div>

        <div class="stage-area" id="pbox">
          <div class="chain-rail" id="chain"></div>
          <div class="combo-flash" id="combo"></div>
          <div class="flash" id="flash"></div>
          <div id="actors"></div>
          <button class="backpack" id="bag" title="가방">${icon('backpack')}<span>가방</span></button>
          <div class="effect-log" id="log"></div>
        </div>

        <div class="word-zone">
          <div class="pane-stack">
            <div class="pane words">
              <div class="slot-step" id="steps"></div>
              <div class="word-row" id="grid"></div>
            </div>
            <div class="pane bag">
              <div class="bag-row" id="bagrow"></div>
            </div>
          </div>
          <button class="undo-btn" id="undo">되돌리기</button>
        </div>

        <div class="stat-dock glass">
          <div class="dock-title">우비 아이</div>
          <div class="stat-list" id="stats"></div>
          <button class="wordbook-btn" id="deck-btn">${icon('book')}<span>단어장</span></button>
        </div>

        <div class="info-dock glass empty" id="detail"></div>

        <div id="overlay"></div>
      </div>`

    this.q('#f-date').textContent = this.field.date
    this.q('#f-title').textContent = this.field.title
    this.q('#f-desc').textContent = this.field.desc.replace(/<[^>]+>/g, '')
    this.q('#f-weather').innerHTML = weatherIcon(this.field.weather)

    this.q('#undo').addEventListener('click', () => this.undo())
    this.q('#bag').addEventListener('click', () => this.toggleBag())
    this.q('#deck-btn').addEventListener('click', () => this.openDeck())

    this.drawHand()
    this.renderActors()
    this.renderChain()
    this.renderWords()
    this.renderStats()
    this.renderBag()
  }

  // 한 턴에 슬롯당 최대 3개만 보여준다(많아도 3가지). 매 턴 새로 뽑는다.
  private drawHand() {
    for (const s of this.t.template.slots) {
      const pool = this.t.words[s.key] ?? []
      if (pool.length <= 3) {
        this.hand[s.key] = [...pool]
        continue
      }
      const bag = [...pool]
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[bag[i], bag[j]] = [bag[j], bag[i]]
      }
      this.hand[s.key] = bag.slice(0, 3)
    }
  }

  private q<T extends HTMLElement = HTMLElement>(sel: string): T {
    return this.root.querySelector(sel) as T
  }
  private order() {
    return this.t.template.slots.map((s) => s.key)
  }
  private filledCount() {
    return this.order().filter((k) => this.sel[k]).length
  }

  // 단어 효과별 무드(색) 분류.
  private moodOf(w: Word): Mood {
    if (w.variance) return 'gamble'
    if (w.kind === 'heal' || w.effects?.heal) return 'heal'
    if (w.kind === 'guard' || w.effects?.guard) return 'guard'
    if (w.kind === 'attack' || (w.power ?? 0) > 0) return 'attack'
    if (w.effects?.recoil) return 'sacrifice'
    return 'buff'
  }

  // ── 배우 — 적은 "레일 대기열": 최전방만 선명·전투 참여, 뒷줄은 흐릿·대기 ──
  private renderActors() {
    const host = this.q('#actors')
    const s = this.state
    const alive = aliveIdx(s) // 살아있는 적 인덱스(앞→뒤)
    // 전투 대상은 항상 최전방.
    this.target = frontIdx(s)

    // rank 0 = 최전방(플레이어와 가장 가까움). 뒤로 갈수록 축소·블러·감광.
    const FRONT_RIGHT = 660
    const GAP = 235
    const enemyHtml = s.enemies
      .map((e, i) => {
        if (e.dead) return ''
        const rank = alive.indexOf(i)
        const right = FRONT_RIGHT - rank * GAP
        const scale = Math.max(0.6, 1 - rank * 0.16)
        const blur = rank * 2.6
        const op = Math.max(0.42, 1 - rank * 0.26)
        const front = rank === 0
        const pct = Math.max(0, (e.hp / e.maxHp) * 100)
        const visual = CHARACTER_VISUALS[e.def.id as 'moth' | 'roach']
        return `
        <div class="actor foe ${front ? 'front target' : 'back'}" data-i="${i}" data-character="${visual.id}"
          role="button" tabindex="0" aria-label="${e.def.name} 상세 보기"
          style="right:${right}px; opacity:${op.toFixed(2)}; --model-scale:${scale.toFixed(2)}; --model-blur:${blur.toFixed(1)}px;">
          ${front
            ? `<div class="nameplate glass">
                 <div class="row"><span class="nm">${e.def.name}</span><span class="hpn">${Math.max(0, e.hp)}/${e.maxHp}</span></div>
                 <div class="hpbar foe"><div class="fill" style="width:${pct}%"></div></div>
               </div>`
            : ''}
          <div class="shadow"></div>
          <div class="model-shell" data-model-status="fallback-2d"><img class="battle-sprite" src="${visual.portrait2d}" alt="${e.def.name}"></div>
          ${front ? '<span class="inspect-hint">클릭해서 상세 보기</span>' : ''}
        </div>`
      })
      .join('')

    const php = Math.max(0, (s.playerHp / s.playerMax) * 100)
    host.innerHTML = `
      <div class="actor you" data-character="player" role="button" tabindex="0" aria-label="우비 아이 상세 보기">
        <div class="nameplate glass">
          <div class="row"><span class="nm">우비 아이</span><span class="hpn">${Math.max(0, s.playerHp)}/${s.playerMax} ${s.guard ? `<span class="shield-chip">◈${s.guard}</span>` : ''}</span></div>
          <div class="hpbar you"><div class="fill" style="width:${php}%"></div></div>
        </div>
        <div class="shadow"></div>
        <div class="model-shell" data-model-status="fallback-2d"><img class="battle-sprite" src="${CHARACTER_VISUALS.player.portrait2d}" alt="우비 아이"></div>
        <span class="inspect-hint">클릭해서 상세 보기</span>
      </div>
      ${enemyHtml}`

    host.querySelectorAll<HTMLElement>('.actor[role="button"]').forEach((actor) => {
      const open = () => {
        const id = actor.dataset.character as CharacterVisualDef['id']
        this.openCharacterDetail(id, actor.dataset.i == null ? null : Number(actor.dataset.i))
      }
      actor.addEventListener('click', open)
      actor.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          open()
        }
      })
    })
  }

  // 모델이 준비되기 전 전장은 2D 대체 스프라이트를 쓰며, 상세도 같은 매핑을 따른다.
  private openCharacterDetail(id: CharacterVisualDef['id'], enemyIndex: number | null) {
    const visual = CHARACTER_VISUALS[id]
    const host = this.q('#overlay')
    let stats: string
    if (id === 'player') {
      const p = this.player.stats
      stats = [
        ['체력', `${Math.max(0, this.state.playerHp)} / ${this.state.playerMax}`],
        ['공격', String(p.atk)],
        ['방어', String(p.guard)],
        ['회복', String(p.heal)],
        ['운', String(p.luck)],
      ].map(([label, value]) => `<div><span>${label}</span><b>${value}</b></div>`).join('')
    } else {
      const enemy = enemyIndex == null ? null : this.state.enemies[enemyIndex]
      stats = enemy
        ? [
            ['체력', `${Math.max(0, enemy.hp)} / ${enemy.maxHp}`],
            ['공격', String(Math.round(enemy.def.atk * enemy.atkMult))],
            ['행동 주기', `${enemy.def.every}턴`],
          ].map(([label, value]) => `<div><span>${label}</span><b>${value}</b></div>`).join('')
        : ''
    }
    host.innerHTML = `
      <div class="ov-backdrop"></div>
      <article class="character-card glass" aria-modal="true" role="dialog" aria-label="${visual.name} 상세 정보">
        <button class="ov-close character-close" id="character-x" aria-label="닫기">${icon('close')}</button>
        <div class="character-portrait"><img src="${visual.portrait2d}" alt="${visual.name} 2D 스프라이트"></div>
        <div class="character-copy">
          <div class="character-kicker">3D MODEL ↔ 2D SPRITE</div>
          <h2>${visual.name}</h2>
          <h3>${visual.title}</h3>
          <p>${visual.description}</p>
          <div class="character-stats">${stats}</div>
          ${id === 'player' ? '<div class="character-note">문장을 조립해 이야기를 올바른 방향으로 이끈다.</div>' : `<div class="character-note">${this.state.enemies[enemyIndex ?? 0]?.def.note ?? ''}</div>`}
        </div>
      </article>`
    host.classList.add('open')
    const close = () => this.closeOverlay()
    host.querySelector('#character-x')?.addEventListener('click', close)
    host.querySelector('.ov-backdrop')?.addEventListener('click', close)
  }

  // ── 상단 발광 체인(문장) + 맥락/어긋남 미리보기 ──
  private renderChain() {
    const host = this.q('#chain')
    const toks = sentenceTokens(this.sel, this.t)
    const order = this.order()
    const anyPicked = order.some((k) => this.sel[k])
    const words = order
      .map((k, i) => (this.sel[k] ? `<span class="chain-word" data-i="${i}">${toks[i]}</span>` : ''))
      .join('')
    let extra = ''
    if (anyPicked) {
      const combos = matchCombos(this.sel, this.t.combos, order)
      if (combos.length) extra += `<span class="chain-combo">${combos.map((c) => `「${c.name}」×${c.mult}`).join(' ')}</span>`
      // 부조화(어긋난 맥락) 경고 — 위력이 깎인다는 걸 실행 전에 보여준다.
      const intent = compile(this.sel, this.t)
      if (intent.penalties.length) {
        extra += `<span class="chain-penalty">⚠ 어긋남 ×${intent.coherence.toFixed(2)} · ${intent.penalties[0]}</span>`
      }
    }
    host.innerHTML = words + extra
  }

  // ── 중앙 하단: 슬롯 스텝 + 가로 단어 ──
  private renderWords() {
    this.q('#steps').innerHTML = this.t.template.slots
      .map((s, i) => {
        const key = s.key
        const cls = i === this.slotIndex ? 'active' : this.sel[key] ? 'done' : ''
        return `<button class="step ${cls}" data-i="${i}"><b>${i + 1}</b> ${s.label}</button>`
      })
      .join('<span class="sep">·</span>')
    this.q('#steps')
      .querySelectorAll<HTMLElement>('.step')
      .forEach((st) =>
        st.addEventListener('click', () => {
          const i = Number(st.dataset.i)
          if (i <= this.filledCount()) this.setSlot(i)
        }),
      )

    const key = this.order()[this.slotIndex]
    // 손패(최대 3). 이미 고른 단어가 손패에 없으면 포함시켜 표시가 어긋나지 않게.
    const words = [...(this.hand[key] ?? this.t.words[key] ?? [])]
    const chosen = this.sel[key]
    if (chosen && !words.some((w) => w.id === chosen.id)) words.unshift(chosen)
    const grid = this.q('#grid')
    grid.innerHTML = words
      .map((w) => {
        const why = conflictReason(w, this.slotIndex, this.sel, this.t)
        const picked = this.sel[key]?.id === w.id
        const cls = ['word-cell', `mood-${this.moodOf(w)}`, picked ? 'picked' : '', why ? 'blocked' : ''].join(' ')
        return `<button class="${cls}" data-id="${w.id}">
          <span class="w">${w.text}</span>
          <span class="n">${why ?? w.note}</span>
        </button>`
      })
      .join('')

    grid.querySelectorAll<HTMLElement>('.word-cell').forEach((btn) => {
      const w = words.find((x) => x.id === btn.dataset.id)!
      btn.addEventListener('mouseenter', () => this.renderDetail(w))
      btn.addEventListener('mouseleave', () => this.renderDetail(null))
      btn.addEventListener('click', () => {
        if (btn.classList.contains('blocked') || this.busy || this.over) return
        this.pick(btn.dataset.id!)
      })
    })
    if (!this.bagMode) this.renderDetail(null)
  }

  // ── 우측 정보 패널 ──
  // 이 단어의 고유 효과(작게) + 이 단어를 문장에 넣었을 때의 "최종 적용 수치"를
  // 단계별로 보여준다: 이 단어가 더하는 값(적용) + 현재 문장 총합(최종).
  private renderDetail(word: Word | null) {
    const detail = this.q('#detail')
    const key = this.order()[this.slotIndex]
    const w = word ?? this.sel[key] ?? null
    if (!w) {
      detail.className = 'info-dock glass empty'
      detail.innerHTML = '단어에 마우스를 올리면<br>등급 · 범위 · 최종 적용 수치가 여기 표시된다.'
      return
    }
    const rarity = w.rarity ?? 'common'
    const slotLabel = this.t.template.slots.find((s) => s.key === w.slot)?.label ?? ''
    const mood = this.moodOf(w)
    const values = this.wordOwnValues(w)
    // 현재 문장에 이 단어를 끼우면 맥락이 어긋나는지 미리 경고(실행 전 학습).
    const trial: Selection = { ...this.sel, [w.slot]: w }
    const intent = compile(trial, this.t)
    const warn = intent.penalties.length
      ? `<div class="wd-warn">⚠ ${intent.penalties[0]} · 위력 ×${intent.coherence.toFixed(2)}</div>`
      : ''

    detail.className = `info-dock glass mood-${mood}`
    detail.innerHTML = `
      <div class="wd-name">${w.text}</div>
      <div class="wd-grade">✦ ${RARITY_LABEL[rarity]} · ${slotLabel} · 범위 ${this.wordRange(w)}</div>
      ${this.projectionHtml(w)}
      <div class="wd-values">${values.map((v) => `<div class="v ${v.cls}">${v.text}</div>`).join('')}</div>
      ${warn}`
  }

  // 이 문장(현재 선택 + 이 단어)이 실제 발동될 때의 최종 수치 — execute()와 동일 계산.
  private projectFinal(sel: Selection): { dmg: number; heal: number; guard: number; self: number; multiplier: number } {
    const intent = compile(sel, this.t)
    let guard = intent.guard
    let heal = intent.heal
    if (guard > 0) guard += this.player.stats.guard
    if (heal > 0) heal += this.player.stats.heal
    const atk = this.player.stats.atk
    const effBase = intent.kind === 'heal' ? 0 : intent.base + atk
    const dmg = intent.kind === 'heal' ? 0 : Math.round(effBase * intent.multiplier)
    if (intent.targetMode === 'both') return { dmg, heal, guard, self: intent.recoil + Math.round(dmg * 0.4), multiplier: intent.multiplier }
    return { dmg, heal, guard, self: intent.recoil, multiplier: intent.multiplier }
  }

  // "적용(이 단어가 더하는 값) · 최종(현재 문장 총합)" 프로젝션 블록.
  private projectionHtml(w: Word): string {
    const base: Selection = { ...this.sel }
    delete base[w.slot]
    const now = this.projectFinal({ ...this.sel, [w.slot]: w })
    const prev = this.projectFinal(base)
    const metrics: { key: 'dmg' | 'heal' | 'guard' | 'self'; label: string }[] = [
      { key: 'dmg', label: '피해' },
      { key: 'heal', label: '회복' },
      { key: 'guard', label: '방어' },
      { key: 'self', label: '자해' },
    ]
    const rows = metrics
      .filter((m) => now[m.key] > 0 || (m.key === 'dmg' && prev.dmg > 0))
      .map((m) => {
        const delta = now[m.key] - prev[m.key]
        const sign = delta > 0 ? '+' : delta < 0 ? '' : '±'
        const dcls = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
        return `<div class="pj-row ${m.key}">
          <span class="pj-l">${m.label}</span>
          <span class="pj-d ${dcls}">${sign}${delta}</span>
          <span class="pj-f">${now[m.key]}</span>
        </div>`
      })
      .join('')
    if (!rows) return '' // 순수 보정 단어(회피/지연 등)는 프로젝션 없이 고유 효과만
    const multLine = now.multiplier !== 1 ? `<span class="pj-mult">위력 ×${now.multiplier.toFixed(2)}</span>` : ''
    return `<div class="wd-proj">
      <div class="pj-head"><span>이 단어 적용</span><span>문장 최종</span>${multLine}</div>
      <div class="pj-rows">${rows}</div>
    </div>`
  }

  // 단어 하나의 범위(대상) — 다른 슬롯과 무관.
  private wordRange(w: Word): string {
    if (w.kind === 'heal') return '자신'
    if (w.aoe === 'all') return w.targetMode === 'both' ? '적 전체 + 자신' : '적 전체'
    if (w.targetMode === 'both') return '적 하나 + 자신'
    if (w.targetMode === 'enemy' || w.kind === 'attack' || (w.power ?? 0) > 0) return '적 하나'
    return '문장 보정'
  }

  // 단어 하나의 고유 수치 — 누적하지 않는다.
  private wordOwnValues(w: Word): { text: string; cls: string }[] {
    const out: { text: string; cls: string }[] = []
    if (w.power) out.push({ text: `기본 위력 +${w.power}`, cls: 'dmg' })
    if (w.kind === 'attack' && !w.power) out.push({ text: '적을 공격', cls: 'dmg' })
    if (w.bonus) out.push({ text: `위력 배수 ${w.bonus >= 0 ? '+' : ''}${Math.round(w.bonus * 100)}%`, cls: 'buff' })
    if (w.effects?.guard) out.push({ text: `방어(임시 체력) ${w.effects.guard >= 0 ? '+' : ''}${w.effects.guard}`, cls: 'guard' })
    if (w.effects?.heal) out.push({ text: `회복 +${w.effects.heal}`, cls: 'heal' })
    if (w.effects?.recoil) out.push({ text: `자해 ${w.effects.recoil}`, cls: 'self' })
    if (w.effects?.evade) out.push({ text: `회피 +${w.effects.evade}`, cls: 'guard' })
    if (w.variance) out.push({ text: `도박 ${Math.round(w.variance.p * 100)}%: ×${w.variance.hi} / ×${w.variance.lo}`, cls: 'buff' })
    if (w.timing === 'delayed') out.push({ text: '다음 턴에 발동', cls: '' })
    if (w.aoe === 'all') out.push({ text: '적 전체 적중', cls: 'dmg' })
    if (w.targetMode === 'both') out.push({ text: '피해 40% 나에게 되돌아옴', cls: 'self' })
    if (!out.length) out.push({ text: w.note, cls: '' })
    return out
  }

  // ── 우측 스탯표 ──
  private renderStats() {
    this.q('#stats').innerHTML = STAT_META.map(
      (m) => `<div class="stat" title="${m.desc}">
        <span class="si">${icon(m.icon)}</span>
        <span class="sl">${m.label}</span>
        <span class="sv">${this.player.stats[m.key]}</span>
      </div>`,
    ).join('')
  }

  // ── 가방(아이템) — 하단 인라인 토글 ──
  private renderBag() {
    const row = this.q('#bagrow')
    if (!this.player.items.length) {
      row.innerHTML = `<div class="bag-empty">가방이 비었다.</div>`
      return
    }
    row.innerHTML = this.player.items
      .map(
        (it, i) => `<button class="bag-item" data-i="${i}">
        <div class="bag-art">${itemArt(it.art)}</div>
        <div class="bag-name">${it.name}</div>
      </button>`,
      )
      .join('')
    row.querySelectorAll<HTMLElement>('.bag-item').forEach((btn) => {
      const it = this.player.items[Number(btn.dataset.i)]
      btn.addEventListener('mouseenter', () => this.renderItemDetail(it))
      btn.addEventListener('mouseleave', () => this.renderItemDetail(null))
    })
  }

  private toggleBag() {
    this.bagMode = !this.bagMode
    this.q('.word-zone').classList.toggle('bag-mode', this.bagMode)
    this.q('#bag').classList.toggle('active', this.bagMode)
    this.renderItemDetail(null)
    if (!this.bagMode) this.renderDetail(null)
  }

  // 우측 정보 패널에 아이템 정보(스탯표 + 일러스트).
  private renderItemDetail(item: OwnedItem | null) {
    const detail = this.q('#detail')
    if (!item) {
      detail.className = 'info-dock glass empty'
      detail.innerHTML = this.bagMode
        ? '아이템에 마우스를 올리면<br>스탯과 일러스트가 여기 표시된다.'
        : '단어에 마우스를 올리면<br>등급 · 범위 · 수치가 여기 표시된다.'
      return
    }
    const rows = STAT_ORDER.filter((k) => item.stats[k])
      .map((k) => `<div class="idrow"><span>${STAT_LABEL[k]}</span><span class="iv">+${item.stats[k]}</span></div>`)
      .join('')
    detail.className = 'info-dock glass item-detail'
    detail.innerHTML = `
      <div class="wd-name">${item.name}</div>
      <div class="wd-grade">✦ ${item.grade} · 「${item.line}」</div>
      <div class="id-stats">${rows}</div>
      <div class="id-art">${itemArt(item.art)}</div>`
  }

  // ── 단어장(전체 덱) 오버레이 ──
  private openDeck() {
    const host = this.q('#overlay')
    const slots = this.t.template.slots
    host.innerHTML = `
      <div class="ov-backdrop"></div>
      <div class="ov-panel glass deck-panel">
        <div class="ov-head"><div class="ov-title">${icon('book')} 단어장</div><button class="ov-close" id="ov-x">${icon('close')}</button></div>
        <div class="deck-cols">
          ${slots
            .map(
              (s, i) => `<div class="deck-col">
              <div class="deck-col-h"><b>${i + 1}</b> ${s.label}</div>
              ${(this.player.deck[s.key] ?? [])
                .map(
                  (w) => `<div class="deck-word mood-${this.moodOf(w)}">
                    <span class="dw">${w.text}</span><span class="dn">${w.note}</span>
                  </div>`,
                )
                .join('')}
            </div>`,
            )
            .join('')}
        </div>
      </div>`
    host.classList.add('open')
    const close = () => this.closeOverlay()
    host.querySelector('#ov-x')!.addEventListener('click', close)
    host.querySelector('.ov-backdrop')!.addEventListener('click', close)
  }
  private closeOverlay() {
    const host = this.q('#overlay')
    host.classList.remove('open')
    host.innerHTML = ''
  }

  private setSlot(i: number) {
    this.slotIndex = Math.max(0, Math.min(i, this.order().length - 1))
    this.renderWords()
  }

  private pick(id: string) {
    const key = this.order()[this.slotIndex]
    const w = this.t.words[key].find((x) => x.id === id)!
    this.sel = { ...this.sel, [key]: w }
    this.sel = pruneConflicts(this.sel, this.slotIndex, this.t)
    const order = this.order()
    let next = this.slotIndex + 1
    while (next < order.length && this.sel[order[next]]) next++
    this.slotIndex = Math.min(next, order.length - 1)
    this.renderChain()
    this.renderWords()
    // 전부 채우면 자동 완성(반짝 → 발동)
    if (this.complete() && !this.busy && !this.over) void this.autoComplete()
  }

  // 한 단계 되돌리기 — 마지막으로 채운 단어만 제거.
  private undo() {
    if (this.busy || this.over) return
    const order = this.order()
    for (let i = order.length - 1; i >= 0; i--) {
      if (this.sel[order[i]]) {
        const next = { ...this.sel }
        delete next[order[i]]
        this.sel = next
        this.slotIndex = i
        break
      }
    }
    this.renderChain()
    this.renderWords()
  }

  private complete(): boolean {
    return this.order().every((k) => !!this.sel[k])
  }

  private async autoComplete() {
    const rail = this.q('#chain')
    rail.classList.add('sparkle')
    await sleep(300)
    rail.classList.remove('sparkle')
    await this.execute()
  }

  // 단어 하나가 문장 위로 톡 튀길 기여 수치.
  private contribOf(w: Word): { text: string; cls: string } | null {
    if (w.power) return { text: `+${w.power}`, cls: w.kind === 'heal' ? 'heal' : w.kind === 'guard' ? 'guard' : 'dmg' }
    if (w.bonus) return { text: `×${(1 + w.bonus).toFixed(1)}`, cls: 'buff' }
    if (w.effects?.guard) return { text: `방어+${w.effects.guard}`, cls: 'guard' }
    if (w.effects?.heal) return { text: `+${w.effects.heal}`, cls: 'heal' }
    return null
  }

  // ── 발동: 팅팅팅(기여 수치) → 맥락 → 총합 롤업 → 돌진·사각 블라스트로 꽂힘 ──
  private async execute() {
    if (!this.complete() || this.busy || this.over) return
    this.busy = true

    const order = this.order()
    const intent = compile(this.sel, this.t)
    // 스탯 = 효과 "수치" 상승(개수 아님). 방어/회복 값에 가산, 공격은 atkBonus로.
    if (intent.guard > 0) intent.guard += this.player.stats.guard
    if (intent.heal > 0) intent.heal += this.player.stats.heal
    const atk = this.player.stats.atk
    const effBase = intent.kind === 'heal' ? 0 : intent.base + atk
    const dmg = Math.round(effBase * intent.multiplier)
    const heal = intent.heal

    // 1) 팅팅팅 — 각 단어의 기여 수치가 문장 위로 톡톡 튄다
    const chainEls = Array.from(this.q('#chain').querySelectorAll<HTMLElement>('.chain-word'))
    for (let i = 0; i < order.length; i++) {
      const w = this.sel[order[i]]
      const c = w ? this.contribOf(w) : null
      const el = chainEls[i]
      if (el) el.classList.add('wave')
      if (c && el) this.popEl(el, c.text, `tick ${c.cls}`)
      await sleep(95)
    }
    this.q('#flash').classList.add('go')
    await sleep(150)

    // 2) 맥락(관용구) 발동 배너
    if (intent.combos.length) {
      const combos = matchCombos(this.sel, this.t.combos, order)
      const mult = combos.reduce((m, c) => m * c.mult, 1)
      const el = this.q('#combo')
      el.innerHTML = `<div class="kicker">맥락 발동</div><div class="name">${intent.combos.join(' · ')}</div><div class="mult">위력 ×${mult.toFixed(1)}</div>`
      el.classList.remove('show')
      void el.offsetWidth
      el.classList.add('show')
      await sleep(760)
    }

    // 3) 총합이 띠리리릭 차오른다
    const totalVal = dmg > 0 ? dmg : heal
    if (totalVal > 0) await this.rollTotal(totalVal, dmg > 0 ? 'dmg' : 'heal')

    // 4) 실제 발동 + 꽂힘 연출
    const startFront = frontIdx(this.state)
    const res = applyIntent(this.state, intent, this.t.multCap, this.target, Math.random, atk)
    await this.strike(res)
    this.log(
      res.text +
        (res.combos.length ? ` · ${res.combos.join(', ')}` : '') +
        (intent.penalties.length ? ` · 어긋남 ×${intent.coherence.toFixed(2)}` : ''),
    )
    this.renderActors()

    // 초과 피해(오버플로우): 앞 적을 넘겼으면 활활 타오르다 다음 적이 당겨오면 꽂힌다.
    if (res.overflow > 0 && !allDead(this.state)) await this.resolveOverflow(res.overflow)

    if (allDead(this.state)) {
      this.over = true
      this.log('마지막 벌레가 책장 밖으로 떨어졌다.')
      await sleep(800)
      this.onWin()
      return
    }

    // 5) 적 턴 — 방금 최전방으로 도착한 적은 이번 턴 공격 유예(부조리 방지)
    this.state.turn++
    this.q('#turn').textContent = String(this.state.turn)
    const grace = frontIdx(this.state) !== startFront
    await this.enemyPhase(grace)

    if (this.state.pending) {
      const p = this.state.pending
      const targets = p.aoe ? aliveIdx(this.state) : [p.target]
      const killed: number[] = []
      for (const ti of targets) {
        const e = this.state.enemies[ti]
        if (!e || e.dead) continue
        e.hp -= p.dmg
        const el = this.q(`#actors .actor.foe[data-i="${ti}"]`)
        if (el) SquareBurst.playOn(el, 'damage', { spread: 100 })
        this.popAt(ti, `${p.dmg}`, 'dmg big')
        if (e.hp <= 0) {
          e.dead = true
          killed.push(ti)
        }
      }
      this.log(`예약된 문장 발동 → ${p.dmg} 피해`)
      this.state.pending = null
      await sleep(300)
      for (const k of killed) await this.playDeath(k, 1)
      this.renderActors()
    }

    if (this.state.playerHp <= 0) {
      this.over = true
      this.log('일기장이 너무 상했다… (패배)')
    } else if (allDead(this.state)) {
      this.over = true
      await sleep(500)
      this.onWin()
      return
    }

    this.sel = {}
    this.slotIndex = 0
    this.busy = false
    this.drawHand()
    this.renderChain()
    this.renderWords()
  }

  // 플레이어 공격/방어/회복 꽂힘 — 공격이면 돌진, 방어/회복/자해는 플레이어에게 날아가 꽂힘.
  private async strike(res: {
    hits: { target: number; dmg: number }[]
    selfDmg: number
    heal: number
    guardGain: number
    killed: number[]
  }) {
    const you = this.q<HTMLElement>('.actor.you')
    const attacking = res.hits.length > 0
    if (attacking) you.classList.add('lunge')
    await sleep(attacking ? 170 : 40)

    for (const h of res.hits) {
      const el = this.q<HTMLElement>(`#actors .actor.foe[data-i="${h.target}"]`)
      if (el) {
        SquareBurst.playOn(el, 'damage', { spread: 120 })
        this.hitOne(el)
      }
      this.popAt(h.target, `${h.dmg}`, 'dmg big')
    }
    if (attacking) {
      await sleep(250)
      you.classList.remove('lunge')
    }
    // 방어/회복/자해 수치도 플레이어에게 각각 날아가 꽂힌다.
    if (res.selfDmg) await this.flyToPlayer(`${res.selfDmg}`, 'self', 'self')
    if (res.heal) await this.flyToPlayer(`+${res.heal}`, 'heal', 'heal')
    if (res.guardGain > 0) await this.flyToPlayer(`방어+${res.guardGain}`, 'guard', 'guard')
    // 처치된 적은 레일이 당겨지기 전에 카드가 쓰러지며 회색으로 소멸.
    for (const k of res.killed) await this.playDeath(k, 1)
  }

  // 적 사망 연출 — 카드가 살짝 젖혀졌다 옆으로 쓰러지고, 회색으로 변하며 소멸.
  // combo가 높을수록 튀는 불꽃이 많아 관통 콤보의 화려함이 커진다.
  private async playDeath(idx: number, combo = 1): Promise<void> {
    const el = this.q<HTMLElement>(`#actors .actor.foe[data-i="${idx}"]`)
    if (!el) return
    el.classList.remove('lunge')
    el.classList.add('dying')
    this.spawnSparks(el, 8 + combo * 5)
    await sleep(560)
  }

  // 불꽃 파편 — 지정 배우 근처에서 사방으로 튀며 사그라든다.
  private spawnSparks(el: HTMLElement, count: number) {
    const pbox = this.q('#pbox')
    const r = this.toStage(el.getBoundingClientRect())
    const cx = r.x
    const cy = r.y + 150 // 스프라이트 몸통 근처
    for (let i = 0; i < count; i++) {
      const s = document.createElement('div')
      s.className = 'spark'
      s.style.left = `${cx}px`
      s.style.top = `${cy}px`
      pbox.appendChild(s)
      const ang = Math.random() * Math.PI * 2
      const dist = 60 + Math.random() * 150
      const dx = Math.cos(ang) * dist
      const dy = Math.sin(ang) * dist - 50 // 살짝 위로 솟구쳤다 흩어짐
      const dur = 420 + Math.random() * 380
      s.animate(
        [
          { transform: 'translate(0,0) scale(1)', opacity: 1 },
          { transform: `translate(${dx.toFixed(0)}px, ${dy.toFixed(0)}px) scale(0.15)`, opacity: 0 },
        ],
        { duration: dur, easing: 'cubic-bezier(0.2,0.7,0.3,1)' },
      )
      this.timers.push(window.setTimeout(() => s.remove(), dur + 60))
    }
  }

  // 관통 콤보 배지 — "관통 ×N". 콤보가 오를수록 크고 뜨겁게.
  private showComboBadge(combo: number) {
    if (combo < 2) return
    const b = document.createElement('div')
    b.className = 'combo-badge'
    b.style.setProperty('--cb', String(Math.min(combo, 6)))
    b.innerHTML = `<span class="cb-x">관통</span><span class="cb-n">×${combo}</span>`
    this.q('#pbox').appendChild(b)
    this.timers.push(window.setTimeout(() => b.remove(), 900))
  }

  // 화면 흔들림 — 관통이 깊을수록 강하게(0~1).
  private shakeStage(intensity: number) {
    if (intensity <= 0) return
    const px = 5 + intensity * 13
    this.q('#pbox').animate(
      [
        { transform: 'translate(0,0)' },
        { transform: `translate(${px.toFixed(0)}px, ${(-px * 0.5).toFixed(0)}px)` },
        { transform: `translate(${(-px * 0.8).toFixed(0)}px, ${(px * 0.4).toFixed(0)}px)` },
        { transform: 'translate(0,0)' },
      ],
      { duration: 230, easing: 'ease-out' },
    )
  }

  // 오버플로우 — 초과 피해가 꼬챙이처럼 다음 적을 깊게 관통한다(빠바바박).
  // 한 마리씩 쓰러질수록 콤보가 오르고 불꽃·흔들림·배지가 점점 화려해진다.
  private async resolveOverflow(overflow: number) {
    let combo = 1 // strike의 첫 처치가 콤보 1. 관통마다 +1.
    while (overflow > 0 && !allDead(this.state)) {
      this.renderActors() // 다음 적이 최전방으로 당겨온다
      const front = frontIdx(this.state)
      if (front < 0) break
      combo++
      const el = this.q<HTMLElement>(`#actors .actor.foe[data-i="${front}"]`)
      const ember = this.showEmber(overflow, combo)
      // 콤보가 오를수록 대기가 짧아져 관통이 빨라진다(빠·바·바·박).
      await sleep(Math.max(200, 480 - combo * 66))
      const e = this.state.enemies[front]
      const before = e.hp
      e.hp -= overflow
      // 깊고 화려한 관통 — 콤보에 따라 블라스트/불꽃/흔들림이 커진다.
      ember.classList.add('stab')
      this.showComboBadge(combo)
      if (el) {
        SquareBurst.playOn(el, 'damage', { spread: 120 + combo * 46 })
        this.hitOne(el)
        this.spawnSparks(el, 6 + combo * 4)
      }
      this.shakeStage(Math.min(1, combo / 5))
      this.popAt(front, `${overflow}`, 'dmg big')
      this.timers.push(window.setTimeout(() => ember.remove(), 220))
      // 또 넘겼으면 카드가 쓰러진 뒤 남은 초과 피해가 다음 적으로 연쇄된다.
      if (e.hp <= 0) {
        e.dead = true
        await this.playDeath(front, combo)
        overflow = overflow - before
      } else {
        overflow = 0
        await sleep(320)
      }
    }
    this.renderActors()
  }

  // 중앙에서 타오르는 초과 피해 숫자. 콤보가 높으면 더 뜨겁게 빛난다.
  private showEmber(n: number, combo = 1): HTMLElement {
    const el = document.createElement('div')
    el.className = 'ember-num' + (combo >= 3 ? ' hot' : '')
    el.textContent = String(n)
    this.q('#pbox').appendChild(el)
    return el
  }

  // 수치가 중앙에서 플레이어에게 날아가 꽂힌다.
  private async flyToPlayer(text: string, cls: string, theme: 'self' | 'heal' | 'guard') {
    const pboxEl = this.q('#pbox')
    const you = this.q<HTMLElement>('.actor.you')
    const to = this.toStage(you.getBoundingClientRect())
    const fx = pboxEl.offsetWidth / 2
    const fy = pboxEl.offsetHeight * 0.5
    const p = document.createElement('div')
    p.className = `pop ${cls} big`
    p.textContent = text
    p.style.left = `${fx - 24}px`
    p.style.top = `${fy}px`
    p.style.animation = 'none'
    pboxEl.appendChild(p)
    await p.animate(
      [
        { transform: 'translate(0,0) scale(0.6)', opacity: 0 },
        { transform: 'translate(0,0) scale(1.15)', opacity: 1, offset: 0.22 },
        { transform: `translate(${to.x - fx}px, ${to.y + 40 - fy}px) scale(1)`, opacity: 1, offset: 0.85 },
        { transform: `translate(${to.x - fx}px, ${to.y + 40 - fy}px) scale(0.7)`, opacity: 0 },
      ],
      { duration: 520, easing: 'cubic-bezier(0.4,0,0.3,1)' },
    ).finished
    SquareBurst.playOn(you, theme, { spread: 95 })
    this.hitOne(you)
    p.remove()
  }

  // 적 턴 연출 — 최전방 적이 돌진해 플레이어에게 사각 블라스트.
  private async enemyPhase(skipFront = false) {
    for (const st of enemyTurn(this.state, Math.random, skipFront)) {
      const foe = this.q<HTMLElement>(`#actors .actor.foe[data-i="${st.idx}"]`)
      if (st.dealt <= 0) {
        this.log(st.text)
        continue
      }
      foe?.classList.add('lunge')
      await sleep(170)
      const you = this.q<HTMLElement>('.actor.you')
      SquareBurst.playOn(you, 'damage', { spread: 100 })
      this.hitOne(you)
      this.popPlayer(`${st.dealt}`, 'dmg big')
      this.log(st.text)
      await sleep(240)
      foe?.classList.remove('lunge')
    }
    this.renderActors()
  }

  // 중앙 총합 카운트업(띠리리릭).
  private async rollTotal(val: number, cls: string) {
    const host = this.q('#pbox')
    const el = document.createElement('div')
    el.className = `big-total ${cls}`
    host.appendChild(el)
    const dur = 440
    const t0 = performance.now()
    await new Promise<void>((resolve) => {
      const tick = (t: number) => {
        const p = Math.min(1, (t - t0) / dur)
        el.textContent = String(Math.round(val * (0.15 + 0.85 * p)))
        if (p < 1) requestAnimationFrame(tick)
        else resolve()
      }
      requestAnimationFrame(tick)
    })
    el.textContent = String(val)
    await sleep(160)
    el.classList.add('out')
    this.timers.push(window.setTimeout(() => el.remove(), 400))
  }

  // ── 피드백 ──
  private toStage(rect: DOMRect): { x: number; y: number } {
    const pboxEl = this.q('#pbox')
    const box = pboxEl.getBoundingClientRect()
    const scale = box.width / pboxEl.offsetWidth
    return { x: (rect.left + rect.width / 2 - box.left) / scale, y: (rect.top - box.top) / scale }
  }
  private popEl(el: HTMLElement, txt: string, cls: string) {
    const { x, y } = this.toStage(el.getBoundingClientRect())
    this.spawnPop(x, y - 4, txt, cls)
  }
  private popAt(enemyIdx: number, txt: string, cls: string) {
    const el = this.q('#actors').querySelector<HTMLElement>(`.actor.foe[data-i="${enemyIdx}"]`)
    if (!el) return
    const { x, y } = this.toStage(el.getBoundingClientRect())
    this.spawnPop(x, y + 30, txt, cls)
  }
  private popPlayer(txt: string, cls: string) {
    this.spawnPop(320, 120, txt, cls)
  }
  private spawnPop(x: number, y: number, txt: string, cls: string) {
    const p = document.createElement('div')
    p.className = `pop ${cls}`
    p.textContent = (cls.includes('heal') ? '+' : '') + txt
    p.style.left = `${x - 24}px`
    p.style.top = `${Math.max(10, y)}px`
    this.q('#pbox').appendChild(p)
    this.timers.push(window.setTimeout(() => p.remove(), 1000))
  }
  private hitOne(el: HTMLElement) {
    el.classList.remove('hit')
    void el.offsetWidth
    el.classList.add('hit')
  }
  private log(html: string) {
    const host = this.q('#log')
    const line = document.createElement('div')
    line.className = 'log-line'
    line.innerHTML = html
    host.appendChild(line)
    this.timers.push(window.setTimeout(() => line.remove(), 3100))
    while (host.children.length > 3) host.removeChild(host.firstChild!)
  }
}
