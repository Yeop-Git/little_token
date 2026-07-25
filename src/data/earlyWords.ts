/**
 * 실제 3슬롯 일반 런 데이터 조립.
 * 원본 단어와 맥락 데이터는 csv/에서 관리하고 generated/는 자동 생성한다.
 */

import type { Tables, Word } from '@core/types'
import type { PlayerState } from '@core/player'
import { hasPassive, slotOrderFor } from '@core/passives'
import { buildTemplate } from './slots'
import {
  EARLY_COMBOS,
  EARLY_CONFLICTS,
  EARLY_DISSONANCES,
  EARLY_WORDS,
  GROW_WORDS,
  PUNCT_WORDS,
  REWARD_WORDS,
} from './generated/sentenceData'

export { EARLY_COMBOS, EARLY_CONFLICTS, EARLY_WORDS, GROW_WORDS, PUNCT_WORDS, REWARD_WORDS }

export const EARLY_TEMPLATE = ['subj', 'adv', 'verb']

const MULT_CAP = 2.5

/**
 * 아이템 패시브가 슬롯을 늘리면 그 칸의 단어 목록도 함께 채워야 한다.
 * 겹동사는 동사 덱을 그대로 다시 쓰고, 문장부호는 전용 풀을 쓴다.
 */
export function makeEarlyTables(
  deck: Record<string, Word[]> = EARLY_WORDS,
  player?: PlayerState,
): Tables {
  const order = slotOrderFor(EARLY_TEMPLATE, player)
  const words: Record<string, Word[]> = { ...deck }
  if (hasPassive(player, 'punct')) words.punct = PUNCT_WORDS
  // 잭과 숙주나물 — 열려 있는 슬롯마다 무럭무럭을 한 장씩 뿌린다.
  // 문장부호 칸은 당근을 들고 있을 때만 존재하므로 자연히 그때만 붙는다.
  if (hasPassive(player, 'beanstalk')) {
    for (const w of GROW_WORDS) {
      if (!words[w.slot]) continue
      if (!words[w.slot].some((x) => x.id === w.id)) words[w.slot] = [...words[w.slot], w]
    }
  }
  // 겹슬롯은 원본 칸의 목록을 그대로 다시 쓴다(무럭무럭까지 포함해서).
  if (hasPassive(player, 'twinSubj')) words.subj2 = words.subj ?? []
  if (hasPassive(player, 'twinVerb')) words.verb2 = words.verb ?? []
  return {
    template: buildTemplate(order),
    words,
    combos: EARLY_COMBOS,
    conflicts: EARLY_CONFLICTS,
    dissonances: EARLY_DISSONANCES,
    multCap: MULT_CAP,
  }
}
