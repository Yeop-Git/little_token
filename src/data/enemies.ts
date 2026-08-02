/**
 * 적 — 그림일기를 좀먹는 벌레들(의인화 벌레 소녀). 전투라기보다 "정해진 턴 안에
 * 처리해야 하는 디펜스 대상". every(공격 주기)를 다르게 둬 서로 다른 대응을 요구한다.
 * sprite 필드는 assets/index.ts의 SPRITES 키를 참조한다.
 */

import type { EnemyDef, Rarity } from '@core/types'

export const QUEEN_ESCORT_IMMUNITY_LABEL = '호위 중 : 본체 무적'

export const ENEMIES: Record<string, EnemyDef> = {
  mantis: {
    id: 'mantis', name: '사마귀', boss: true,
    // 준비 → 내려베기 → 휘두르기가 3턴 한 사이클이다. 첫 두 턴이 곧 파훼 교실이라
    // 강한 덱도 규칙을 먼저 읽고, 세 번째 턴에 숨을 고른다.
    //
    // 예전에는 준비 → 내려베기 2턴뿐이라 **평타가 아예 없었다.** 매 턴이 예고
    // 아니면 강타여서 플레이어는 방어만 강요받았고, 상단 문장도 경고 두 종류만
    // 돌아 늘 강공격 직전처럼 읽혔다. 숨 돌릴 한 턴을 넣어 공격·회복 문장을 쓸
    // 자리를 만들고, 대신 내려베기를 더 무겁게 해 못 막았을 때의 값을 올린다.
    // 숨 돌리는 턴은 **사이클 끝**에 둔다 — 앞에 두면 예고→내려베기를 두 번 보기
    // 전에 전투가 끝나 보스가 자기 패턴을 못 보여 주고 죽는다.
    hp: 116, atk: 7, every: 1, initiative: 'first',
    sprite: 'boss_mantis', guard: 8, weakEmotion: 'sorrow',
    attackPattern: [
      { name: '강공격 자세 잡기', bonusAtk: 0, animationStage: 2, damageScale: 0, telegraphText: '큰낫을 높이 들고 다음 공격을 준비한다!' },
      {
        name: '큰낫 내려베기',
        bonusAtk: 0,
        animationStage: 3,
        // 주기가 2턴 → 3턴으로 늘어 강타가 덜 자주 온다. 한 방의 무게를 올려
        // "막아야 하는 순간"의 값을 유지한다.
        damageScale: 1.7,
        shatterGuard: true,
        lifeStealRate: 0.5,
        groggyDamageMult: 1.5,
        groggyRequiresGuardShatter: true,
      },
      { name: '낫 휘두르기', bonusAtk: 0, animationStage: 1, damageScale: 0.75 },
    ],
    note: '큰낫을 들어 강공격을 예고하고 내려벤 뒤, 한 턴 숨을 고르며 낫을 휘두르는 세 턴 패턴을 반복한다. 표시된 필요 방어를 채우면 방어를 전부 소모하는 대신 체력 피해 없이 사마귀가 그로기되어 받는 피해가 커지고 예정된 다음 공격을 한 턴 거른다. 부족한 방어는 피해를 흡수한 만큼만 소모되며, 남은 피해의 절반을 사마귀가 흡혈한다.',
  },
  queenBee: {
    id: 'queenBee', name: '여왕벌', boss: true,
    hp: 68, atk: 7, every: 3, initiative: 'second',
    sprite: 'boss_queen_bee', weakEmotion: 'anger',
    summonPattern: {
      name: '일벌',
      sprite: 'enemy_worker_bee',
      // 10층 덱의 평범한 문장은 한두 마리를 순서대로 정리하고, 덱 상한(약 160)은
      // 네 마리 총 120 체력을 한 번에 관통할 수 있는 기준이다.
      hp: 30,
      // 전투 시작과 호위 전멸 다음 턴에만 네 마리를 한꺼번에 세운다. 중간 보충을
      // 막아 매 웨이브가 "네 마리를 모두 퇴치하면 그로기"라는 완결된 목표가 된다.
      perTurn: 4,
      max: 4,
      maxPerSide: 2,
      refillOnlyWhenEmpty: true,
      pierceWhileEscorted: true,
      backlashMaxHpRatePerUnit: 0.03,
      focusedBacklash: { emotion: 'anger', multiplier: 2 },
      groggyEvery: 4,
      groggyDamageMult: 1.5,
    },
    note: `전투 시작에 체력 30인 일벌 네 마리를 한꺼번에 호위로 세운다. ${QUEEN_ESCORT_IMMUNITY_LABEL}. 한 마리라도 남아 있으면 여왕벌의 공격도 방어를 관통한다. 문장 피해는 일벌 넷을 차례로 쓰러뜨린 뒤 남은 만큼 본체까지 이어진다. 범위·관통 공격은 여러 일벌을 빠르게 퇴치해 그로기를 노리고, 분노 단일 비관통 공격은 한 마리씩 노리는 대신 퇴치 반동 피해를 2배로 준다. 일반 퇴치 반동은 일벌 한 마리마다 여왕벌 최대 체력의 3%다. 네 마리를 모두 퇴치하면 여왕벌이 그 턴 받는 피해 ×1.5 그로기에 빠지고 다음 턴에는 아무 행동도 하지 않는다. 그 다음 턴 시작에 새 일벌 네 마리를 소환해 같은 주기를 반복한다.`,
  },
  elderSpider: {
    id: 'elderSpider', name: '장로거미', boss: true,
    // 다리 하나가 곧 체력 한 막이다. 막당 체력이 낮으면 문장 하나가 다리 둘을
    // 한꺼번에 끊어 기쁨·분노·슬픔·즐거움 약점이 드러나기도 전에 사라진다.
    //
    // 거미줄은 방패 위를 타고 넘어 몸을 감는다(pierceGuard). 방어로 버티는 길을
    // 막아야 "지금 드러난 약점을 읽어 다리를 끊는다"가 유일한 활로가 된다.
    // 대신 한 방은 최대 체력의 1/5로 묶여 있어 즉사가 아니라 조여드는 압박이다.
    hp: 74, atk: 12, every: 2, initiative: 'first',
    sprite: 'boss_elder_spider', guard: 12, magicShield: 1, pierceGuard: true, weakEmotion: null,
    parts: [
      { id: 'leg-joy', name: '첫째 다리', kind: 'leg', weakness: { kind: 'emotion', value: 'joy', label: '기쁨' } },
      { id: 'leg-anger', name: '둘째 다리', kind: 'leg', weakness: { kind: 'emotion', value: 'anger', label: '분노' } },
      { id: 'leg-sorrow', name: '셋째 다리', kind: 'leg', weakness: { kind: 'emotion', value: 'sorrow', label: '슬픔' } },
      { id: 'leg-pleasure', name: '넷째 다리', kind: 'leg', weakness: { kind: 'emotion', value: 'pleasure', label: '즐거움' } },
      { id: 'body', name: '본체', kind: 'body' },
    ],
    webPattern: { sealPerTurn: 1, maxSealedCards: 3 },
    note: '네 다리는 기쁨·분노·슬픔·즐거움 약점을 차례로 드러내며, 마지막 본체에는 약점이 없다. 거미줄은 방어막을 넘어 몸에 직접 감기므로 막아서 버틸 수 없고, 대신 한 번의 피해가 최대 체력의 1/5을 넘지 않는다. 매 문장마다 무작위 카드 하나를 거미줄로 봉인하며 봉인은 최대 3장까지 누적된다. 현재 다리의 약점 공격은 피해 ×1.5와 함께 봉인 하나를 풀지만 기본적으로 현재 다리에서 멈춘다. 현재 약점을 맞힌 관용구 문장만 남은 피해로 뒤의 다리와 본체까지 관통한다. 공격이 아니어도 현재 약점 속성을 담은 방어·회복 문장은 봉인 하나를 푼다. 약점을 빗나간 공격은 아무리 세도 지금 다리에서 멈춘다. 다리가 떨어지면 모든 카드의 거미줄이 즉시 사라진다.',
  },
  termite: {
    id: 'termite', name: '흰개미', hp: 6, atk: 4, every: 2, initiative: 'second',
    sprite: 'enemy_termite', weakEmotion: null,
    note: '특별한 능력 없이 종이 섬유를 차근차근 갉아 먹는다.',
  },
  moth: {
    id: 'moth',
    name: '먼지벌레',
    hp: 6,
    atk: 4,
    every: 2,
    initiative: 'second',
    sprite: 'enemy_moth', weakEmotion: 'sorrow',
    note: '특별한 능력 없이 먼지 묻은 솔로 문장 가장자리를 털어 지운다.',
  },
  flea: {
    id: 'flea', name: '좀나방', hp: 7, atk: 5, every: 2, initiative: 'first',
    sprite: 'enemy_flea', weakEmotion: 'joy',
    note: '빠른 날갯짓으로 문장이 시작되기 전 먼저 날아든다.',
  },
  roach: {
    id: 'roach',
    name: '바퀴',
    hp: 10,
    atk: 6,
    every: 2,
    initiative: 'second',
    sprite: 'enemy_roach',
    guard: 7, weakEmotion: 'anger',
    note: '단단한 껍질의 방어 7이 피해를 먼저 받아 낸다.',
  },
  pillbug: {
    id: 'pillbug', name: '공벌레', hp: 12, atk: 5, every: 2, initiative: 'second',
    sprite: 'enemy_pillbug', magicShield: 1, weakEmotion: null,
    note: '매직실드 1겹이 첫 타격을 완전히 막고 사라진다.',
  },
  mosquito: {
    id: 'mosquito', name: '모기', hp: 8, atk: 6, every: 2, initiative: 'second',
    sprite: 'enemy_mosquito', pierceGuard: true, weakEmotion: 'pleasure',
    note: '긴 침으로 방어막을 소모시키지 않고 체력에 직접 피해를 준다.',
  },
}

