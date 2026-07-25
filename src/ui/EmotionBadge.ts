import { EMOTION_FACES } from '@/assets'
import { EMOTION_ICON, EMOTION_LABEL, type Emotion } from '@core/types'

/** 감정 캐릭터만 표시한다. 카드에서는 이름 대신 큰 아이콘으로 감정을 읽는다. */
export function emotionIconContent(emotion: Emotion): string {
  const face = EMOTION_FACES[emotion]
  return face
    ? `<img class="emotion-face" src="${face}" alt="" aria-hidden="true">`
    : `<span class="emotion-symbol" aria-hidden="true">${EMOTION_ICON[emotion]}</span>`
}

/** 텍스트를 숨긴 카드용 감정 배지. 접근성 이름과 툴팁에는 감정명을 남긴다. */
export function emotionIconBadge(emotion: Emotion, className: string): string {
  const label = `감정: ${EMOTION_LABEL[emotion]}`
  return `<span class="${className} emotion-${emotion}" title="${label}" aria-label="${label}">${emotionIconContent(emotion)}</span>`
}

/** 적 약점·공명처럼 감정명이 설명에 필요한 곳은 아이콘과 텍스트를 함께 표시한다. */
export function emotionBadgeContent(emotion: Emotion): string {
  return `${emotionIconContent(emotion)}<span>${EMOTION_LABEL[emotion]}</span>`
}
