/**
 * 카드·스티커·유물 설명을 게임 용어 칩으로 바꿔 그린다.
 *
 * 엔진의 규칙 문구는 「가산 +0.6. 이번 스테이지 첫 문장이면 +1.2」처럼 계산식 말투라 처음 보는 사람이 읽기 어렵다.
 * 여기서는 문구 자체(번역 원문)는 그대로 두고, 화면에 그릴 때만
 *  1) 계산 용어를 게임 화면에 실제로 보이는 이름으로 바꾸고(가산 → 배율, 칩 → 깡 점수 …),
 *  2) 수치와 붙은 용어를 색 칩으로 묶고(파랑 = 깡 점수, 빨강 = 배율, 하늘 = 눈물, 금 = 대성공, 초록 = 기회),
 *  3) 「첫 문장」 같은 조건은 노란 밑줄 칩으로, 감정 이름은 감정 색 칩으로 세우고,
 *  4) 문장(마침표) 단위로 줄을 나눈다.
 * 같은 칩 색은 집계판(깡 점수 × 배율)과 같은 색이라 카드에서 읽은 것이 그대로 계산판으로 이어진다.
 */
import { getLocale, t } from '@/score/i18n'
import type { ScoreLocale } from '@/score/i18n'
import { SCORE_EMOTIONS } from '@/score/types'

type Kind = 'chips' | 'mult' | 'tears' | 'crit' | 'chance' | 'cond'
/** [원문에 나오는 말, 화면에 그릴 말, 칩 종류]. 긴 말부터 맞춘다. */
type Term = [string, string, Kind]

const TERMS: Record<ScoreLocale, Term[]> = {
  ko: [
    ['가산 풀', '배율 합계', 'mult'], ['주어 가산', '주어 배율', 'mult'], ['가산 효과', '배율 효과', 'mult'], ['가산', '배율', 'mult'], ['배율', '배율', 'mult'],
    ['칩', '깡 점수', 'chips'], ['눈물', '눈물', 'tears'],
    ['대성공 확률', '대성공', 'crit'], ['대성공 배율', '대성공 배율', 'crit'], ['대성공', '대성공', 'crit'],
    ['남은 기회', '남은 기회', 'chance'], ['마지막 기회', '마지막 기회', 'chance'], ['쓰지 않은 기회', '남은 기회', 'chance'], ['기회', '기회', 'chance'],
    ['첫 문장', '첫 문장', 'cond'], ['직전 문장', '직전 문장', 'cond'], ['다음 문장', '다음 문장', 'cond'], ['서로 다른 감정', '서로 다른 감정', 'cond'], ['같은 감정', '같은 감정', 'cond'], ['이번 스테이지', '이번 스테이지', 'cond'],
  ],
  en: [
    ['additions', 'mult bonuses', 'mult'], ['Add', 'Mult', 'mult'], ['Mult', 'Mult', 'mult'], ['mult', 'mult', 'mult'],
    ['Chips', 'Chips', 'chips'], ['chips', 'chips', 'chips'], ['Tears', 'Tears', 'tears'], ['tears', 'tears', 'tears'],
    ['Crit chance', 'Crit', 'crit'], ['crit chance', 'crit', 'crit'], ['Crit', 'Crit', 'crit'], ['crit', 'crit', 'crit'],
    ['last chance', 'last chance', 'chance'], ['chances left', 'chances left', 'chance'], ['Chance', 'Chance', 'chance'], ['chance', 'chance', 'chance'],
    ['first sentence', 'first sentence', 'cond'], ['previous sentence', 'previous sentence', 'cond'], ['next sentence', 'next sentence', 'cond'], ['different emotions', 'different emotions', 'cond'], ['same emotion', 'same emotion', 'cond'],
  ],
  ja: [
    ['加算プール', '倍率合計', 'mult'], ['加算', '倍率', 'mult'], ['倍率', '倍率', 'mult'],
    ['チップ', 'チップ', 'chips'], ['涙', '涙', 'tears'], ['大成功率', '大成功', 'crit'], ['大成功', '大成功', 'crit'],
    ['最後の機会', '最後の機会', 'chance'], ['機会', '機会', 'chance'],
    ['最初の文', '最初の文', 'cond'], ['直前の文', '直前の文', 'cond'], ['次の文', '次の文', 'cond'], ['異なる感情', '異なる感情', 'cond'], ['同じ感情', '同じ感情', 'cond'],
  ],
  ru: [
    ['прибавок', 'бонусов множителя', 'mult'], ['Прибавка', 'Множитель', 'mult'], ['прибавка', 'множитель', 'mult'], ['Множитель', 'Множитель', 'mult'], ['множитель', 'множитель', 'mult'],
    ['Фишки', 'Фишки', 'chips'], ['фишки', 'фишки', 'chips'], ['фишек', 'фишек', 'chips'], ['Слёзы', 'Слёзы', 'tears'], ['слёзы', 'слёзы', 'tears'], ['слёз', 'слёз', 'tears'],
    ['Шанс крита', 'Крит', 'crit'], ['шанс крита', 'крит', 'crit'], ['крит', 'крит', 'crit'],
    ['последней попытке', 'последней попытке', 'chance'], ['Попытка', 'Попытка', 'chance'], ['попытк', 'попытк', 'chance'],
    ['первой фразе', 'первой фразе', 'cond'], ['следующей фразе', 'следующей фразе', 'cond'], ['предыдущей фразы', 'предыдущей фразы', 'cond'],
  ],
  'zh-Hans': [
    ['加算池', '倍率合计', 'mult'], ['加算', '倍率', 'mult'], ['倍率', '倍率', 'mult'],
    ['筹码', '筹码', 'chips'], ['眼泪', '眼泪', 'tears'], ['大成功几率', '大成功', 'crit'], ['大成功率', '大成功', 'crit'], ['大成功', '大成功', 'crit'],
    ['最后一次机会', '最后一次机会', 'chance'], ['机会', '机会', 'chance'],
    ['第一句', '第一句', 'cond'], ['上一句', '上一句', 'cond'], ['下一句', '下一句', 'cond'], ['不同的情感', '不同的情感', 'cond'], ['同一情感', '同一情感', 'cond'],
  ],
  'zh-Hant': [
    ['加算池', '倍率合計', 'mult'], ['加算', '倍率', 'mult'], ['倍率', '倍率', 'mult'],
    ['籌碼', '籌碼', 'chips'], ['眼淚', '眼淚', 'tears'], ['大成功機率', '大成功', 'crit'], ['大成功率', '大成功', 'crit'], ['大成功', '大成功', 'crit'],
    ['最後一次機會', '最後一次機會', 'chance'], ['機會', '機會', 'chance'],
    ['第一句', '第一句', 'cond'], ['上一句', '上一句', 'cond'], ['下一句', '下一句', 'cond'], ['不同的情感', '不同的情感', 'cond'], ['同一情感', '同一情感', 'cond'],
  ],
}

