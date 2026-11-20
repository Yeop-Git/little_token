/**
 * 적 기믹과 수식어를 연결하는 공용 안내 데이터다.
 * 보스 직전 수식어 보상도 이 목록을 사용하므로, 화면 설명과 실제 제안이 어긋나지 않는다.
 */
export interface TacticalCardGuide {
  id: string
  /**
   * 이 공략을 전장 TIP으로 붙일 적. 빈 문자열은 보상 진열 전용 안내라 어떤 적에게도
   * 붙지 않는다(방패치기는 흰개미와 무관한 2층 보상 안내였는데 흰개미에 붙어 있었다).
   */
  enemyId: string
  /** 이 층의 수식어 보상을 고르면 다음 층에서 해당 기믹을 만난다. 엔드리스에서도 반복한다. */
  rewardFloors?: readonly number[]
  title: string
  /**
   * 전장 아이콘 툴팁과 보상 화면이 함께 읽는 공략 문장이다. 실제 기믹과 선택 가능한
   * 대응책을 짧고 명확하게 설명한다.
   */
  tooltip: string
  cardIds: readonly string[]
}

/** 첫 전투에서는 빌드 공략보다 공격 문장의 가장 기본적인 결과를 먼저 가르친다. */
export const FIRST_FLOOR_ATTACK_GUIDE = {
  title: '공격으로 체력 깎기',
  tooltip: '공격 동사로 문장 완성\n적에게 피해를 주어 체력 깎기',
}

export const TACTICAL_CARD_GUIDES: readonly TacticalCardGuide[] = [
  {
    id: 'stored-resolve',
    enemyId: '',
    rewardFloors: [2],
    title: '방패치기',
    tooltip: '「밀어냈다」: 현재 방어도 100%를 피해로\n방어도는 줄지 않음\n「꾹 참고」로 방어부터 쌓기',
    cardIds: ['kkuk'],
  },
  {
    id: 'pierce',
    enemyId: 'roach',
    title: '관통 수식어',
    tooltip: '단단한 방어엔 관통 수식어\n「힘껏」·「이판사판」을 공격 동사에\n방어 무시, 체력에 바로 피해',
    cardIds: ['himkkeot', 'ipan', 'bangeopge'],
  },
  {
    id: 'multihit',
    enemyId: 'pillbug',
    rewardFloors: [3],
    title: '반복 수식어',
    tooltip: '매직실드는 타격 1번에 1겹씩 막음\n「미친 듯이」로 동사를 2번 발동해 벗기기',
    cardIds: ['michin'],
  },
  {
    id: 'magic-shield',
    enemyId: 'mosquito',
    rewardFloors: [5],
    title: '매직실드',
    tooltip: '모기 침은 방어 무시\n「꾹 참고」를 방어 동사에 붙여 매직실드\n매직실드는 공격 1번을 완전히 막음',
    cardIds: ['kkuk'],
  },
  {
    id: 'mantis-counter',
    enemyId: 'mantis',
    rewardFloors: [4],
    title: '카운터 방어',
    tooltip: '큰 베기 예고가 뜨면 카운터 방어\n「다정히」·「못 이기는 척」을 방어 동사에\n막아 내면 사마귀 그로기',
    cardIds: ['dandanhi', 'motdohage', 'sseulsseulhi'],
  },
  {
    id: 'queen-area',
    enemyId: 'queenBee',
    rewardFloors: [9],
    title: '범위 수식어·분노 집중',
    tooltip: '「웃으며」·「거칠게」·「신나게」로 일벌 정리\n분노 단일 공격은 퇴치 반동 피해 2배',
    cardIds: ['useumyeo', 'geochilge', 'sinnage'],
  },
  {
    id: 'spider-pierce',
    enemyId: 'elderSpider',
    rewardFloors: [14],
    title: '반복·관통 수식어',
    tooltip: '매직실드는 「미친 듯이」로 벗기기\n두꺼운 방어는 관통 수식어로\n지금 다리의 약점 감정 맞추기',
    cardIds: ['michin', 'himkkeot', 'ipan', 'bangeopge'],
  },
  {
    id: 'elite-warded', enemyId: '*', rewardFloors: [10], title: '겹실드 정예',
    tooltip: '겹실드 정예: 매직실드를 더 두름\n「미친 듯이」로 겹부터 벗기기',
    cardIds: ['michin'],
  },
  {
    id: 'elite-leeching', enemyId: '*', rewardFloors: [11], title: '흡묵 정예',
    tooltip: '흡묵 정예: 준 피해 일부를 흡혈\n「꾹 참고」의 매직실드로 막으면 흡혈도 끊김',
    cardIds: ['kkuk'],
  },
  {
    id: 'elite-raging', enemyId: '*', rewardFloors: [12, 13], title: '격문 정예',
    tooltip: '약한 견제와 강한 돌진을 번갈아\n기세를 낮춰 큰 공격 누르기',
    cardIds: ['aesseo', 'motdohage'],
  },
]

export function tacticalGuideForEnemy(
  enemyId: string,
  guideId?: string,
  stage?: { floor: number; endlessCycle: number },
): Pick<TacticalCardGuide, 'title' | 'tooltip'> | undefined {
  if (stage?.floor === 1 && stage.endlessCycle === 0) return FIRST_FLOOR_ATTACK_GUIDE
  return (guideId ? TACTICAL_CARD_GUIDES.find((guide) => guide.id === guideId) : undefined)
    ?? TACTICAL_CARD_GUIDES.find((guide) => !!guide.enemyId && guide.enemyId === enemyId)
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
