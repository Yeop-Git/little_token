/**
 * 아이템 감탄사(재련) 뷰 — 전투와 같은 패턴.
 *  · 상단: 감탄 문장이 점차 완성되는 체인
 *  · 그 아래: 아이템 일러스트(좌) + 감정 스탯표(우, ▲로 증가 표시)
 *  · 하단: 감탄/정도/평가 선택지를 "텍스트"로 순차 선택(버튼 아님, 인게임 스타일)
 */

import type { ItemDef, StatKey } from '@data/items'
import { EXCLAIM_SLOTS, STAT_LABEL } from '@data/items'
import type { OwnedItem } from '@core/player'
import { BACKGROUNDS } from '@/assets'
import { itemArt } from '@/ui/Icons'
import { GameAudio } from '@/audio/GameAudio'

interface Opts {
  item: ItemDef
  /** 전투에서 들고 온 보상등급 — 높을수록 행운 감탄(팅! 추가 스탯)이 잘 붙는다. */
  grade?: number
  onDone: (result: OwnedItem) => void
}

const STAT_ORDER: StatKey[] = ['hp', 'atk', 'guard', 'heal', 'luck']

// 행운 감탄이 붙일 수 있는 추가 스탯 — 체력은 2가 1점 가치라 +2.
const BLESS_POOL: { stat: StatKey; n: number }[] = [
  { stat: 'hp', n: 2 },
  { stat: 'atk', n: 1 },
  { stat: 'guard', n: 1 },
  { stat: 'heal', n: 1 },
  { stat: 'luck', n: 1 },
]
// 등급 1당 4% — 등급 10이면 선택지마다 40% 확률로 팅!이 붙는다.
const BLESS_CHANCE_PER_GRADE = 0.04

export class ItemExclaimView {
  private picks: Record<string, string | undefined> = {}
  private slotIndex = 0
  private finalizing = false
  private timers: number[] = []
  // 행운 감탄 — 이 화면에서 추가 스탯이 붙은 단어들. 키는 `슬롯:단어id`.
  private blessed = new Map<string, { stat: StatKey; n: number }>()
  // 팅! 연출은 처음 드러날 때 한 번만.
  private revealed = new Set<string>()

  constructor(private root: HTMLElement, private opts: Opts) {
    // 입장 시 한 번만 굴린다 — 슬롯을 오가도 붙은 자리는 그대로다.
    const chance = Math.min(0.4, (opts.grade ?? 0) * BLESS_CHANCE_PER_GRADE)
    for (const slot of EXCLAIM_SLOTS)
      for (const w of slot.words)
        if (Math.random() < chance) {
          this.blessed.set(`${slot.key}:${w.id}`, BLESS_POOL[Math.floor(Math.random() * BLESS_POOL.length)])
        }
    this.mount()
  }
  destroy() {
    this.timers.forEach((t) => clearTimeout(t))
  }

  private totals() {
    const t: Record<StatKey, number> = { ...this.opts.item.base }
    for (const slot of EXCLAIM_SLOTS) {
      const w = slot.words.find((x) => x.id === this.picks[slot.key])
      if (!w) continue
      for (const k of STAT_ORDER) t[k] += w.mods[k] ?? 0
      const bless = this.blessed.get(`${slot.key}:${w.id}`)
      if (bless) t[bless.stat] += bless.n
    }
    return t
  }

  private complete() {
    return EXCLAIM_SLOTS.every((s) => this.picks[s.key])
  }

  private mount() {
    const item = this.opts.item
    this.root.innerHTML = `
      <div class="scene item-scene" style="background-image:url(${BACKGROUNDS.bg001})">
        <div class="iforge">
          <div class="iforge-chain" id="chain"></div>

          <div class="iforge-top">
            <div class="iforge-illust glass">
              <div class="glint">✦ 새 아이템 ✦</div>
              <div class="art">${itemArt(item.art)}</div>
              <div class="iname">${item.name}</div>
              <div class="grade">등급 · ${item.grade}</div>
            </div>
            <div class="iforge-stats glass">
              <div class="dock-title">감정된 스탯</div>
              <div class="stat-list" id="stats"></div>
              <div class="iforge-flavor">“${item.flavor}”</div>
            </div>
          </div>

          <div class="iforge-choose">
            <div class="slot-step" id="esteps"></div>
            <div class="word-row" id="egrid"></div>
            <button class="undo-btn" id="undo">되돌리기</button>
          </div>
        </div>
      </div>`

    // 확정 버튼 없음 — 단어 선택처럼 모두 고르면 자동 확정(반짝 후 발동).
    this.root.querySelector('#undo')!.addEventListener('click', () => {
      if (this.finalizing) return
      this.picks = {}
      this.slotIndex = 0
      this.refresh()
    })
    this.refresh()
  }

