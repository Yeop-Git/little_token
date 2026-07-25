/**
 * 적 기믹과 특수 동사를 연결하는 공용 안내 데이터다.
 * 보스 직전 동사 보상도 이 목록을 사용하므로, 화면 설명과 실제로 제안되는 대응책이 어긋나지 않는다.
 */
export interface TacticalCardGuide {
  enemyId: string
  /** 이 날의 동사 보상을 고르면 다음 날 해당 보스를 만난다. */
  rewardDay?: number
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
    enemyId: 'roach',
    title: '관통 동사',
    tooltip: '단단한 방어에는 관통 동사(뚫고나갔다·갈라냈다)가 체력을 바로 노린다.',
    cardIds: ['pierceStrike', 'splitTwo'],
  },
  {
    enemyId: 'pillbug',
    title: '연타 동사',
    tooltip: '마력실드는 타격 횟수만큼 먼저 막는다. 연타 동사(두드렸다·휘몰아쳤다)로 바로 벗길 수 있다.',
    cardIds: ['doubleTap', 'flurry'],
  },
  {
    enemyId: 'mantis',
    rewardDay: 4,
    title: '카운터 방어',
    tooltip: '사마귀의 큰 베기는 카운터 방어(되돌려주었다·버텨냈다)로 막으면 그로기에 빠뜨릴 수 있다.',
    cardIds: ['counterOne', 'counterTwo'],
  },
  {
    enemyId: 'queenBee',
    rewardDay: 9,
    title: '범위·분노 집중',
    tooltip: '범위 동사로 일벌을 함께 정리해 그로기를 열거나, 분노 단일 공격으로 한 마리씩 노려 본체 반동 피해를 2배로 준다.',
    cardIds: ['spreadTwo', 'scatterThree', 'pourThree', 'splitTwo'],
  },
  {
    enemyId: 'elderSpider',
    rewardDay: 14,
    title: '연타·관통 동사',
    tooltip: '장로거미의 마력실드는 연타로 벗기고, 두꺼운 방어는 관통으로 넘긴다. 다리 약점 감정도 함께 맞춘다.',
    cardIds: ['doubleTap', 'flurry', 'pierceStrike', 'splitTwo'],
  },
]

export function tacticalGuideForEnemy(enemyId: string): TacticalCardGuide | undefined {
  return TACTICAL_CARD_GUIDES.find((guide) => guide.enemyId === enemyId)
}

export function tacticalCardIdsForRewardDay(day: number): readonly string[] {
  return TACTICAL_CARD_GUIDES.find((guide) => guide.rewardDay === day)?.cardIds ?? []
}
