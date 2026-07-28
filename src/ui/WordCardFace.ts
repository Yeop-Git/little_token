/**
 * 단어 카드 앞면의 유일한 마크업.
 *
 * 손패(`ui/CardHand.ts`)와 손패 밖 화면(도움말 등)이 같은 함수를 쓴다 —
 * 설명서에 그려지는 카드가 전투에서 집는 카드와 한 글자도 다르지 않게 한다.
 */

import { SKILL_ART } from '@/assets'
import { emotionIconBadge } from '@/ui/EmotionBadge'
import { icon } from '@/ui/Icons'
import { emotionOrNeutral, RARITY_LABEL, type Word } from '@core/types'
import { wordNoteText } from '@core/wordText'

/** 제목을 한 줄에 온전히 남기되, 카드 폭을 넘는 경우에만 글자를 줄인다. */
export function cardTitleStyle(text: string, illustrated = false): string {
  const maxSize = illustrated ? 27 : 24
  const availableWidth = illustrated ? 140 : 126
  const widthUnits = Array.from(text).reduce((sum, char) => {
    if (/\s/.test(char)) return sum + 0.35
    if (/[\u0000-\u00ff]/.test(char)) return sum + 0.62
    return sum + 1
  }, 0)
  const fittedSize = Math.max(12, Math.min(maxSize, (availableWidth * 0.92) / Math.max(1, widthUnits)))
  return `style="--card-title-size:${fittedSize.toFixed(1)}px"`
}

/** 카드 색감(--wglow): 공격=붉음 · 방어=파랑 · 회복=초록 · 도박=보라. */
export function wordMood(word: Word): string {
  if (word.variance) return 'gamble'
  if (word.kind === 'heal' || word.effects?.heal) return 'heal'
  if (word.kind === 'guard' || word.effects?.guard) return 'guard'
  if (word.kind === 'attack' || (word.power ?? 0) > 0) return 'attack'
  if (word.effects?.recoil) return 'sacrifice'
  return 'buff'
}

/** 일러스트가 없는 카드의 대체 문양. */
export function wordArtGlyph(word: Word): string {
  if (word.variance) return '✧'
  if (word.kind === 'heal' || word.effects?.heal) return '✚'
  if (word.kind === 'guard' || word.effects?.guard) return '◇'
  if (word.kind === 'attack' || word.power) return '↗'
  if (word.effects?.recoil) return '※'
  return '✦'
}

/** 동사는 카드 문구를 읽기 전에도 공격·방어·회복 역할을 알아볼 수 있게 한다. */
export function wordActionBadge(word: Word): string {
  if (word.slot !== 'verb' && word.slot !== 'verb2') return ''
  const action = word.kind === 'heal' || word.effects?.heal
    ? { cls: 'heal', label: '회복', glyph: 'cross' }
    : word.kind === 'guard' || word.effects?.guard
      ? { cls: 'guard', label: '방어', glyph: 'shield' }
      : { cls: 'attack', label: '공격', glyph: 'sword' }
  return `<span class="card-action action-${action.cls}" title="${action.label}" aria-hidden="true">${icon(action.glyph)}</span>`
}

export interface WordCardFaceOpts {
  /** 선택 불가 사유처럼 카드 문구를 갈아 끼울 때 쓴다. 기본은 단어의 note. */
  note?: string
  /** 일러스트 없는 카드 하단의 작은 글자. */
  footer?: string
  /** 거미줄 봉인처럼 앞면 위에 덮는 겹. */
  overlay?: string
}

/** 카드 앞면 한 겹. 일러스트가 있으면 원화 카드, 없으면 문양 카드로 그린다. */
export function wordCardFrontHtml(word: Word, opts: WordCardFaceOpts = {}): string {
  const { note = wordNoteText(word), footer = 'WORD CARD', overlay = '' } = opts
  const artUrl = word.art ? SKILL_ART[word.art] : undefined
  const level = word.level ?? 1
  const rarity = word.rarity ?? 'common'
  const emotion = emotionOrNeutral(word.emotion)
  const levelBadge = `<span class="card-level rarity-${rarity}">${RARITY_LABEL[rarity]}${level > 1 ? ` Lv.${level}` : ''}</span>`
  const badges = `${levelBadge}${emotionIconBadge(emotion, 'card-emotion')}${wordActionBadge(word)}`
  if (artUrl) {
    return `<span class="card-face card-front art">
          <img class="card-illus" src="${artUrl}" alt="" aria-hidden="true" />
          <span class="card-tint" aria-hidden="true"></span>
          <span class="card-veil" aria-hidden="true"></span>
          <span class="card-foil" aria-hidden="true"></span>
          ${badges}
          <strong class="card-title" ${cardTitleStyle(word.text, true)}>${word.text}</strong>
          <span class="card-note">${note}</span>
          ${overlay}
        </span>`
  }
  return `<span class="card-face card-front">
          <span class="card-foil" aria-hidden="true"></span>
          ${badges}
          <span class="card-art" aria-hidden="true"><i></i><b>${wordArtGlyph(word)}</b></span>
          <strong class="card-title" ${cardTitleStyle(word.text)}>${word.text}</strong>
          <span class="card-note">${note}</span>
          <small>${footer}</small>
          ${overlay}
        </span>`
}

/** 버튼·도움말처럼 손패 밖에서 카드를 쓸 때도 앞면과 내부 구조를 그대로 공유한다. */
export function wordCardInnerHtml(word: Word, opts: WordCardFaceOpts = {}): string {
  return `<span class="card-lift"><span class="card-inner">${wordCardFrontHtml(word, opts)}</span></span>`
}

/**
 * 손패 밖에 한 장만 세우는 정적 카드. 손패 좌표 변수(--card-x/--card-z)를
 * 0으로 고정하므로 감싸는 칸이 크기만 잡아 주면 된다.
 */
export function wordCardHtml(word: Word, className = ''): string {
  const emotion = emotionOrNeutral(word.emotion)
  const rarity = word.rarity ?? 'common'
  return `<span class="word-card mood-${wordMood(word)} emotion-${emotion} rarity-${rarity}${className ? ` ${className}` : ''}"
      style="--card-x:0px;--card-z:1" aria-hidden="true">
      ${wordCardInnerHtml(word)}
    </span>`
}
