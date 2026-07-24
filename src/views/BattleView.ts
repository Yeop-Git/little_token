/**
 * 전투 뷰 — 그림일기 한 페이지.
 *  · 머리글(날짜/날씨/제목) = 필드 효과
 *  · 그림 칸 = 포켓로그형 측면 전투(주인공 vs 벌레 무리) + 상단 발광 체인 + 맥락 배너
 *  · 글 칸 = 순차 단어 선택(1→N), 완성 시 "타다다닥!" 웨이브 → 효과 발동 → 하단 로그
 *
 * 렌더는 셸을 1회 구성하고 영역별로 부분 갱신한다(애니메이션 보존).
 */

import { compile, matchCombos, sentenceTokens } from '@core/compiler'
import { conflictReason, pruneConflicts } from '@core/validator'
import type { FieldDef, Selection, Tables, Word } from '@core/types'
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
import { SPRITE, weatherIcon } from './sprites'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface Opts {
  field: FieldDef
  encounter: string[]
  onWin: () => void
}

export class BattleView {
  private t: Tables = TABLES
  private field: FieldDef
  private onWin: () => void
  private state: BattleState
  private sel: Selection = {}
  private slotIndex = 0
  private target = 0
  private busy = false
  private over = false
  private timers: number[] = []

  constructor(private root: HTMLElement, opts: Opts) {
    this.field = opts.field
    this.onWin = opts.onWin
    // 적 무리 구성 + 필드 수정자.
    const enemies = opts.encounter.map((id) => makeEnemy(ENEMIES[id], this.field.enemyAtkMult ?? 1))
    this.state = { playerHp: 40, playerMax: 40, guard: 0, turn: 1, enemies, pending: null }
    this.target = aliveIdx(this.state)[0] ?? 0
    this.mount()
  }

  destroy() {
    this.timers.forEach((t) => clearTimeout(t))
  }

