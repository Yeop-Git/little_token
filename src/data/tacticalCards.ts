/**
 * 적 기믹과 특수 동사를 연결하는 공용 안내 데이터다.
 * 보스 직전 동사 보상도 이 목록을 사용하므로, 화면 설명과 실제로 제안되는 대응책이 어긋나지 않는다.
 */
export interface TacticalCardGuide {
  id: string
  enemyId: string
  /** 이 층의 동사 보상을 고르면 다음 층에서 해당 기믹을 만난다. 엔드리스에서도 반복한다. */
  rewardFloors?: readonly number[]
  title: string
  /**
   * 전장 아이콘 툴팁과 보상 화면이 함께 읽는 공략 문장이다. 실제 기믹과 선택 가능한
   * 대응책을 짧고 명확하게 설명한다.
   */
  tooltip: string
  cardIds: readonly string[]
}

export const TACTICAL_CARD_GUIDES: readonly TacticalCardGuide[] = [
  {
    id: 'stored-resolve',
    enemyId: 'termite',
    rewardFloors: [2],
    title: '버틴 힘',
    tooltip: '방어를 쌓은 뒤 「버틴 힘을 내질렀다」로 현재 방어도의 90%를 두 대상까지 밀어낸다. 방어도는 소모하지 않는다.',
    cardIds: ['storedResolve'],
  },
  {
    id: 'pierce',
    enemyId: 'roach',
    title: '관통 동사',
    tooltip: '단단한 방어에는 관통 동사(뚫고나갔다·갈라냈다)가 체력을 바로 노린다.',
    cardIds: ['pierceStrike', 'splitTwo'],
  },
  {
    id: 'multihit',
    enemyId: 'pillbug',
    rewardFloors: [3],
    title: '연타 동사',
    tooltip: '마력실드는 타격 횟수만큼 먼저 막는다. 연타 동사(두드렸다·휘몰아쳤다)로 바로 벗길 수 있다.',
    cardIds: ['doubleTap', 'flurry'],
  },
  {
    id: 'magic-shield',
    enemyId: 'mosquito',
    rewardFloors: [5],
    title: '매직실드',
    tooltip: '모기의 침은 방어를 건너뛴다. 「빛의 막을 둘렀다」의 매직실드는 관통 공격 한 번을 완전히 막는다.',
    cardIds: ['magicVeil'],
  },
  {
    id: 'mantis-counter',
    enemyId: 'mantis',
    rewardFloors: [4],
    title: '카운터 방어',
    tooltip: '사마귀의 큰 베기는 카운터 방어(되돌려주었다·버텨냈다)로 막으면 그로기에 빠뜨릴 수 있다.',
    cardIds: ['counterOne', 'counterTwo'],
  },
  {
    id: 'queen-area',
    enemyId: 'queenBee',
    rewardFloors: [9],
    title: '범위·분노 집중',
    tooltip: '범위 동사로 일벌을 함께 정리해 그로기를 열거나, 분노 단일 공격으로 한 마리씩 노려 본체 반동 피해를 2배로 준다.',
    cardIds: ['spreadTwo', 'scatterThree', 'pourThree', 'splitTwo'],
  },
  {
    id: 'spider-pierce',
    enemyId: 'elderSpider',
    rewardFloors: [14],
    title: '연타·관통 동사',
    tooltip: '장로거미의 마력실드는 연타로 벗기고, 두꺼운 방어는 관통으로 넘긴다. 다리 약점 감정도 함께 맞춘다.',
    cardIds: ['doubleTap', 'flurry', 'pierceStrike', 'splitTwo'],
  },
  {
    id: 'elite-warded', enemyId: '*', rewardFloors: [10], title: '겹실드 정예',
    tooltip: '희귀 이상 겹실드 정예는 추가 매직실드를 두른다. 연타 동사로 겹을 먼저 벗긴다.',
    cardIds: ['doubleTap', 'flurry'],
  },
  {
    id: 'elite-leeching', enemyId: '*', rewardFloors: [11], title: '흡묵 정예',
    tooltip: '흡묵 정예는 체력에 준 피해 일부를 회복한다. 매직실드로 한 번 완전히 막아 흡혈도 끊는다.',
    cardIds: ['magicVeil'],
  },
  {
    id: 'elite-raging', enemyId: '*', rewardFloors: [12, 13], title: '격문 정예',
    tooltip: '격문 정예는 약한 견제와 강한 돌진을 번갈아 쓴다. 기세를 낮춰 큰 공격을 누른다.',
    cardIds: ['dampenMomentum'],
  },
]

export function tacticalGuideForEnemy(enemyId: string, guideId?: string): TacticalCardGuide | undefined {
  return (guideId ? TACTICAL_CARD_GUIDES.find((guide) => guide.id === guideId) : undefined)
    ?? TACTICAL_CARD_GUIDES.find((guide) => guide.enemyId === enemyId)
}

export function tacticalCardIdsForRewardDay(day: number): readonly string[] {
  const floor = ((Math.max(1, Math.floor(day)) - 1) % 15) + 1
  return [...new Set(TACTICAL_CARD_GUIDES
    .filter((guide) => guide.rewardFloors?.includes(floor))
    .flatMap((guide) => guide.cardIds))]
}

/** 한 번 놓치면 런 공략이 막히는 보스 직전 보상만 구매 AI가 비용을 예약한다. */
export const BOSS_TACTICAL_REWARD_DAYS = [4, 9, 14] as const

export function isBossTacticalRewardDay(day: number): boolean {
  const floor = ((Math.max(1, Math.floor(day)) - 1) % 15) + 1
  return BOSS_TACTICAL_REWARD_DAYS.includes(floor as (typeof BOSS_TACTICAL_REWARD_DAYS)[number])
}
