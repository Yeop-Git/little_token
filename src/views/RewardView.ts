/**
 * 보상 뷰 — 하루를 끝내고 일기 한 장이 넘어간다. 문장(신규/강화)·아이템 3택.
 * 스킬카드처럼 일러스트로 보여주고, 상단=종류 / 하단=메인 효과 / 자세히보기=우측 정보창.
 */

import type { FieldDef, Word } from '@core/types'
import type { RewardOption } from '@data/rewards'
import { BACKGROUNDS, SKILL_ART } from '@/assets'
import { itemArt } from '@/ui/Icons'
import { gradeTier } from '@core/grade'
import { reinforceWord } from '@core/run'
import { PASSIVES } from '@core/passives'
import { STAT_LABEL, type StatKey } from '@data/items'

interface Opts {
  day: number
  /** 전투에서 확정된 보상등급 — 카드 희귀도가 이 등급의 가중치로 굴려졌다. */
  grade: number
  nextField: FieldDef
  options: RewardOption[]
  onPick: (opt: RewardOption) => void
}

const SLOT_LABEL: Record<string, string> = { subj: '주어', adv: '수식', verb: '동사', obj: '목적어', end: '어미' }
// 문장 순서 번호 — 전투의 "1 주어 · 2 수식 · 3 동사" 스텝과 같은 순서.
const SLOT_NO: Record<string, string> = { subj: '1', adv: '2', verb: '3' }
const RARITY_LABEL: Record<string, string> = { common: '흔함', rare: '희귀', epic: '영웅', legendary: '전설' }
const STAT_ORDER: StatKey[] = ['hp', 'atk', 'guard', 'heal', 'luck']
const pct = (b: number) => `${b >= 0 ? '+' : ''}${Math.round(b * 100)}%`

function moodOf(w: Word): string {
  if (w.variance) return 'gamble'
  if (w.kind === 'heal' || w.effects?.heal) return 'heal'
  if (w.kind === 'guard' || w.effects?.guard) return 'guard'
  if (w.kind === 'attack' || (w.power ?? 0) > 0) return 'attack'
  if (w.effects?.recoil) return 'sacrifice'
  return 'buff'
}

// 상단 종류 라벨 — 단어는 문장 순서 번호를 함께 표기한다("1번 주어").
function typeLabel(opt: RewardOption): string {
  if (opt.kind === 'item') return '아이템'
  const slot = opt.word!.slot
  const label = SLOT_LABEL[slot] ?? '문장'
  return SLOT_NO[slot] ? `${SLOT_NO[slot]}번 ${label}` : label
}

// 하단 메인 효과 한 줄.
function mainEffect(opt: RewardOption): string {
  if (opt.kind === 'item' && opt.item) {
    // 전설(규칙) 아이템은 스탯이 0이다 — 대신 바뀌는 규칙을 그대로 적는다.
    if (opt.item.passive) return PASSIVES[opt.item.passive].desc
    const s = STAT_ORDER.filter((k) => opt.item!.base[k]).map((k) => `${STAT_LABEL[k]} +${opt.item!.base[k]}`)
    return s.join(' · ') || '스탯 상승'
  }
  const w = opt.word!
  if (w.power) return `공격 위력 ${w.power}`
  if (w.effects?.heal) return `회복 +${w.effects.heal}`
  if (w.effects?.guard) return `방어 +${w.effects.guard}`
  if (w.bonus) return `배율 ${pct(w.bonus)}`
  return w.note
}

// 풀 카드 배경 — 일러스트가 있으면 꽉 채우고, 없으면(아이템/보상단어) 색 그라디언트 + 아이콘.
function bgHtml(opt: RewardOption): string {
  const art = opt.kind === 'word' && opt.word?.art ? SKILL_ART[opt.word.art] : undefined
  if (art) return `<div class="rp-bg"><img src="${art}" alt="" /></div>`
  const icon = opt.kind === 'item' && opt.item ? itemArt(opt.item.art) : itemArt('word')
  return `<div class="rp-bg noart"><span class="rp-icon">${icon}</span></div>`
}

