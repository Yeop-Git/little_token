/**
 * 전장 배경 고르기.
 *
 * 규칙은 셋뿐이다.
 *   ① 1스테이지는 늘 첫 배경이다 — 게임을 처음 켠 사람이 보는 그림은 고정이어야 한다.
 *   ② 보스방은 전용 배경을 쓰고 일반 풀에 섞이지 않는다.
 *   ③ 나머지는 무작위. 다만 **직전에 쓴 것은 빼고** 뽑는다 — 두 판 연속 같은 그림이
 *      나오면 배경이 바뀌는 연출 자체가 무의미해진다.
 *
 * 직전 배경을 여기서 들고 있는 이유는 전환 연출 때문이다. 새 전투가 열릴 때 이전
 * 그림 위로 새 그림이 밀려 들어와야 해서, 부르는 쪽이 둘 다 알아야 한다.
 */

import { BOSS_BACKGROUND, FIELD_BACKGROUNDS } from '@/assets'

/**
 * 배경마다의 빛 — 3D 캐릭터에 그대로 물린다.
 *
 * 눈대중이 아니라 그림에서 뽑았다. 각 배경을 128×72로 줄여 상위 10% 밝은 픽셀의
 * 무게중심을 광원 위치로, 상위 12%의 평균색을 주광색으로, 하위 18%의 평균색을
 * 그늘색(반사광)으로 삼았다. 그래서 캐릭터에 드는 빛의 방향과 색이 배경 그림과 맞는다.
 *
 * key는 광원 방향 벡터다. x는 실측 광원 x를 화면 중앙 기준으로 옮긴 값(왼쪽이 음수),
 * y는 위쪽일수록 높게, z는 앞에서 비추도록 양수로 고정한다.
 * bounce는 그 반대편에서 되받는 빛이라 방향을 뒤집고 그늘색을 쓴다 — 이게 있어야
 * 어두운 면이 검게 죽지 않고 배경색을 머금는다.
 */
export interface FieldLight {
  key: [number, number, number]
  keyColor: number
  bounce: [number, number, number]
  bounceColor: number
  /** 반구광 — 위는 하늘빛, 아래는 지면빛. */
  skyColor: number
  groundColor: number
  intensity: number
}

/** FIELD_BACKGROUNDS와 같은 순서. 마지막은 보스방(bg006). */
const LIGHTS: FieldLight[] = [
  // bg001 광원(0.41, 0.39) · 하이라이트 #e4d692 · 그늘 #262636 — 따뜻한 한낮
  { key: [-1.9, 5.6, 5], keyColor: 0xe4d692, bounce: [2.6, -1.2, -2], bounceColor: 0x262636, skyColor: 0xffeec6, groundColor: 0x3a3a4e, intensity: 1.42 },
  // bg002 광원(0.47, 0.32) · 하이라이트 #c9d7ae · 그늘 #0c2843 — 서늘한 풀빛
  { key: [-0.5, 6.4, 5], keyColor: 0xc9d7ae, bounce: [1.6, -1.4, -2], bounceColor: 0x0c2843, skyColor: 0xdcecc8, groundColor: 0x1c3c58, intensity: 1.3 },
  // bg003 광원(0.42, 0.27) · 하이라이트 #738c91 · 그늘 #101821 — 흐린 하늘
  { key: [-1.7, 7.2, 4.4], keyColor: 0x9fb6ba, bounce: [2.2, -1, -2], bounceColor: 0x101821, skyColor: 0xa8bfc4, groundColor: 0x1a242e, intensity: 1.12 },
  // bg004 광원(0.42, 0.37) · 하이라이트 #c17ebe · 그늘 #110448 — 보랏빛 마법
  { key: [-1.8, 5.8, 4.8], keyColor: 0xd79ad2, bounce: [2.4, -1.2, -2], bounceColor: 0x110448, skyColor: 0xc9a4dd, groundColor: 0x241452, intensity: 1.26 },
  // bg005 광원(0.29, 0.31) · 하이라이트 #fbb258 · 그늘 #41282b — 노을. 가장 치우친 빛
  { key: [-4.2, 6, 4.2], keyColor: 0xfbb258, bounce: [3.4, -1, -2], bounceColor: 0x41282b, skyColor: 0xffd39a, groundColor: 0x53373a, intensity: 1.5 },
  // bg006 광원(0.56, 0.69) · 하이라이트 #445f6f · 그늘 #091123 — 보스방. 아래에서 치는 차가운 빛
  { key: [1.1, -2.4, 4.6], keyColor: 0x6f97ad, bounce: [-1.6, 3, -2], bounceColor: 0x091123, skyColor: 0x2a3a52, groundColor: 0x0d1626, intensity: 1.18 },
]

