/**
 * 스테이지 상태 전이 (§1·§2). 순수함수: 상태를 받아 새 상태를 돌려준다.
 * 목표 점수 = 적 수 × 개체 체력 × 형태 배수. 기회를 남기고 넘기면 남은 기회 1당 돈.
 */
import {
  CLEAR_MONEY_BASE, MONEY_PER_LEFTOVER_CHANCE, OVERTIME_HIT_PIECES, SCORE_FLOORS, form as formDef,
  relic as relicDef,
} from './data'
import type { FloorDef, ScoreEmotion, ScoreLoadout, SentenceResult, StageContext } from './types'
import { EMPTY_CARRY } from './types'

export interface StagePlan {
  floor: number
  formId: string
  weatherIds: string[]
  target: number
  chances: number
  boss?: string
  weakness?: ScoreEmotion
}

export function floorDef(floor: number): FloorDef {
  const f = SCORE_FLOORS.find((x) => x.floor === floor)
  if (!f) throw new Error(`층 없음: ${floor}`)
  return f
}

export function planStage(floor: number, weakness?: ScoreEmotion): StagePlan {
  const f = floorDef(floor)
  const fm = formDef(f.form)
  const weatherIds = [f.weather, f.weather2].filter(Boolean)
  return {
    floor,
    formId: f.form,
    weatherIds,
    target: Math.round(f.enemies * f.hp * fm.targetMult),
    chances: fm.chances,
    boss: f.boss || undefined,
    weakness: weatherIds.includes('weakday') ? weakness : undefined,
  }
}

export function startStage(plan: StagePlan, loadout: ScoreLoadout): StageContext {
  let tears = loadout.stats.startTears
  for (const id of loadout.relics) if (id === 'diary') tears += relicDef(id).a
  return {
    formId: plan.formId,
    weatherIds: plan.weatherIds,
    chancesTotal: plan.chances,
    chancesLeft: plan.chances,
    sentencesUsed: 0,
    tears,
    history: [],
    carry: { ...EMPTY_CARRY },
    emotionsUsed: [],
    angerWordsUsed: 0,
    wordUses: {},
    stageAdd: 0,
    oncePerStageUsed: [],
    weakness: plan.weakness,
  }
}

/** 문장 결과를 스테이지 상태에 반영한다. */
export function applySentence(ctx: StageContext, res: SentenceResult): StageContext {
  const wordUses = { ...ctx.wordUses }
  for (const id of res.record.wordIds) wordUses[id] = (wordUses[id] ?? 0) + 1
  return {
    ...ctx,
    chancesLeft: ctx.chancesLeft - res.chanceSpent,
    sentencesUsed: ctx.sentencesUsed + 1,
    tears: res.tearsAfter,
    history: [...ctx.history, res.record],
    carry: res.carry,
    emotionsUsed: [...new Set([...ctx.emotionsUsed, ...res.record.emotions])],
    angerWordsUsed: ctx.angerWordsUsed + res.record.slotEmotions.filter((e) => e === 'anger').length,
    wordUses,
    stageAdd: ctx.stageAdd + res.stageAddGain,
    oncePerStageUsed: [...ctx.oncePerStageUsed, ...res.onceUsed],
    firstScore: ctx.firstScore ?? res.score,
  }
}

/** 이 문장이 기회를 다 쓴 뒤(초과) 쓰는 문장이면 맞는 하트 조각. */
export function overtimeHit(ctx: StageContext): number {
  return ctx.chancesLeft <= 0 ? OVERTIME_HIT_PIECES : 0
}

export function clearMoney(ctx: StageContext, loadout: ScoreLoadout): number {
  const left = Math.max(0, ctx.chancesLeft)
  let perLeft = MONEY_PER_LEFTOVER_CHANCE
  for (const id of loadout.relics) if (id === 'piggy') perLeft += relicDef(id).a
  return CLEAR_MONEY_BASE + loadout.stats.allowance + left * perLeft
}
