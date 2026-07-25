import type { Emotion } from '@core/types'

/**
 * 효과와 별개인 카드 정체성. 일반 3슬롯 풀은 타입마다 네 감정을 5장씩 맞춰
 * 어느 감정으로도 3장 공명을 안정적으로 만들 수 있다. 성장/문장부호만 무감정이다.
 */
const WORD_EMOTIONS: Record<string, Emotion> = {
  // 1번 주어: 기쁨 5 · 분노 5 · 슬픔 5 · 즐거움 5
  'early:na': 'joy', 'early:eoje': 'sorrow', 'reward:nado': 'pleasure', 'reward:oneul': 'joy',
  'reward:gyeop': 'anger', 'reward:naman': 'anger', 'reward:dachin': 'sorrow', 'reward:uri': 'pleasure',
  'reward:utneun': 'joy', 'reward:ttatteutan': 'joy', 'reward:andohan': 'joy',
  'reward:hwanan': 'anger', 'reward:matseo': 'anger', 'reward:kkeutkkaji': 'anger',
  'reward:ulmeogin': 'sorrow', 'reward:hollo': 'sorrow', 'reward:gogae': 'sorrow',
  'reward:deultteun': 'pleasure', 'reward:sinnan': 'pleasure', 'reward:jangnan': 'pleasure',

  // 2번 수식: 기쁨 5 · 분노 5 · 슬픔 5 · 즐거움 5
  'early:himkkeot': 'anger', 'early:dandanhi': 'joy', 'early:saljjak': 'pleasure', 'reward:naepda': 'anger',
  'reward:kkuk': 'sorrow', 'reward:nunmullo': 'sorrow',
  'reward:jaeppalli': 'pleasure', 'reward:motdohage': 'sorrow', 'reward:michin': 'anger', 'reward:ipan': 'anger',
  'reward:hwanhage': 'joy', 'reward:pogeunhage': 'joy', 'reward:bangeopge': 'joy', 'reward:useumyeo': 'joy',
  'reward:geochilge': 'anger', 'reward:sseulsseulhi': 'sorrow', 'reward:aesseo': 'sorrow',
  'reward:sinnage': 'pleasure', 'reward:deulsseogimyeo': 'pleasure', 'reward:gyeongkwaehage': 'pleasure',

  // 3번 동사: 일반 카드 2장 + 특수 보상 카드 3장씩으로 감정마다 5장.
  'early:ttaeryeot': 'anger', 'early:makat': 'anger', 'early:gamssat': 'joy',
  'early:huryeo': 'pleasure', 'reward:jikyeot': 'joy', 'reward:pumeot': 'sorrow',
  'reward:naedeonjyeot': 'pleasure', 'reward:ureojyeot': 'sorrow',

  'special:focusStrike': 'anger', 'special:pierceStrike': 'sorrow', 'special:spreadTwo': 'joy',
  'special:splitTwo': 'pleasure', 'special:scatterThree': 'joy', 'special:pourThree': 'sorrow',
  'special:doubleTap': 'anger', 'special:flurry': 'pleasure', 'special:counterOne': 'joy',
  'special:counterTwo': 'pleasure', 'special:tearMend': 'sorrow', 'special:riseAgain': 'anger',

  // 5슬롯 확장 데이터는 일반 런의 공명 비율과 독립적으로 보존한다.
  'expansion:na': 'joy', 'expansion:neo': 'anger', 'expansion:geu': 'sorrow', 'expansion:uri': 'pleasure',
  'expansion:holo': 'sorrow', 'expansion:joy': 'pleasure', 'expansion:mad': 'anger', 'expansion:slow': 'joy',
  'expansion:war': 'anger', 'expansion:fir': 'pleasure', 'expansion:sil': 'joy', 'expansion:mem': 'sorrow', 'expansion:bit': 'pleasure',
  'expansion:jin': 'sorrow', 'expansion:hoi': 'pleasure', 'expansion:jum': 'joy', 'expansion:mang': 'sorrow', 'expansion:hui': 'anger',
}

export function emotionFor(pool: string, id: string): Emotion {
  return WORD_EMOTIONS[`${pool}:${id}`] ?? 'neutral'
}
