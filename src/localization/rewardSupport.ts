import { currentLocale, type LocaleCode } from './index'

const TEXT: Record<LocaleCode, string> = {
  ko: '보스 보상: 부족한 영감만큼 가격이 낮아졌어요.',
  en: 'Boss reward: prices are reduced to fit your Inspiration.',
  ja: 'ボス報酬：ひらめきが足りない分、価格が下がります。',
  ru: 'Награда за босса: цены снижены до доступного вдохновения.',
  'zh-Hans': '首领奖励：灵感不足时，价格会降低。',
  'zh-Hant': '首領獎勵：靈感不足時，價格會降低。',
}
export function bossRewardDiscountText(locale: LocaleCode = currentLocale): string { return TEXT[locale] }
