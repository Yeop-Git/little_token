import { currentLocale, type LocaleCode } from './index'
const TEXT: Record<LocaleCode, string> = {
  ko: '문장을 완성할 수 있도록 일부 카드는 지울 수 없어요.',
  en: 'Some cards are protected so you can still complete a sentence.',
  ja: '文を完成できるよう、一部のカードは消せません。',
  ru: 'Некоторые карты защищены, чтобы фразу можно было завершить.',
  'zh-Hans': '为确保能完成句子，部分卡牌无法移除。',
  'zh-Hant': '為確保能完成句子，部分卡牌無法移除。',
}
export function protectedCardsText(locale: LocaleCode = currentLocale): string { return TEXT[locale] }
