/**
 * 아이템 특성 설명을 읽히는 모양으로 바꾼다.
 * - ` · `로 이어 쓴 설명은 •글머리표 줄로 나눈다.
 * - 감정·잉크·스탯·전투 키워드는 아이콘이 붙은 색 태그로 감싼다(감정은 감정색).
 * 보상 카드, 보유 아이템 툴팁, 아이템 획득 연출이 같은 함수를 쓴다.
 */
import { INK_UI } from '@/assets'
import { currentLocale } from '@/localization'
import { EMOTION_LABEL, type Emotion } from '@core/types'
import { keywordDetailByLabel } from '@core/wordKeywords'
import { emotionIconContent } from './EmotionBadge'
import { icon } from './Icons'

type TagSpec =
  | { kind: 'emotion'; emotion: Emotion }
  | { kind: 'ink' }
  | { kind: 'stat'; stat: 'atk' | 'guard' | 'heal' | 'luck' }
  | { kind: 'keyword' }
  | { kind: 'slot' }

const STAT_ICON = { atk: 'sword', guard: 'shield', heal: 'cross', luck: 'clover' } as const

/** 언어별 태그 사전. 긴 말부터 맞춘다(예: '최대 잉크'가 '잉크'보다 먼저). */
const TERMS: Record<string, Array<[string, TagSpec]>> = {
  ko: [
    ['최대 잉크', { kind: 'ink' }], ['잉크 최대치', { kind: 'ink' }], ['잉크', { kind: 'ink' }],
    ['공격', { kind: 'stat', stat: 'atk' }], ['방어', { kind: 'stat', stat: 'guard' }],
    // '방어도'가 '방어'+'도'로 쪼개져 태그되던 것을 한 덩어리로 묶는다.
    ['방어도', { kind: 'stat', stat: 'guard' }], ['방어 스탯', { kind: 'stat', stat: 'guard' }],
    ['회복', { kind: 'stat', stat: 'heal' }], ['운 스탯', { kind: 'stat', stat: 'luck' }],
    ['대성공', { kind: 'keyword' }], ['관용구', { kind: 'keyword' }], ['공명', { kind: 'keyword' }],
    ['공명 배율', { kind: 'keyword' }], ['관용구 배율', { kind: 'keyword' }], ['배율 풀', { kind: 'keyword' }], ['배율', { kind: 'keyword' }], ['카드 뽑기', { kind: 'keyword' }],
    ['최대 체력', { kind: 'keyword' }], ['생명력 폭발', { kind: 'keyword' }], ['무럭무럭', { kind: 'keyword' }], ['랭크', { kind: 'keyword' }],
    ['문장부호 칸', { kind: 'slot' }], ['문장부호', { kind: 'slot' }], ['주어 칸', { kind: 'slot' }], ['동사 칸', { kind: 'slot' }],
    ['수식어 칸', { kind: 'slot' }], ['서술어', { kind: 'slot' }], ['주어', { kind: 'slot' }], ['수식어', { kind: 'slot' }], ['동사', { kind: 'slot' }],
    // 전장 TIP·적 기믹 설명에 자주 나오는 전투 용어(11/20 피드백: 팁도 태그로).
    ['매직실드', { kind: 'keyword' }], ['관통', { kind: 'keyword' }], ['카운터', { kind: 'keyword' }],
    ['방패치기', { kind: 'keyword' }], ['연타', { kind: 'keyword' }], ['그로기', { kind: 'keyword' }],
    ['흡혈', { kind: 'keyword' }], ['선공', { kind: 'keyword' }], ['봉인', { kind: 'keyword' }],
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

/** 한국어 설명 속 태그 툴팁. 전투 키워드는 카드 키워드 설명(wordKeywords)을 먼저 쓴다. */
const TAG_TIPS_KO: Record<string, string> = {
  공격: '적의 체력을 깎는 행동이에요.\n공격 동사로 문장을 끝내면 피해를 줘요.',
  방어: '실드를 쌓아 받는 피해를 줄여요.\n방어 동사로 문장을 끝내면 실드가 생겨요.',
  회복: '잃은 체력을 되찾아요.\n회복 동사로 문장을 끝내면 체력이 차요.',
  '운 스탯': '확률 효과가 터질 가능성을 높여요.',
  잉크: '카드를 낼 때 쓰는 자원이에요.\n카드마다 잉크 비용이 있어요.',
  '최대 잉크': '한 문장에 쓸 수 있는 잉크의 최대치예요.',
  '잉크 최대치': '한 문장에 쓸 수 있는 잉크의 최대치예요.',
  관용구: '정해진 카드 조합으로 문장을 완성하면 붙는 보너스예요.\n관용구 배율이 곱해져요.',
  공명: '같은 감정 카드를 한 문장에 모으면 일어나요.\n공명 배율이 곱해져요.',
  '공명 배율': '같은 감정 카드가 모였을 때 곱해지는 배율이에요.',
  '관용구 배율': '관용구를 완성했을 때 곱해지는 배율이에요.',
  '배율 풀': '여러 보너스를 더해서 한 번에 곱하는 배율이에요.',
  배율: '문장의 기본 점수에 곱해지는 값이에요.',
  '최대 체력': '체력이 차오를 수 있는 최대치예요.',
  랭크: '공격·방어를 25%씩 올리거나 내리는 단계예요.\n그 스테이지가 끝나면 사라져요.',
  무럭무럭: '문장을 쓰면 최대 체력이 영구히 자라요.\n배율을 받지 않는 고정 점수예요.',
  그로기: '큰 기믹이 막히면 빠지는 상태예요.\n주는 피해가 커지고 예정된 공격을 한 턴 걸러요.',
  봉인: '거미줄에 묶인 카드는 풀릴 때까지 쓸 수 없어요.',
  '카드 뽑기': '손패를 새로 채우는 행동이에요.',
  주어: '문장의 주인공 카드를 놓는 칸이에요.',
  수식어: '동사를 꾸며 효과를 더하는 카드를 놓는 칸이에요.',
  동사: '문장의 행동을 정하는 칸이에요.\n공격·방어·회복은 동사가 정해요.',
  서술어: '문장의 행동을 정하는 칸이에요.\n공격·방어·회복은 서술어가 정해요.',
  문장부호: '문장 끝에 붙는 부호 카드를 놓는 칸이에요.',
}

function tagTip(term: string, spec: TagSpec): string {
  if (spec.kind === 'emotion') return currentLocale === 'ko' ? `${term} 감정 카드예요.\n적의 약점 감정으로 공격하면 피해가 커져요.` : ''
  if (currentLocale !== 'ko') return keywordDetailByLabel(term) ?? ''
  return TAG_TIPS_KO[term] ?? TAG_TIPS_KO[term.replace(/ 칸$/, '')] ?? keywordDetailByLabel(term) ?? ''
}

/** 태그 툴팁 속성 — 이름은 제목, 설명은 본문. TooltipLayer가 읽는다. */
function tagTipAttrs(term: string, spec: TagSpec): string {
  const tipText = tagTip(term, spec)
  return tipText ? ` data-tip-title="${escapeHtml(term)}" data-tooltip="${escapeHtml(tipText)}"` : ''
}

function tagHtml(term: string, spec: TagSpec): string {
  const label = escapeHtml(term)
  const tipAttrs = tagTipAttrs(term, spec)
  if (spec.kind === 'emotion') {
    return `<span class="trait-tag is-emotion emotion-${spec.emotion}"${tipAttrs}>${emotionIconContent(spec.emotion)}<b>${label}</b></span>`
  }
  if (spec.kind === 'ink') {
    return `<span class="trait-tag is-ink"${tipAttrs}><img class="trait-tag-ink" src="${INK_UI.costBadge}" alt="" aria-hidden="true" draggable="false"><b>${label}</b></span>`
  }
  if (spec.kind === 'stat') {
    return `<span class="trait-tag is-stat stat-${spec.stat}"${tipAttrs}><i aria-hidden="true">${icon(STAT_ICON[spec.stat])}</i><b>${label}</b></span>`
  }
  if (spec.kind === 'slot') return `<span class="trait-tag is-slot"${tipAttrs}><b>${label}</b></span>`
  return `<span class="trait-tag is-keyword"${tipAttrs}><b>${label}</b></span>`
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

/**
 * 전장 TIP·적 설명 한 줄 — 「카드 이름」은 카드 태그로, 나머지는 특성 설명과 같은 키워드 태그로 감싼다.
 * 입력은 평문, 출력은 이스케이프된 HTML.
 */
export function tipLineHtml(line: string): string {
  return line.split(/(「[^」]+」|⟦[^⟧]+⟧)/).map((part) => {
    const card = /^「([^」]+)」$/.exec(part)
    if (card) return cardTagHtml(card[1])
    const calc = /^⟦([^|⟧]+)\|([^⟧]+)⟧$/.exec(part)
    if (calc) return calcTagHtml(calc[1], calc[2])
    return traitLineHtml(part)
  }).join('')
}

/**
 * ⟦보이는 값|계산 줄; 계산 줄⟧ — 점선 밑줄 숫자. 올리면 그 값이 나온 계산식을 옆 쪽지로 보여 준다.
 * 본문은 "최대 체력 절반 + 방어×2"처럼 말로 두고, 실제 숫자 계산은 여기로 미룬다(11/20 피드백).
 */
function calcTagHtml(shown: string, lines: string): string {
  const tipText = lines.split(/\s*;\s*/).filter(Boolean).join('\n')
  return `<span class="trait-tag is-calc" data-tip-title="${currentLocale === 'ko' ? '계산식' : 'Formula'}" data-tooltip="${escapeHtml(tipText)}"><b>${escapeHtml(shown)}</b></span>`
}

/** 「카드 이름」 태그 — 카드 모양 딱지. 올리면 TooltipLayer가 옆에 실제 카드 앞면을 띄운다. */
function cardTagHtml(name: string): string {
  const safe = escapeHtml(name)
  return `<span class="trait-tag is-card" data-tip-card="${safe}" data-tip-title="${safe}" data-tooltip="${safe}"><i class="trait-card-glyph" aria-hidden="true"></i><b>${safe}</b></span>`
}