// 화면 데모 조우: 서로 다른 능력을 바로 비교한다.
export const DEMO_ENCOUNTER = ['flea', 'roach', 'pillbug', 'mosquito']

type EliteRarity = Exclude<Rarity, 'common'>
type EliteTrait = NonNullable<EnemyDef['elite']>['trait']

const ELITE_SCALE: Record<EliteRarity, { hp: number; atk: number; shield: number; leech: number }> = {
  rare: { hp: 1.08, atk: 1.04, shield: 1, leech: 0.25 },
  epic: { hp: 1.16, atk: 1.08, shield: 2, leech: 0.4 },
  legendary: { hp: 1.25, atk: 1.12, shield: 3, leech: 0.55 },
}

/** 로케일 적용 시 내용만 바뀌며, 등급 셰이더와 전투 규칙은 이 텍스트를 참조하지 않는다. */
export const ELITE_ENEMY_TEXT = {
  rarity: { rare: '희귀', epic: '영웅', legendary: '전설' } as Record<EliteRarity, string>,
  trait: {
    warded: { label: '겹실드', note: '추가 매직실드가 타격을 통째로 지운다.', attacks: ['껍질 튕기기'] },
    leeching: { label: '흡묵', note: '체력에 준 피해 일부를 잉크처럼 빨아들여 회복한다.', attacks: ['잉크 빨아먹기'] },
    raging: { label: '격문', note: '약한 견제와 강한 돌진을 번갈아 사용한다.', attacks: ['기세 긁기', '문장 들이받기'] },
    boss: { label: '정예 보스', note: '고유 패턴을 유지한 채 체력과 공격이 강화된다.', attacks: [] },
  } as Record<EliteTrait, { label: string; note: string; attacks: string[] }>,
}

