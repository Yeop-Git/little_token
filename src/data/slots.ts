/**
 * 기본 문장 템플릿 — 5칸(주어·수식·목적어·동사·어미).
 * SPEC/레퍼런스에 충실. 슬롯 배열이라 덱/아이템이 칸을 추가·제거할 수 있다.
 * 예: buildTemplate(['subj','obj','verb','end']) → 4칸(수식 제거).
 */

import type { SentenceTemplate, SlotDef } from '@core/types'

export const BASE_SLOTS: Record<string, SlotDef> = {
  subj: { key: 'subj', label: '주어', role: 'subject' },
  adv: { key: 'adv', label: '수식', role: 'modifier' },
  obj: { key: 'obj', label: '목적어', role: 'object', josa: true },
  verb: { key: 'verb', label: '동사', role: 'verb' },
  end: { key: 'end', label: '어미', role: 'ending' },
  // 아이템 패시브로 열리는 칸 — 기본 템플릿에는 없다(core/passives.ts).
  subj2: { key: 'subj2', label: '주어 2', role: 'subject' },
  verb2: { key: 'verb2', label: '동사 2', role: 'verb' },
  punct: { key: 'punct', label: '문장부호', role: 'ending', attach: true },
}

export const DEFAULT_ORDER = ['subj', 'adv', 'obj', 'verb', 'end']

export function buildTemplate(order: string[] = DEFAULT_ORDER): SentenceTemplate {
  return { slots: order.map((k) => BASE_SLOTS[k]) }
}

export const DEFAULT_TEMPLATE = buildTemplate()
