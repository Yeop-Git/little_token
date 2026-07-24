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
  makeEnemy,
  type BattleState,
} from '@/sim/reference'
import { BACKGROUNDS, SPRITES } from '@/assets'
import { weatherIcon } from './sprites'
import { icon, itemArt } from '@/ui/Icons'
import { defaultPlayer, STAT_META, type PlayerState, type OwnedItem } from '@core/player'
import { STAT_LABEL, type StatKey } from '@data/items'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface Opts {
  field: FieldDef
  encounter: string[]
  onWin: () => void
  player?: PlayerState
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

  constructor(private root: HTMLElement, opts: Opts) {
    this.field = opts.field
    this.onWin = opts.onWin
    this.player = opts.player ?? defaultPlayer()
    const enemies = opts.encounter.map((id) => makeEnemy(ENEMIES[id], this.field.enemyAtkMult ?? 1))
    this.state = { playerHp: 40, playerMax: 40, guard: 0, turn: 1, enemies, pending: null }
    this.target = aliveIdx(this.state)[0] ?? 0
    this.mount()
  }

  destroy() {
    this.timers.forEach((t) => clearTimeout(t))
  }

  private mount() {
    this.root.innerHTML = `
      <div class="scene battle" style="background-image:url(${BACKGROUNDS.bg001})">
        <div class="vignette"></div>

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

    this.renderActors()
    this.renderChain()
    this.renderWords()
    this.renderStats()
    this.renderBag()
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

  // ── 배우 ──
  private renderActors() {
    const host = this.q('#actors')
    const s = this.state
    const alive = aliveIdx(s)
    const n = s.enemies.length
    const spacing = 250
    const base = 120
    const enemyHtml = s.enemies
      .map((e, i) => {
        const right = base + (n - 1 - i) * spacing
        const pct = Math.max(0, (e.hp / e.maxHp) * 100)
        const isTarget = this.target === i && !e.dead
        return `
        <div class="actor foe ${e.dead ? 'dead' : ''} ${isTarget ? 'target' : ''}" data-i="${i}" style="right:${right}px;">
          <div class="nameplate glass">
            <div class="row"><span class="nm">${e.def.name}</span><span class="hpn">${Math.max(0, e.hp)}/${e.maxHp}</span></div>
            <div class="hpbar foe"><div class="fill" style="width:${pct}%"></div></div>
          </div>
          <div class="shadow"></div>
          <img class="sprite" src="${SPRITES[e.def.sprite]}" alt="${e.def.name}">
        </div>`
      })
      .join('')

    const php = Math.max(0, (s.playerHp / s.playerMax) * 100)
    host.innerHTML = `
      <div class="actor you">
        <div class="nameplate glass">
          <div class="row"><span class="nm">우비 아이</span><span class="hpn">${Math.max(0, s.playerHp)}/${s.playerMax} ${s.guard ? `<span class="shield-chip">◈${s.guard}</span>` : ''}</span></div>
          <div class="hpbar you"><div class="fill" style="width:${php}%"></div></div>
        </div>
        <div class="shadow"></div>
        <img class="sprite" src="${SPRITES.player_001}" alt="우비 아이">
      </div>
      ${enemyHtml}`

    host.querySelectorAll<HTMLElement>('.actor.foe').forEach((el) =>
      el.addEventListener('click', () => {
        const i = Number(el.dataset.i)
        if (!this.state.enemies[i].dead) {
          this.target = i
          this.renderActors()
        }
      }),
    )
    if (this.state.enemies[this.target]?.dead) this.target = alive[0] ?? 0
  }

  // ── 상단 발광 체인(문장) ──
  private renderChain() {
    const host = this.q('#chain')
    const toks = sentenceTokens(this.sel, this.t)
    const combos = matchCombos(this.sel, this.t.combos, this.order())
    const words = this.order()
      .map((k, i) => (this.sel[k] ? `<span class="chain-word" data-i="${i}">${toks[i]}</span>` : ''))
      .join('')
    const preview = combos.length ? `<span class="chain-combo">${combos.map((c) => `「${c.name}」×${c.mult}`).join(' ')}</span>` : ''
    host.innerHTML = words + (words ? preview : '')
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
    const words = this.t.words[key] ?? []
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

  // ── 우측 정보 패널: "해당 단어"만의 효과(누적 아님) ──
  private renderDetail(word: Word | null) {
    const detail = this.q('#detail')
    const key = this.order()[this.slotIndex]
    const w = word ?? this.sel[key] ?? null
    if (!w) {
      detail.className = 'info-dock glass empty'
      detail.innerHTML = '단어에 마우스를 올리면<br>등급 · 범위 · 수치가 여기 표시된다.'
      return
    }
    const rarity = w.rarity ?? 'common'
    const slotLabel = this.t.template.slots.find((s) => s.key === w.slot)?.label ?? ''
    const mood = this.moodOf(w)
    const values = this.wordOwnValues(w)
    detail.className = `info-dock glass mood-${mood}`
    detail.innerHTML = `
      <div class="wd-name">${w.text}</div>
      <div class="wd-grade">✦ ${RARITY_LABEL[rarity]} · ${slotLabel}</div>
      <div class="wd-range">범위 · ${this.wordRange(w)}</div>
      <div class="wd-values">${values.map((v) => `<div class="v ${v.cls}">${v.text}</div>`).join('')}</div>
      <div class="wd-lore">“${w.lore ?? ''}”</div>`
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

  // ── 발동 → 적 턴 ──
  private async execute() {
    if (!this.complete() || this.busy || this.over) return
    this.busy = true

    const intent = compile(this.sel, this.t)

    const words = this.q('#chain').querySelectorAll<HTMLElement>('.chain-word')
    for (let i = 0; i < words.length; i++) {
      words[i].classList.add('wave')
      await sleep(70)
    }
    this.q('#flash').classList.add('go')
    await sleep(180)

    if (intent.combos.length) {
      const combos = matchCombos(this.sel, this.t.combos, this.order())
      const mult = combos.reduce((m, c) => m * c.mult, 1)
      const el = this.q('#combo')
      el.innerHTML = `<div class="kicker">맥락 발동</div><div class="name">${intent.combos.join(' · ')}</div><div class="mult">위력 ×${mult.toFixed(1)}</div>`
      el.classList.remove('show')
      void el.offsetWidth
      el.classList.add('show')
      await sleep(720)
    }

    const res = applyIntent(this.state, intent, this.t.multCap, this.target, Math.random, this.player.stats.atk)
    for (const h of res.hits) this.popAt(h.target, `${h.dmg}`, 'dmg')
    if (res.selfDmg) this.popPlayer(`${res.selfDmg}`, 'self')
    if (res.heal) this.popPlayer(`${res.heal}`, 'heal')
    this.hitFlash(res.hits.map((h) => h.target), !!res.selfDmg)
    this.log(res.text + (res.combos.length ? ` · ${res.combos.join(', ')}` : ''))

    await sleep(420)
    this.renderActors()

    if (allDead(this.state)) {
      this.over = true
      this.log('마지막 벌레가 책장 밖으로 떨어졌다.')
      await sleep(900)
      this.onWin()
      return
    }

    this.state.turn++
    this.q('#turn').textContent = String(this.state.turn)
    for (const st of enemyTurn(this.state, Math.random)) {
      if (st.dealt) this.popPlayer(`${st.dealt}`, 'dmg')
      this.log(st.text)
    }
    if (this.state.pending) {
      const p = this.state.pending
      const targets = p.aoe ? aliveIdx(this.state) : [p.target]
      for (const ti of targets) {
        const e = this.state.enemies[ti]
        if (!e || e.dead) continue
        e.hp -= p.dmg
        this.popAt(ti, `${p.dmg}`, 'dmg')
        if (e.hp <= 0) e.dead = true
      }
      this.log(`예약된 문장 발동 → ${p.dmg} 피해`)
      this.state.pending = null
      this.hitFlash(targets, false)
    }

    await sleep(360)
    this.renderActors()

    if (this.state.playerHp <= 0) {
      this.over = true
      this.log('일기장이 너무 상했다… (패배)')
    } else if (allDead(this.state)) {
      this.over = true
      await sleep(600)
      this.onWin()
      return
    }

    this.sel = {}
    this.slotIndex = 0
    this.busy = false
    this.renderChain()
    this.renderWords()
  }

  // ── 피드백 ──
  private popAt(enemyIdx: number, txt: string, cls: string) {
    const el = this.q('#actors').querySelector<HTMLElement>(`.actor.foe[data-i="${enemyIdx}"]`)
    const pboxEl = this.q('#pbox')
    if (!el) return
    const r = el.getBoundingClientRect()
    const box = pboxEl.getBoundingClientRect()
    const scale = box.width / pboxEl.offsetWidth
    const x = (r.left + r.width / 2 - box.left) / scale
    const y = (r.top - box.top) / scale + 30
    this.spawnPop(x, y, txt, cls)
  }
  private popPlayer(txt: string, cls: string) {
    this.spawnPop(320, 120, txt, cls)
  }
  private spawnPop(x: number, y: number, txt: string, cls: string) {
    const p = document.createElement('div')
    p.className = `pop ${cls}`
    p.textContent = (cls === 'heal' ? '+' : '') + txt
    p.style.left = `${x - 24}px`
    p.style.top = `${Math.max(20, y)}px`
    this.q('#pbox').appendChild(p)
    this.timers.push(window.setTimeout(() => p.remove(), 1000))
  }
  private hitFlash(enemyIdxs: number[], player: boolean) {
    for (const i of enemyIdxs) {
      const el = this.q('#actors').querySelector<HTMLElement>(`.actor.foe[data-i="${i}"]`)
      if (!el) continue
      el.classList.remove('hit')
      void el.offsetWidth
      el.classList.add('hit')
    }
    if (player) {
      const el = this.q('#actors').querySelector<HTMLElement>('.actor.you')
      el?.classList.remove('hit')
      void el?.offsetWidth
      el?.classList.add('hit')
    }
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
