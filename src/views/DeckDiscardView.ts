import { emotionOrNeutral, type Word } from '@core/types'
import { BACKGROUNDS, TOKEN_FACES } from '@/assets'
import { wordNoteText } from '@core/wordText'
import { wordCardInnerHtml, wordMood } from '@/ui/WordCardFace'

interface Opts {
  incoming: Word
  candidates: Word[]
  onDiscard: (word: Word) => void
  onDiscardIncoming: () => void
}

const SLOT_LABEL: Record<string, string> = { subj: '주어', adv: '수식어', verb: '동사' }

function cardButton(word: Word, label: string, action: string, attrs: string, extraClass = '', showLabel = false): string {
  const rarity = word.rarity ?? 'common'
  const emotion = emotionOrNeutral(word.emotion)
  return `
    <button class="discard-choice word-card mood-${wordMood(word)} emotion-${emotion} rarity-${rarity}${extraClass ? ` ${extraClass}` : ''}"
      type="button" ${attrs} aria-label="${label}, ${word.text}, ${action}"
      style="--card-x:0px;--card-z:1">
      ${showLabel ? `<span class="discard-order">${label}</span>` : ''}
      ${wordCardInnerHtml(word, { note: wordNoteText(word) })}
      <span class="discard-action">${action}</span>
    </button>`
}

function candidateHtml(word: Word, index: number): string {
  return cardButton(word, `보유 카드 ${index + 1}`, '이 카드를 버리기', `data-i="${index}"`, 'discard-pick')
}

function incomingHtml(word: Word): string {
  return `
    <aside class="discard-preview" aria-label="새로 들어올 카드">
      <div class="discard-preview-label">새로 들어올 카드</div>
      ${cardButton(word, '새 카드', '새 카드를 버리기', 'data-discard-incoming="true"', 'discard-new-card', true)}
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
            새 카드 <b>「${opts.incoming.text}」</b>와 교체할 보유 카드 중 하나를 고르거나, 새 카드를 버린다.
          </div>
          <div class="discard-body">
            <div class="reward-grid discard-grid" tabindex="0" aria-label="버릴 보유 카드 목록">
              ${opts.candidates.map(candidateHtml).join('')}
            </div>
            ${incomingHtml(opts.incoming)}
          </div>
        </div>
      </div>`

    // 고를 수 있는 건 보유 카드 버튼뿐이다. 자리 번호가 없거나 후보 밖을 가리키는
    // 클릭은 아무것도 버리지 않고 조용히 넘긴다 — 화면이 멈춰 버리는 것보다 낫다.
    let chosen = false
    this.root.querySelectorAll<HTMLButtonElement>('.discard-pick[data-i]').forEach((button) => {
      button.addEventListener('click', () => {
        if (chosen) return
        const target = opts.candidates[Number(button.dataset.i)]
        if (!target) return
        chosen = true
        button.classList.add('is-chosen')
        window.setTimeout(() => opts.onDiscard(target), 180)
      })
    })
    this.root.querySelector<HTMLButtonElement>('[data-discard-incoming]')?.addEventListener('click', (event) => {
      if (chosen) return
      chosen = true
      const button = event.currentTarget as HTMLButtonElement
      button.classList.add('is-chosen')
      window.setTimeout(opts.onDiscardIncoming, 180)
    })
  }

  destroy() {}
}
