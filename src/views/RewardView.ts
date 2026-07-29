/**
 * 보상 뷰 — 하루를 끝내고 일기 한 장이 넘어간다. 문장(신규/강화)·아이템 3택.
 * 스킬카드처럼 일러스트로 보여주고 카드 앞면에서 핵심 효과를 바로 읽는다.
 */

import { emotionOrNeutral, RARITY_LABEL, type Word } from '@core/types'
import { REWARD_REFRESH_COST, rewardPrice, type RewardOption } from '@data/rewards'
import { BACKGROUNDS, ITEM_ART, SKILL_ART, TOKEN_FACES } from '@/assets'
import { itemArt } from '@/ui/Icons'
import { PASSIVES } from '@core/passives'
import { STAT_LABEL, type ItemDef, type StatKey } from '@data/items'
import { emotionIconBadge } from '@/ui/EmotionBadge'
import type { RewardPhase } from '@core/run'
import { reinforceWord } from '@core/run'
import { EARLY_COMBOS, EARLY_WORDS } from '@data/earlyWords'
import { critText, gambleText, multText, wordNoteText, wordValueLines } from '@core/wordText'
import { comboHintHtml } from '@/ui/ComboHint'

interface Opts {
  day: number
  deck?: Record<string, Word[]>
  inspiration: number
  earned: number
  options: RewardOption[]
  phase: RewardPhase
  onPick: (opt: RewardOption) => void
  onRefresh: () => boolean
  onSkip: () => void
}

const SLOT_LABEL: Record<string, string> = { subj: '주어', adv: '수식', verb: '동사', obj: '목적어', end: '어미' }
// 문장 순서 번호 — 전투의 "1 주어 · 2 수식 · 3 동사" 스텝과 같은 순서.
const SLOT_NO: Record<string, string> = { subj: '1', adv: '2', verb: '3' }
const STAT_ORDER: StatKey[] = ['hp', 'atk', 'guard', 'heal', 'luck']
const PHASE_NO: Record<RewardPhase, number> = { subject: 1, item: 2, verb: 3 }
const PHASE_TITLE: Record<RewardPhase, string> = {
  subject: '주어와 수식어를 고르자',
  item: '이야기의 소품을 고르자',
  verb: '마지막 동사를 고르자',
}

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
    return '제련 문장으로 스탯을 더할 수 있다'
  }
  // 단어는 손패 카드 앞면과 같은 문구를 쓴다 — 보상에서 본 카드가 전투에서 다르게 읽히면 안 된다.
  return wordNoteText(opt.word!)
}

/** 아이템 카드 앞면에서 상세창 없이 비교하는 고유 기본 스탯 칩. */
function itemBaseStatsHtml(item?: ItemDef): string {
  if (!item) return ''
  const stats = STAT_ORDER.filter((key) => item.base[key])
  if (!stats.length) return ''
  const label = stats.map((key) => `${STAT_LABEL[key]} +${item.base[key]}`).join(', ')
  return `<div class="rp-base-stats" aria-label="고유 기본 스탯: ${label}">
    <span class="rp-base-label">고유 기본</span>
    ${stats.map((key) => `<span class="rp-base-stat stat-${key}"><b>${STAT_LABEL[key]}</b> +${item.base[key]}</span>`).join('')}
  </div>`
}

/** 보상 선택 단계에서도 감정을 즉시 읽게 한다. 상세 창을 열 필요가 없다. */
function emotionBadge(opt: RewardOption): string {
  if (opt.kind !== 'word' || !opt.word) return ''
  const emotion = emotionOrNeutral(opt.word.emotion)
  return emotionIconBadge(emotion, 'rp-emotion')
}

function influenceNote(w: Word): string {
  const parts: string[] = []
  if (w.kind === 'heal' || w.effects?.heal) parts.push('회복')
  if (w.kind === 'guard' || w.effects?.guard) parts.push('방어')
  if (w.kind === 'attack' || w.power) parts.push('공격')
  if (w.crit || w.fail) parts.push('룰렛(맥락 스탯+운)')
  return parts.length ? `<div class="wd-inf">영향 스탯: ${parts.join(' · ')}</div>` : ''
}

