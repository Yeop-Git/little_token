/**
 * 등급 예산 — "디메리트는 없다, 등급은 예산이다"를 숫자로 못 박은 계약이다.
 * 같은 등급이면 강약이 아니라 **성향**만 갈린다: 총량은 같고 배분이 다르다.
 * `npm run check`가 이 파일을 기준으로 words.csv를 검사하므로, 값을 바꾸려면
 * 여기와 `src/data/csv/README.md`를 함께 고친다.
 */

import type { Rarity, Word } from './types'

export type BudgetRarity = 'common' | 'rare' | 'epic'

/**
 * 배율 칸(주어·어미·문장부호)의 기대 배율 예산.
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

/** 다른 행동 스탯을 끌어오는 변환형의 상한. 비용과 참조 스탯에 따라 더 낮은 계수를 쓸 수 있다. */
export const OFF_STAT_VERB_COEF_BUDGET: Record<BudgetRarity, number> = {
  common: .75,
  rare: 1.2,
  epic: 1.5,
}

/** 예산 검사 허용 오차. 표기용 반올림(×1.15 · 대성공 10% = 1.2075)까지만 허용한다. */
export const BUDGET_TOLERANCE = 0.05

/** 성장·보스 대여 카드를 제외한 3슬롯 실전 카드풀의 4:3:2:1 정수 근사. */
export const CARD_POOL_RARITY_QUOTA: Record<'subj' | 'adv' | 'verb', Record<Rarity, number>> = {
  subj: { common: 8, rare: 6, epic: 4, legendary: 2 },
  adv: { common: 8, rare: 6, epic: 4, legendary: 2 },
  verb: { common: 11, rare: 8, epic: 6, legendary: 3 },
}

/** 도박 기댓값 — 컴파일러의 굴림과 같은 정의(p로 hi, 나머지는 lo). */
export const gambleExpectation = (w: Word): number =>
  w.variance ? w.variance.p * w.variance.hi + (1 - w.variance.p) * w.variance.lo : 1

/** 이 카드가 배율 칸에서 뽑아내는 기대 배율. */
export const expectedMult = (w: Word): number =>
  (1 + (w.bonus ?? 0)) * gambleExpectation(w) * (1 + 0.5 * (w.crit ?? 0))

/** 수식어는 즉시 읽히는 배율 풀 기여나 공개 전술을 최소 하나 가져야 한다. */
export const hasModifierTactic = (w: Word): boolean => {
  const effects = w.effects
  const numericEffect = effects && Object.values(effects).some((value) =>
    typeof value === 'number' ? value !== 0 : value === true,
  )
  return (w.bonus ?? 0) > 0
    || (w.crit ?? 0) > 0
    || !!numericEffect
    || w.tags.includes('preempt')
    || w.aoe === 'all'
    || w.targetCount === 'all'
    || (typeof w.targetCount === 'number' && w.targetCount > 1)
}

/** 수식어에 두지 않는, 행동 결과를 다른 행동으로 잇는 동사 전용 기능. */
export const hasModifierActionTactic = (w: Word): boolean => {
  const effects = w.effects
  return (effects?.guardAttackMultiplier ?? 0) > 0
    || (effects?.overhealDamageMultiplier ?? 0) > 0
    || (effects?.lifeStealRate ?? 0) > 0
}

const laneStat = (word: Word): Word['stat'] => word.kind === 'guard' ? 'guard' : word.kind === 'heal' ? 'heal' : 'atk'

/** 일반 동사는 주행동 스탯이면 정규 계수, 다른 스탯을 활용하면 변환 계수를 쓴다. */
export const verbCoefBudget = (rarity: BudgetRarity, word: Word): number =>
  word.stat === laneStat(word) ? VERB_COEF_BUDGET[rarity] : OFF_STAT_VERB_COEF_BUDGET[rarity]

/** 일반 동사에 남아 있으면 수식어와 역할이 겹치는 전술 필드. 보스 전용 대여 카드는 별도다. */
export const hasVerbTactic = (w: Word): boolean => {
  const effects = w.effects
  return !!w.timing
    || w.tags.includes('preempt')
    || !!effects?.pierceGuard
    || (effects?.castCount ?? 1) > 1
    || (effects?.magicShield ?? 0) > 0
    || (effects?.inkDiscount ?? 0) > 0
    || (effects?.attackRank ?? 0) !== 0
    || (effects?.guardRank ?? 0) !== 0
    || !!effects?.counter
}

/** 수식어에 적힌 서로 다른 기능 키워드 수. 한 기능의 보조값(castScale)은 따로 세지 않는다. */
export const modifierKeywordCount = (w: Word): number => {
  const effects = w.effects
  return [
    (w.bonus ?? 0) > 0,
    (w.crit ?? 0) > 0,
    w.tags.includes('preempt'),
    w.aoe === 'all' || w.targetCount === 'all' || (typeof w.targetCount === 'number' && w.targetCount > 1),
    !!effects?.pierceGuard,
    (effects?.hitCount ?? 1) > 1,
    (effects?.castCount ?? 1) > 1,
    !!effects?.counter,
    (effects?.magicShield ?? 0) > 0,
    (effects?.inkDiscount ?? 0) > 0,
    (effects?.attackRank ?? 0) !== 0,
    (effects?.guardRank ?? 0) !== 0,
    (effects?.guardAttackMultiplier ?? 0) > 0,
    (effects?.overhealDamageMultiplier ?? 0) > 0,
    (effects?.lifeStealRate ?? 0) > 0,
  ].filter(Boolean).length
}

/** 3잉크 단일 키워드 수식어가 비용을 설명할 만큼 강한 계수를 가졌는지 판정한다. */
export const hasStrongModifierScale = (w: Word): boolean =>
  (w.effects?.lifeStealRate ?? 0) >= .5
  || !!w.effects?.counter
  || (w.effects?.guardAttackMultiplier ?? 0) >= 1.2
  || (w.effects?.overhealDamageMultiplier ?? 0) >= 1.25
  || (w.effects?.magicShield ?? 0) >= 1
  || (w.effects?.castCount ?? 1) >= 2
  || w.targetCount === 'all'
  || (typeof w.targetCount === 'number' && w.targetCount >= 3)

/** 전설은 규칙 카드(문장부호·무럭무럭·아이템) 전용이라 수치 예산이 없다. */
export const hasBudget = (rarity: Rarity | undefined): rarity is BudgetRarity =>
  rarity === 'common' || rarity === 'rare' || rarity === 'epic'
