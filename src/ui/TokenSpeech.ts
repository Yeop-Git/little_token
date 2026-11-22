/**
 * 토큰 말풍선 대사 표식 → HTML.
 *
 * 대사 원문(localization/bossToken.ts)에는 세 가지 표식만 쓴다.
 * - `\n`            : 웹소설식 줄 끊기. 한 줄은 한 호흡이다.
 * - `**낱말**`       : 굵은 강조. 말풍선 잉크색보다 진한 색에 형광펜 밑줄이 깔린다.
 * - `[[종류:낱말]]`  : 특성 설명과 같은 색 태그. 종류는 atk·guard·heal·ink·slot·kw·emo.
 *                     종류를 빼면 언어별 태그 사전에서 찾는다.
 *
 * 글자는 낱말 단위로 짧게 번져 나온다(`--d` 지연). 다 읽기 전에 사라지지 않도록
 * 말풍선 수명은 `speechLifeMs`가 글자 수로 정한다.
 */
import { SPEECH_TAG_KINDS as TAG_KINDS, tokenSpeechPlain, type SpeechTagKind } from '@/localization/tokenSpeechMarkup'
import { speechTagHtml } from './TraitText'

export { speechLifeMs, tokenSpeechPlain } from '@/localization/tokenSpeechMarkup'

/** 띄어쓰기가 없는 언어(일·중)는 이 글자 수마다 끊어 번지게 한다. */
const CJK_CHUNK = 4
/** 마지막 낱말까지 번지는 데 걸리는 시간 상한. 길어도 이 안에 다 보인다. */
const REVEAL_SPAN_MS = 700
const REVEAL_STEP_MS = 42

const escapeHtml = (value: string): string => value
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function chunks(text: string): string[] {
  const out: string[] = []
  for (const part of text.split(/(\s+)/)) {
    if (!part) continue
    if (/^\s+$/.test(part) || [...part].length <= CJK_CHUNK + 2 || /[a-zA-Zа-яА-Я가-힣]/.test(part)) {
      out.push(part)
      continue
    }
    const letters = [...part]
    for (let i = 0; i < letters.length; i += CJK_CHUNK) out.push(letters.slice(i, i + CJK_CHUNK).join(''))
  }
  return out
}

/** 표식 대사를 말풍선 HTML로. 입력은 신뢰하는 번역 원문 + 이름 같은 변수, 출력은 이스케이프된 HTML. */
export function tokenSpeechHtml(text: string): string {
  let index = 0
  const total = Math.max(1, (tokenSpeechPlain(text).match(/\S+/g) ?? []).length)
  const step = Math.min(REVEAL_STEP_MS, REVEAL_SPAN_MS / total)
  const unit = (html: string) => `<span class="ts-w" style="--d:${Math.round(index++ * step)}ms">${html}</span>`

  const inline = (segment: string): string => {
    const pieces = segment.split(/(\[\[[^\]]+\]\])/)
    let html = ''
    for (let p = 0; p < pieces.length; p++) {
      const piece = pieces[p]
      const tag = /^\[\[(?:([a-z]+):)?([^\]]+)\]\]$/.exec(piece)
      if (tag) {
        const kind = tag[1] && TAG_KINDS.has(tag[1] as SpeechTagKind) ? tag[1] as SpeechTagKind : undefined
        // 태그 바로 뒤에 붙은 조사·어미(「주어」부터, 「방어」해!)는 태그와 한 덩어리로 묶어
        // 줄이 바뀔 때 태그만 윗줄에 남지 않게 한다.
        // 띄어쓰기 없는 언어는 다음 문장 전체가 딸려 오지 않게 세 글자까지만 묶는다.
        const tail = [...(/^[^\s*[]+/.exec(pieces[p + 1] ?? '')?.[0] ?? '')].slice(0, 3).join('')
        if (tail) pieces[p + 1] = pieces[p + 1].slice(tail.length)
        html += unit(`${speechTagHtml(tag[2], kind)}${tail ? `<span class="ts-tail">${escapeHtml(tail)}</span>` : ''}`)
        continue
      }
      html += piece.split('\n').map((row) => chunks(row)
        .map((word) => (/^\s+$/.test(word) ? ' ' : unit(escapeHtml(word))))
        .join('')).join('<br>')
    }
    return html
  }

  return text.split('**').map((segment, i) => (
    i % 2 ? `<strong class="ts-strong">${inline(segment)}</strong>` : inline(segment)
  )).join('')
}