function reinforceDeltas(w: Word): string {
  const after: Word = {
    ...w,
    tags: [...w.tags],
    effects: w.effects ? { ...w.effects } : undefined,
    variance: w.variance ? { ...w.variance } : undefined,
  }
  reinforceWord(after)
  const rows: string[] = [`단계 Lv.${w.level ?? 1} → <b>Lv.${after.level}</b>`]
  if (w.power != null) rows.push(`위력 ${w.power} → <b>${after.power}</b>`)
  if (w.bonus != null) rows.push(`${multText(w.bonus)} → <b>${multText(after.bonus!)}</b>`)
  if (w.effects?.guard) rows.push(`방어 ${w.effects.guard} → <b>${after.effects!.guard}</b>`)
  if (w.effects?.heal) rows.push(`회복 ${w.effects.heal} → <b>${after.effects!.heal}</b>`)
  if (w.effects?.counterMultiplier) {
    rows.push(`카운터 ×${w.effects.counterMultiplier.toFixed(2)} → <b>×${after.effects!.counterMultiplier!.toFixed(2)}</b>`)
  }
  if (w.statMult != null) rows.push(`계수 ×${w.statMult} → <b>×${after.statMult}</b>`)
  // 도박 카드는 고점이, 성장 카드는 체력이 그 카드의 핵심 수치다(core/run.ts).
  if (w.variance) rows.push(`${gambleText(w.variance)} → <b>${gambleText(after.variance!)}</b>`)
  if (w.growHp) rows.push(`최대 체력 +${w.growHp} → <b>+${after.growHp}</b>`)
  if (w.crit != null) rows.push(`${critText(w.crit)} → <b>${critText(after.crit!)}</b>`)
  return `<div class="rf-deltas"><div class="rf-h">강화하면</div>${rows.map((row) => `<div class="rf-row">${row}</div>`).join('')}</div>`
}

function detailHtml(opt: RewardOption, deck?: Record<string, Word[]>): string {
  if (opt.kind === 'item' && opt.item) {
    const item = opt.item
    const rows = STAT_ORDER.filter((key) => item.base[key])
      .map((key) => `<div class="idrow"><span>${STAT_LABEL[key]}</span><span class="iv">+${item.base[key]}</span></div>`)
      .join('')
    const passive = item.passive ? PASSIVES[item.passive] : null
    return `
      <div class="wd-name">${item.name}</div>
      <div class="wd-grade">✦ 아이템 · ${RARITY_LABEL[item.rarity]}</div>
      ${passive ? `<div class="id-passive"><b>${passive.name}</b><span>${passive.desc}</span></div>` : ''}
      <div class="id-stats">${rows}</div>
      <div class="wd-inf">${passive ? '스탯은 오르지 않는다. 문장 규칙이 바뀐다.' : '제련 문장을 조립해 추가 스탯이 붙는다.'}</div>
      <div class="wd-flavor">${item.flavor}</div>
      <div class="id-art">${itemArt(item.art)}</div>`
  }
  const word = opt.word!
  const values = wordValueLines(word)
  return `
    <div class="wd-title-row">${emotionIconBadge(emotionOrNeutral(word.emotion), 'wd-emotion')}<div class="wd-name">${word.text}</div></div>
    <div class="wd-grade">✦ ${typeLabel(opt)}${opt.reinforce ? ` · 강화 Lv.${word.level ?? 1}` : ' · 새 단어'}</div>
    <div class="wd-values">${values.map((value) => `<div class="v ${value.cls}">${value.text}</div>`).join('')}</div>
    ${comboHintHtml(word, { combos: EARLY_COMBOS, words: deck ?? EARLY_WORDS })}
    ${opt.reinforce ? reinforceDeltas(word) : ''}
    ${influenceNote(word)}`
}

