/**
 * 아이템 감탄사 뷰 — 획득 시 아이템은 낮은 기본 스탯으로 나오고, 플레이어가
 * 감탄 문장(감탄 / 정도 / 평가)을 조립하면 그 단어들의 mods가 스탯에 가산된다.
 * 코어(문장 조립)의 축소판. 왼쪽=아이템/스탯, 오른쪽=감탄 조립.
 */

import type { ItemDef, StatKey } from '@data/items'
import { EXCLAIM_SLOTS, STAT_LABEL } from '@data/items'
import { BACKGROUNDS } from '@/assets'
import { itemArt } from './sprites'

interface Opts {
  item: ItemDef
  onDone: () => void
}

const STAT_ORDER: StatKey[] = ['atk', 'guard', 'heal', 'luck']

export class ItemExclaimView {
  private picks: Record<string, string | undefined> = {}

  constructor(private root: HTMLElement, private opts: Opts) {
    this.render()
  }

  destroy() {}

  private totals() {
    const t: Record<StatKey, number> = { ...this.opts.item.base }
    for (const slot of EXCLAIM_SLOTS) {
      const id = this.picks[slot.key]
      const w = slot.words.find((x) => x.id === id)
      if (!w) continue
      for (const k of STAT_ORDER) t[k] += w.mods[k] ?? 0
    }
    return t
  }

  private render() {
    const item = this.opts.item
    const totals = this.totals()
    const complete = EXCLAIM_SLOTS.every((s) => this.picks[s.key])

    // 감탄 문장 미리보기
    const sentence = EXCLAIM_SLOTS.map((s) => {
      const w = s.words.find((x) => x.id === this.picks[s.key])
      return w
        ? `<span class="tok bang">${w.text}</span>`
        : `<span class="tok empty">${s.label}</span>`
    }).join(' ')

    this.root.innerHTML = `
      <div class="scene item-scene" style="background-image:url(${BACKGROUNDS.bg001})">
        <div class="item-card">
          <div class="item-left">
            <div class="glint">✦ 새 아이템 ✦</div>
            <div class="art">${itemArt(item.art)}</div>
            <div class="iname hand">${item.name}</div>
            <div class="grade">등급 · ${item.grade}</div>
            <div class="item-stats">
              ${STAT_ORDER.map((k) => {
                const base = item.base[k]
                const now = totals[k]
                const up = now - base
                return `<div class="stat-row"><span>${STAT_LABEL[k]}</span>
                  <span class="sv">${now}${up ? `<span class="up">▲${up}</span>` : ''}</span></div>`
              }).join('')}
            </div>
          </div>

          <div class="item-right">
            <div class="head">"${item.flavor}" — 뭐라고 감탄할까?</div>
            <div class="exclaim-line">${sentence}</div>
            <div class="exclaim-slots">
              ${EXCLAIM_SLOTS.map(
                (s) => `
                <div class="exclaim-slot" data-key="${s.key}">
                  <div class="lbl">${s.label}</div>
                  <div class="exclaim-opts">
                    ${s.words
                      .map(
                        (w) => `<button class="exclaim-opt ${this.picks[s.key] === w.id ? 'picked' : ''}"
                          data-slot="${s.key}" data-id="${w.id}">
                          ${w.text}<span class="eff">${w.note}</span></button>`,
                      )
                      .join('')}
                  </div>
                </div>`,
              ).join('')}
            </div>
            <div class="item-confirm">
              <button class="btn primary" id="confirm" ${complete ? '' : 'disabled'}>
                ${complete ? '이 감탄으로 확정!' : '감탄을 완성해줘'}
              </button>
            </div>
          </div>
        </div>
      </div>`

    this.root.querySelectorAll<HTMLElement>('.exclaim-opt').forEach((btn) =>
      btn.addEventListener('click', () => {
        const slot = btn.dataset.slot!
        this.picks[slot] = this.picks[slot] === btn.dataset.id ? undefined : btn.dataset.id
        this.render()
      }),
    )
    const confirm = this.root.querySelector<HTMLButtonElement>('#confirm')
    confirm?.addEventListener('click', () => {
      if (confirm.disabled) return
      this.opts.onDone()
    })
  }
}
