/**
 * 아이템 특성 설명을 읽히는 모양으로 바꾼다.
 * - ` · `로 이어 쓴 설명은 •글머리표 줄로 나눈다.
 * - 감정·잉크·스탯·전투 키워드는 아이콘이 붙은 색 태그로 감싼다(감정은 감정색).
 * 보상 카드, 보유 아이템 툴팁, 아이템 획득 연출이 같은 함수를 쓴다.
 */
import { INK_UI } from '@/assets'
import { currentLocale } from '@/localization'
import { EMOTION_LABEL, type Emotion } from '@core/types'
import { emotionIconContent } from './EmotionBadge'
import { icon } from './Icons'

type TagSpec =
  | { kind: 'emotion'; emotion: Emotion }
  | { kind: 'ink' }
  | { kind: 'stat'; stat: 'atk' | 'guard' | 'heal' | 'luck' }
  | { kind: 'keyword' }

const STAT_ICON = { atk: 'sword', guard: 'shield', heal: 'cross', luck: 'clover' } as const

/** 언어별 태그 사전. 긴 말부터 맞춘다(예: '최대 잉크'가 '잉크'보다 먼저). */
const TERMS: Record<string, Array<[string, TagSpec]>> = {
  ko: [
    ['최대 잉크', { kind: 'ink' }], ['잉크 최대치', { kind: 'ink' }], ['잉크', { kind: 'ink' }],
    ['공격', { kind: 'stat', stat: 'atk' }], ['방어', { kind: 'stat', stat: 'guard' }],
    ['회복', { kind: 'stat', stat: 'heal' }], ['운 스탯', { kind: 'stat', stat: 'luck' }],
    ['대성공', { kind: 'keyword' }], ['관용구', { kind: 'keyword' }], ['공명', { kind: 'keyword' }],
    ['공명 배율', { kind: 'keyword' }], ['관용구 배율', { kind: 'keyword' }], ['배율 풀', { kind: 'keyword' }], ['배율', { kind: 'keyword' }], ['카드 뽑기', { kind: 'keyword' }],
    ['깡점수', { kind: 'keyword' }], ['최대 체력', { kind: 'keyword' }],
  ],
  en: [
    ['Max Ink', { kind: 'ink' }], ['Ink', { kind: 'ink' }],
    ['Attack', { kind: 'stat', stat: 'atk' }], ['Guard', { kind: 'stat', stat: 'guard' }],
    ['Heal', { kind: 'stat', stat: 'heal' }], ['Luck', { kind: 'stat', stat: 'luck' }],
    ['critical', { kind: 'keyword' }], ['Critical', { kind: 'keyword' }], ['combo', { kind: 'keyword' }],
    ['Combo', { kind: 'keyword' }], ['Resonance', { kind: 'keyword' }], ['resonance', { kind: 'keyword' }],
    ['multiplier', { kind: 'keyword' }], ['Multiplier', { kind: 'keyword' }], ['Card draws', { kind: 'keyword' }],
  ],
}

const escapeHtml = (value: string): string => value
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function termsForLocale(): Array<[string, TagSpec]> {
  const emotions = (['anger', 'joy', 'sorrow', 'pleasure'] as Emotion[])
    .map((emotion): [string, TagSpec] => [EMOTION_LABEL[emotion], { kind: 'emotion', emotion }])
  return [...emotions, ...(TERMS[currentLocale] ?? [])]
    .filter(([term]) => !!term)
    .sort((a, b) => b[0].length - a[0].length)
}

function tagHtml(term: string, spec: TagSpec): string {
  const label = escapeHtml(term)
  if (spec.kind === 'emotion') {
    return `<span class="trait-tag is-emotion emotion-${spec.emotion}">${emotionIconContent(spec.emotion)}<b>${label}</b></span>`
  }
  if (spec.kind === 'ink') {
    return `<span class="trait-tag is-ink"><img class="trait-tag-ink" src="${INK_UI.costBadge}" alt="" aria-hidden="true" draggable="false"><b>${label}</b></span>`
  }
  if (spec.kind === 'stat') {
    return `<span class="trait-tag is-stat stat-${spec.stat}"><i aria-hidden="true">${icon(STAT_ICON[spec.stat])}</i><b>${label}</b></span>`
  }
  return `<span class="trait-tag is-keyword"><b>${label}</b></span>`
}

/** 한 줄 안의 키워드를 태그로 감싼다. 입력은 평문, 출력은 이스케이프된 HTML. */
export function traitLineHtml(line: string): string {
  const terms = termsForLocale()
  if (!terms.length) return escapeHtml(line)
  const lookup = new Map(terms)
  const pattern = new RegExp(terms.map(([term]) => escapeRegExp(term)).join('|'), 'g')
  let out = ''
  let last = 0
  for (const match of line.matchAll(pattern)) {
    const index = match.index ?? 0
    out += escapeHtml(line.slice(last, index)) + tagHtml(match[0], lookup.get(match[0])!)
    last = index + match[0].length
  }
  return out + escapeHtml(line.slice(last))
}

/** ` · `나 줄바꿈으로 이어 쓴 설명을 줄로 나눈다. */
export function traitLines(desc: string): string[] {
  return desc.split(/\s*·\s*|\n+/).map((line) => line.trim()).filter(Boolean)
}

/**
 * 특성 설명 HTML. 줄이 하나면 그대로, 둘 이상이면 •글머리표 목록으로 쓴다.
 * 감싸는 요소 이름은 쓰는 곳의 레이아웃(span 안/div 안)에 맞춰 고른다.
 */
export function traitDescHtml(desc: string, inline = false): string {
  const lines = traitLines(desc)
  const tag = inline ? 'span' : 'div'
  if (lines.length <= 1) return `<${tag} class="trait-desc">${traitLineHtml(lines[0] ?? '')}</${tag}>`
  const items = lines.map((line) => `<${tag} class="trait-desc-line">${traitLineHtml(line)}</${tag}>`).join('')
  return `<${tag} class="trait-desc is-list">${items}</${tag}>`
}