const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const escHtml = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!))

/** 용어 바로 뒤에 붙은 수치(「+0.6」「= 」「×1.5」「 +30%」)까지 한 칩으로 묶는다. */
const NUM = String.raw`(?:\s*(?:[=]\s*)?(?:[+\-−×]\s*)?\d[\d.,]*%?)?`

interface Compiled { re: RegExp; terms: Map<string, Term>; emotions: Map<string, string> }
const cache = new Map<ScoreLocale, Compiled>()

function compiled(): Compiled {
  const locale = getLocale()
  const hit = cache.get(locale)
  if (hit) return hit
  const terms = new Map<string, Term>()
  for (const term of TERMS[locale]) terms.set(term[0], term)
  const emotions = new Map<string, string>()
  for (const e of SCORE_EMOTIONS) emotions.set(t(`emotion_${e}`), e)
  const words = [...terms.keys(), ...emotions.keys()].sort((a, b) => b.length - a.length).map(escRe)
  // 1) 용어(+수치) 2) 홀로 선 배수 3) 홀로 선 가산치
  const re = new RegExp(`(${words.join('|')})(${NUM})|(×\\s?\\d[\\d.,]*)|(\\+\\s?\\d[\\d.,]*%?)`, 'g')
  const out = { re, terms, emotions }
  cache.set(locale, out)
  return out
}

/** 한 덩어리 문구를 칩이 섞인 HTML로. 줄 나눔은 하지 않는다. */
function chipLine(text: string): string {
  const { re, terms, emotions } = compiled()
  let out = ''
  let last = 0
  for (const m of text.matchAll(re)) {
    out += escHtml(text.slice(last, m.index))
    last = m.index! + m[0].length
    if (m[1]) {
      const emotion = emotions.get(m[1])
      const num = (m[2] ?? '').trim()
      if (emotion) {
        out += `<b class="rc rc-emo e-${emotion}">${escHtml(m[1])}</b>${num ? ` <b class="rc-num">${escHtml(num)}</b>` : ''}`
        continue
      }
      const [, label, kind] = terms.get(m[1])!
      out += `<b class="rc rc-${kind}">${escHtml(label)}${num ? ` <i>${escHtml(num.replace(/^=\s*/, '= '))}</i>` : ''}</b>`
    } else if (m[3]) {
      out += `<b class="rc rc-mult rc-bare">${escHtml(m[3].replace(/\s/g, ''))}</b>`
    } else if (m[4]) {
      out += `<b class="rc-num">${escHtml(m[4].replace(/\s/g, ''))}</b>`
    }
  }
  return out + escHtml(text.slice(last))
}

/** 칩 없이 용어만 게임 화면의 말로 바꾼다(스탯 이름처럼 칩을 세우기엔 짧은 글자). */
export function gameWords(text: string): string {
  const { terms } = compiled()
  const keys = [...terms.keys()].sort((a, b) => b.length - a.length)
  let out = text
  for (const k of keys) {
    const [, label, kind] = terms.get(k)!
    if (kind === 'mult' || kind === 'chips') out = out.split(k).join(`\u0000${label}\u0001`)
  }
  return out.replace(/\u0000|\u0001/g, '')
}

/** 규칙 문구 전체를 문장 단위 줄로 나눠 칩 HTML로 그린다. */
export function ruleChipsHtml(text: string): string {
  const lines = text
    // 「0.6」 같은 소수점은 자르지 않는다 — 마침표 뒤에 빈칸이 있을 때만 줄을 나눈다.
    .split(/(?<=。)|(?<=\.)\s+/)
    .map((s) => s.replace(/[.。]$/, '').trim())
    .filter(Boolean)
  return lines.map((line) => `<span class="rc-line">${chipLine(line)}</span>`).join('')
}
