/**
 * 아이템 패시브 — 스탯이 아니라 "문장을 읽는 규칙"을 바꾸는 효과.
 *
 * 노멀/희귀 아이템은 스탯을 준다. 전설 아이템은 기본 스탯이 0이고 규칙만 바꾼다
 * (감탄사로 붙는 소량은 받는다). 그래서 전설만 모아서는 깡수치가 거의 안 늘고
 * 단어 보상을 계속 골라야 한다 — 아이템과 단어가 같은 축에서 경쟁하지 않게 하는 장치다.
 */

import type { PlayerState } from './player'
import type { CompileMods } from './types'

export type PassiveId =
  | 'echo' // 누댕의 메아리 — 대성공하면 그 문장이 한 번 더 발동한다
  | 'punct' // 올림프의 당근 — 문장 끝에 문장부호 칸이 생긴다
  | 'twinVerb' // 맛동사 — 동사 칸이 둘이 된다
  | 'retry' // 신데렐라의 황금사과 — 대성공에 실패하면 한 번 더 굴린다
  | 'twinSubj' // 미녀의 거울 — 주어 칸이 둘이 된다
  | 'heavyShoe' // 백설공주의 구두 — 동사 깡수치에 고정 가산
  | 'matchFire' // 빨간망토의 성냥 — 배율 칸마다 보너스 추가
  | 'luckCloak' // 성냥팔이 소녀의 망토 — 모든 동사가 운을 깡수치로 받는다
  | 'bbq' // 아기돼지 바베큐 — 이번 전투 처치 수만큼 배율 상승
  | 'doubt' // 피노키오의 미아핑 — 맥락마다 "근데?"가 붙는다
  | 'beanstalk' // 잭과 숙주나물 — 무럭무럭 카드와 맥락 성장

/** 백설공주의 구두가 동사 깡수치에 더하는 값. */
export const HEAVY_SHOE_FLAT = 7
/** 빨간망토의 성냥이 배율 칸마다 더하는 보너스. */
export const MATCH_FIRE_BONUS = 0.1
/** 아기돼지 바베큐 — 이번 전투 처치 1마리당 배율. */
export const BBQ_PER_KILL = 0.05
/** 피노키오의 미아핑 — 맥락 하나당 굴리는 "근데?" 배율 상한(1.0 ~ 1+이 값). */
export const DOUBT_RANGE = 0.3

export interface PassiveDef {
  id: PassiveId
  name: string
  /** 카드/가방에 그대로 뜨는 한 줄. 규칙을 숨기지 않는다. */
  desc: string
}

export const PASSIVES: Record<PassiveId, PassiveDef> = {
  echo: {
    id: 'echo',
    name: '메아리',
    desc: '대성공하면 그 문장이 한 번 더 발동한다',
  },
  punct: {
    id: 'punct',
    name: '문장부호',
    desc: '문장 끝에 문장부호를 붙이는 칸이 생긴다',
  },
  twinVerb: {
    id: 'twinVerb',
    name: '겹동사',
    desc: '동사 칸이 둘이 된다 · 공격과 회복을 함께 쓸 수 있다',
  },
  retry: {
    id: 'retry',
    name: '재시도',
    desc: '대성공에 실패하면 한 번 더 굴린다',
  },
  twinSubj: {
    id: 'twinSubj',
    name: '겹주어',
    desc: '주어 칸이 둘이 된다 · 배율을 두 번 얹는다',
  },
  heavyShoe: {
    id: 'heavyShoe',
    name: '무거운 구두',
    desc: `동사의 깡수치에 +${HEAVY_SHOE_FLAT}`,
  },
  matchFire: {
    id: 'matchFire',
    name: '불붙은 배율',
    desc: `배율 칸마다 +${Math.round(MATCH_FIRE_BONUS * 100)}%씩 더 붙는다`,
  },
  luckCloak: {
    id: 'luckCloak',
    name: '운을 두른다',
    desc: '모든 동사가 운 스탯만큼 깡수치를 더 받는다',
  },
  bbq: {
    id: 'bbq',
    name: '바베큐',
    desc: `이번 전투에서 잡은 적 1마리당 배율 +${Math.round(BBQ_PER_KILL * 100)}%`,
  },
  doubt: {
    id: 'doubt',
    name: '근데?',
    desc: `맥락마다 ×1.00~×${(1 + DOUBT_RANGE).toFixed(2)}이 따로 굴려 붙는다`,
  },
  beanstalk: {
    id: 'beanstalk',
    name: '무럭무럭',
    desc: '무럭무럭 카드가 생기고, 맥락이 터질 때마다 최대 체력이 자란다',
  },
}

export function hasPassive(player: PlayerState | undefined, id: PassiveId): boolean {
  return !!player?.items.some((it) => it.passive === id)
}

export function passivesOf(player: PlayerState | undefined): PassiveDef[] {
  const seen = new Set<PassiveId>()
  const out: PassiveDef[] = []
  for (const it of player?.items ?? []) {
    if (!it.passive || seen.has(it.passive)) continue
    seen.add(it.passive)
    out.push(PASSIVES[it.passive])
  }
  return out
}

/**
 * 보유 패시브가 문장 슬롯을 어떻게 늘리는지.
 * 동사 뒤에 겹동사, 문장 맨 끝에 문장부호가 붙는다 — 우리말 어순 그대로다.
 */
export function slotOrderFor(base: string[], player: PlayerState | undefined): string[] {
  const order = [...base]
  if (hasPassive(player, 'twinSubj')) {
    const i = order.indexOf('subj')
    if (i >= 0) order.splice(i + 1, 0, 'subj2')
  }
  if (hasPassive(player, 'twinVerb')) {
    const i = order.lastIndexOf('verb')
    if (i >= 0) order.splice(i + 1, 0, 'verb2')
  }
  if (hasPassive(player, 'punct') && !order.includes('punct')) order.push('punct')
  return order
}

/**
 * 보유 패시브 → 컴파일러 수정자.
 * 컴파일러는 순수함수라 플레이어를 모른다. 여기서 데이터로 바꿔 넘긴다.
 * `kills`는 이번 전투에서 지금까지 잡은 적 수(아기돼지 바베큐).
 */
export function modsFor(player: PlayerState | undefined, kills = 0): CompileMods {
  return {
    verbFlat: hasPassive(player, 'heavyShoe') ? HEAVY_SHOE_FLAT : 0,
    verbLuck: hasPassive(player, 'luckCloak'),
    bonusEach: hasPassive(player, 'matchFire') ? MATCH_FIRE_BONUS : 0,
    stageMult: hasPassive(player, 'bbq') ? 1 + kills * BBQ_PER_KILL : 1,
    doubt: hasPassive(player, 'doubt'),
    grow: hasPassive(player, 'beanstalk'),
  }
}
