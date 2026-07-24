/**
 * 관용구(맥락) — 유일하게 곱셈으로 들어가는 값. 멀티셋 tag 매칭.
 * 새 관용구를 늘리는 것이 조합 공간을 키우는 정석(단어보다 관용구).
 */

import type { Combo, Conflict } from '@core/types'

export const COMBOS: Combo[] = [
  { id: 'c1', name: '고독한 전사', need: ['solo', 'war', 'atk'], mult: 1.4, flavor: '혼자서 맞서는 자' },
  { id: 'c2', name: '화염광란', need: ['mad', 'fire', 'fire'], mult: 1.8, flavor: '미쳐 타오르다' },
  { id: 'c3', name: '완전한 정적', need: ['quiet', 'quiet'], mult: 1.2, flavor: '숨죽인 방어' },
  { id: 'c4', name: '망각의 의식', need: ['mind', 'mind'], mult: 1.3, flavor: '잊으며 회복하다' },
  { id: 'c5', name: '공멸', need: ['both', 'fire'], mult: 2.0, flavor: '함께 타 죽는다' },
  { id: 'c6', name: '장맛비', need: ['wide', 'water'], mult: 1.5, flavor: '모두를 적시는 비' },
]

export const CONFLICTS: Conflict[] = [
  { a: 'both', b: 'solo', reason: '혼자일 수 없다' },
  { a: 'mad', b: 'quiet', reason: '광기와 정적은 공존 못 한다' },
  { a: 'quiet', b: 'fire', reason: '조용히 불태울 수 없다' },
  { a: 'slow', b: 'mad', reason: '속도가 모순된다' },
]

// SPEC 5장. sweep으로 확정한 값. 임의로 올리지 말 것.
export const MULT_CAP = 2.5
