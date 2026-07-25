import type { Emotion } from '@core/types'

/** 효과와 별개인 카드 정체성. 목록 밖의 단어는 무감정이며 공명을 만들지 않는다. */
const WORD_EMOTIONS: Record<string, Emotion> = {
  // 주어도 문장의 첫 조각이다. 시작 덱에서 네 감정을 고르게 골라 공명 경로를 연다.
  'early:na': 'joy', 'early:eoje': 'sorrow', 'early:nado': 'pleasure', 'early:oneul': 'joy',
  'early:gyeop': 'sorrow', 'early:naman': 'anger', 'early:dachin': 'anger', 'reward:uri': 'pleasure',
  'early:himkkeot': 'anger', 'early:dandanhi': 'joy', 'early:saljjak': 'pleasure', 'early:naepda': 'sorrow',
  'early:kkuk': 'sorrow', 'early:nunmullo': 'joy',
  'early:ttaeryeot': 'anger', 'early:makat': 'anger', 'early:gamssat': 'joy',
  'early:huryeo': 'pleasure', 'early:jikyeot': 'joy', 'early:pumeot': 'pleasure',
  'reward:jaeppalli': 'pleasure', 'reward:motdohage': 'sorrow', 'reward:naedeonjyeot': 'sorrow',
  'reward:ureojyeot': 'sorrow', 'reward:michin': 'anger', 'reward:ipan': 'anger',
  'reward:baksal': 'anger', 'reward:hwissda': 'joy',
  'expansion:na': 'joy', 'expansion:neo': 'anger', 'expansion:geu': 'sorrow', 'expansion:uri': 'pleasure',
  'expansion:holo': 'sorrow', 'expansion:joy': 'pleasure', 'expansion:mad': 'anger', 'expansion:slow': 'joy',
  'expansion:war': 'anger', 'expansion:fir': 'pleasure', 'expansion:sil': 'joy', 'expansion:mem': 'sorrow', 'expansion:bit': 'pleasure',
  'expansion:jin': 'sorrow', 'expansion:hoi': 'pleasure', 'expansion:jum': 'joy', 'expansion:mang': 'sorrow', 'expansion:hui': 'anger',
}

export function emotionFor(pool: string, id: string): Emotion {
  return WORD_EMOTIONS[`${pool}:${id}`] ?? 'neutral'
}
