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

function cardContents(word: Word, label: string, action: string): string {
  const art = word.art ? SKILL_ART[word.art] : undefined
  const rarity = word.rarity ?? 'common'
  return `
    ${art ? `<img class="discard-art" src="${art}" alt="" />` : ''}
    <span class="discard-veil" aria-hidden="true"></span>
    <span class="discard-order">${label}</span>
    <span class="discard-copy">
      <span class="discard-meta">${emotionIconBadge(emotionOrNeutral(word.emotion), 'rp-emotion')} ${RARITY_LABEL[rarity]} · Lv.${word.level ?? 1}</span>
      <strong>${word.text}</strong>
      <span class="discard-effect">${wordValueLines(word).map((line) => line.text).join(' · ') || word.note}</span>
      <span class="discard-action">${action}</span>
    </span>`
}

function candidateHtml(word: Word, index: number): string {
  const rarity = word.rarity ?? 'common'
  return `
    <button class="discard-pick rarity-${rarity}" type="button" data-i="${index}">
      ${cardContents(word, `보유 카드 ${index + 1}`, '이 카드를 버리기')}
    </button>`
}

function incomingHtml(word: Word): string {
  const rarity = word.rarity ?? 'common'
  return `
    <aside class="discard-preview" aria-label="새로 들어올 카드">
      <div class="discard-preview-label">새로 들어올 카드</div>
      <div class="discard-pick discard-new-card rarity-${rarity}">
        ${cardContents(word, '새 카드', '이 카드가 들어옵니다')}
      </div>
    </aside>`
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
            오른쪽의 새 카드 <b>「${opts.incoming.text}」</b>를 넣기 위해 현재 보유 카드 중 한 장을 골라 버린다.
          </div>
          <div class="discard-body">
            <div class="reward-grid discard-grid">
              ${opts.candidates.map(candidateHtml).join('')}
            </div>
            ${incomingHtml(opts.incoming)}
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