  // ── 셸 구성(1회) ──
  private mount() {
    const order = this.t.template.slots
    this.root.innerHTML = `
      <div class="scene">
        <div class="diary-page">
          <div class="diary-head">
            <div class="head-cell"><span class="label">날짜</span><span class="value" id="f-date"></span></div>
            <div class="head-cell head-title"><span class="value hand" id="f-title"></span><span class="sub" id="f-desc"></span></div>
            <div class="head-cell head-weather"><span id="f-weather"></span></div>
          </div>

          <div class="picture-box" id="pbox">
            <div class="turn-badge">턴 <b id="turn">1</b></div>
            <div class="ground-line"></div>
            <div class="chain-rail" id="chain"></div>
            <div class="combo-flash" id="combo"></div>
            <div class="flash" id="flash"></div>
            <div id="actors"></div>
            <div class="effect-log" id="log"></div>
          </div>

          <div class="writing-box">
            <div class="sentence-line" id="sentence"></div>
            <div class="slot-strip" id="tabs">
              ${order.map((s, i) => `<button class="slot-tab" data-i="${i}"><span class="step">${i + 1}</span>${s.label}</button>`).join('')}
            </div>
            <div class="compose">
              <div class="word-list" id="grid"></div>
              <div class="word-detail empty" id="detail"></div>
            </div>
            <div class="action-row">
              <button class="btn primary" id="go">문장 완성!</button>
              <button class="btn ghost" id="undo">되돌리기</button>
            </div>
          </div>
        </div>
      </div>`

    // 머리글 채우기
    this.q('#f-date').textContent = this.field.date
    this.q('#f-title').textContent = this.field.title
    this.q('#f-desc').innerHTML = this.field.desc
    this.q('#f-weather').innerHTML = weatherIcon(this.field.weather)

    this.q('#go').addEventListener('click', () => this.execute())
    this.q('#undo').addEventListener('click', () => this.undo())
    this.q('#tabs')
      .querySelectorAll<HTMLElement>('.slot-tab')
      .forEach((tab) =>
        tab.addEventListener('click', () => {
          const i = Number(tab.dataset.i)
          if (i <= this.filledCount()) this.setSlot(i)
        }),
      )

    this.renderActors()
    this.renderChain()
    this.renderSentence()
    this.renderSlots()
    this.updateGo()
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

  // ── 그림 칸: 배우(주인공 + 적 무리) ──
  private renderActors() {
    const host = this.q('#actors')
    const s = this.state
    const alive = aliveIdx(s)
    // 적을 오른쪽에 고르게 배치.
    const n = s.enemies.length
    const spacing = 236 // 무리 간격
    const base = 80 // 오른쪽 가장자리 여백
    const enemyHtml = s.enemies
      .map((e, i) => {
        // 오른쪽 앵커: 마지막 적이 가장 오른쪽. 마리 수가 달라도 안 잘린다.
        const right = base + (n - 1 - i) * spacing
        const pct = Math.max(0, (e.hp / e.maxHp) * 100)
        const isTarget = this.target === i && !e.dead
        return `
        <div class="actor foe ${e.dead ? 'dead' : ''} ${isTarget ? 'target' : ''}" data-i="${i}"
             style="right:${right}px;">
          <div class="nameplate">
            <div class="row"><span class="nm">${e.def.name}</span><span class="hpn">${Math.max(0, e.hp)}/${e.maxHp}</span></div>
            <div class="hpbar foe"><div class="fill" style="width:${pct}%"></div></div>
          </div>
          ${SPRITE[e.def.sprite]()}
          ${isTarget ? '<div class="sprite-cap target-ring"></div>' : ''}
        </div>`
      })
      .join('')

    const php = Math.max(0, (s.playerHp / s.playerMax) * 100)
    host.innerHTML = `
      <div class="actor you">
        <div class="nameplate">
          <div class="row"><span class="nm">일기 지킴이</span><span class="hpn">${Math.max(0, s.playerHp)}/${s.playerMax}
            ${s.guard ? `<span class="shield-chip">◈${s.guard}</span>` : ''}</span></div>
          <div class="hpbar you"><div class="fill" style="width:${php}%"></div></div>
        </div>
        ${SPRITE.diarist()}
      </div>
      ${enemyHtml}`

    // 적 클릭 → 타깃 지정(단일 공격 대상)
    host.querySelectorAll<HTMLElement>('.actor.foe').forEach((el) =>
      el.addEventListener('click', () => {
        const i = Number(el.dataset.i)
        if (!this.state.enemies[i].dead) {
          this.target = i
          this.renderActors()
        }
      }),
    )
    // 살아있는 타깃 보정
    if (this.state.enemies[this.target]?.dead) this.target = alive[0] ?? 0
  }

  // ── 상단 발광 체인 ──
  private renderChain() {
    const host = this.q('#chain')
    const toks = sentenceTokens(this.sel, this.t)
    host.innerHTML = this.order()
      .map((k, i) => {
        const on = !!this.sel[k]
        if (!on) return ''
        return `<span class="chain-word lit" data-i="${i}">${toks[i]}</span>`
      })
      .join('')
  }

  // ── 글 칸: 완성 문장 줄 ──
  private renderSentence() {
    const host = this.q('#sentence')
    const toks = sentenceTokens(this.sel, this.t)
    const parts = this.order().map((k, i) => {
      const filled = !!this.sel[k]
      const cls = filled ? 'tok' : 'tok empty'
      const cursor = i === this.slotIndex && !filled ? '<span class="cursor"></span>' : ''
      return `<span class="${cls}">${filled ? toks[i] : this.t.template.slots[i].label}</span>${cursor}`
    })
    // 관용구 미리보기
    const combos = matchCombos(this.sel, this.t.combos, this.order())
    const preview = combos.length
      ? `<span style="margin-left:auto;font-size:18px;color:var(--accent);font-weight:800">${combos
          .map((c) => `「${c.name}」×${c.mult}`)
          .join('  ')}</span>`
      : ''
    host.innerHTML = parts.join(' ') + preview
  }

  // ── 글 칸: 슬롯 탭 + 단어 그리드 ──
  private renderSlots() {
    // 탭 상태
    this.q('#tabs')
      .querySelectorAll<HTMLElement>('.slot-tab')
      .forEach((tab, i) => {
        const key = this.order()[i]
        tab.classList.toggle('active', i === this.slotIndex)
        tab.classList.toggle('done', !!this.sel[key])
      })

    const key = this.order()[this.slotIndex]
    const words = this.t.words[key] ?? []
    const grid = this.q('#grid')
    grid.innerHTML = words
      .map((w) => {
        const why = conflictReason(w, this.slotIndex, this.sel, this.t)
        const picked = this.sel[key]?.id === w.id
        const cls = ['word-opt', `rarity-${w.rarity ?? 'common'}`, picked ? 'picked' : '', why ? 'blocked' : ''].join(' ')
        return `<button class="${cls}" data-id="${w.id}">
          <span class="w">${w.text}</span><span class="n">${why ?? w.note}</span>
        </button>`
      })
      .join('')

    grid.querySelectorAll<HTMLElement>('.word-opt').forEach((btn) => {
      const w = words.find((x) => x.id === btn.dataset.id)!
      btn.addEventListener('mouseenter', () => this.renderDetail(w))
      btn.addEventListener('mouseleave', () => this.renderDetail(null))
      btn.addEventListener('click', () => {
        if (btn.classList.contains('blocked') || this.busy || this.over) return
        this.pick(btn.dataset.id!)
      })
    })

    // 마우스가 없을 때 기본: 현재 슬롯의 선택 단어 또는 안내.
    this.renderDetail(null)
  }

  // 우측 상세 패널 — 등급/설명/줄거리. word=null이면 기본(선택 단어 or 안내).
  private renderDetail(word: Word | null) {
    const detail = this.q('#detail')
    const key = this.order()[this.slotIndex]
    const w = word ?? this.sel[key] ?? null
    if (!w) {
      detail.className = 'word-detail empty'
      detail.innerHTML = '단어에 마우스를 올리면<br>등급과 줄거리가 보인다.'
      return
    }
    const rarity = w.rarity ?? 'common'
    const slotLabel = this.t.template.slots.find((s) => s.key === w.slot)?.label ?? ''
    const roleDesc: Record<string, string> = {
      subject: '주어 · 문장의 화자 · 대상 결정',
      modifier: '수식 · 위력 배수 풀',
      object: '목적어 · 기본 위력',
      verb: '동사 · 위력 + 행동 종류',
      ending: '어미 · 발동 시점 · 배수',
    }
    const role = this.t.template.slots.find((s) => s.key === w.slot)?.role ?? 'object'
    detail.className = `word-detail rarity-${rarity}`
    detail.innerHTML = `
      <div class="detail-grade">✦ ${RARITY_LABEL[rarity]} · ${slotLabel}</div>
      <div class="detail-name">${w.text}</div>
      <div class="detail-role">${roleDesc[role]}</div>
      <div class="detail-effect">${w.note}${w.aoe === 'all' ? ' · 전체 적중' : ''}</div>
      <div class="detail-lore">“${w.lore ?? ''}”</div>`
  }

  private setSlot(i: number) {
    this.slotIndex = Math.max(0, Math.min(i, this.order().length - 1))
    this.renderSlots()
    this.renderSentence()
  }

  private pick(id: string) {
    const key = this.order()[this.slotIndex]
    const w = this.t.words[key].find((x) => x.id === id)!
    this.sel = { ...this.sel, [key]: w }
    this.sel = pruneConflicts(this.sel, this.slotIndex, this.t)
    // 다음 빈 슬롯으로 이동
    const order = this.order()
    let next = this.slotIndex + 1
    while (next < order.length && this.sel[order[next]]) next++
    this.slotIndex = Math.min(next, order.length - 1)

    this.renderChain()
    this.renderSentence()
    this.renderSlots()
    this.updateGo()
  }

  private undo() {
    if (this.busy || this.over) return
    this.sel = {}
    this.slotIndex = 0
    this.renderChain()
    this.renderSentence()
    this.renderSlots()
    this.updateGo()
  }

  private complete(): boolean {
    return this.order().every((k) => !!this.sel[k])
  }

  private updateGo() {
    const go = this.q<HTMLButtonElement>('#go')
    go.disabled = !this.complete() || this.busy || this.over
  }

  // ── 문장 완성 → 타다다닥 → 발동 → 적 턴 ──
  private async execute() {
    if (!this.complete() || this.busy || this.over) return
    this.busy = true
    this.updateGo()

    const intent = compile(this.sel, this.t)

    // 1) 타다다닥! 체인 웨이브
    const words = this.q('#chain').querySelectorAll<HTMLElement>('.chain-word')
    for (let i = 0; i < words.length; i++) {
      words[i].classList.add('wave')
      await sleep(70)
    }
    this.q('#flash').classList.add('go')
    await sleep(180)

    // 2) 맥락(관용구) 발동 배너
    if (intent.combos.length) {
      const combos = matchCombos(this.sel, this.t.combos, this.order())
      const mult = combos.reduce((m, c) => m * c.mult, 1)
      const el = this.q('#combo')
      el.innerHTML = `<div class="kicker">맥락 발동</div>
        <div class="name">${intent.combos.join(' · ')}</div>
        <div class="mult">위력 ×${mult.toFixed(1)}</div>`
      el.classList.remove('show')
      void el.offsetWidth
      el.classList.add('show')
      await sleep(720)
    }

    // 3) 효과 발동(피해/자해/회복)
    const res = applyIntent(this.state, intent, this.t.multCap, this.target, Math.random)
    for (const h of res.hits) this.popAt(h.target, `${h.dmg}`, 'dmg')
    if (res.selfDmg) this.popPlayer(`${res.selfDmg}`, 'self')
    if (res.heal) this.popPlayer(`${res.heal}`, 'heal')
    this.hitFlash(res.hits.map((h) => h.target), !!res.selfDmg)
    this.log(res.text + (res.combos.length ? ` · ${res.combos.join(', ')}` : ''))

    await sleep(420)
    this.renderActors()

    // 승리 판정
    if (allDead(this.state)) {
      this.over = true
      this.log('마지막 벌레가 종이 밖으로 떨어졌다.')
      await sleep(900)
      this.onWin()
      return
    }

    // 4) 적 턴 + 지연 예약 발동
    this.state.turn++
    this.q('#turn').textContent = String(this.state.turn)
    const strikes = enemyTurn(this.state, Math.random)
    for (const st of strikes) {
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

    // 다음 턴 초기화
    this.sel = {}
    this.slotIndex = 0
    this.busy = false
    this.renderChain()
    this.renderSentence()
    this.renderSlots()
    this.updateGo()
  }

  // ── 피드백 ──
  private popAt(enemyIdx: number, txt: string, cls: string) {
    const el = this.q('#actors').querySelector<HTMLElement>(`.actor.foe[data-i="${enemyIdx}"]`)
    const pbox = this.q('#pbox').getBoundingClientRect()
    if (!el) return
    const r = el.getBoundingClientRect()
    const scale = pbox.width / this.q('#pbox').offsetWidth
    const x = (r.left + r.width / 2 - pbox.left) / scale
    const y = (r.top - pbox.top) / scale
    this.spawnPop(x, y, txt, cls)
  }
  private popPlayer(txt: string, cls: string) {
    this.spawnPop(300, 90, txt, cls)
  }
  private spawnPop(x: number, y: number, txt: string, cls: string) {
    const p = document.createElement('div')
    p.className = `pop ${cls}`
    p.textContent = (cls === 'heal' ? '+' : '') + txt
    p.style.left = `${x - 20}px`
    p.style.top = `${y}px`
    this.q('#pbox').appendChild(p)
    this.timers.push(window.setTimeout(() => p.remove(), 950))
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
    // 최근 로그 3개만 유지
    while (host.children.length > 3) host.removeChild(host.firstChild!)
  }
}
