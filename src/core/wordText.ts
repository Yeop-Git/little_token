/**
 * 카드 수치 문구 — 손패·집계판·보상·덤프가 같은 문장을 쓰도록 한곳에 모아 둔다.
 * 화면마다 따로 조립하면 같은 카드가 화면마다 다르게 읽힌다(도박 표기가 그랬다).
 */

import { TARGET_FALLOFF } from './combatRules'
import { PREEMPT_TAG, STAT_NAME, wordFlat } from './compiler'
import type { StatBlock, TargetCount, Variance, Word } from './types'
import { currentLocale } from '@/localization'

const L = {
  ko: { chance:'확률로 배율', rest:'나머지', mult:'배율', crit:'대성공', power:'위력', guard:'방어', heal:'회복', hp:'최대 체력', allHit:'적 전체 적중', next:'다음 턴 발동', self:'피해 40% 나에게 되돌아옴', preempt:'선공 상대보다 먼저 행동', adapt:'현재 다리 약점 적용', attack:'명 공격', unit:'명', pierce:'방어 관통', hits:'연타', casts:'회 동사 발동', each:'각', counter:'카운터', inkDiscount:'문장 비용', carryInk:'다음 문장 잉크', all:'전체', noMult:'배율을 받지 않는다', pool:'배율 풀', safe:'안전한 한 수', immediate:'즉발', magicShield:'매직실드', guardAttack:'현재 방어도 피해', overhealAttack:'초과 회복 피해', lifeSteal:'흡혈' },
  en: { chance:'chance for multiplier', rest:'otherwise', mult:'Multiplier', crit:'Critical', power:'Power', guard:'Guard', heal:'Heal', hp:'Max HP', allHit:'Hits all enemies', next:'Activates next turn', self:'40% damage returns to self', preempt:'Acts before first-strike enemies', adapt:'Uses current part weakness', attack:' targets', unit:' targets', pierce:'Pierces guard', hits:' hits', casts:' verb casts', each:'each', counter:'Counter', inkDiscount:'Sentence cost', carryInk:'Next sentence Ink', all:'All', noMult:'Unaffected by multipliers', pool:'Multiplier pool', safe:'safe move', immediate:'Immediate' },
  ja: { chance:'の確率で倍率', rest:'それ以外', mult:'倍率', crit:'大成功', power:'威力', guard:'防御', heal:'回復', hp:'最大体力', allHit:'敵全体に命中', next:'次のターンに発動', self:'ダメージ40%が自分に戻る', preempt:'先攻の敵より先に行動', adapt:'現在の部位弱点を適用', attack:'体を攻撃', unit:'体', pierce:'防御貫通', hits:'連打', casts:'回動詞発動', each:'各', counter:'カウンター', inkDiscount:'文のコスト', carryInk:'次の文のインク', all:'全体', noMult:'倍率を受けない', pool:'倍率プール', safe:'安全な一手', immediate:'即時' },
  ru: { chance:'шанс на множитель', rest:'иначе', mult:'Множитель', crit:'Критический успех', power:'Сила', guard:'Защита', heal:'Лечение', hp:'Макс. здоровье', allHit:'Попадает по всем врагам', next:'Сработает в следующий ход', self:'40% урона возвращается герою', preempt:'Действует раньше быстрых врагов', adapt:'Использует слабость текущей части', attack:' цели', unit:' цели', pierce:'Пробивает защиту', hits:' ударов', casts:' срабатывания глагола', each:'каждый', counter:'Контратака', inkDiscount:'Стоимость фразы', carryInk:'Чернила следующей фразы', all:'Все', noMult:'Не получает множитель', pool:'Пул множителя', safe:'надёжный ход', immediate:'Сразу' },
  'zh-Hans': { chance:'概率获得倍率', rest:'其余', mult:'倍率', crit:'大成功', power:'威力', guard:'防御', heal:'恢复', hp:'最大体力', allHit:'命中全部敌人', next:'下回合发动', self:'40%伤害反弹给自己', preempt:'先于先攻敌人行动', adapt:'套用当前部位弱点', attack:'个目标', unit:'个目标', pierce:'贯穿防御', hits:'连击', casts:'次动词发动', each:'每次', counter:'反击', inkDiscount:'句子费用', carryInk:'下句墨水', all:'全部', noMult:'不受倍率影响', pool:'倍率池', safe:'稳妥一手', immediate:'立即发动' },
  'zh-Hant': { chance:'機率獲得倍率', rest:'其餘', mult:'倍率', crit:'大成功', power:'威力', guard:'防禦', heal:'恢復', hp:'最大體力', allHit:'命中全部敵人', next:'下回合發動', self:'40%傷害反彈給自己', preempt:'先於先攻敵人行動', adapt:'套用目前部位弱點', attack:'個目標', unit:'個目標', pierce:'貫穿防禦', hits:'連擊', casts:'次動詞發動', each:'每次', counter:'反擊', inkDiscount:'句子費用', carryInk:'下句墨水', all:'全部', noMult:'不受倍率影響', pool:'倍率池', safe:'穩妥一手', immediate:'立即發動' },
}[currentLocale]

