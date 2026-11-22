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
  tooltip: '공격 동사로 문장을 완성하면 적에게 피해를 줘요\n혹은 방어 동사로 먼저 버티며 다음 턴을 노려요',
}

export const TACTICAL_CARD_GUIDES: readonly TacticalCardGuide[] = [
  {
    id: 'stored-resolve',
    enemyId: '',
    rewardFloors: [2],
    title: '방패치기',
    tooltip: '「꾹 참고」를 방어 동사와 함께 써서 방어도를 먼저 쌓아요\n그다음 「밀어냈다」를 쓰면 쌓인 방어도 100%만큼 피해를 줘요\n밀어내도 방어도는 줄지 않으니 막으면서 때릴 수 있어요',
    cardIds: ['kkuk'],
  },
  {
    id: 'pierce',
    enemyId: 'roach',
    title: '관통 수식어',
    tooltip: '방어가 단단한 적에게는 관통이 잘 들어요\n「힘껏」이나 「이판사판」을 공격 동사와 함께 쓰면 방어를 무시하고 체력에 바로 피해를 줘요\n혹은 공격 랭크를 올려 방어보다 큰 피해로 밀어붙여요',
    cardIds: ['himkkeot', 'ipan', 'bangeopge'],
  },
  {
    id: 'multihit',
    enemyId: 'pillbug',
    rewardFloors: [3],
    title: '반복 수식어',
    tooltip: '매직실드는 공격 한 번을 한 겹씩 막아 내요\n관통 공격도 막아요\n「미친 듯이」를 공격 동사와 함께 쓰면 동사가 2번 발동해 실드를 빨리 벗겨요\n혹은 앞 적을 쓰러뜨린 오버킬 피해로 실드를 깨며 뚫어요',
    cardIds: ['michin'],
  },
  {
    id: 'magic-shield',
    enemyId: 'mosquito',
    rewardFloors: [5],
    title: '매직실드',
    tooltip: '모기 침은 방어를 무시하고 들어와요\n「꾹 참고」를 방어 동사와 함께 쓰면 매직실드가 생겨 침 한 번을 통째로 막아요\n혹은 회복 동사로 잃은 체력을 메우며 버텨요',
    cardIds: ['kkuk'],
  },
  {
    id: 'mantis-counter',
    enemyId: 'mantis',
    rewardFloors: [4],
    title: '카운터 방어',
    tooltip: '사마귀가 큰 베기를 예고하면 카운터로 받아쳐요\n「다정히」나 「못 이기는 척」을 방어 동사와 함께 쓰면 카운터 방어가 돼요\n큰 베기를 막아 내면 사마귀가 그로기에 빠져요\n혹은 카운터 카드가 없으면 방어 동사로 피해만 줄여요',
    cardIds: ['dandanhi', 'motdohage'],
  },
  {
    id: 'queen-area',
    enemyId: 'queenBee',
    rewardFloors: [9],
    title: '범위 수식어·분노 집중',
    tooltip: '마지막 페이지에 들어서면 일벌 넷이 한 번 호위로 나와요\n일벌을 쓰러뜨릴 때마다 여왕벌도 반동 피해를 받아요\n분노 감정의 단일 공격으로 쓰러뜨리면 반동 피해가 2배예요\n혹은 「웃으며」·「거칠게」·「신나게」로 일벌을 빠르게 정리해요',
    cardIds: ['useumyeo', 'geochilge', 'sinnage'],
  },
  {
    id: 'spider-pierce',
    enemyId: 'elderSpider',
    rewardFloors: [14],
    title: '반복·관통 수식어',
    tooltip: '지금 노리는 다리의 약점 감정으로 공격해요\n매직실드가 있으면 「미친 듯이」를 공격 동사와 함께 써서 벗겨요\n혹은 방어가 두꺼우면 「힘껏」이나 「이판사판」으로 관통해요',
    cardIds: ['michin', 'himkkeot', 'ipan', 'bangeopge'],
  },
  {
    id: 'elite-warded', enemyId: '*', rewardFloors: [10], title: '겹실드 정예',
    tooltip: '겹실드 정예는 매직실드를 여러 겹 둘러요\n「미친 듯이」를 공격 동사와 함께 써서 겹부터 벗겨요\n혹은 약한 공격을 여러 번 넣어 겹을 먼저 소모시켜요',
    cardIds: ['michin'],
  },
  {
    id: 'elite-leeching', enemyId: '*', rewardFloors: [11], title: '흡묵 정예',
    tooltip: '흡묵 정예는 준 피해 일부만큼 흡혈해요\n「꾹 참고」를 방어 동사와 함께 써서 매직실드로 막으면 흡혈도 끊겨요\n혹은 회복보다 빠르게 큰 피해로 몰아붙여요',
    cardIds: ['kkuk'],
  },
  {
    id: 'elite-raging', enemyId: '*', rewardFloors: [12, 13], title: '격문 정예',
    tooltip: '약한 견제와 강한 돌진을 번갈아 써요\n돌진 차례에는 「애써」나 「못 이기는 척」을 방어 동사와 함께 써서 막아요\n혹은 견제 차례에 공격을 몰아 넣어요',
    cardIds: ['aesseo', 'motdohage'],
  },
  // 번역표(TACTICAL_TEXT)가 순서로 짝지어지므로 새 공략은 항상 끝에 붙인다.
  {
    id: 'preempt',
    enemyId: 'flea',
    title: '선공 수식어',
    tooltip: '좀나방은 내 문장보다 먼저 날아들어 때려요\n「살짝」을 공격 동사와 함께 쓰면 먼저 움직여 맞기 전에 쓰러뜨려요\n혹은 방어 동사로 먼저 버텨요',
    cardIds: ['saljjak'],
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
