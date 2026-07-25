import { emotionOrNeutral, RARITY_LABEL, type Word } from '@core/types'
import { BACKGROUNDS, SKILL_ART, TOKEN_FACES } from '@/assets'
import { wordValueLines } from '@core/wordText'
import { emotionIconBadge } from '@/ui/EmotionBadge'

interface Opts {
  incoming: Word
  candidates: Word[]
  onDiscard: (word: Word) => void
}

const SLOT_LABEL: Record<string, string> = { subj: '주어', adv: '수식어', verb: '동사' }

function cardHtml(word: Word, index: number): string {
  const art = word.art ? SKILL_ART[word.art] : undefined
  const rarity = word.rarity ?? 'common'
  return `
    <button class="discard-pick rarity-${rarity}" type="button" data-i="${index}">
      ${art ? `<img class="discard-art" src="${art}" alt="" />` : ''}
      <span class="discard-veil" aria-hidden="true"></span>
      <span class="discard-order">보유 카드 ${index + 1}</span>
      <span class="discard-copy">
        <span class="discard-meta">${emotionIconBadge(emotionOrNeutral(word.emotion), 'rp-emotion')} ${RARITY_LABEL[rarity]} · Lv.${word.level ?? 1}</span>
        <strong>${word.text}</strong>
        <span class="discard-effect">${wordValueLines(word).map((line) => line.text).join(' · ') || word.note}</span>
        <span class="discard-action">이 카드를 버리기</span>
      </span>
    </button>`
}

export class DeckDiscardView {
  private root: HTMLElement

  constructor(root: HTMLElement, opts: Opts) {
    this.root = root
    const slotLabel = SLOT_LABEL[opts.incoming.slot] ?? '문법'
    this.root.innerHTML = `
      <div class="scene reward-scene discard-scene" style="background-image:url(${BACKGROUNDS.bg001})">
        <div class="reward-card discard-card">
          <div class="reward-token" aria-hidden="true">
            <img class="reward-token-shadow" src="${TOKEN_FACES.crown}" alt="" />
            <img class="reward-token-main" src="${TOKEN_FACES.crown}" alt="" />
          </div>
          <div class="reward-head">
            <div class="k">${slotLabel} 단어장이 가득 찼다</div>
            <div class="t hand">한 장을 지우고 새 문장을 쓰자</div>
          </div>
          <div class="discard-incoming">
            새 카드 <b>「${opts.incoming.text}」</b>를 넣기 위해 현재 보유 카드 중 한 장을 골라 버린다.
          </div>
          <div class="reward-grid discard-grid">
            ${opts.candidates.map(cardHtml).join('')}
          </div>
        </div>
      </div>`

    this.root.querySelectorAll<HTMLButtonElement>('.discard-pick').forEach((button) => {
      button.addEventListener('click', () => {
        button.classList.add('is-chosen')
        window.setTimeout(() => opts.onDiscard(opts.candidates[Number(button.dataset.i)]), 180)
      })
    })
  }

  destroy() {}
}
