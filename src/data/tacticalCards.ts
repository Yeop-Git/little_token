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
   * 한 줄 공략. 전장 아이콘 툴팁과 보상 화면이 같이 읽는 문장이라, 규칙을 설명하지
   * 말고 **지금 무엇을 고르면 되는지**만 적는다. 처음 하는 사람이 한 번에 읽고
   * 행동을 정할 수 있는 길이를 넘기지 않는다.
   */
  tooltip: string
  cardIds: readonly string[]
}

export const TACTICAL_CARD_GUIDES: readonly TacticalCardGuide[] = [
  {
    enemyId: 'roach',
    title: '관통 동사',
    tooltip: '관통 동사(파고들었다·갈라냈다)는 방어를 무시하고 체력을 때린다.',
    cardIds: ['pierceStrike', 'splitTwo'],
  },
  {
    enemyId: 'pillbug',
    title: '연타 동사',
    tooltip: '연타 동사(두드렸다·난타했다)는 때린 횟수만큼 마법실드를 벗긴다.',
    cardIds: ['doubleTap', 'flurry'],
  },
  {
    enemyId: 'mantis',
    rewardDay: 4,
    title: '카운터 방어',
    tooltip: '큰낫을 들면 카운터 방어(되돌려주었다·버텨냈다)로 막아 그로기를 만든다.',
    cardIds: ['counterOne', 'counterTwo'],
  },
  {
    enemyId: 'queenBee',
    rewardDay: 9,
    title: '범위 공격',
    tooltip: '범위 동사(흩뿌렸다·쏟아냈다)로 일벌 넷을 한 번에 정리한다.',
    cardIds: ['spreadTwo', 'scatterThree', 'pourThree', 'splitTwo'],
  },
  {
    enemyId: 'elderSpider',
    rewardDay: 14,
    title: '연타·관통 동사',
    tooltip: '연타로 마법실드를 벗기고, 관통으로 방어를 넘고, 드러난 다리 약점을 맞춘다.',
    cardIds: ['doubleTap', 'flurry', 'pierceStrike', 'splitTwo'],
  },
]

export function tacticalGuideForEnemy(enemyId: string): TacticalCardGuide | undefined {
  return TACTICAL_CARD_GUIDES.find((guide) => guide.enemyId === enemyId)
}

export function tacticalCardIdsForRewardDay(day: number): readonly string[] {
  return TACTICAL_CARD_GUIDES.find((guide) => guide.rewardDay === day)?.cardIds ?? []
}