function eliteTraitFor(enemyId: string): EliteTrait {
  if (enemyId === 'roach' || enemyId === 'pillbug') return 'warded'
  if (enemyId === 'flea' || enemyId === 'mosquito') return 'leeching'
  return 'raging'
}

const BOSS_RARITY_QUANTILE: Record<string, number> = {
  mantis: 0.78,
  queenBee: 0.62,
  elderSpider: 0.38,
}

/** 같은 보스의 다음 출현은 이전보다 낮은 등급으로 돌아가지 않는다. */
export function bossEliteRarityForDay(enemyId: string, day: number): EliteRarity | null {
  if (day <= 15) return null
  if (day >= 105) return 'legendary'
  const quantile = BOSS_RARITY_QUANTILE[enemyId] ?? 0.5
  const weights = enemyRarityWeightsForDay(day)
  if (quantile < weights.common) return null
  if (quantile < weights.common + weights.rare) return 'rare'
  if (quantile < weights.common + weights.rare + weights.epic) return 'epic'
  return 'legendary'
}

type EnemyRarityWeights = Record<Rarity, number>

const ENDLESS_RARITY_CURVE: ReadonlyArray<readonly [day: number, weights: EnemyRarityWeights]> = [
  [16, { common: 0.82, rare: 0.18, epic: 0, legendary: 0 }],
  [30, { common: 0.62, rare: 0.33, epic: 0.05, legendary: 0 }],
  [45, { common: 0.42, rare: 0.38, epic: 0.19, legendary: 0.01 }],
  [60, { common: 0.25, rare: 0.33, epic: 0.36, legendary: 0.06 }],
  [75, { common: 0.14, rare: 0.23, epic: 0.48, legendary: 0.15 }],
  [90, { common: 0.07, rare: 0.13, epic: 0.45, legendary: 0.35 }],
  [105, { common: 0.03, rare: 0.06, epic: 0.31, legendary: 0.6 }],
  [120, { common: 0.01, rare: 0.03, epic: 0.21, legendary: 0.75 }],
]

