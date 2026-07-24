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

interface Opts {
  item: ItemDef
  onDone: (result: OwnedItem) => void
}

const STAT_ORDER: StatKey[] = ['atk', 'guard', 'heal', 'luck']

export class ItemExclaimView {
  private picks: Record<string, string | undefined> = {}
  private slotIndex = 0

  constructor(private root: HTMLElement, private opts: Opts) {
    this.mount()
  }
  destroy() {}

  private totals() {
    const t: Record<StatKey, number> = { ...this.opts.item.base }
    for (const slot of EXCLAIM_SLOTS) {
      const w = slot.words.find((x) => x.id === this.picks[slot.key])
      if (!w) continue
      for (const k of STAT_ORDER) t[k] += w.mods[k] ?? 0
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
            <div class="zone-actions">
              <button class="btn primary" id="confirm" disabled>감탄을 완성해줘</button>
              <button class="btn ghost" id="undo">되돌리기</button>
            </div>
          </div>
        </div>
      </div>`

    this.root.querySelector('#confirm')!.addEventListener('click', () => {
      if (!this.complete()) return
      const totals = this.totals()
      const line = EXCLAIM_SLOTS.map((s) => s.words.find((x) => x.id === this.picks[s.key])?.text ?? '').join(' ')
      // 최종 스탯(기본+감탄사) 전체가 플레이어 스탯에 더해진다(스펙업).
      this.opts.onDone({
        id: item.id,
        name: item.name,
        grade: item.grade,
        art: item.art,
        line,
        stats: { atk: totals.atk, guard: totals.guard, heal: totals.heal, luck: totals.luck },
      })
    })
    this.root.querySelector('#undo')!.addEventListener('click', () => {
      this.picks = {}
      this.slotIndex = 0
      this.refresh()
    })
    this.refresh()
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

    // 현재 슬롯의 텍스트 선택지
    const slot = EXCLAIM_SLOTS[this.slotIndex]
    this.q('#egrid').innerHTML = slot.words
      .map((w) => {
        const picked = this.picks[slot.key] === w.id
        return `<button class="word-cell rarity-common ${picked ? 'picked' : ''}" data-id="${w.id}">
          <span class="w">${w.text}</span><span class="n">${w.note}</span>
        </button>`
      })
      .join('')
    this.q('#egrid')
      .querySelectorAll<HTMLElement>('.word-cell')
      .forEach((btn) =>
        btn.addEventListener('click', () => {
          this.picks[slot.key] = btn.dataset.id
          // 다음 빈 슬롯으로 진행
          let next = this.slotIndex + 1
          while (next < EXCLAIM_SLOTS.length && this.picks[EXCLAIM_SLOTS[next].key]) next++
          this.slotIndex = Math.min(next, EXCLAIM_SLOTS.length - 1)
          this.refresh()
        }),
      )

    const confirm = this.q<HTMLButtonElement>('#confirm')
    confirm.disabled = !this.complete()
    confirm.textContent = this.complete() ? '이 감탄으로 확정!' : '감탄을 완성해줘'
  }
}