const EXTRA_EFFECT_LABEL = {
  ko: { attackRank: '공격', guardRank: '방어', enemyAttackRank: '적 공격', rank: '랭크', bonusDraws: '다시 뽑기' },
  en: { attackRank: 'Attack', guardRank: 'Guard', enemyAttackRank: 'Enemy Attack', rank: 'rank', bonusDraws: 'Redraw' },
  ja: { attackRank: '攻撃', guardRank: '防御', enemyAttackRank: '敵の攻撃', rank: 'ランク', bonusDraws: '引き直し' },
  ru: { attackRank: 'Атака', guardRank: 'Защита', enemyAttackRank: 'Атака врага', rank: 'ранг', bonusDraws: 'Добор' },
  'zh-Hans': { attackRank: '攻击', guardRank: '防御', enemyAttackRank: '敌方攻击', rank: '级', bonusDraws: '重抽' },
  'zh-Hant': { attackRank: '攻擊', guardRank: '防禦', enemyAttackRank: '敵方攻擊', rank: '級', bonusDraws: '重抽' },
}[currentLocale]

const DRAW_COUNT_UNIT = {
  ko: '회', en: '', ja: '回', ru: '', 'zh-Hans': '次', 'zh-Hant': '次',
}[currentLocale]

const BUILD_EFFECT_LABEL = {
  ko: { magicShield: '매직실드 1겹', guardAttack: '방어도', overhealAttack: '초과 회복량', lifeSteal: '흡혈' },
  en: { magicShield: 'Magic Shield 1 layer', guardAttack: 'Current Guard damage', overhealAttack: 'Overheal damage', lifeSteal: 'Lifesteal' },
  ja: { magicShield: 'マジックシールド1層', guardAttack: '現在の防御ダメージ', overhealAttack: '超過回復ダメージ', lifeSteal: '吸収' },
  ru: { magicShield: 'Магический щит: 1 слой', guardAttack: 'Урон от текущей защиты', overhealAttack: 'Урон от избытка лечения', lifeSteal: 'Вампиризм' },
  'zh-Hans': { magicShield: '魔法盾1层', guardAttack: '当前防御伤害', overhealAttack: '过量治疗伤害', lifeSteal: '吸血' },
  'zh-Hant': { magicShield: '魔法盾1層', guardAttack: '目前防禦傷害', overhealAttack: '過量治療傷害', lifeSteal: '吸血' },
}[currentLocale]

const resourceDamageText = (label: string, rate: number): string => currentLocale === 'ko'
  ? `${label} ${Math.round(rate * 100)}% 피해`
  : `${label} ${Math.round(rate * 100)}%`

const rankText = (label: string, rank: number): string => {
  const arrow = rank > 0 ? '↑' : '↓'
  const value = Math.abs(rank)
  if (currentLocale === 'en' || currentLocale === 'ru') return `${label} ${EXTRA_EFFECT_LABEL.rank} ${rank > 0 ? '+' : '−'}${value}`
  return `${label} ${value}${EXTRA_EFFECT_LABEL.rank}${arrow}`
}

const OVERDRAW_HIT_LABEL = {
  ko: '잉크 초과 시 공격',
  en: 'Attack hits on Ink overdraw',
  ja: 'インク超過時の攻撃',
  ru: 'Удары атаки при перерасходе чернил',
  'zh-Hans': '墨水超支时攻击',
  'zh-Hant': '墨水超支時攻擊',
}[currentLocale]
const OVERDRAW_HIT_UNIT = {
  ko: '타', en: ' hits', ja: 'ヒット', ru: ' удара', 'zh-Hans': '次', 'zh-Hant': '次',
}[currentLocale]

/**
 * 도박 표기 — "40% 확률로 배율 ×2.50".
 * 저점은 규칙상 항상 ×1.00이다(`variance_lo`를 1 미만으로 내리지 않는다). 그래서
 * 양쪽을 나란히 적을 필요가 없다. `×2.50 / ×1.00`은 "절반은 손해"처럼 읽혀서 폐지했다.
 * 저점이 1이 아닌 데이터가 들어오면 그때만 나머지 쪽을 덧붙인다.
 */
