import { eul } from '@core/josa'
import type { Emotion } from '@core/types'
import {
  activeEnemyPart,
  enemyAttackDamageRange,
  enemyGuardBreakRequirement,
  nextEnemyAttackStep,
  spiderWebTension,
  summonCount,
  type BattleState,
  type EnemyInst,
} from './reference'

export type EnemySentenceRole = 'subject' | 'modifier' | 'object' | 'verb'
export type EnemySentenceTone = 'calm' | 'warn' | 'danger' | 'relief'

export interface EnemySentenceToken {
  role: EnemySentenceRole
  text: string
  emotion?: Emotion
  crossed?: boolean
}

export interface EnemySentenceClause {
  id: string
  text: string
  emotion?: Emotion
  active: boolean
  crossed: boolean
}

/**
 * 전투 규칙을 새로 정의하지 않고 현재 보스 상태를 사람이 읽는 문장으로 투영한 값.
 * BattleView는 이 값을 그리기만 하고, 공격 시점·수치·파훼 여부는 reference.ts가 정한다.
 */
export interface EnemySentenceView {
  key: string
  label: string
  tone: EnemySentenceTone
  tokens: EnemySentenceToken[]
  meta: string[]
  context?: {
    label: string
    tokens: EnemySentenceToken[]
    meta: string[]
  }
  manuscript?: EnemySentenceClause[]
  eventText?: string
}

export interface EnemySentenceProjectionOptions {
  eventText?: string | null
}

const tokens = (...items: Array<[EnemySentenceRole, string]>): EnemySentenceToken[] =>
  items.map(([role, text]) => ({ role, text }))

const timingText = (state: BattleState, enemy: EnemyInst): string => {
  const left = Math.max(0, enemy.nextAttackTurn - state.turn)
  if (left > 0) return `${left}턴 뒤`
  return enemy.initiativePhase === 'first' ? '선공' : '후공'
}

/** enemyTurn과 같은 원본값으로 다음 공격의 RNG 0~2 범위를 미리 보여 준다. */
export function enemyDamageRange(state: BattleState, enemy: EnemyInst): [number, number] {
  return enemyAttackDamageRange(state, enemy)
}

const damageMeta = (state: BattleState, enemy: EnemyInst): string => {
  const [min, max] = enemyDamageRange(state, enemy)
  return min === max ? `예상 피해 ${min}` : `예상 피해 ${min}~${max}`
}

const nativeCount = (count: number): string =>
  ['영', '하나', '둘', '셋', '넷'][count] ?? `${count}`

function mantisSentence(state: BattleState, enemy: EnemyInst, eventText?: string): EnemySentenceView {
  if (state.turn <= enemy.groggyUntilTurn) {
    return {
      key: `mantis-groggy-${enemy.groggyUntilTurn}`,
      label: '고쳐 쓴 결말',
      tone: 'relief',
      tokens: tokens(['subject', '사마귀가'], ['modifier', '충격을 견디지 못하고'], ['verb', '휘청거린다']),
      meta: [`받는 피해 ×${enemy.groggyDamageMult.toFixed(1)}`, '예정 공격 1회 스킵'],
      eventText,
    }
  }

  const step = nextEnemyAttackStep(enemy)
  if (step?.damageScale === 0) {
    return {
      key: `mantis-ready-${enemy.attackPatternIndex}`,
      label: '문장을 준비한다',
      tone: 'warn',
      tokens: tokens(['subject', '사마귀가'], ['modifier', '온 힘을 모아'], ['verb', '큰낫을 치켜든다']),
      meta: ['이번 행동 피해 없음', '다음 문장: 큰낫 내려베기'],
      eventText,
    }
  }
  if (step?.shatterGuard) {
    const required = enemyGuardBreakRequirement(enemy, state.turn)
    return {
      key: `mantis-heavy-${required}-${enemy.initiativePhase}`,
      label: '다음 보스 문장',
      tone: 'danger',
      tokens: tokens(['subject', '사마귀가'], ['modifier', '방어를 부수며'], ['verb', '큰낫을 내려벤다']),
      meta: [timingText(state, enemy), `필요 방어 ${required}`, '성공: 피해 0 · 그로기', '실패: 체력 피해의 절반 흡혈'],
      eventText,
    }
  }
  return {
    key: `mantis-plain-${enemy.attackPatternIndex}-${enemy.initiativePhase}-${enemy.nextAttackTurn}`,
    label: '다음 보스 문장',
    tone: state.turn >= enemy.nextAttackTurn ? 'warn' : 'calm',
    tokens: tokens(['subject', '사마귀가'], ['modifier', '날카롭게'], ['verb', '낫을 휘두른다']),
    meta: [timingText(state, enemy), damageMeta(state, enemy), '슬픔 피해 ×1.25'],
    eventText,
  }
}

