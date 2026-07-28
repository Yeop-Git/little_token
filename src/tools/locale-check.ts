import { localizationCoverageErrors, wordTextFor } from '@/localization/content'
import { EARLY_WORDS } from '@data/earlyWords'
import { SUPPORTED_LOCALES } from '@/localization'

const errors = localizationCoverageErrors()
const samples = Object.values(EARLY_WORDS).flat()

for (const locale of SUPPORTED_LOCALES) {
  const rendered = samples.map((word) => wordTextFor(locale, word))
  if (rendered.some((text) => !text.trim())) errors.push(`${locale}: empty starting word`)
  console.log(`${locale.padEnd(7)} 시작 카드 ${rendered.length}장 · ${rendered.slice(0, 3).join(' / ')}`)
}

if (errors.length) {
  errors.forEach((error) => console.error(`위반  ${error}`))
  throw new Error(`현지화 검사 ${errors.length}건 실패`)
}

console.log('현지화 데이터 완전성 통과')