export function gambleText(v: Variance): string {
  const p = Math.round(v.p * 100)
  const hi = `${p}% ${L.chance} ×${v.hi.toFixed(2)}`
  return v.lo === 1 ? hi : `${hi} · ${L.rest} ×${v.lo.toFixed(2)}`
}

/** 가산 배율 표기 — "배율 ×1.20". */
export const multText = (bonus: number): string => `${L.mult} ×${(1 + bonus).toFixed(2)}`

/** 대성공 표기 — "대성공 20%". */
export const critText = (crit: number): string => `${L.crit} ${Math.round(crit * 100)}%`

/**
 * 카드가 화면에 내걸어야 하는 수치 조각 — CSV `note`가 빠뜨리지 않았는지 검사하는
 * 기준이기도 하다(`npm run check`). 규칙 카드(문장부호·무럭무럭)는 수치가 아니라
 * 규칙을 적으므로 빈 배열이 나온다.
 */
export interface ValueLine {
  text: string
  cls: string
}

/**
 * 카드 한 장의 수치 목록 — **화면 전체가 이 한 함수를 쓴다**(체인·카드 상세·보상 상세).
 * 화면마다 따로 조립하니 같은 카드가 "위력 배수 +10%"(대성공 누락)와
 * "배율 ×1.10 · 대성공 20%"로 다르게 읽혔다. 표기 규칙은 하나다.
 *
 *   깡수치  `공격 ×1` — 스탯을 넘기면 `공격 ×1 = 5`까지 (방어·회복도 같은 형식)
 *   배율    `배율 ×1.10`
 *   도박    `40% 확률로 배율 ×2.50`
 *   확률    `대성공 20%`
 *
 * 폐지한 규칙(실패·자해·회피)은 데이터가 0이라 줄을 만들지 않는다.
 */
export function wordValueLines(w: Word, stats?: StatBlock): ValueLine[] {
  const out: ValueLine[] = []
  const lane = w.kind === 'heal' ? 'heal' : w.kind === 'guard' ? 'guard' : 'dmg'
  // 동사·목적어 — 공격도 방어처럼 "공격 ×1"로 적는다("적을 공격"은 수치가 아니다).
  if (w.stat && w.statMult != null && w.statMult > 0) {
    const applied = stats ? ` = ${wordFlat(w, stats)}` : ''
    out.push({ text: `${STAT_NAME[w.stat]} ×${w.statMult}${applied}`, cls: lane })
  } else if (w.power) {
    out.push({ text: `${L.power} ${w.power}`, cls: lane })
  }
  if (w.effects?.guard) out.push({ text: `${L.guard} +${w.effects.guard}`, cls: 'guard' })
  if (w.effects?.heal) out.push({ text: `${L.heal} +${w.effects.heal}`, cls: 'heal' })
  if (w.bonus) out.push({ text: multText(w.bonus), cls: 'buff' })
  if (w.variance) out.push({ text: gambleText(w.variance), cls: 'gamble' })
  if (w.crit) out.push({ text: critText(w.crit), cls: 'buff' })
  if (w.growHp) out.push({ text: `${L.hp} +${w.growHp}`, cls: 'heal' })
  if (w.aoe === 'all') out.push({ text: L.allHit, cls: 'dmg' })
  if (w.timing === 'delayed') out.push({ text: L.next, cls: '' })
  if (w.targetMode === 'both') out.push({ text: L.self, cls: 'self' })
  if (w.tags.includes(PREEMPT_TAG)) out.push({ text: L.preempt, cls: 'buff' })
  if (w.tags.includes('adapt')) out.push({ text: L.adapt, cls: 'buff' })
  // 수치가 없는 카드(규칙 카드·차단 안내)는 카드에 적힌 문구를 그대로 쓴다.
  if ((w.kind === 'attack' || w.targetCount) && w.aoe !== 'all') out.push({ text: `${w.targetCount ?? 1}${L.attack}`, cls: 'dmg' })
  if (w.effects?.pierceGuard) out.push({ text: L.pierce, cls: 'dmg' })
  if (w.effects?.hitCount && w.effects.hitCount > 1) out.push({ text: `${w.effects.hitCount}${L.hits}`, cls: 'dmg' })
  if (w.effects?.castCount && w.effects.castCount > 1) {
    const scale = w.effects.castScale != null ? ` (${L.each} ${Math.round(w.effects.castScale * 100)}%)` : ''
    out.push({ text: `${w.effects.castCount}${L.casts}${scale}`, cls: 'buff' })
  }
  if (w.effects?.overdrawHitCount) out.push({ text: `${OVERDRAW_HIT_LABEL} +${w.effects.overdrawHitCount}${OVERDRAW_HIT_UNIT}`, cls: 'dmg' })
  if (w.effects?.counterMultiplier) out.push({ text: `${L.counter} ×${w.effects.counterMultiplier.toFixed(2)}`, cls: 'guard' })
  if (w.effects?.magicShield) out.push({ text: BUILD_EFFECT_LABEL.magicShield, cls: 'guard' })
  if (w.effects?.guardAttackMultiplier) out.push({ text: resourceDamageText(BUILD_EFFECT_LABEL.guardAttack, w.effects.guardAttackMultiplier), cls: 'dmg' })
  if (w.effects?.overhealDamageMultiplier) out.push({ text: resourceDamageText(BUILD_EFFECT_LABEL.overhealAttack, w.effects.overhealDamageMultiplier), cls: 'dmg' })
  if (w.effects?.lifeStealRate) out.push({ text: `${BUILD_EFFECT_LABEL.lifeSteal} ${Math.round(w.effects.lifeStealRate * 100)}%`, cls: 'heal' })
  if (w.effects?.inkDiscount) out.push({ text: `${L.inkDiscount} −${w.effects.inkDiscount}`, cls: 'buff' })
  if (w.effects?.carryInk) out.push({ text: `${L.carryInk} +${w.effects.carryInk}`, cls: 'buff' })
  if (w.effects?.attackRank) out.push({ text: rankText(EXTRA_EFFECT_LABEL.attackRank, w.effects.attackRank), cls: 'buff' })
  if (w.effects?.guardRank) out.push({ text: rankText(EXTRA_EFFECT_LABEL.guardRank, w.effects.guardRank), cls: 'guard' })
  if (w.effects?.enemyAttackRank) out.push({ text: rankText(EXTRA_EFFECT_LABEL.enemyAttackRank, w.effects.enemyAttackRank), cls: 'buff' })
  if (w.effects?.bonusDraws) out.push({ text: `${EXTRA_EFFECT_LABEL.bonusDraws} +${w.effects.bonusDraws}${DRAW_COUNT_UNIT}`, cls: 'buff' })
  if (!out.length) out.push({ text: wordNoteText(w), cls: 'flat' })
  return out
}