export function enemyRarityWeightsForDay(day: number): EnemyRarityWeights {
  if (day <= 15) return { common: 1, rare: 0, epic: 0, legendary: 0 }
  const upperIndex = ENDLESS_RARITY_CURVE.findIndex(([anchor]) => day <= anchor)
  if (upperIndex <= 0) return { ...ENDLESS_RARITY_CURVE[0][1] }
  if (upperIndex < 0) return { ...ENDLESS_RARITY_CURVE[ENDLESS_RARITY_CURVE.length - 1][1] }
  const [lowerDay, lower] = ENDLESS_RARITY_CURVE[upperIndex - 1]
  const [upperDay, upper] = ENDLESS_RARITY_CURVE[upperIndex]
  const progress = (day - lowerDay) / (upperDay - lowerDay)
  return {
    common: lower.common + (upper.common - lower.common) * progress,
    rare: lower.rare + (upper.rare - lower.rare) * progress,
    epic: lower.epic + (upper.epic - lower.epic) * progress,
    legendary: lower.legendary + (upper.legendary - lower.legendary) * progress,
  }
}

/**
 * 첫 권은 11~14층 선두에 희귀 정예만 소개한다. 이후에는 층별 가중치를 편성 안에서
 * 층화 추출해 갑작스러운 등급 도약과 재접속 리롤을 막는다. 보스는 고유 재질을 유지한다.
 */
export function eliteRarityForEncounter(
  floor: number,
  endlessCycle: number,
  index: number,
  encounterCount = 8,
): EliteRarity | null {
  if (floor === 5 || floor === 10 || floor === 15) return null
  if (endlessCycle === 0) return floor >= 11 && floor <= 14 && index === 0 ? 'rare' : null

  const day = endlessCycle * 15 + floor
  const weights = enemyRarityWeightsForDay(day)
  // 황금비 위상으로 날짜마다 줄의 시작점을 돌리되, 각 인덱스는 동일 간격으로 뽑아
  // 여덟 마리 편성이 작은 표본 하나에 치우치지 않게 한다.
  const roll = ((index + 0.5) / Math.max(1, encounterCount) + day * 0.61803398875) % 1
  if (roll < weights.common) return null
  if (roll < weights.common + weights.rare) return 'rare'
  if (roll < weights.common + weights.rare + weights.epic) return 'epic'
  return 'legendary'
}

/** 스테이지가 같은 기본 모델을 등급 셰이더와 종족 특성으로 변주할 때 읽는 단일 진입점. */
export function enemyDefForEncounter(
  enemyId: string,
  floor: number,
  endlessCycle: number,
  index: number,
  encounterCount = 8,
): EnemyDef {
  const base = ENEMIES[enemyId]
  if (!base) throw new Error(`등록되지 않은 적: ${enemyId}`)
  const day = endlessCycle * 15 + floor
  const rarity = base.boss
    ? bossEliteRarityForDay(enemyId, day)
    : eliteRarityForEncounter(floor, endlessCycle, index, encounterCount)
  if (!rarity) return base

  if (base.boss) {
    const scale = ELITE_SCALE[rarity]
    const text = ELITE_ENEMY_TEXT.trait.boss
    return {
      ...base,
      name: `${ELITE_ENEMY_TEXT.rarity[rarity]} ${base.name}`,
      hp: Math.max(1, Math.round(base.hp * (1 + (scale.hp - 1) * 0.65))),
      atk: Math.max(1, Math.round(base.atk * (1 + (scale.atk - 1) * 0.75))),
      note: `${text.note} ${base.note}`,
      elite: { rarity, trait: 'boss', label: text.label },
    }
  }

  const trait = eliteTraitFor(enemyId)
  const scale = ELITE_SCALE[rarity]
  const text = ELITE_ENEMY_TEXT.trait[trait]
  const attackPattern: EnemyDef['attackPattern'] = trait === 'leeching'
    ? [{ name: text.attacks[0], bonusAtk: 0, lifeStealRate: scale.leech }]
    : trait === 'raging'
      ? [
          { name: text.attacks[0], bonusAtk: 0, damageScale: 0.75 },
          { name: text.attacks[1], bonusAtk: 0, damageScale: rarity === 'rare' ? 1.25 : rarity === 'epic' ? 1.4 : 1.55 },
        ]
      : [{ name: text.attacks[0], bonusAtk: 0 }]

  return {
    ...base,
    name: `${ELITE_ENEMY_TEXT.rarity[rarity]} ${base.name}`,
    hp: Math.max(1, Math.round(base.hp * scale.hp)),
    atk: Math.max(1, Math.round(base.atk * scale.atk)),
    magicShield: trait === 'warded' ? (base.magicShield ?? 0) + scale.shield : base.magicShield,
    attackPattern,
    note: `${text.note} ${base.note}`,
    elite: { rarity, trait, label: text.label },
    tacticalGuideId: `elite-${trait}`,
  }
}
