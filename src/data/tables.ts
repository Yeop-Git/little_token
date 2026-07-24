/**
 * 데이터 조립 — 컴파일러/검증기/sweep이 공유하는 단일 Tables 출처.
 */

import type { Tables } from '@core/types'
import { DEFAULT_TEMPLATE } from './slots'
import { WORDS } from './words'
import { COMBOS, CONFLICTS, MULT_CAP } from './combos'

export const TABLES: Tables = {
  template: DEFAULT_TEMPLATE,
  words: WORDS,
  combos: COMBOS,
  conflicts: CONFLICTS,
  multCap: MULT_CAP,
}
