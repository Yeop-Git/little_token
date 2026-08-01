/**
 * 「여는 맥락」 블록 — 이 카드가 어떤 관용구의 재료인지, 무엇과 같이 써야 터지는지.
 *
 * 관용구 접근권은 태그로만 정해져서 카드 앞면에 안 적힌다. 같은 등급·같은 수치인
 * 카드의 실질 차이가 거기서 갈리는데 화면에 없으면 플레이어는 알 수가 없다.
 * 전투 카드 상세와 보상 상세가 이 한 블록을 공유해 같은 문장으로 보여 준다.
 */

import { comboLeads } from '@core/compiler'
import { gwa } from '@core/josa'
import type { Combo, Word } from '@core/types'
import { discoveredComboIds } from '@core/comboDiscovery'

export interface ComboHintSource {
  combos: Combo[]
  /** 짝을 찾아 줄 단어 풀 — 전투는 현재 테이블, 보상은 플레이어 덱을 넘긴다. */
  words: Record<string, Word[]>
}

const MAX_ROWS = 4
const MAX_PARTNERS = 2

/** 필요 태그를 "그 태그를 가진 실제 카드 이름"으로 바꾼다 — 태그는 플레이어의 언어가 아니다. */
function partnersFor(tags: string[], src: ComboHintSource, self: Word): string {
  const names: string[] = []
  for (const tag of tags) {
    const hit = Object.entries(src.words)
      // 한 슬롯에서는 카드를 하나만 고르므로 같은 칸의 짝은 안내하지 않는다.
      .filter(([slot]) => slot !== self.slot)
      .flatMap(([, list]) => list)
      .filter((w) => w.id !== self.id && w.tags.includes(tag))
    for (const w of hit) if (!names.includes(w.text)) names.push(w.text)
  }
  if (!names.length) return '짝이 될 카드가 아직 없다'
  const shown = names.slice(0, MAX_PARTNERS)
  const tail = names.length > MAX_PARTNERS ? `${shown.join(' · ')} 등과` : gwa(shown.join(' · '))
  return `${tail} 함께`
}

/** 활성 관용구 이름 목록(`Intent.combos`)을 주면 지금 터지는 줄에 표시를 남긴다. */
export function comboHintHtml(w: Word, src: ComboHintSource, active: string[] = []): string {
  const discovered = discoveredComboIds()
  const leads = comboLeads(w, src.combos).filter(({ combo }) => discovered.has(combo.id))
  if (!leads.length) return ''
  const rows = leads
    .slice(0, MAX_ROWS)
    .map(({ combo, missing }) => {
      const on = active.includes(combo.name)
      const need = !missing.length ? '이 카드만으로' : partnersFor(missing, src, w)
      return `<div class="cl-row${on ? ' on' : ''}">
        <span class="cl-n">「${combo.name}」</span>
        <span class="cl-m">×${combo.mult.toFixed(2)}</span>
        <span class="cl-w">${on ? '지금 발동 중' : need}</span>
      </div>`
    })
    .join('')
  const more = leads.length > MAX_ROWS ? `<div class="cl-more">+${leads.length - MAX_ROWS}종 더</div>` : ''
  return `<div class="wd-combos">
    <div class="wd-ch">여는 맥락 <em>${leads.length}종</em></div>
    ${rows}${more}
  </div>`
}
