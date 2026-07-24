/**
 * 보상 뷰 — 전투 후 일기 한 장이 넘어간다. 다음 필드(날씨/제목)를 예고하고,
 * 단어 또는 아이템을 하나 고르게 한다(덱빌딩 파밍의 접점).
 */

import type { FieldDef } from '@core/types'
import { BACKGROUNDS } from '@/assets'
import { itemArt } from '@/ui/Icons'

interface RewardPick {
  kind: 'word' | 'item'
  name: string
  desc: string
  tag: string
  art: string
}

interface Opts {
  nextField: FieldDef
  onPickWord: () => void
  onPickItem: () => void
}

// 데모 보상 3택(단어 2 + 아이템 1).
const PICKS: RewardPick[] = [
  { kind: 'word', name: '천둥', desc: '목적어 · 위력 7 · 전체 적중', tag: '새 단어', art: 'word' },
  { kind: 'word', name: '버텨', desc: '동사 · 방어 +6 · 반격 흡수', tag: '새 단어', art: 'word' },
  { kind: 'item', name: '몽당 양초', desc: '지니면 감탄사로 스탯을 붙일 수 있다', tag: '아이템', art: 'gift' },
]

export class RewardView {
  constructor(private root: HTMLElement, opts: Opts) {
    const f = opts.nextField
    this.root.innerHTML = `
      <div class="scene reward-scene" style="background-image:url(${BACKGROUNDS.bg001})">
        <div class="reward-card">
          <div class="reward-head">
            <div class="k">오늘의 일기, 한 장</div>
            <div class="t hand">보상을 고르자</div>
          </div>
          <div class="reward-field">
            내일은 <b>${f.date}</b> · <b>${f.title}</b><br>${f.desc}
          </div>
          <div class="reward-grid">
            ${PICKS.map(
              (p, i) => `
              <div class="reward-pick" data-i="${i}">
                <div class="kind">${p.tag}</div>
                <div class="art">${itemArt(p.art)}</div>
                <div class="rname">${p.name}</div>
                <div class="rdesc">${p.desc}</div>
                <div class="rtag">고르기 →</div>
              </div>`,
            ).join('')}
          </div>
        </div>
      </div>`

    this.root.querySelectorAll<HTMLElement>('.reward-pick').forEach((el) =>
      el.addEventListener('click', () => {
        const p = PICKS[Number(el.dataset.i)]
        el.style.borderColor = 'var(--accent)'
        el.style.transform = 'translateY(-8px) scale(1.03)'
        window.setTimeout(() => (p.kind === 'item' ? opts.onPickItem() : opts.onPickWord()), 260)
      }),
    )
  }

  destroy() {}
}