  // 모든 감탄사를 고르면 자동으로 확정 — 상단 체인이 반짝인 뒤 스탯이 확정된다.
  private finalize() {
    if (this.finalizing || !this.complete()) return
    this.finalizing = true
    const item = this.opts.item
    this.q('#chain').classList.add('sparkle')
    this.timers.push(
      window.setTimeout(() => {
        const totals = this.totals()
        const line = EXCLAIM_SLOTS.map((s) => s.words.find((x) => x.id === this.picks[s.key])?.text ?? '').join(' ')
        // 최종 스탯(기본+감탄사) 전체가 플레이어 스탯에 더해진다(스펙업).
        this.opts.onDone({
          id: item.id,
          name: item.name,
          grade: item.grade,
          art: item.art,
          line,
          stats: { hp: totals.hp, atk: totals.atk, guard: totals.guard, heal: totals.heal, luck: totals.luck },
          passive: item.passive,
        })
      }, 340),
    )
  }

  private q<T extends HTMLElement = HTMLElement>(s: string): T {
    return this.root.querySelector(s) as T
  }

  private refresh() {
    // 상단 감탄 체인
    this.q('#chain').innerHTML = EXCLAIM_SLOTS.map((s) => {
      const w = s.words.find((x) => x.id === this.picks[s.key])
      return w
        ? `<span class="chain-word">${w.text}</span>`
        : `<span class="chain-ghost">${s.label}</span>`
    }).join(' ')

    // 스탯표(▲ 증가)
    const totals = this.totals()
    this.q('#stats').innerHTML = STAT_ORDER.map((k) => {
      const up = totals[k] - this.opts.item.base[k]
      return `<div class="stat"><span class="sl">${STAT_LABEL[k]}</span>
        <span class="sv">${totals[k]}${up ? `<span class="up">▲${up}</span>` : ''}</span></div>`
    }).join('')

    // 슬롯 스텝
    this.q('#esteps').innerHTML = EXCLAIM_SLOTS.map((s, i) => {
      const cls = i === this.slotIndex ? 'active' : this.picks[s.key] ? 'done' : ''
      return `<button class="step ${cls}" data-i="${i}"><b>${i + 1}</b> ${s.label}</button>`
    }).join('<span class="sep">·</span>')
    this.q('#esteps')
      .querySelectorAll<HTMLElement>('.step')
      .forEach((st) =>
        st.addEventListener('click', () => {
          const i = Number(st.dataset.i)
          const filled = EXCLAIM_SLOTS.filter((s) => this.picks[s.key]).length
          if (i <= filled) {
            this.slotIndex = i
            this.refresh()
          }
        }),
      )

    // 현재 슬롯의 텍스트 선택지 — 행운 감탄이 붙은 칸은 금빛으로 빛나고, 첫 등장에만 팅!.
    const slot = EXCLAIM_SLOTS[this.slotIndex]
    let freshBless = false
    this.q('#egrid').innerHTML = slot.words
      .map((w) => {
        const picked = this.picks[slot.key] === w.id
        const key = `${slot.key}:${w.id}`
        const bless = this.blessed.get(key)
        const fresh = bless && !this.revealed.has(key)
        if (fresh) {
          this.revealed.add(key)
          freshBless = true
        }
        const blessHtml = bless
          ? `<span class="bless">팅! ${STAT_LABEL[bless.stat]} +${bless.n}</span>`
          : ''
        return `<button class="word-cell rarity-common ${picked ? 'picked' : ''} ${bless ? 'blessed' : ''} ${fresh ? 'fresh' : ''}" data-id="${w.id}">
          <span class="w">${w.text}</span><span class="n">${w.note}</span>${blessHtml}
        </button>`
      })
      .join('')
    if (freshBless) GameAudio.play('wordSelect')
    this.q('#egrid')
      .querySelectorAll<HTMLElement>('.word-cell')
      .forEach((btn) =>
        btn.addEventListener('click', () => {
          if (this.finalizing) return
          this.picks[slot.key] = btn.dataset.id
          // 다음 빈 슬롯으로 진행
          let next = this.slotIndex + 1
          while (next < EXCLAIM_SLOTS.length && this.picks[EXCLAIM_SLOTS[next].key]) next++
          this.slotIndex = Math.min(next, EXCLAIM_SLOTS.length - 1)
          this.refresh()
          // 전부 고르면 단어 선택처럼 자동 확정
          if (this.complete()) this.finalize()
        }),
      )
  }
}