// 단어 고유 수치(누적 아님).
function ownValues(w: Word): { text: string; cls: string }[] {
  const out: { text: string; cls: string }[] = []
  if (w.power) out.push({ text: `기본 위력 +${w.power}`, cls: 'dmg' })
  if (w.bonus) out.push({ text: `배율 ${pct(w.bonus)}`, cls: 'buff' })
  if (w.effects?.guard) out.push({ text: `방어 +${w.effects.guard}`, cls: 'guard' })
  if (w.effects?.heal) out.push({ text: `회복 +${w.effects.heal}`, cls: 'heal' })
  if (w.effects?.recoil) out.push({ text: `자해 ${w.effects.recoil}`, cls: 'self' })
  if (w.crit) out.push({ text: `대성공 ${Math.round(w.crit * 100)}%`, cls: 'buff' })
  if (w.fail) out.push({ text: `실패 ${Math.round(w.fail * 100)}%`, cls: 'self' })
  if (w.variance) out.push({ text: `도박 ${Math.round(w.variance.p * 100)}%: ×${w.variance.hi} / ×${w.variance.lo}`, cls: 'buff' })
  if (w.aoe === 'all') out.push({ text: '적 전체 적중', cls: 'dmg' })
  if (!out.length) out.push({ text: w.note, cls: '' })
  return out
}

// 어떤 스탯의 영향을 받는지.
function influenceNote(w: Word): string {
  const parts: string[] = []
  if (w.kind === 'heal' || w.effects?.heal) parts.push('회복')
  if (w.kind === 'guard' || w.effects?.guard) parts.push('방어')
  if (w.kind === 'attack' || w.power) parts.push('공격')
  if (w.crit || w.fail) parts.push('룰렛(맥락 스탯+운)')
  return parts.length ? `<div class="wd-inf">영향 스탯: ${parts.join(' · ')}</div>` : ''
}

// 강화 전→후 변동치.
function reinforceDeltas(w: Word): string {
  const after: Word = { ...w, tags: [...w.tags], effects: w.effects ? { ...w.effects } : undefined, variance: w.variance ? { ...w.variance } : undefined }
  reinforceWord(after)
  const rows: string[] = []
  rows.push(`단계 Lv.${w.level ?? 1} → <b>Lv.${after.level}</b>`)
  if (w.power != null) rows.push(`위력 ${w.power} → <b>${after.power}</b>`)
  if (w.bonus != null) rows.push(`배율 ${pct(w.bonus)} → <b>${pct(after.bonus!)}</b>`)
  if (w.effects?.guard) rows.push(`방어 ${w.effects.guard} → <b>${after.effects!.guard}</b>`)
  if (w.effects?.heal) rows.push(`회복 ${w.effects.heal} → <b>${after.effects!.heal}</b>`)
  if (w.crit != null) rows.push(`대성공 ${Math.round(w.crit * 100)}% → <b>${Math.round(after.crit! * 100)}%</b>`)
  return `<div class="rf-deltas"><div class="rf-h">강화하면</div>${rows.map((r) => `<div class="rf-row">${r}</div>`).join('')}</div>`
}

// 우측 정보창 내용.
function detailHtml(opt: RewardOption): string {
  if (opt.kind === 'item' && opt.item) {
    const it = opt.item
    const rows = STAT_ORDER.filter((k) => it.base[k])
      .map((k) => `<div class="idrow"><span>${STAT_LABEL[k]}</span><span class="iv">+${it.base[k]}</span></div>`)
      .join('')
    const p = it.passive ? PASSIVES[it.passive] : null
    return `
      <div class="wd-name">${it.name}</div>
      <div class="wd-grade">✦ 아이템 · ${it.grade}</div>
      ${p ? `<div class="id-passive"><b>${p.name}</b><span>${p.desc}</span></div>` : ''}
      <div class="id-stats">${rows}</div>
      <div class="wd-inf">${p ? '스탯은 오르지 않는다. 문장 규칙이 바뀐다.' : '감탄사를 조립해 추가 스탯이 붙는다.'}</div>
      <div class="wd-flavor">${it.flavor}</div>
      <div class="id-art">${itemArt(it.art)}</div>`
  }
  const w = opt.word!
  const values = ownValues(w)
  return `
    <div class="wd-name">${w.text}</div>
    <div class="wd-grade">✦ ${typeLabel(opt)}${opt.reinforce ? ` · 강화 Lv.${w.level ?? 1}` : ' · 새 단어'}</div>
    <div class="wd-values">${values.map((v) => `<div class="v ${v.cls}">${v.text}</div>`).join('')}</div>
    ${opt.reinforce ? reinforceDeltas(w) : ''}
    ${influenceNote(w)}`
}

