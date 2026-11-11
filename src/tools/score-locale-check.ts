/**
 * 점수 재기획 번역 검사. 여섯 언어가 같은 id·같은 키를 모두 채우고,
 * 규칙 문장의 자리표시({a}, {b%} …)가 한국어 원본에 있는 것만 쓰는지 확인한다.
 * 실행: npm run score:locale
 */
import { KO, PACKS, SCORE_LOCALES, type ContentKind } from '../score/i18n'
import { UI_KO, type UiKey } from '../score/i18n/ko'

const errors: string[] = []
const holes = (s: string) => new Set([...s.matchAll(/\{(\w+)%?\}/g)].map((m) => m[1]))
const KINDS: ContentKind[] = ['card', 'sticker', 'relic', 'weather', 'form', 'stat']
const HANGUL = /[가-힣]/

for (const locale of SCORE_LOCALES) {
  if (locale === 'ko') continue
  const pack = PACKS[locale]
  for (const key of Object.keys(UI_KO) as UiKey[]) {
    const text = pack.ui[key]
    if (!text) { errors.push(`${locale} ui.${key}: 번역 없음`); continue }
    if (HANGUL.test(text)) errors.push(`${locale} ui.${key}: 한글이 남아 있음`)
    const want = holes(UI_KO[key])
    const got = holes(text)
    for (const h of want) if (!got.has(h)) errors.push(`${locale} ui.${key}: {${h}} 빠짐`)
    for (const h of got) if (!want.has(h)) errors.push(`${locale} ui.${key}: 원본에 없는 {${h}}`)
  }
  for (const key of Object.keys(pack.ui)) if (!(key in UI_KO)) errors.push(`${locale} ui.${key}: 원본에 없는 키`)
  for (const kind of KINDS) {
    for (const [id, ko] of Object.entries(KO[kind])) {
      const tr = pack[kind][id]
      if (!tr?.name || !tr.rule) { errors.push(`${locale} ${kind}.${id}: 번역 없음`); continue }
      if (HANGUL.test(tr.name + tr.rule)) errors.push(`${locale} ${kind}.${id}: 한글이 남아 있음`)
      const want = holes(ko.rule)
      for (const h of holes(tr.rule)) if (!want.has(h)) errors.push(`${locale} ${kind}.${id}: 원본에 없는 {${h}}`)
      for (const h of want) if (!holes(tr.rule).has(h)) errors.push(`${locale} ${kind}.${id}: {${h}} 빠짐`)
    }
    for (const id of Object.keys(pack[kind])) if (!(id in KO[kind])) errors.push(`${locale} ${kind}.${id}: 원본에 없는 id`)
  }
}

for (const e of errors) console.error(`✗ ${e}`)
console.log(`score:locale — 언어 ${SCORE_LOCALES.length} · 오류 ${errors.length}`)
if (errors.length) process.exit(1)