/** 방금 쓴 배경 — 다음 판에서 이전 그림으로 깔리고, 뽑기에서는 제외된다. */
let lastBackground: string | null = null

export interface FieldBackground {
  /** 이번 판에 쓸 그림. */
  next: string
  /** 직전 판의 그림. 없으면(첫 판) 전환 없이 바로 건다. */
  prev: string | null
}

export function pickFieldBackground(day: number, isBoss: boolean): FieldBackground {
  const prev = lastBackground
  const next = isBoss ? BOSS_BACKGROUND : day <= 1 ? FIELD_BACKGROUNDS[0] : rollExcluding(prev)
  lastBackground = next
  // 조명과 무대 배치가 이 값을 읽어 간다. 배우는 배경보다 나중에 만들어지므로
  // 여기서 걸어 두면 된다.
  const slot = isBoss ? LIGHTS.length - 1 : Math.max(0, FIELD_BACKGROUNDS.indexOf(next))
  currentLight = LIGHTS[slot]
  currentStage = STAGES[slot]
  return { next, prev: prev === next ? null : prev }
}

/** 이어하기·씬 점퍼로 전투에 바로 들어올 때처럼 흐름이 끊기면 기억을 비운다. */
export function resetFieldBackground() {
  lastBackground = null
}

/**
 * 배경마다의 무대 배치 — 얼마나 내려 서고, 적이 어느 깊이로 밀려오는가.
 *
 * **바꾸지 않는 것**: 프롬은 언제나 화면 왼쪽에서 오른쪽을 보고 서고, 적은 오른쪽에서
 * 왼쪽으로 밀려온다. 이건 전투의 읽는 방향 자체라 배경이 달라져도 흔들리면 안 된다.
 * 그래서 이 표에는 플레이어의 자리나 방향을 넣지 않는다 — 넣어 두면 언젠가 건드리게 된다.
 * (배경 하나에서 가운데로 옮기고 화면을 등지게 해 봤다가 다른 판과 너무 튀어서 되돌렸다.)
 *
 * 공통 바닥선을 하나 정하면 어느 배경에선가는 반드시 어색해진다. 그림마다 바닥이 난
 * 높이가 다르기 때문이다. 그래서 높이와 깊이감만 배경별로 따로 잡는다.
 *
 * 발끝은 그림의 바닥선에 딱 붙이지 않는다 — 붙이면 오히려 종이에 눌린 것처럼 보이고,
 * 무엇보다 모든 배경의 바닥선(0.72~0.87)이 손패 UI 위쪽 경계(0.694)보다 아래라
 * 붙이는 순간 카드와 겹친다. 조금 띄워 두는 편이 그림으로도 낫다.
 *
 * bottom은 배우 부모(높이 730)의 아래 기준 px다. 음수면 부모 밖으로 내려간다.
 */
export interface FieldStage {
  /** 배우 발끝 높이. 작을수록 화면 아래. */
  bottom: number
  /** 맨 앞 적의 오른쪽 여백. 작을수록 화면 가운데로 온다. */
  railRight: number
  /** 뒷줄로 갈수록 벌어지는 가로 간격. */
  railGap: number
  /** 뒷줄이 위로 물러나는 정도 — 크면 깊은 길에서 걸어 나오는 느낌이 난다. */
  railRise: number
  /** 뒷줄이 작아지는 정도. 길이 깊을수록 크게 준다. */
  railShrink: number
}

