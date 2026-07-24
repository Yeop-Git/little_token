/**
 * 실제 3슬롯 일반 런 데이터 조립.
 * 원본 단어와 맥락 데이터는 csv/에서 관리하고 generated/는 자동 생성한다.
 */

import type { Tables, Word } from '@core/types'
import { buildTemplate } from './slots'
import {
  EARLY_COMBOS,
  EARLY_CONFLICTS,
  EARLY_DISSONANCES,
  EARLY_WORDS,
  REWARD_WORDS,
} from './generated/sentenceData'

export { EARLY_COMBOS, EARLY_CONFLICTS, EARLY_WORDS, REWARD_WORDS }

export const EARLY_TEMPLATE = ['subj', 'adv', 'verb']

const MULT_CAP = 2.5

export function makeEarlyTables(deck: Record<string, Word[]> = EARLY_WORDS): Tables {
  return {
    template: buildTemplate(EARLY_TEMPLATE),
    words: deck,
    combos: EARLY_COMBOS,
    conflicts: EARLY_CONFLICTS,
    dissonances: EARLY_DISSONANCES,
    multCap: MULT_CAP,
  }
}
