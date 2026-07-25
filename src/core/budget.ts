/**
 * 등급 예산 — "디메리트는 없다, 등급은 예산이다"를 숫자로 못 박은 계약이다.
 * 같은 등급이면 강약이 아니라 **성향**만 갈린다: 총량은 같고 배분이 다르다.
 * `npm run check`가 이 파일을 기준으로 words.csv를 검사하므로, 값을 바꾸려면
 * 여기와 `src/data/csv/README.md`를 함께 고친다.
 */

import type { Rarity, Word } from './types'

export type BudgetRarity = 'common' | 'rare' | 'epic'

/**
 * 배율 칸(주어·수식·어미·문장부호)의 기대 배율 예산.
 * 기대 배율 = (1 + bonus) × 도박 기댓값 × (1 + 0.5 × 대성공률)  ← 대성공은 ×1.5
 */
export const MULT_BUDGET: Record<BudgetRarity, number> = {
  common: 1.2,
  rare: 1.6,
  epic: 2.1,
}

/** 동사 칸의 스탯 계수 예산 — 동사는 배율이 아니라 깡수치를 낸다. */
export const VERB_COEF_BUDGET: Record<BudgetRarity, number> = {
  common: 1,
  rare: 1.5,
  epic: 2,
}

/** 전체 적중(aoe)은 계수를 이만큼 깎아서 산다 — 적이 늘어날수록 총량이 곱으로 커지니까. */
export const AOE_COEF_FACTOR = 0.7

/** 예산 검사 허용 오차. 표기용 반올림(×1.15 · 대성공 10% = 1.2075)까지만 허용한다. */
export const BUDGET_TOLERANCE = 0.05

/**
 * 초기 덱의 노멀 정원 — 슬롯마다 "가장 단순한 기준 카드" 몫만 노멀로 둔다.
 * 노멀을 여러 장 두면 수치가 같은 쌍둥이가 생기고(어제의 나는 = 나도 = ×1.20),
 * 그 순간 등급 표기가 예산을 설명하지 못한다. 나머지는 예산이 큰 등급으로 올린다.
 *
 * 노멀 = 수식은 룰렛 기준 스탯마다 한 장(공격·방어·회복), 동사는 행동마다 한 장,
 * 주어는 "나는" 한 장.
 */
export const COMMON_QUOTA: Record<string, number> = { subj: 1, adv: 3, verb: 3 }

/** 도박 기댓값 — 컴파일러의 굴림과 같은 정의(p로 hi, 나머지는 lo). */
export const gambleExpectation = (w: Word): number =>
  w.variance ? w.variance.p * w.variance.hi + (1 - w.variance.p) * w.variance.lo : 1

/** 이 카드가 배율 칸에서 뽑아내는 기대 배율. */
export const expectedMult = (w: Word): number =>
  (1 + (w.bonus ?? 0)) * gambleExpectation(w) * (1 + 0.5 * (w.crit ?? 0))

/** 이 등급이 사도 되는 동사 계수(전체 적중이면 깎인다). */
export const verbCoefBudget = (rarity: BudgetRarity, aoe?: Word['aoe']): number =>
  VERB_COEF_BUDGET[rarity] * (aoe === 'all' ? AOE_COEF_FACTOR : 1)

/** 전설은 규칙 카드(문장부호·무럭무럭·아이템) 전용이라 수치 예산이 없다. */
export const hasBudget = (rarity: Rarity | undefined): rarity is BudgetRarity =>
  rarity === 'common' || rarity === 'rare' || rarity === 'epic'
