import { emotionOrNeutral, RARITY_LABEL, type Word } from '@core/types'
import { BACKGROUNDS, SKILL_ART, TOKEN_FACES } from '@/assets'
import { wordNoteText, wordValueLines } from '@core/wordText'
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
      <span class="discard-effect">${wordValueLines(word).map((line) => line.text).join(' · ') || wordNoteText(word)}</span>
      <span class="discard-action">${action}</span>
    </span>`
}

function candidateHtml(word: Word, index: number): string {
  const rarity = word.rarity ?? 'common'
  return `
    <button class="discard-pick discard-card-face rarity-${rarity}" type="button" data-i="${index}">
      ${cardContents(word, `보유 카드 ${index + 1}`, '이 카드를 버리기')}
    </button>`
}

/**
 * 새로 들어올 카드는 미리보기다 — 고를 수 있는 자리가 아니다.
 * 예전에는 이 카드도 후보 버튼과 같은 `.discard-pick` 클래스를 써서 호버하면
 * 똑같이 떠올랐고, 아래의 클릭 핸들러도 같이 붙었다. 누르면 `data-i`가 없어
 * `candidates[NaN]`이 undefined로 나와 그 자리에서 예외가 났고 — 화면은 그대로,
 * 아무 일도 일어나지 않았다. 클래스를 나누고 포인터를 아예 안 받게 한다.
 */
function incomingHtml(word: Word): string {
  const rarity = word.rarity ?? 'common'
  return `
    <aside class="discard-preview" aria-label="새로 들어올 카드">
      <div class="discard-preview-label">새로 들어올 카드</div>
      <div class="discard-card-face discard-new-card rarity-${rarity}">
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
  }

  destroy() {}
}
