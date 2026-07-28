/**
 * 모순 판정 — SPEC 3.4. 앞 슬롯에서 이미 고른 tag와 충돌하면 비활성.
 * "이 단어를 이 슬롯에 놓으면 모순인가?" → 이유 문자열 또는 null.
 *
 * 두 종류의 "틀린 문장"을 구분한다:
 *  · 문법 역할 오류(roleReason) — 슬롯 단위. 예: 2인칭이 주어면 행위자가 뒤바뀐다.
 *    태그 쌍을 나열하지 않고 슬롯 계약 한 줄로 막으므로 단어가 늘어도 안 폭발한다.
 *  · 의미 모순(conflict 태그 쌍) — 앞 슬롯 태그와 어긋나는 하드 차단.
 * (결만 안 맞는 "부조화"는 여기서 막지 않고 compiler가 소프트 감점으로 처리.)
 */

import type { Conflict, Selection, SlotDef, Tables, Word } from './types'
import { currentLocale } from '@/localization'

function tagsBefore(sel: Selection, slotIndex: number, order: string[]): string[] {
  const out: string[] = []
  order.forEach((k, i) => {
    if (i < slotIndex && sel[k]) out.push(...sel[k]!.tags)
  })
  return out
}

// 슬롯 역할 계약 위반? — 앞 선택과 무관하게 이 단어가 이 슬롯에 놓일 자격이 있는지.
// 주어(subject)는 일기의 화자, 즉 1인칭(나·우리)만 온다. 2·3인칭은 목적어로.
export function roleReason(word: Word, slot: SlotDef | undefined): string | null {
  if (!slot) return null
  if (slot.role === 'subject' && word.person && word.person !== 'first')
    return currentLocale === 'en' ? 'The diary subject must be I or We (others belong in the object slot)'
      : currentLocale === 'ja' ? '日記の主語は「ぼく・ぼくたち」だけ（相手は目的語へ）'
        : currentLocale === 'ru' ? 'Подлежащее дневника — только «я» или «мы» (остальные идут в дополнение)'
          : currentLocale === 'zh-Hans' ? '日记主语只能是“我／我们”（其他角色应放入宾语槽）'
            : currentLocale === 'zh-Hant' ? '日記主語只能是「我／我們」（其他角色應放入受詞槽）'
              : '일기의 주어는 나·우리다 (상대는 목적어로)'
  return null
}

export function conflictReason(
  word: Word,
  slotIndex: number,
  sel: Selection,
  t: Tables,
): string | null {
  const order = t.template.slots.map((s) => s.key)
  const role = roleReason(word, t.template.slots[slotIndex])
  if (role) return role
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