// 풀 카드 배경 — 일러스트가 있으면 꽉 채운다. 아직 그림이 없는 단어도 공용 아이콘을
// 크게 띄우지 않고 단어 자체를 옅은 필기 워터마크로 써서 완성된 카드처럼 보이게 한다.
function bgHtml(opt: RewardOption): string {
  const art =
    opt.kind === 'word' ? (opt.word?.art ? SKILL_ART[opt.word.art] : undefined) : ITEM_ART[opt.item!.art]
  if (art) return `<div class="rp-bg"><img src="${art}" alt="" /></div>`
  if (opt.kind === 'word' && opt.word) {
    return `<div class="rp-bg noart word-noart" aria-hidden="true"><span class="rp-word-mark">${opt.word.text}</span></div>`
  }
  const icon = opt.kind === 'item' && opt.item ? itemArt(opt.item.art) : itemArt('word')
  return `<div class="rp-bg noart"><span class="rp-icon">${icon}</span></div>`
}

function rewardPickHtml(p: RewardOption, i: number): string {
  const mood = p.kind === 'item' ? 'buff' : `mood-${moodOf(p.word!)}`
  const emotion = p.kind === 'word' && p.word ? ` emotion-${emotionOrNeutral(p.word.emotion)}` : ''
  const badge = p.reinforce ? '▲ RANK UP' : p.kind === 'item' ? '● ITEM' : '✦ NEW'
  const rewardKind = p.reinforce ? 'is-reinforce' : p.kind === 'item' ? 'is-item' : 'is-new'
  const nameLength = [...p.name.replace(/\s/g, '')].length
  const nameSize = nameLength >= 8 ? 'has-long-name' : nameLength >= 6 ? 'has-medium-name' : ''
  const price = rewardPrice(p)
  return `
    <div class="reward-pick ${mood}${emotion} rarity-${p.rarity} ${rewardKind} ${nameSize}" data-i="${i}" data-price="${price}">
      ${bgHtml(p)}
      <span class="rp-tint" aria-hidden="true"></span>
      <span class="rp-veil" aria-hidden="true"></span>
      <span class="rp-foil" aria-hidden="true"></span>
      <div class="rp-top">
        <span class="rp-type">${typeLabel(p)}</span>
        <span class="rp-tags">
          ${emotionBadge(p)}
          <span class="rp-rarity rarity-${p.rarity}">${RARITY_LABEL[p.rarity]}</span>
          <span class="rp-badge">${badge}</span>
        </span>
      </div>
      <div class="rp-foot">
        <div class="rp-name">${p.name}</div>
        ${p.kind === 'item' ? itemBaseStatsHtml(p.item) : ''}
        <div class="rp-effect">${mainEffect(p)}</div>
        <div class="rp-actions">
          <button class="rp-detail" type="button">자세히보기</button>
          <span class="rp-take"><b class="rp-price">✦ ${price}</b> 기록하기 →</span>
        </div>
      </div>
    </div>`
}

export class RewardView {
  private root: HTMLElement
  private opts: Opts
  private locked = false

