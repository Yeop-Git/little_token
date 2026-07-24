/**
 * 보상 뷰 — 하루를 끝내고 일기 한 장이 넘어간다. 문장/아이템 3택.
 * 문장 선택 = 단어장 등록(스킬업), 아이템 선택 = 감탄사 커스텀(스펙업)으로 이어진다.
 */

import type { FieldDef } from '@core/types'
import { RARITY_LABEL } from '@core/types'
import type { RewardOption } from '@data/rewards'
import { BACKGROUNDS } from '@/assets'
import { itemArt } from '@/ui/Icons'

interface Opts {
  day: number
  nextField: FieldDef
  options: RewardOption[]
  onPick: (opt: RewardOption) => void
}

export class RewardView {
  constructor(private root: HTMLElement, opts: Opts) {
    const f = opts.nextField
    this.root.innerHTML = `
      <div class="scene reward-scene" style="background-image:url(${BACKGROUNDS.bg001})">
        <div class="reward-card">
          <div class="reward-head">
            <div class="k">${opts.day}일차 클리어</div>
            <div class="t hand">전리품을 고르자</div>
          </div>
          <div class="reward-field">
            내일은 <b>${f.date}</b> · <b>${f.title}</b><br>${f.desc}
          </div>
          <div class="reward-grid">
            ${opts.options
              .map(
                (p, i) => `
              <div class="reward-pick rarity-${p.rarity}" data-i="${i}">
                <div class="kind">${p.kind === 'word' ? '문장 · 스킬업' : '아이템 · 스펙업'} · ${RARITY_LABEL[p.rarity]}</div>
                <div class="art">${itemArt(p.art)}</div>
                <div class="rname">${p.name}</div>
                <div class="rdesc">${p.desc}</div>
                <div class="rtag">고르기 →</div>
              </div>`,
              )
              .join('')}
          </div>
        </div>
      </div>`

    this.root.querySelectorAll<HTMLElement>('.reward-pick').forEach((el) =>
      el.addEventListener('click', () => {
        const opt = opts.options[Number(el.dataset.i)]
        el.style.transform = 'translateY(-8px) scale(1.03)'
        window.setTimeout(() => opts.onPick(opt), 240)
      }),
    )
  }

  destroy() {}
}
