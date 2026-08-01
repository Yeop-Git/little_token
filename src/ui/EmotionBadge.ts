import { EMOTION_FACES } from '@/assets'
import { EMOTION_ICON, EMOTION_LABEL, type Emotion } from '@core/types'
import { currentLocale, type LocaleCode } from '@/localization'

const EMOTION_PREFIX: Record<LocaleCode, string> = {
  ko: '감정',
  en: 'Emotion',
  ja: '感情',
  ru: 'Эмоция',
  'zh-Hans': '情绪',
  'zh-Hant': '情緒',
}

/** 감정 캐릭터만 표시한다. 카드에서는 이름 대신 큰 아이콘으로 감정을 읽는다. */
export function emotionIconContent(emotion: Emotion): string {
  const face = EMOTION_FACES[emotion]
  return face
    ? `<img class="emotion-face" src="${face}" alt="" aria-hidden="true">`
    : `<span class="emotion-symbol" aria-hidden="true">${EMOTION_ICON[emotion]}</span>`
}

/** 작은 표식처럼 이름을 숨기는 감정 배지. 접근성 이름과 툴팁에는 감정명을 남긴다. */
export function emotionIconBadge(emotion: Emotion, className: string): string {
  const label = `${EMOTION_PREFIX[currentLocale]}: ${EMOTION_LABEL[emotion]}`
  return `<span class="${className} emotion-${emotion}" title="${label}" aria-label="${label}">${emotionIconContent(emotion)}</span>`
}

/** 카드 모서리처럼 색만으로 감정을 추측하면 안 되는 곳에 아이콘과 이름을 함께 쓴다. */
export function emotionNamedBadge(emotion: Emotion, className: string): string {
  const label = `${EMOTION_PREFIX[currentLocale]}: ${EMOTION_LABEL[emotion]}`
  return `<span class="${className} emotion-${emotion}" title="${label}" aria-label="${label}">${emotionIconContent(emotion)}<b>${EMOTION_LABEL[emotion]}</b></span>`
}

/** 적 약점·공명처럼 감정명이 설명에 필요한 곳은 아이콘과 텍스트를 함께 표시한다. */
export function emotionBadgeContent(emotion: Emotion): string {
  return `${emotionIconContent(emotion)}<span>${EMOTION_LABEL[emotion]}</span>`
}
