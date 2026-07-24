/**
 * 모순 판정 — SPEC 3.4. 앞 슬롯에서 이미 고른 tag와 충돌하면 비활성.
 * "이 단어를 이 슬롯에 놓으면 모순인가?" → 이유 문자열 또는 null.
 */

import type { Conflict, Selection, Tables, Word } from './types'

function tagsBefore(sel: Selection, slotIndex: number, order: string[]): string[] {
  const out: string[] = []
  order.forEach((k, i) => {
    if (i < slotIndex && sel[k]) out.push(...sel[k]!.tags)
  })
  return out
}

export function conflictReason(
  word: Word,
  slotIndex: number,
  sel: Selection,
  t: Tables,
): string | null {
  const order = t.template.slots.map((s) => s.key)
  const prior = tagsBefore(sel, slotIndex, order)
  for (const c of t.conflicts) {
    if (word.tags.includes(c.b) && prior.includes(c.a)) return c.reason
    if (word.tags.includes(c.a) && prior.includes(c.b)) return c.reason
  }
  return null
}

// 앞 슬롯이 바뀌어 뒤 선택이 모순이 되면 해제하고, 정리된 선택을 반환.
export function pruneConflicts(sel: Selection, changedIndex: number, t: Tables): Selection {
  const order = t.template.slots.map((s) => s.key)
  const next: Selection = { ...sel }
  order.forEach((k, j) => {
    if (j > changedIndex && next[k] && conflictReason(next[k]!, j, next, t)) {
      next[k] = undefined
    }
  })
  return next
}

// 위 Conflict re-export(편의).
export type { Conflict }
