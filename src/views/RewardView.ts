/**
 * 보상 뷰 — 하루를 끝내고 일기 한 장이 넘어간다. 문장(신규/강화)·아이템 3택.
 * 스킬카드처럼 일러스트로 보여주고 카드 앞면에서 핵심 효과를 바로 읽는다.
 */

import { emotionOrNeutral, RARITY_LABEL, type Word } from '@core/types'
import type { RewardOption } from '@data/rewards'
import { BACKGROUNDS, ITEM_ART, REWARD_ART, SKILL_ART } from '@/assets'
import { itemArt } from '@/ui/Icons'
import { PASSIVES } from '@core/passives'
import { STAT_LABEL, type StatKey } from '@data/items'
import { emotionIconBadge } from '@/ui/EmotionBadge'
import type { RewardPhase } from '@core/run'

interface Opts {
  day: number
  options: RewardOption[]
  phase: RewardPhase
  onPick: (opt: RewardOption) => void
}

const SLOT_LABEL: Record<string, string> = { subj: '주어', adv: '수식', verb: '동사', obj: '목적어', end: '어미' }
// 문장 순서 번호 — 전투의 "1 주어 · 2 수식 · 3 동사" 스텝과 같은 순서.
const SLOT_NO: Record<string, string> = { subj: '1', adv: '2', verb: '3' }
const STAT_ORDER: StatKey[] = ['hp', 'atk', 'guard', 'heal', 'luck']
const PHASE_NO: Record<RewardPhase, number> = { subject: 1, item: 2, verb: 3 }
const PHASE_ALT: Record<RewardPhase, string> = {
  subject: '이야기의 주어를 고르자!',
  item: '소품과 수식어를 고르자!',
  verb: '마지막 동사를 고르자!',
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
    const s = STAT_ORDER.filter((k) => opt.item!.base[k]).map((k) => `${STAT_LABEL[k]} +${opt.item!.base[k]}`)
    return s.join(' · ') || '스탯 상승'
  }
  // 단어는 손패 카드 앞면과 같은 문구를 쓴다 — 보상에서 본 카드가 전투에서 다르게 읽히면 안 된다.
  return opt.word!.note
}

/** 보상 선택 단계에서도 감정을 즉시 읽게 한다. 상세 창을 열 필요가 없다. */
function emotionBadge(opt: RewardOption): string {
  if (opt.kind !== 'word' || !opt.word) return ''
  const emotion = emotionOrNeutral(opt.word.emotion)
  return emotionIconBadge(emotion, 'rp-emotion')
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

function rewardPickHtml(p: RewardOption, i: number, summary = false): string {
  const mood = p.kind === 'item' ? 'buff' : `mood-${moodOf(p.word!)}`
  const emotion = p.kind === 'word' && p.word ? ` emotion-${emotionOrNeutral(p.word.emotion)}` : ''
  const badge = p.reinforce ? '▲ RANK UP' : p.kind === 'item' ? '● ITEM' : '✦ NEW'
  const rewardKind = p.reinforce ? 'is-reinforce' : p.kind === 'item' ? 'is-item' : 'is-new'
  const nameLength = [...p.name.replace(/\s/g, '')].length
  const nameSize = nameLength >= 8 ? 'has-long-name' : nameLength >= 6 ? 'has-medium-name' : ''
  return `
    <div class="reward-pick ${mood}${emotion} rarity-${p.rarity} ${rewardKind} ${nameSize}${summary ? ' is-receipt' : ''}" data-i="${i}">
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
        <div class="rp-effect">${mainEffect(p)}</div>
        ${summary
          ? '<div class="rp-received">이번 보상으로 획득</div>'
          : '<div class="rp-actions"><span class="rp-take">고르기 →</span></div>'}
      </div>
    </div>`
}

export class RewardView {
  private root: HTMLElement
  private opts: Opts

  constructor(root: HTMLElement, opts: Opts) {
    this.root = root
    this.opts = opts
    this.root.innerHTML = `
      <div class="scene reward-scene" style="background-image:url(${BACKGROUNDS.bg001})">
        <div class="reward-stage">
          <div class="reward-card">
            <header class="reward-art-head">
              <img src="${REWARD_ART[opts.phase]}" alt="${PHASE_ALT[opts.phase]}" />
              <span class="sr-only">${opts.day}일차 클리어 · 보상 ${PHASE_NO[opts.phase]}단계 / 3단계</span>
            </header>
            <div class="reward-grid">
              ${opts.options.map((p, i) => rewardPickHtml(p, i)).join('')}
            </div>
          </div>
        </div>
      </div>`

    this.root.querySelectorAll<HTMLElement>('.reward-pick').forEach((el) => {
      const i = Number(el.dataset.i)
      el.addEventListener('click', () => this.take(el, opts.options[i]))
    })
  }

  private take(el: HTMLElement, opt: RewardOption) {
    el.style.transform = 'translateY(-10px) scale(1.03)'
    window.setTimeout(() => this.opts.onPick(opt), 220)
  }

  destroy() {}
}

interface SummaryOpts {
  day: number
  picks: RewardOption[]
  onContinue: () => void
}

/** 세 장을 모두 고른 뒤 한 번 더 펼쳐 보는 이번 스테이지의 보상 영수증. */
export class RewardCompleteView {
  constructor(private root: HTMLElement, opts: SummaryOpts) {
    this.root.innerHTML = `
      <div class="scene reward-scene reward-complete-scene" style="background-image:url(${BACKGROUNDS.bg001})">
        <div class="reward-complete-card">
          <header class="reward-clear-head">
            <img src="${REWARD_ART.clear}" alt="CLEAR! 보상" />
            <span class="sr-only">${opts.day}일차 보상 획득 완료</span>
          </header>
          <div class="reward-grid reward-summary-grid">
            ${opts.picks.map((pick, i) => rewardPickHtml(pick, i, true)).join('')}
          </div>
          <button class="reward-continue" type="button">다음 이야기로</button>
        </div>
      </div>`
    this.root.querySelector<HTMLButtonElement>('.reward-continue')?.addEventListener('click', opts.onContinue)
  }

  destroy() {}
}