  constructor(root: HTMLElement, opts: Opts) {
    this.root = root
    this.opts = opts
    this.root.innerHTML = `
      <div class="scene reward-scene" style="background-image:url(${BACKGROUNDS.bg001})">
        <div class="reward-stage">
          <div class="reward-card">
            <div class="reward-token" aria-hidden="true">
              <img class="reward-token-shadow" src="${TOKEN_FACES.party}" alt="" />
              <img class="reward-token-main" src="${TOKEN_FACES.party}" alt="" />
            </div>
            <header class="reward-head">
              <div class="k">${opts.day}스테이지 클리어</div>
              <div class="t hand">${PHASE_TITLE[opts.phase]}</div>
              <div class="reward-progress" aria-label="보상 ${PHASE_NO[opts.phase]}단계 / 3단계">
                ${[1, 2, 3].map((step) => `<i class="${step <= PHASE_NO[opts.phase] ? 'on' : ''}"></i>`).join('')}
              </div>
              <div class="reward-grade">보유 영감 <b>✦ ${opts.inspiration}</b><span>이번 클리어 +${opts.earned}</span></div>
            </header>
            <div class="reward-system-message" role="status" aria-live="assertive" hidden></div>
            <div class="reward-grid">
              ${opts.options.map((p, i) => rewardPickHtml(p, i)).join('')}
            </div>
            <div class="reward-controls">
              <button class="reward-refresh" type="button">다른 발상 떠올리기 <b>✦ ${REWARD_REFRESH_COST}</b></button>
              <button class="reward-skip" type="button" title="이번 단계에서 아무것도 기록하지 않고 넘어갑니다">그냥 넘어가기</button>
            </div>
          </div>
          <aside class="info-dock glass reward-dock empty" id="rdetail" aria-live="polite">
            <div class="rd-hint">카드의 <b>자세히보기</b>를 누르면<br>효과·확률·영향 스탯이 여기 표시된다.</div>
          </aside>
        </div>
      </div>`

    this.root.querySelectorAll<HTMLElement>('.reward-pick').forEach((el) => {
      const i = Number(el.dataset.i)
      const price = Number(el.dataset.price)
      if (price > opts.inspiration) {
        el.classList.add('is-unaffordable')
      }
      el.addEventListener('click', () => this.take(el, opts.options[i]))
      el.querySelector<HTMLElement>('.rp-detail')?.addEventListener('click', (event) => {
        event.stopPropagation()
        this.showDetail(opts.options[i], el)
      })
    })
    this.root.querySelector<HTMLButtonElement>('.reward-skip')?.addEventListener('click', (event) => {
      event.stopPropagation()
      this.skip()
    })
    this.root.querySelector<HTMLButtonElement>('.reward-refresh')?.addEventListener('click', (event) => {
      event.stopPropagation()
      this.refresh()
    })
  }

  private showDetail(opt: RewardOption, el: HTMLElement) {
    const dock = this.root.querySelector<HTMLElement>('#rdetail')!
    const mood = opt.kind === 'item' ? 'buff' : moodOf(opt.word!)
    dock.className = `info-dock glass reward-dock mood-${mood}`
    dock.innerHTML = detailHtml(opt, this.opts.deck)
    this.root.querySelectorAll('.reward-pick').forEach((pick) => pick.classList.remove('detailing'))
    el.classList.add('detailing')
  }

  private take(el: HTMLElement, opt: RewardOption) {
    if (this.locked) return
    const price = rewardPrice(opt)
    if (this.opts.inspiration < price) {
      this.failAndSkip(`영감이 ${price - this.opts.inspiration} 부족해 이 보상을 기록하지 못했다.`)
      return
    }
    this.locked = true
    this.disableChoices()
    el.style.transform = 'translateY(-10px) scale(1.03)'
    window.setTimeout(() => this.opts.onPick(opt), 220)
  }

  private refresh() {
    if (this.locked) return
    if (this.opts.inspiration < REWARD_REFRESH_COST || !this.opts.onRefresh()) {
      this.showSystemMessage('영감이 부족해 다른 발상을 떠올릴 수 없다.')
    }
  }

  private failAndSkip(message: string) {
    this.locked = true
    this.disableChoices()
    this.showSystemMessage(message)
    window.setTimeout(() => this.opts.onSkip(), 1100)
  }

  private showSystemMessage(message: string) {
    const notice = this.root.querySelector<HTMLElement>('.reward-system-message')
    if (!notice) return
    notice.hidden = false
    notice.textContent = message
    notice.classList.remove('show')
    void notice.offsetWidth
    notice.classList.add('show')
  }

  private skip() {
    if (this.locked) return
    this.locked = true
    this.disableChoices()
    window.setTimeout(() => this.opts.onSkip(), 120)
  }

  private disableChoices() {
    this.root.querySelectorAll<HTMLElement>('.reward-pick').forEach((pick) => {
      pick.setAttribute('aria-disabled', 'true')
    })
    const skip = this.root.querySelector<HTMLButtonElement>('.reward-skip')
    if (skip) skip.disabled = true
    const refresh = this.root.querySelector<HTMLButtonElement>('.reward-refresh')
    if (refresh) refresh.disabled = true
  }

  destroy() {}
}
