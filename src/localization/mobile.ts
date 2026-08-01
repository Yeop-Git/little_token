import { currentLocale, type LocaleCode } from './index'

const COPY = {
  ko: { rotateTitle: '기기를 가로로 돌려 주세요', rotateBody: '가로 화면에서 카드와 전장을 더 또렷하게 볼 수 있습니다.' },
  en: { rotateTitle: 'Rotate your device', rotateBody: 'Use landscape to see the cards and battlefield clearly.' },
  ja: { rotateTitle: '端末を横向きにしてください', rotateBody: '横画面にするとカードと戦場を見やすく遊べます。' },
  ru: { rotateTitle: 'Поверните устройство', rotateBody: 'В альбомной ориентации карты и поле боя видны лучше.' },
  'zh-Hans': { rotateTitle: '请将设备横过来', rotateBody: '横屏时可以更清楚地查看卡牌和战场。' },
  'zh-Hant': { rotateTitle: '請將裝置橫過來', rotateBody: '橫向畫面能更清楚地查看卡牌和戰場。' },
} as const satisfies Record<LocaleCode, Record<string, string>>

export function mobileText(key: keyof typeof COPY.ko, locale: LocaleCode = currentLocale): string {
  return COPY[locale][key]
}
