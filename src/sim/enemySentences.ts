import { eul } from '@core/josa'
import type { Emotion } from '@core/types'
import { currentLocale } from '@/localization'
import { enemySentenceText as tx, type EnemySentenceTextKey } from '@/localization/enemySentences'
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
  if (left > 0) return tx('turnsLater', { count: left })
  return tx(enemy.initiativePhase === 'first' ? 'first' : 'second')
}

/** enemyTurn과 같은 원본값으로 다음 공격의 RNG 0~2 범위를 미리 보여 준다. */
export function enemyDamageRange(state: BattleState, enemy: EnemyInst): [number, number] {
  return enemyAttackDamageRange(state, enemy)
}

const damageMeta = (state: BattleState, enemy: EnemyInst): string => {
  const [min, max] = enemyDamageRange(state, enemy)
  return min === max ? tx('expectedDamage', { value: min }) : tx('expectedDamageRange', { min, max })
}

const workerCount = (count: number): string =>
  tx((['workerZero', 'workerOne', 'workerTwo', 'workerThree', 'workerFour'][count] ?? 'workerCount') as EnemySentenceTextKey, { count })

function mantisSentence(state: BattleState, enemy: EnemyInst, eventText?: string): EnemySentenceView {
  if (state.turn <= enemy.groggyUntilTurn) {
    return {
      key: `mantis-groggy-${enemy.groggyUntilTurn}`,
      label: tx('correctedEnding'),
      tone: 'relief',
      tokens: tokens(['subject', tx('mantisSubject')], ['modifier', tx('mantisStaggerModifier')], ['verb', tx('mantisStaggerVerb')]),
      meta: [tx('damageTakenMult', { value: enemy.groggyDamageMult.toFixed(1) }), tx('scheduledAttackSkip')],
      eventText,
    }
  }

  const step = nextEnemyAttackStep(enemy)
  if (step?.damageScale === 0) {
    return {
      key: `mantis-ready-${enemy.attackPatternIndex}`,
      label: tx('preparesSentence'),
      tone: 'warn',
      tokens: tokens(['subject', tx('mantisSubject')], ['modifier', tx('mantisGather')], ['verb', tx('mantisRaise')]),
      meta: [tx('noDamageThisAction'), tx('nextScythe')],
      eventText,
    }
  }
  if (step?.shatterGuard) {
    const required = enemyGuardBreakRequirement(enemy, state.turn)
    return {
      key: `mantis-heavy-${required}-${enemy.initiativePhase}`,
      label: tx('nextBossSentence'),
      tone: 'danger',
      tokens: tokens(['subject', tx('mantisSubject')], ['modifier', tx('mantisBreakGuard')], ['verb', tx('mantisSlam')]),
      meta: [timingText(state, enemy), tx('requiredGuard', { value: required }), tx('successGroggy'), tx('failLifesteal')],
      eventText,
    }
  }
  return {
    key: `mantis-plain-${enemy.attackPatternIndex}-${enemy.initiativePhase}-${enemy.nextAttackTurn}`,
    label: tx('nextBossSentence'),
    tone: state.turn >= enemy.nextAttackTurn ? 'warn' : 'calm',
    tokens: tokens(['subject', tx('mantisSubject')], ['modifier', tx('mantisSharp')], ['verb', tx('mantisSwing')]),
    meta: [timingText(state, enemy), damageMeta(state, enemy), tx('sorrowDamage')],
    eventText,
  }
}

function queenSentence(state: BattleState, enemy: EnemyInst, eventText?: string): EnemySentenceView {
  const escorts = summonCount(enemy)
  if (escorts === 0 && state.turn < enemy.summonRespawnTurn) {
    return {
      key: `queen-groggy-${enemy.summonRespawnTurn}`,
      label: tx('correctedEnding'),
      tone: 'relief',
      tokens: tokens(['subject', tx('queenSubject')], ['modifier', tx('queenStagger')], ['verb', tx('queenRest')]),
      meta: [tx('damageTakenMult', { value: enemy.groggyDamageMult.toFixed(1) }), tx('nextActionSkip'), tx('respawnWorkers')],
      eventText,
    }
  }

  const escortLabel = workerCount(escorts)
  const ready = state.turn >= enemy.nextAttackTurn
  return {
    key: `queen-${escorts}-${enemy.nextAttackTurn}-${enemy.initiativePhase}`,
    label: tx('nextBossSentence'),
    tone: ready ? 'danger' : 'warn',
    tokens: tokens(
      ['subject', escorts > 0 ? tx('queenWithWorkers', { workers: escortLabel }) : tx('queenSubject')],
      ['modifier', tx(escorts > 0 ? 'throughShield' : 'fromFront')],
      ['verb', tx('queenSting')],
    ),
    meta: [timingText(state, enemy), damageMeta(state, enemy), ...(escorts > 0 ? [tx('guardPierce')] : [])],
    context: escorts > 0
      ? {
          label: tx('continuedSentence'),
          tokens: tokens(['subject', tx('queenSubject')], ['modifier', tx('surroundedByWorkers', { workers: escortLabel })], ['verb', tx('queenHide')]),
          meta: [tx('bodyInvulnerable'), tx('areaPierce'), tx('angerSingle')],
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
        ? tx('spiderEnding')
        : tx(part.def.id === 'leg-sorrow' ? 'spiderErase' : part.def.id === 'leg-pleasure' ? 'spiderSwallow' : part.def.id === 'leg-anger' ? 'spiderEntangle' : 'spiderBind', {
            weakness: currentLocale === 'ko' ? eul(part.def.weakness?.label ?? part.def.name) : part.def.weakness?.label ?? part.def.name,
          }),
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
    label: tx('nextBossSentence'),
    tone: state.turn >= enemy.nextAttackTurn ? 'danger' : web >= webMax ? 'warn' : 'calm',
    tokens: tokens(['subject', tx('spiderSubject')], ['modifier', tx('beyondGuard')], ['verb', tx('tightenWeb')]),
    meta: [
      timingText(state, enemy),
      damageMeta(state, enemy),
      tx('guardPierce'),
      tx('sealCount', { current: web, max: webMax }),
      ...(weakness ? [tx('currentWeakness', { weakness: weakness.label }), tx('weaknessAction'), tx('weaknessComboPierce')] : [tx('bodyNoWeakness')]),
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
