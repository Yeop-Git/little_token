import { localizationCoverageErrors, wordTextFor } from '@/localization/content'
import { EARLY_WORDS } from '@data/earlyWords'
import { PROPER_NAMES, SUPPORTED_LOCALES } from '@/localization'
import { localizedGuidePages } from '@/localization/guide'
import { missingLocalizationTexts, translateText } from '@/localization/dom'
import { bossTokenLocalizationErrors } from '@/localization/bossToken'

const errors = [...localizationCoverageErrors(), ...bossTokenLocalizationErrors()]
const samples = Object.values(EARLY_WORDS).flat()
const EXPECTED_PROPER_NAMES = {
  ko: { player: '프롬', token: '토큰' },
  en: { player: 'Prompt', token: 'Token' },
  ja: { player: 'プロンプト', token: 'トークン' },
  ru: { player: 'Промпт', token: 'Токен' },
  'zh-Hans': { player: '提示词', token: '词元' },
  'zh-Hant': { player: '提示詞', token: '詞元' },
} as const

for (const locale of SUPPORTED_LOCALES) {
  const expectedNames = EXPECTED_PROPER_NAMES[locale]
  if (PROPER_NAMES[locale].player !== expectedNames.player) errors.push(`${locale}: player proper name is not ${expectedNames.player}`)
  if (PROPER_NAMES[locale].token !== expectedNames.token) errors.push(`${locale}: token proper name is not ${expectedNames.token}`)
  if (locale !== 'ko' && translateText('프롬', locale) !== expectedNames.player) errors.push(`${locale}: player name translation is not canonical`)
  if (locale !== 'ko' && translateText('토큰', locale) !== expectedNames.token) errors.push(`${locale}: token name translation is not canonical`)
  const rendered = samples.map((word) => wordTextFor(locale, word))
  if (rendered.some((text) => !text.trim())) errors.push(`${locale}: empty starting word`)
  console.log(`${locale.padEnd(7)} 시작 카드 ${rendered.length}장 · ${rendered.slice(0, 3).join(' / ')}`)
}

for (const locale of SUPPORTED_LOCALES.filter((value) => value !== 'ko')) {
  const pages = localizedGuidePages(locale)
  if (pages.length !== 6) errors.push(`${locale}: guide chapter count ${pages.length} != 6`)
  for (const chapter of pages) {
    if (!chapter.title.trim() || !chapter.body.trim()) errors.push(`${locale}: empty guide chapter ${chapter.key}`)
    if (/[가-힣]/.test(`${chapter.title}${chapter.hint}${chapter.body}`)) errors.push(`${locale}: Korean remains in guide chapter ${chapter.key}`)
  }
  missingLocalizationTexts.clear()
  const uiSamples = [
    '전투 상태', '지금 배율', '새 단어', '제련 완료', '일기장이 너무 상했다…',
    '카드 9 / 51', '적 2 / 10', '운 ×1.06', '9종', '문장부호', '행동',
    '그래픽 품질', '해상도 배율', '최대 FPS', '이펙트 품질', '후처리 품질',
    '안티앨리어싱 품질', '마스터 볼륨', '쓰러진 장로거미', '고개를 떨군 토큰',
  ]
  for (const sample of uiSamples) {
    if (/[가-힣]/.test(translateText(sample, locale))) errors.push(`${locale}: UI phrase not localized: ${sample}`)
  }
  for (const missing of missingLocalizationTexts) errors.push(`${locale}: UI phrase uses missing-translation fallback: ${missing}`)
}

if (errors.length) {
  errors.forEach((error) => console.error(`위반  ${error}`))
  throw new Error(`현지화 검사 ${errors.length}건 실패`)
}

console.log('현지화 데이터 완전성 통과')