/**
 * FIELD_BACKGROUNDS와 같은 순서 + 마지막이 보스방.
 *
 * bottom은 실측 바닥선을 그대로 쓰지 않고 **눈으로 맞춘 보정**을 거쳤다.
 * bg001에서 발끝 0.700(bottom -26)이 맞다고 확인했는데, 그 배경의 실측 바닥선은
 * 0.778이다. 즉 사람 눈에는 그림의 바닥 경계보다 **약 0.08 위**에 발이 있을 때
 * 서 있는 것으로 읽힌다 — 배경의 원근이 아래로 눕는 바닥이라 경계선에 딱 붙이면
 * 오히려 뒤로 밀려 보인다.
 *
 * 나머지도 눈으로 하나씩 맞췄다. 결과적으로 발끝은 0.700~0.754에 걸쳐 있다.
 * 손패 UI 위쪽 경계가 0.694라 숫자만 보면 겹칠 것 같지만, 손패는 화면 가운데 아래에
 * 모여 있고 배우는 좌우로 갈라져 서므로 실제로는 부딪히지 않는다.
 * 깊이감의 나머지는 아래 railRise·railShrink가 맡는다.
 */
const STAGES: FieldStage[] = [
  // bg001 바닥 0.778 — 넓은 광장. 기본 배치, 옆에서 마주 본다.
  { bottom: -26, railRight: 860, railGap: 260, railRise: 10, railShrink: 0.24 },
  // bg002 바닥 0.833 — 가운데 골목. 처음엔 플레이어를 가운데로 옮기고 화면을 등지게
  // 해 봤는데 다른 배경과 너무 튀어서 되돌렸다. 자리와 방향은 공통을 따르고,
  // 골목의 깊이감은 뒷줄이 더 물러나고 더 작아지는 것으로만 낸다.
  { bottom: -76, railRight: 830, railGap: 240, railRise: 34, railShrink: 0.34 },
  // bg003 바닥 0.822 — 흐린 하늘, 트인 벌판. 넓게 벌려 선다.
  { bottom: -29, railRight: 900, railGap: 280, railRise: 14, railShrink: 0.26 },
  // bg004 — 측정이 유일하게 못 미더운 배경이다. 경계 후보 1순위(0.611)는 세기가 약했고
  // 2순위 0.722를 골랐는데, 둘 다 실제 바닥이 아니라 중간 구조물의 경계였다.
  // 그 값으로 잡으니 눈에 확연히 떠 보여서 다른 배경과 같은 높이로 되돌렸다.
  { bottom: -56, railRight: 840, railGap: 250, railRise: 22, railShrink: 0.3 },
  // bg005 바닥 0.867 — 가장 낮은 바닥. 그만큼 배우도 가장 아래로 내린다.
  // 빛이 왼쪽에서 오므로 적은 조금 더 오른쪽 깊이에 둔다.
  { bottom: -84, railRight: 920, railGap: 240, railRise: 26, railShrink: 0.3 },
  // bg006 보스방 — 배치는 보스 전용 규칙이 따로 덮는다. 바닥만 맞춘다.
  { bottom: -29, railRight: 860, railGap: 260, railRise: 0, railShrink: 0.24 },
]

let currentStage: FieldStage = STAGES[0]

/** 지금 전장의 무대 배치. BattleView가 배우와 적 레일을 여기에 맞춘다. */
export function currentFieldStage(): FieldStage {
  return currentStage
}

let currentLight: FieldLight = LIGHTS[0]

/**
 * 지금 전장의 빛. 3D 캐릭터가 만들어질 때 이걸 읽어 주광·반사광·반구광을 세운다.
 * 배경을 고르는 쪽과 캐릭터를 세우는 쪽이 서로를 모르므로 여기 한 곳에 둔다.
 */
export function currentFieldLight(): FieldLight {
  return currentLight
}

function rollExcluding(exclude: string | null): string {
  const pool = FIELD_BACKGROUNDS.filter((bg) => bg !== exclude)
  // 풀이 한 장뿐이면 걸러낼 것도 없다.
  const from = pool.length ? pool : FIELD_BACKGROUNDS
  return from[Math.floor(Math.random() * from.length)]
}
