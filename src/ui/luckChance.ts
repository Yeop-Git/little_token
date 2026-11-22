/**
 * 운 반영 확률 표기 — 카드·상세·상점이 같은 모양으로 쓴다.
 * 화면에는 운이 반영된 최종 확률을 크게 두고, 마우스를 올리면 기본 확률과 운 몫을 밝힌다.
 */
import { CRIT_CAP } from '@/core/compiler'
import { getCardLuck, luckChance, type LuckChance } from '@/core/luck'
import type { Word } from '@/core/types'
import { currentLocale, type LocaleCode } from '@/localization'

const COPY: Record<LocaleCode, { title: string; line: string }> = {
  ko: { title: '운 반영 확률', line: '기본 {base}% + 운 +{bonus}% = {final}%' },
  en: { title: 'Luck-adjusted chance', line: 'Base {base}% + Luck +{bonus}% = {final}%' },
  ja: { title: '運を反映した確率', line: '基本{base}% + 運 +{bonus}% = {final}%' },
  ru: { title: 'Шанс с учётом удачи', line: 'База {base}% + удача +{bonus}% = {final}%' },
  'zh-Hans': { title: '计入幸运的概率', line: '基础{base}% + 幸运 +{bonus}% = {final}%' },
  'zh-Hant': { title: '計入幸運的機率', line: '基礎{base}% + 幸運 +{bonus}% = {final}%' },
}

const pct = (value: number) => String(Math.round(value * 100))

/** "기본 75% + 운 +3% = 78%" */
export function luckChanceTooltip(chance: LuckChance, locale: LocaleCode = currentLocale): string {
  const copy = COPY[locale]
  return copy.line
    .replace('{base}', pct(chance.base))
    .replace('{bonus}', String(Math.round(chance.final * 100) - Math.round(chance.base * 100)))
    .replace('{final}', pct(chance.final))
}

const escapeAttr = (value: string) => value
  .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** 툴팁 레이어(data-tooltip)가 읽는 속성들. 다른 태그에 붙일 때도 이것만 덧붙이면 된다. */
export function luckChanceAttrs(chance: LuckChance): string {
  const tip = luckChanceTooltip(chance)
  return `data-tooltip="${escapeAttr(tip)}" data-tip-title="${escapeAttr(COPY[currentLocale].title)}" data-tip-place="above" aria-label="${escapeAttr(`${COPY[currentLocale].title}: ${tip}`)}" tabindex="0"`
}

/** <span class="luck-chance">78%</span> — 운 반영 최종 확률 태그. */
export function luckChanceHtml(chance: LuckChance, extraClass = ''): string {
  return `<span class="luck-chance${chance.bonus > 0 ? ' boosted' : ''}${extraClass ? ` ${extraClass}` : ''}" ${luckChanceAttrs(chance)}>${pct(chance.final)}%</span>`
}

/** 이 카드가 화면에 적는 확률들(도박 성공·대성공) — 운 반영 후 값. */
export function wordLuckChances(word: Word, luck = getCardLuck()): LuckChance[] {
  const out: LuckChance[] = []
  if (word.variance) out.push(luckChance(word.variance.p, luck))
  if (word.crit) out.push(luckChance(word.crit, luck, CRIT_CAP))
  return out
}

/**
 * 이미 만들어진 문구(HTML 안전한 텍스트) 속 확률 숫자를 운 확률 태그로 바꾼다.
 * 카드가 가진 확률 수만큼, 같은 숫자의 첫 등장부터 바꾼다. "대성공 확률 +20%"처럼 다른 값은 그대로 둔다.
 */
export function tagLuckChances(text: string, chances: readonly LuckChance[]): string {
  let out = text
  for (const chance of chances) {
    const label = `${Math.round(chance.final * 100)}%`
    const at = out.search(new RegExp(`(?<![\\d.>])${label.replace('%', '%')}`))
    if (at < 0) continue
    out = `${out.slice(0, at)}${luckChanceHtml(chance)}${out.slice(at + label.length)}`
  }
  return out
}
