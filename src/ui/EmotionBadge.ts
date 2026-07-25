import { EMOTION_FACES } from '@/assets'
import { EMOTION_ICON, EMOTION_LABEL, type Emotion } from '@core/types'

/** 감정 캐릭터와 텍스트를 카드 뱃지에서 동일한 구조로 표시한다. */
export function emotionBadgeContent(emotion: Emotion): string {
  const face = EMOTION_FACES[emotion]
  const icon = face
    ? `<img class="emotion-face" src="${face}" alt="" aria-hidden="true">`
    : `<span class="emotion-symbol" aria-hidden="true">${EMOTION_ICON[emotion]}</span>`
  return `${icon}<span>${EMOTION_LABEL[emotion]}</span>`
}