/** 다중 대상 표기 — "2명(100%·70%)". 감쇠율은 실제 전투 규칙에서 읽는다. */
export function targetCountText(count: TargetCount): string {
  if (count === 'all') return L.all
  if (count <= 1) return `1${L.unit}`
  const falloff = Array.from({ length: count }, (_, rank) =>
    `${Math.round((TARGET_FALLOFF[rank] ?? TARGET_FALLOFF[TARGET_FALLOFF.length - 1]) * 100)}%`)
  return `${count}${L.unit}(${falloff.join('·')})`
}

/**
 * 카드 앞면 한 줄 요약을 **지금 이 카드의 값에서** 조립한다.
 *
 * 데이터의 `note`는 1단계 카드를 적어 둔 원문이라, 반복강화로 수치가 오르면
 * 그대로 두는 순간 화면과 실제가 어긋난다(Lv.3인데 "공격 ×1"로 읽히던 문제).
 * 그래서 표시하는 쪽은 전부 이 함수를 거치고, `note`는 원문 검수 기준으로만 남는다.
 * `npm run check`가 1단계 카드에 대해 이 함수의 결과와 `note`가 같은지 확인한다.
 *
 * 수치가 아니라 규칙을 적는 카드(주어로 못 쓰는 카드 등)는 조각이 하나도 나오지
 * 않으므로 원문을 그대로 돌려준다.
 */
export function wordNoteText(w: Word): string {
  const parts = noteParts(w)
  return parts.length ? parts.join(' · ') : w.note
}

