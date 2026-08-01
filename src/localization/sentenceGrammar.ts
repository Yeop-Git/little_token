import type { LocaleCode } from './index'

/** 완결된 두 번째 동사를 앞 동사와 자연스럽게 잇는 언어별 접속 표기. */
export const TWIN_VERB_CONNECTOR: Record<LocaleCode, string> = {
  ko: '그리고 ',
  en: 'and ',
  ja: '、そして',
  ru: 'и ',
  'zh-Hans': '，并',
  'zh-Hant': '，並',
}

export function sentenceSlotText(locale: LocaleCode, slotKey: string, text: string, hasPreviousVerb: boolean): string {
  if (slotKey !== 'verb2' || !hasPreviousVerb) return text
  return `${TWIN_VERB_CONNECTOR[locale]}${text}`
}

export function sentenceUsesCompactSpacing(locale: LocaleCode): boolean {
  return locale === 'ja' || locale === 'zh-Hans' || locale === 'zh-Hant'
}