export class RewardView {
  private root: HTMLElement
  private opts: Opts

  constructor(root: HTMLElement, opts: Opts) {
    this.root = root
    this.opts = opts
    const f = opts.nextField
    this.root.innerHTML = `
      <div class="scene reward-scene" style="background-image:url(${BACKGROUNDS.bg001})">
        <div class="reward-stage">
          <div class="reward-card">
            <div class="reward-head">
              <div class="k">${opts.day}일차 클리어</div>
              <div class="t hand">전리품을 고르자</div>
              <div class="reward-grade rarity-${gradeTier(opts.grade)}">오늘의 보상등급 <b>✦ ${opts.grade}</b></div>
            </div>
            <div class="reward-field">
              내일은 <b>${f.date}</b> · <b>${f.title}</b><br>${f.desc}
            </div>
            <div class="reward-grid">
              ${opts.options.map((p, i) => this.pickHtml(p, i)).join('')}
            </div>
          </div>
          <aside class="info-dock glass reward-dock empty" id="rdetail" aria-live="polite">
            <div class="rd-hint">카드의 <b>자세히보기</b>를 누르면<br>효과·확률·영향 스탯이 여기 표시된다.</div>
          </aside>
        </div>
      </div>`

    this.root.querySelectorAll<HTMLElement>('.reward-pick').forEach((el) => {
      const i = Number(el.dataset.i)
      el.addEventListener('click', () => this.take(el, opts.options[i]))
      el.querySelector<HTMLElement>('.rp-detail')?.addEventListener('click', (ev) => {
        ev.stopPropagation()
        this.showDetail(opts.options[i], el)
      })
    })
  }

  private pickHtml(p: RewardOption, i: number): string {
    const mood = p.kind === 'item' ? 'buff' : `mood-${moodOf(p.word!)}`
    const badge = p.reinforce ? '▲ RANK UP' : p.kind === 'item' ? '● ITEM' : '✦ NEW'
    const cls = p.reinforce ? 'is-reinforce' : p.kind === 'item' ? 'is-item' : 'is-new'
    return `
      <div class="reward-pick ${mood} ${cls}" data-i="${i}">
        ${bgHtml(p)}
        <span class="rp-tint" aria-hidden="true"></span>
        <span class="rp-veil" aria-hidden="true"></span>
        <div class="rp-top">
          <span class="rp-type">${typeLabel(p)}</span>
          <span class="rp-tags">
            <span class="rp-rarity rarity-${p.rarity}">${RARITY_LABEL[p.rarity]}</span>
            <span class="rp-badge">${badge}</span>
          </span>
        </div>
        <div class="rp-foot">
          <div class="rp-name">${p.name}</div>
          <div class="rp-effect">${mainEffect(p)}</div>
          <div class="rp-actions">
            <button class="rp-detail" type="button">자세히보기</button>
            <span class="rp-take">고르기 →</span>
          </div>
        </div>
      </div>`
  }

  private showDetail(opt: RewardOption, el: HTMLElement) {
    const dock = this.root.querySelector<HTMLElement>('#rdetail')!
    const mood = opt.kind === 'item' ? 'buff' : moodOf(opt.word!)
    dock.className = `info-dock glass reward-dock mood-${mood}`
    dock.innerHTML = detailHtml(opt)
    this.root.querySelectorAll('.reward-pick').forEach((p) => p.classList.remove('detailing'))
    el.classList.add('detailing')
  }

  private take(el: HTMLElement, opt: RewardOption) {
    el.style.transform = 'translateY(-10px) scale(1.03)'
    window.setTimeout(() => this.opts.onPick(opt), 220)
  }

  destroy() {}
}