function noteParts(w: Word): string[] {
  // 성장 카드와 문장부호는 수치 대신 규칙을 적는다 — 같은 값에서 같은 문구를 다시 만든다.
  if (w.growHp) return [`${L.hp} +${w.growHp}`, L.noMult]
  if (w.slot === 'punct') {
    const punct: string[] = []
    if (w.tags.includes(PREEMPT_TAG)) punct.push(currentLocale === 'ko' ? `${L.preempt}한다` : L.preempt)
    if (w.bonus) punct.push(`${L.pool} +${w.bonus.toFixed(2)} (${L.safe})`)
    if (w.crit) punct.push(currentLocale === 'ko' ? `대성공 확률 +${Math.round(w.crit * 100)}%` : `${L.crit} +${Math.round(w.crit * 100)}%`)
    return punct
  }
  // 일기의 주어는 나·우리뿐이라 다른 인칭은 수치가 아니라 차단 이유를 적는다.
  if (w.person && w.person !== 'first') return []

  const out: string[] = []
  if (w.stat && w.statMult != null && w.statMult > 0) out.push(`${STAT_NAME[w.stat]} ×${w.statMult}`)
  else if (w.power) out.push(`${L.power} ${w.power}`)
  if (w.variance) out.push(gambleText(w.variance))
  // 배율 풀에 보태는 칸(주어·어미)은 0이어도 "배율 ×1.00"을 적는다.
  else if (w.bonus != null && w.statMult == null && !w.power) out.push(multText(w.bonus))
  else if (w.bonus) out.push(multText(w.bonus))
  if (w.effects?.guard) out.push(`${L.guard} +${w.effects.guard}`)
  if (w.effects?.heal) out.push(`${L.heal} +${w.effects.heal}`)
  if (w.crit) out.push(critText(w.crit))
  // 연타는 그 자체로 단일 대상이라 대상 수를 겹쳐 적지 않는다.
  const hits = w.effects?.hitCount ?? 1
  if (w.targetCount && hits <= 1) out.push(targetCountText(w.targetCount))
  if (w.effects?.pierceGuard) out.push(currentLocale === 'ko' ? '관통' : L.pierce)
  if (hits > 1) out.push(`${hits}${L.hits}`)
  if ((w.effects?.castCount ?? 1) > 1) {
    const scale = w.effects?.castScale != null ? ` (${L.each} ${Math.round(w.effects.castScale * 100)}%)` : ''
    out.push(`${w.effects!.castCount}${L.casts}${scale}`)
  }
  if (w.effects?.overdrawHitCount) out.push(`${OVERDRAW_HIT_LABEL} +${w.effects.overdrawHitCount}${OVERDRAW_HIT_UNIT}`)
  if (w.effects?.counterMultiplier) out.push(`${L.counter} ×${w.effects.counterMultiplier.toFixed(2)}`)
  if (w.effects?.magicShield) out.push(BUILD_EFFECT_LABEL.magicShield)
  if (w.effects?.guardAttackMultiplier) out.push(resourceDamageText(BUILD_EFFECT_LABEL.guardAttack, w.effects.guardAttackMultiplier))
  if (w.effects?.overhealDamageMultiplier) out.push(resourceDamageText(BUILD_EFFECT_LABEL.overhealAttack, w.effects.overhealDamageMultiplier))
  if (w.effects?.lifeStealRate) out.push(`${BUILD_EFFECT_LABEL.lifeSteal} ${Math.round(w.effects.lifeStealRate * 100)}%`)
  if (w.effects?.inkDiscount) out.push(`${L.inkDiscount} −${w.effects.inkDiscount}`)
  if (w.effects?.carryInk) out.push(`${L.carryInk} +${w.effects.carryInk}`)
  if (w.effects?.attackRank) out.push(rankText(EXTRA_EFFECT_LABEL.attackRank, w.effects.attackRank))
  if (w.effects?.guardRank) out.push(rankText(EXTRA_EFFECT_LABEL.guardRank, w.effects.guardRank))
  if (w.effects?.enemyAttackRank) out.push(rankText(EXTRA_EFFECT_LABEL.enemyAttackRank, w.effects.enemyAttackRank))
  if (w.effects?.bonusDraws) out.push(`${EXTRA_EFFECT_LABEL.bonusDraws} +${w.effects.bonusDraws}${DRAW_COUNT_UNIT}`)
  if (w.tags.includes(PREEMPT_TAG)) out.push(L.preempt)
  if (w.tags.includes('adapt')) out.push(L.adapt)
  if (w.aoe === 'all') out.push(w.slot === 'adv' && currentLocale === 'ko' ? '전체 적중' : w.slot === 'adv' ? L.allHit : L.all)
  if (w.timing === 'delayed') out.push(L.next)
  else if (w.timing === 'immediate') out.push(L.immediate)
  return out
}

export function numericNoteParts(w: Word): string[] {
  const out: string[] = []
  if (w.stat && w.statMult != null && w.statMult > 0) out.push(`×${w.statMult}`)
  if (w.power) out.push(`${L.power} ${w.power}`)
  if (w.bonus) out.push(multText(w.bonus))
  if (w.variance) out.push(gambleText(w.variance))
  if (w.crit) out.push(critText(w.crit))
  return out
}