function queenSentence(state: BattleState, enemy: EnemyInst, eventText?: string): EnemySentenceView {
  const escorts = summonCount(enemy)
  if (escorts === 0 && state.turn < enemy.summonRespawnTurn) {
    return {
      key: `queen-groggy-${enemy.summonRespawnTurn}`,
      label: '고쳐 쓴 결말',
      tone: 'relief',
      tokens: tokens(['subject', '여왕벌이'], ['modifier', '홀로 비틀거리며'], ['verb', '숨을 고른다']),
      meta: [`받는 피해 ×${enemy.groggyDamageMult.toFixed(1)}`, '다음 행동 스킵', '이후 일벌 넷 재소환'],
      eventText,
    }
  }

  const escortLabel = `일벌 ${nativeCount(escorts)}`
  const ready = state.turn >= enemy.nextAttackTurn
  return {
    key: `queen-${escorts}-${enemy.nextAttackTurn}-${enemy.initiativePhase}`,
    label: '다음 보스 문장',
    tone: ready ? 'danger' : 'warn',
    tokens: tokens(
      ['subject', escorts > 0 ? `여왕벌과 ${escortLabel}이` : '여왕벌이'],
      ['modifier', escorts > 0 ? '방패의 틈으로' : '정면에서'],
      ['verb', '독침을 찌른다'],
    ),
    meta: [timingText(state, enemy), damageMeta(state, enemy), ...(escorts > 0 ? ['방어 관통'] : [])],
    context: escorts > 0
      ? {
          label: '이어지는 문장',
          tokens: tokens(['subject', '여왕벌이'], ['modifier', `${escortLabel}에게 둘러싸여`], ['verb', '모습을 감춘다']),
          meta: ['본체 무적', '범위·관통: 빠른 전멸', '분노 단일: 퇴치 반동 ×2'],
        }
      : undefined,
    eventText,
  }
}

function spiderManuscript(enemy: EnemyInst): EnemySentenceClause[] {
  return enemy.parts.map((part) => {
    const emotion = part.def.weakness?.kind === 'emotion'
      ? part.def.weakness.value as Emotion
      : undefined
    return {
      id: part.def.id,
      text: part.def.kind === 'body'
        ? '결말을 고쳐 쓴다'
        : `${eul(part.def.weakness?.label ?? part.def.name)} ${part.def.id === 'leg-sorrow' ? '지우고' : part.def.id === 'leg-pleasure' ? '삼키고' : part.def.id === 'leg-anger' ? '얽고' : '묶고'}`,
      emotion,
      active: part === activeEnemyPart(enemy),
      crossed: part.broken,
    }
  })
}

function spiderSentence(state: BattleState, enemy: EnemyInst, eventText?: string): EnemySentenceView {
  const active = activeEnemyPart(enemy)
  const weakness = active?.def.weakness
  const webMax = enemy.def.webPattern?.maxSealedCards ?? 0
  const web = spiderWebTension(enemy)
  return {
    key: `spider-${active?.def.id ?? 'done'}-${web}-${enemy.nextAttackTurn}-${eventText ?? ''}`,
    label: '다음 보스 문장',
    tone: state.turn >= enemy.nextAttackTurn ? 'danger' : web >= webMax ? 'warn' : 'calm',
    tokens: tokens(['subject', '장로거미가'], ['modifier', '방패 너머까지'], ['verb', '거미줄을 조인다']),
    meta: [
      timingText(state, enemy),
      damageMeta(state, enemy),
      '방어 관통',
      `봉인 ${web}/${webMax}`,
      ...(weakness ? [`현재 약점 ${weakness.label}`, '약점 행동: 봉인 -1', '약점+관용구 공격: 다음 부위 관통'] : ['본체에는 약점 없음']),
    ],
    manuscript: spiderManuscript(enemy),
    eventText,
  }
}

export function enemySentenceFor(
  state: BattleState,
  enemy: EnemyInst,
  options: EnemySentenceProjectionOptions = {},
): EnemySentenceView | null {
  if (!enemy.def.boss || enemy.dead) return null
  const eventText = options.eventText ?? undefined
  if (enemy.def.id === 'mantis') return mantisSentence(state, enemy, eventText)
  if (enemy.def.id === 'queenBee') return queenSentence(state, enemy, eventText)
  if (enemy.def.id === 'elderSpider') return spiderSentence(state, enemy, eventText)
  return null
}
