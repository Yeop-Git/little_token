import { currentLocale, type LocaleCode } from './index'

const COPY: Record<LocaleCode, { pop: (value: number) => string; log: (value: number) => string }> = {
  ko: { pop: (value) => `무럭무럭 최대 체력 +${value}`, log: (value) => `무럭무럭 자라 최대 체력이 ${value} 늘었다.` },
  en: { pop: (value) => `Growing! Max HP +${value}`, log: (value) => `It grew: Max HP increased by ${value}.` },
  ja: { pop: (value) => `すくすく！ 最大HP +${value}`, log: (value) => `すくすく育ち、最大HPが${value}増えた。` },
  ru: { pop: (value) => `Всё выше! Макс. здоровье +${value}`, log: (value) => `Росток вырос: макс. здоровье +${value}.` },
  'zh-Hans': { pop: (value) => `茁壮成长！最大生命 +${value}`, log: (value) => `茁壮成长，最大生命提高了${value}。` },
  'zh-Hant': { pop: (value) => `茁壯成長！最大生命 +${value}`, log: (value) => `茁壯成長，最大生命提高了${value}。` },
}

export function growthText(value: number, locale: LocaleCode = currentLocale): { pop: string; log: string } {
  return { pop: COPY[locale].pop(value), log: COPY[locale].log(value) }
}
