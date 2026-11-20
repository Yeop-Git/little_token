/**
 * 보상 뷰 — 하루를 끝내고 일기 한 장이 넘어간다. 문장(신규/강화)·아이템 3택.
 * 스킬카드처럼 일러스트로 보여주고 카드 앞면에서 핵심 효과를 바로 읽는다.
 */

import { formatNumber } from '@/core/numberFormat'
import { emotionOrNeutral, RARITY_LABEL, type Word } from '@core/types'
import {
  EARLY_BUILD_REWARD_DAY,
  REWARD_PRICE,
  rewardRefreshCost,
  rewardPrice,
  type RewardOption,
} from '@data/rewards'
import { BACKGROUNDS, INK_UI, ITEM_ART, REWARD_ART, SKILL_ART, TOKEN_FACES } from '@/assets'
import { itemArt } from '@/ui/Icons'
import { wordActionInline, wordCardDisplayNote, wordCardHtml, wordKeywordChipsHtml, wordKeywordDetailsHtml } from '@/ui/WordCardFace'
import { PASSIVES } from '@core/passives'
import { itemTraitText } from '@core/itemTraits'
import { STAT_LABEL, type StatKey } from '@data/items'
import { emotionIconBadge } from '@/ui/EmotionBadge'
import type { RewardPhase } from '@core/run'
import { reinforceWord } from '@core/run'
import { STAT_NAME } from '@core/compiler'
import { EARLY_WORDS, makeEarlyTables } from '@data/earlyWords'
import { critText, gambleFailLine, gambleText, multText, wordNoteText, wordValueLines } from '@core/wordText'
import { comboHintHtml } from '@/ui/ComboHint'
import { GameAudio } from '@/audio/GameAudio'
import { SquareBurst } from '@/ui/SquareBurst'
import { t } from '@/localization'
import { bossRewardDiscountText } from '@/localization/rewardSupport'
import { stageFor } from '@data/stages'
import { availableCombos } from '@core/deckInsights'
import { DISPLAY_FLOORS } from '@/config/edition'
import { discoveredComboIds } from '@core/comboDiscovery'
import { wordInkCost } from '@core/ink'
import type { WordKeywordId } from '@core/wordKeywords'
import { TooltipLayer } from '@/ui/TooltipLayer'

interface Opts {
  day: number
  deck?: Record<string, Word[]>
  inspiration: number
  earned: number
  options: Array<RewardOption | null>
  phase: RewardPhase
  refreshes: number
  mode?: 'reward' | 'shop'
  purchases?: number
  playEntrance?: boolean
  onPick: (opt: RewardOption) => void
  onRefresh: () => boolean
  onSkip: () => void
}

/**
 * 화면이 막 열린 직후의 오클릭 보호. 전투·보스 처치 직후 연타하던 클릭이 그대로
 * 카드 구매로 이어지지 않도록, 넘김 연출(0.7s)이 끝날 때까지 구매·새로고침·나가기를 받지 않는다.
 */
const ENTRANCE_INPUT_GUARD_MS = 850

// 문장 순서 번호 — 전투의 "1 주어 · 2 수식 · 3 동사" 스텝과 같은 순서.
const SLOT_NO: Record<string, string> = { subj: '1', adv: '2', verb: '3' }
const STAT_ORDER: StatKey[] = ['hp', 'atk', 'guard', 'heal', 'luck']
const PHASE_NO: Record<RewardPhase, number> = { item: 1, subject: 2, verb: 3 }
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

function text(key: string, korean: string, values: Record<string, string | number> = {}): string {
  return t(key, korean).replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? `{${name}}`))
}

function slotLabel(slot: string): string {
  const labels: Record<string, string> = {
    subj: text('rewardSlotSubject', '주어'),
    adv: text('rewardSlotModifier', '수식어'),
    verb: text('rewardSlotVerb', '동사'),
    obj: text('rewardSlotObject', '목적어'),
    end: text('rewardSlotEnding', '어미'),
  }
  return labels[slot] ?? text('rewardSlotSentence', '문장')
}

function stageProgressLabel(day: number): string {
  const stage = stageFor(day)
  const cycle = stage.endlessCycle > 0
    ? text('hudEndlessCycle', '엔드리스 {cycle}주기', { cycle: stage.endlessCycle })
    : text('hudStoryCycle', '첫 이야기')
  return `${cycle} · ${text('hudStageLabel', '스테이지')} ${stage.floor}/${DISPLAY_FLOORS}`
}

/**
 * 내 단어장 펼쳐 보기 — 보상·상점 위에 덮는 한 장. 이름만 나열하던 도크 요약 대신
 * 전투 손패와 같은 카드 앞면(WordCardFace)으로 슬롯별 보유 카드를 그대로 보여 준다.
 */
function deckSheetHtml(deck: Record<string, Word[]>): string {
  const slotEntries = Object.entries(deck).filter(([, words]) => words.length > 0)
  const words = slotEntries.flatMap(([, list]) => list)
  const discovered = discoveredComboIds()
  const combos = availableCombos(deck, makeEarlyTables(deck).combos).filter((combo) => discovered.has(combo.id))
  const title = text('rewardDeckTitle', '현재 단어장')
  return `
    <div class="reward-deck-sheet" role="dialog" aria-modal="true" aria-label="${title}">
      <div class="rds-panel glass">
        <header class="rds-head">
          <h2>${title} <b>${words.length}</b></h2>
          <button class="rds-close" type="button">${text('rewardDeckClose', '닫기')}</button>
        </header>
        <div class="rds-body">
          ${slotEntries.map(([slot, list]) => `
            <section class="rds-slot">
              <h3>${SLOT_NO[slot] ? `<i>${SLOT_NO[slot]}</i>` : ''}${slotLabel(slot)} <b>${list.length}</b></h3>
              <div class="rds-cards">${list.map((word) => `
                <div class="rds-card" data-slot="${slot}" data-id="${word.id}" role="button" tabindex="0" aria-label="${word.text}">${wordCardHtml(word)}${(word.level ?? 1) > 1 ? `<em class="rds-level">Lv.${word.level}</em>` : ''}</div>`).join('')}
              </div>
            </section>`).join('')}
          <section class="rds-combos">
            <h3>${text('rewardDeckCombos', '완성 가능한 관용구')} <b>${combos.length}</b></h3>
            <div>${combos.length
              ? combos.map((combo) => `<span><b>「${combo.name}」</b><em>×${combo.mult.toFixed(2)}</em></span>`).join('')
              : `<p>${text('rewardDeckNone', '아직 완성 가능한 관용구가 없다.')}</p>`}</div>
          </section>
        </div>
      </div>
    </div>`
}

function roleLabel(opt: RewardOption): string {
  if (opt.kind === 'item') {
    return opt.item?.passive
      ? text('rewardRoleRule', '문장 규칙')
      : text('rewardRoleStats', '스탯 성장')
  }
  const mood = moodOf(opt.word!)
  if (mood === 'attack') return text('rewardRoleAttack', '공격')
  if (mood === 'guard') return text('rewardRoleGuard', '방어')
  if (mood === 'heal') return text('rewardRoleHeal', '회복')
  if (mood === 'gamble') return text('rewardRoleVariable', '변동')
  return text('rewardRoleTactic', '전술')
}

function acquireLabel(opt: RewardOption): string {
  if (opt.reinforce) return text('rewardAcquireReinforce', '반복강화 +1')
  if (opt.kind === 'item') return text('rewardAcquireItem', '새 아이템')
  return text('rewardAcquireWord', '새 단어')
}

// 상단 종류 라벨 — 단어는 문장 순서 번호를 함께 표기한다("1번 주어").
function typeLabel(opt: RewardOption): string {
  if (opt.kind === 'item') return text('rewardTypeItem', '아이템')
  const slot = opt.word!.slot
  const label = slotLabel(slot)
  return SLOT_NO[slot]
    ? text('rewardSlotOrder', '{order}번 {slot}', { order: SLOT_NO[slot], slot: label })
    : label
}

/** 카드 앞면에는 기본 제공 수치만 크게 세운다. 특성은 아래 종류 줄(itemTraitHtml)에 따로 적는다. */
function itemCardEffect(opt: RewardOption): string {
  if (opt.kind !== 'item' || !opt.item) return ''
  const item = opt.item
  const stats = STAT_ORDER.filter((key) => item.base[key])
    .map((key) => `<span class="rp-base-stat stat-${key}">${STAT_LABEL[key]} +${item.base[key]}</span>`)
    .join('')
  if (!stats) return ''
  // '고유 기본 스탯' 딱지는 뗐다(11/20 피드백) — 수치 칩만 크게 남긴다.
  return `<div class="rp-base-stats">${stats}</div>`
}

/**
 * 아이템 특성(예전 이름 '패시브') — 카드 아래 종류 줄의 빈자리에 큰 글씨로 적는다.
 * 일반·희귀 아이템에도 특성이 붙을 수 있으므로 길어지면 줄을 늘리지 자르지 않는다.
 */
function itemTraitHtml(opt: RewardOption): string {
  if (opt.kind !== 'item' || !opt.item) return ''
  const trait = opt.item.passive
    ? PASSIVES[opt.item.passive]
    : opt.item.trait ? itemTraitText(opt.item.trait, opt.item.rarity) : null
  if (!trait) return ''
  return `<div class="reward-kind-trait"><small>${text('rewardItemPassive', '특성')}</small><b>${trait.name}</b><span>${trait.desc}</span></div>`
}

// 하단 메인 효과 한 줄.
function mainEffect(opt: RewardOption): string {
  if (opt.kind === 'item') return itemCardEffect(opt)
  // 단어는 손패 카드 앞면과 같은 문구를 쓴다 — 보상에서 본 카드가 전투에서 다르게 읽히면 안 된다.
  const word = opt.word!
  const action = wordActionInline(word)
  const keywords = wordKeywordChipsHtml(word)
  const note = action ? wordCardDisplayNote(word) : wordNoteText(word)
  if (keywords) {
    const prefix = word.statMult != null
      ? `×${formatNumber(word.statMult)}`
      : word.variance
        ? wordCardDisplayNote(word, note).split(' · ')[0]
        : word.bonus
          ? `×${(1 + word.bonus).toFixed(2)}`
          : ''
    return `${action}${prefix ? `<span class="rp-effect-copy">${prefix}</span>` : ''}${keywords}`
  }
  return action
    ? `${action}<span class="rp-effect-copy">${note}</span>`
    : note
}

function rewardWordMeta(opt: RewardOption): string {
  if (opt.kind !== 'word' || !opt.word) return ''
  const emotion = emotionOrNeutral(opt.word.emotion)
  const ink = wordInkCost(opt.word)
  return `<div class="rp-word-meta">
    ${emotionIconBadge(emotion, 'rp-emotion')}
    <span class="rp-ink-cost" style="--ink-cost-badge-image:url('${INK_UI.costBadge}')" aria-label="잉크 ${ink}" title="잉크 비용">${ink}</span>
  </div>`
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
  if (w.statMult != null) rows.push(`${w.stat ? STAT_NAME[w.stat] : text('rewardCoefficient', '계수')} ×${formatNumber(w.statMult)} → <b>×${formatNumber(after.statMult!)}</b>`)
  // 도박 카드는 고점이, 성장 카드는 체력이 그 카드의 핵심 수치다(core/run.ts).
  if (w.variance) rows.push(`${gambleText(w.variance)} → <b>${gambleText(after.variance!)}</b>`)
  if (w.growHp) rows.push(`최대 체력 +${w.growHp} → <b>+${after.growHp}</b>`)
  if (w.crit != null && w.crit !== after.crit) rows.push(`${critText(w.crit)} → <b>${critText(after.crit!)}</b>`)
  if (w.effects?.castScale != null && w.effects.castScale !== after.effects?.castScale) {
    rows.push(`${text('rewardRepeatStrength', '반복 위력')} ${Math.round(w.effects.castScale * 100)}% → <b>${Math.round(after.effects!.castScale! * 100)}%</b>`)
  }
  return `<div class="rf-deltas"><div class="rf-h">강화 시</div>${rows.map((row) => `<div class="rf-row">${row}</div>`).join('')}</div>`
}

function detailHtml(opt: RewardOption, deck?: Record<string, Word[]>): string {
  if (opt.kind === 'item' && opt.item) {
    const item = opt.item
    const rows = STAT_ORDER.filter((key) => item.base[key])
      .map((key) => `<div class="idrow"><span>${STAT_LABEL[key]}</span><span class="iv">+${item.base[key]}</span></div>`)
      .join('')
    const passive = item.passive ? PASSIVES[item.passive] : item.trait ? itemTraitText(item.trait, item.rarity) : null
    return `
      <div class="wd-name">${item.name}</div>
      <div class="wd-grade">✦ 아이템 · ${RARITY_LABEL[item.rarity]}</div>
      ${passive ? `<div class="id-passive"><small>${text('rewardItemPassive', '특성')}</small><b>${passive.name}</b><span>${passive.desc}</span></div>` : ''}
      <div class="id-stats">${rows}</div>
      <div class="wd-flavor">${item.flavor}</div>
      <div class="id-art">${itemArt(item.art)}</div>`
  }
  const word = opt.word!
  // 키워드 설명은 상세 카드에 표시하므로 수치 칩에는 넣지 않는다.
  const fail = gambleFailLine(word)
  const values = [...wordValueLines(word, undefined, false), ...(fail ? [fail] : [])]
  const after = opt.reinforce ? { ...word, tags: [...word.tags], effects: word.effects ? { ...word.effects } : undefined, variance: word.variance ? { ...word.variance } : undefined } : null
  if (after) reinforceWord(after)
  // 강화로 변하는 값은 아래 전후 비교에만 표시한다. 변하지 않는 부가 정보는 남긴다.
  const afterFail = after ? gambleFailLine(after) : null
  const unchanged = after ? new Set([...wordValueLines(after, undefined, false), ...(afterFail ? [afterFail] : [])].map((value) => value.text)) : null
  const visibleValues = unchanged ? values.filter((value) => unchanged.has(value.text)) : values
  const comparedKeywords = new Set<WordKeywordId>()
  if (after && after.crit !== word.crit) comparedKeywords.add('critical')
  if (after && after.effects?.castScale !== word.effects?.castScale) comparedKeywords.add('repeat')
  return `
    <div class="wd-title-row">${emotionIconBadge(emotionOrNeutral(word.emotion), 'wd-emotion')}<div class="wd-name">${word.text}</div></div>
    <div class="wd-grade">✦ ${typeLabel(opt)}</div>
    ${visibleValues.length ? `<div class="wd-values">${visibleValues.map((value) => `<div class="v ${value.cls}">${value.text}</div>`).join('')}</div>` : ''}
    ${opt.reinforce ? reinforceDeltas(word) : ''}
    ${wordKeywordDetailsHtml(word, comparedKeywords)}
    ${comboHintHtml(word, { combos: makeEarlyTables(deck ?? EARLY_WORDS).combos, words: deck ?? EARLY_WORDS })}`
}

/**
 * 우측 상세 칸(단어 전용) — 작은 글 대신 카드 앞면(일러스트와 하단 효과)을 두 배로 크게 세우고,
 * 그 밑에 키워드·관용구 설명을 큰 글씨로 둔다.
 * 아이템은 카드와 하단 줄에 이미 다 적혀 있어 상세 칸을 쓰지 않는다(11/20 피드백).
 */
function wordDockHtml(opt: RewardOption, deck?: Record<string, Word[]>): string {
  const word = opt.word!
  // 도박 카드는 앞면에 성공 쪽만 적으므로 상세 칸에서 실패 결과를 붉게 밝힌다.
  const failLine = gambleFailLine(word)
  const comparedKeywords = new Set<WordKeywordId>()
  if (opt.reinforce) {
    const after = { ...word, tags: [...word.tags], effects: word.effects ? { ...word.effects } : undefined, variance: word.variance ? { ...word.variance } : undefined }
    reinforceWord(after)
    if (after.crit !== word.crit) comparedKeywords.add('critical')
    if (after.effects?.castScale !== word.effects?.castScale) comparedKeywords.add('repeat')
  }
  return `
    <div class="rd-card">${wordCardHtml(word)}</div>
    <div class="rd-grade">✦ ${typeLabel(opt)} · ${RARITY_LABEL[opt.rarity]}</div>
    ${failLine ? `<div class="wd-values rd-gamble"><div class="v ${failLine.cls}">${failLine.text}</div></div>` : ''}
    ${opt.reinforce ? reinforceDeltas(word) : ''}
    ${wordKeywordDetailsHtml(word, comparedKeywords)}
    ${comboHintHtml(word, { combos: makeEarlyTables(deck ?? EARLY_WORDS).combos, words: deck ?? EARLY_WORDS })}`
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

function rewardPickHtml(p: RewardOption | null, i: number, shop = false): string {
  if (!p) return `
    <div class="reward-choice is-sold">
      <div class="reward-pick reward-sold-card" aria-label="${text('shopSoldAria', '구매 완료된 자리')}">
        <span aria-hidden="true">✓</span><b>${text('shopSold', '구매 완료')}</b>
      </div>
      <div class="reward-kindline"><span class="reward-state">${text('shopRefreshForMore', '새로고침하면 새 상품이 들어와요.')}</span></div>
    </div>`
  const mood = p.kind === 'item' ? 'buff' : `mood-${moodOf(p.word!)}`
  const emotion = p.kind === 'word' && p.word ? ` emotion-${emotionOrNeutral(p.word.emotion)}` : ''
  const rewardKind = p.reinforce ? 'is-word is-reinforce' : p.kind === 'item' ? 'is-item' : 'is-word is-new'
  const nameLength = [...p.name.replace(/\s/g, '')].length
  const nameSize = nameLength >= 8 ? 'has-long-name' : nameLength >= 6 ? 'has-medium-name' : ''
  const price = rewardPrice(p)
  const role = roleLabel(p)
  const acquire = acquireLabel(p)
  const currency = text('rewardCurrencyInspiration', '영감')
  const cardLabel = text(
    'rewardCardAria',
    '{name}, 등급 {rarity}, 역할 {role}, 획득 {acquire}, 비용 {currency} {price}',
    { name: p.name, rarity: RARITY_LABEL[p.rarity], role, acquire, currency, price },
  )
  const reinforcement = p.word?.level ?? 1
  const ownedLabel = p.reinforce
    ? text('rewardSelectedReinforce', '강화 +{amount} 완료!', { amount: reinforcement })
    : p.kind === 'item'
      ? text('rewardSelectedItem', '내 소품으로 결정!')
      : text('rewardSelectedNew', '내 단어장에 기록!')
  const sticker = p.reinforce
    ? text('rewardReinforceSticker', '강화 +{amount}', { amount: 1 })
    : 'New!'
  return `
    <div class="reward-choice">
      <div class="reward-pick ${mood}${emotion} rarity-${p.rarity} ${rewardKind} ${nameSize}" data-i="${i}" data-price="${price}" role="button" tabindex="0" aria-label="${cardLabel}">
        ${bgHtml(p)}
        <span class="rp-tint" aria-hidden="true"></span>
        <span class="rp-veil" aria-hidden="true"></span>
        <span class="rp-foil" aria-hidden="true"></span>
        <span class="reward-card-sticker ${p.reinforce ? 'is-reinforce' : 'is-new'}" aria-hidden="true">${sticker}</span>
        <span class="rp-owned-stamp" aria-hidden="true">${ownedLabel}</span>
        ${rewardWordMeta(p)}
        <span class="rp-unavailable" aria-hidden="true">
          <b>${text('rewardUnavailable', '구매 불가')}</b>
          <small>${text('rewardInsufficient', '영감 부족')}</small>
        </span>
        <span class="reward-touch-confirm-hint" aria-hidden="true">${text('cardTapAgain', '한 번 더 눌러 선택')}</span>
        <div class="rp-foot">
          <div class="rp-name">${p.name}</div>
          <div class="rp-effect">${mainEffect(p)}</div>
          ${shop ? '' : `<div class="rp-actions">
            <span class="rp-cost" aria-label="${currency} ${price}"><i aria-hidden="true">◈</i>${currency} ${price}</span>
          </div>`}
        </div>
      </div>
      <div class="reward-kindline rarity-${p.rarity}${itemTraitHtml(p) ? ' has-trait' : ''}">
        <span class="reward-rarity-label rarity-${p.rarity}"><i aria-hidden="true">◆</i>${RARITY_LABEL[p.rarity]}</span>
        ${itemTraitHtml(p) ? '' : `<span class="reward-type-label">${typeLabel(p)}</span>`}
        ${shop ? `<span class="reward-kind-cost" aria-label="${currency} ${price}"><i aria-hidden="true">◈</i>${currency} ${price}</span>` : ''}
        ${itemTraitHtml(p)}
      </div>
    </div>`
}

export class RewardView {
  private root: HTMLElement
  private opts: Opts
  private locked = false
  private tooltips: TooltipLayer | null = null
  private lastPointerType = ''
  private touchPreviewIndex: number | null = null
  private inputReadyAt = 0
  private closeDeck: (() => void) | null = null
  private guardTimer = 0

  constructor(root: HTMLElement, opts: Opts) {
    this.root = root
    this.opts = opts
    const shop = opts.mode === 'shop'
    const walletHtml = `<div class="reward-wallet" aria-label="${text('rewardWalletOwned', '보유 영감')} ${opts.inspiration}, ${shop ? text('shopPurchased', '이번 상점 구매') : '이번 클리어'} ${shop ? opts.purchases ?? 0 : `+${opts.earned}`}">
                <span class="inspiration-mark" aria-hidden="true">◈</span>
                <span class="reward-wallet-balance"><small>${text('rewardWalletOwned', '보유 영감')}</small><b>${opts.inspiration}</b></span>
                <span class="reward-wallet-earned">${shop ? text('shopPurchased', '이번 상점 구매') : '이번 클리어'} <b>${shop ? opts.purchases ?? 0 : `+${opts.earned}`}</b></span>
              </div>`
    this.root.innerHTML = `
      <div class="scene reward-scene${shop ? ' reward-shop-scene' : ''}" style="background-image:url(${BACKGROUNDS.bg001})">
        <div class="reward-stage">
          <div class="reward-card${shop ? ' reward-shop-card' : ''}${opts.playEntrance === false ? ' skip-entrance' : ''}">
            ${shop ? `<img class="reward-shop-art" src="${REWARD_ART.shop}" alt="" aria-hidden="true" />` : `<div class="reward-token" aria-hidden="true">
              <img class="reward-token-shadow" src="${TOKEN_FACES.party}" alt="" />
              <img class="reward-token-main" src="${TOKEN_FACES.party}" alt="" />
            </div>`}
            <header class="reward-head">
              <div class="k">${shop ? text('shopEyebrow', '보스 클리어 · 영감 상점') : `${stageProgressLabel(opts.day)} 클리어`}</div>
              <div class="t hand">${shop ? text('shopTitle', '모아 둔 영감을 마음껏 쓰자!') : PHASE_TITLE[opts.phase]}</div>
              ${shop ? `<div class="shop-row-guide">${text('shopRowGuide', '1행 주어·수식어 · 2행 동사 · 3행 아이템')}</div>` : `<div class="reward-progress" aria-label="보상 ${PHASE_NO[opts.phase]}단계 / 3단계">
                ${[1, 2, 3].map((step) => `<i class="${step <= PHASE_NO[opts.phase] ? 'on' : ''}"></i>`).join('')}
              </div>`}
              ${shop ? walletHtml : `<div class="reward-toolbar">
                <button class="reward-deck" type="button">${text('rewardDeck', '내 단어장')} <b>${Object.values(opts.deck ?? EARLY_WORDS).flat().length}</b></button>
                <div class="reward-toolbar-center">
                ${walletHtml}
                <button class="reward-refresh" type="button" title="${text('rewardRefreshSinkHint', '연속해서 떠올릴수록 비용이 1씩 오른다. 횟수 제한은 없다.')}"><img src="${REWARD_ART.refresh}" alt="" aria-hidden="true" />${text('rewardRefresh', '다른 발상 떠올리기')} <b>◈ ${rewardRefreshCost(opts.refreshes)}</b></button>
                </div>
                <button class="reward-skip" type="button" title="이번 단계에서 아무것도 기록하지 않고 넘어갑니다">그냥 넘어가기</button>
              </div>`}
              ${!shop && opts.options.some((option) => option?.bossPrice !== undefined) ? `<div class="reward-boss-discount">${bossRewardDiscountText()}</div>` : ''}
              ${!shop && opts.day === EARLY_BUILD_REWARD_DAY && opts.phase !== 'verb' ? `
                <div class="reward-build-preview">
                  ${text('rewardEarlyBuildReserve', '마지막 동사 단계에 희귀 빌드 동사 3종이 나온다. 영감 {cost}를 남기면 하나를 기록할 수 있다.', { cost: REWARD_PRICE.rare })}
                </div>` : ''}
            </header>
            <div class="reward-system-message" role="status" aria-live="assertive" hidden></div>
            <div class="reward-grid">
              ${opts.options.map((p, i) => rewardPickHtml(p, i, shop)).join('')}
            </div>
          </div>
          ${shop ? '<div class="reward-side">' : ''}
            ${!shop && opts.phase === 'item' ? '' : `<aside class="info-dock glass reward-dock empty${!shop && opts.phase === 'subject' ? ' is-entering' : ''}" id="rdetail" aria-live="polite">
              <div class="rd-hint">${text('rewardDetailHint', '카드에 마우스를 올리면 상세 정보가 표시된다.')}</div>
            </aside>`}
            ${shop ? `<button class="reward-deck" type="button" style="min-height:48px">${text('rewardDeck', '내 단어장')} <b>${Object.values(opts.deck ?? EARLY_WORDS).flat().length}</b></button>
            <button class="reward-refresh" type="button" style="min-height:48px;justify-content:center" title="${text('rewardRefreshSinkHint', '연속해서 떠올릴수록 비용이 1씩 오른다. 횟수 제한은 없다.')}"><img src="${REWARD_ART.refresh}" alt="" aria-hidden="true" />${text('shopRefresh', '상품 새로고침')} <b>◈ ${rewardRefreshCost(opts.refreshes)}</b></button>` : ''}
            ${shop ? `<button class="reward-skip" type="button" title="${text('shopLeaveHint', '구매를 마치고 다음 스테이지로 간다.')}"><img src="${REWARD_ART.exit}" alt="" aria-hidden="true" /><span>${text('shopLeave', '상점 나가기')}</span></button>` : ''}
          ${shop ? '</div>' : ''}
        </div>
      </div>`

    this.root.querySelectorAll<HTMLElement>('.reward-pick').forEach((el) => {
      const i = Number(el.dataset.i)
      const price = Number(el.dataset.price)
      const option = opts.options[i]
      if (!option) return
      if (price > opts.inspiration) {
        el.classList.add('is-unaffordable')
      }
      el.addEventListener('pointerdown', (event) => {
        this.lastPointerType = event.pointerType
      })
      el.addEventListener('mouseenter', () => this.showDetail(option, el))
      el.addEventListener('focus', () => this.showDetail(option, el))
      el.addEventListener('click', () => {
        const isTouch = this.lastPointerType === 'touch'
        this.lastPointerType = ''
        if (isTouch && this.touchPreviewIndex !== i) {
          this.touchPreviewIndex = i
          this.showDetail(option, el)
          this.root.querySelectorAll<HTMLElement>('.reward-pick').forEach((pick) => {
            pick.classList.toggle('touch-previewing', pick === el)
          })
          return
        }
        this.take(el, option)
      })
      el.addEventListener('keydown', (event) => {
        if (event.target !== el || (event.key !== 'Enter' && event.key !== ' ')) return
        event.preventDefault()
        this.take(el, option)
      })
    })
    this.tooltips = new TooltipLayer(this.root.querySelector<HTMLElement>('.reward-scene')!)
    if (opts.playEntrance !== false) {
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const guardMs = reduceMotion ? 300 : ENTRANCE_INPUT_GUARD_MS
      this.inputReadyAt = performance.now() + guardMs
      const scene = this.root.querySelector<HTMLElement>('.reward-scene')
      scene?.classList.add('is-input-guarded')
      this.guardTimer = window.setTimeout(() => scene?.classList.remove('is-input-guarded'), guardMs)
    }
    this.root.querySelector<HTMLButtonElement>('.reward-skip')?.addEventListener('click', (event) => {
      event.stopPropagation()
      this.skip()
    })
    this.root.querySelector<HTMLButtonElement>('.reward-refresh')?.addEventListener('click', (event) => {
      event.stopPropagation()
      this.refresh()
    })
    this.root.querySelector<HTMLButtonElement>('.reward-deck')?.addEventListener('click', (event) => {
      event.stopPropagation()
      this.showDeck()
    })
  }

  private showDeck() {
    const scene = this.root.querySelector<HTMLElement>('.reward-scene')
    if (!scene || scene.querySelector('.reward-deck-sheet')) return
    scene.insertAdjacentHTML('beforeend', deckSheetHtml(this.opts.deck ?? EARLY_WORDS))
    const sheet = scene.querySelector<HTMLElement>('.reward-deck-sheet')!
    const close = () => {
      sheet.remove()
      document.removeEventListener('keydown', onKey, true)
      this.closeDeck = null
      this.root.querySelector<HTMLButtonElement>('.reward-deck')?.focus()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      // 크게 펼친 카드가 있으면 그것부터 접는다.
      const zoomed = sheet.querySelector('.rds-zoom')
      if (zoomed) zoomed.remove()
      else close()
    }
    document.addEventListener('keydown', onKey, true)
    // 카드 밖 빈 곳이나 닫기를 누르면 접는다. 카드를 누르면 크게 펼쳐 수치·키워드를 검수한다.
    const deck = this.opts.deck ?? EARLY_WORDS
    const zoom = (card: HTMLElement) => {
      const word = deck[card.dataset.slot ?? '']?.find((entry) => entry.id === card.dataset.id)
      if (!word) return
      sheet.querySelector('.rds-zoom')?.remove()
      const opt = { kind: 'word', word, rarity: word.rarity ?? 'common', name: word.text, desc: word.note, art: 'word' } as RewardOption
      sheet.querySelector('.rds-panel')!.insertAdjacentHTML('beforeend', `
        <div class="rds-zoom">
          <div class="rds-zoom-card">${wordCardHtml(word)}</div>
          <div class="rds-zoom-detail mood-${moodOf(word)}">${detailHtml(opt, deck)}</div>
        </div>`)
    }
    sheet.addEventListener('click', (event) => {
      const target = event.target as HTMLElement
      if (target === sheet || target.closest('.rds-close')) close()
      else if (target.closest('.rds-zoom')) sheet.querySelector('.rds-zoom')?.remove()
      else {
        const card = target.closest<HTMLElement>('.rds-card')
        if (card) zoom(card)
      }
    })
    sheet.addEventListener('keydown', (event) => {
      const card = (event.target as HTMLElement).closest<HTMLElement>('.rds-card')
      if (!card || (event.key !== 'Enter' && event.key !== ' ')) return
      event.preventDefault()
      zoom(card)
    })
    this.closeDeck = close
    sheet.querySelector<HTMLButtonElement>('.rds-close')?.focus()
  }

  private showDetail(opt: RewardOption, el: HTMLElement) {
    const dock = this.root.querySelector<HTMLElement>('#rdetail')
    // 아이템은 상세 표가 필요 없다 — 카드와 하단 특성 줄이 전부다.
    if (dock && opt.kind === 'word' && opt.word) {
      dock.className = `info-dock glass reward-dock is-word-card mood-${moodOf(opt.word)}`
      dock.innerHTML = wordDockHtml(opt, this.opts.deck)
    } else if (dock) {
      // 상점에서 아이템에 올리면 앞서 본 단어 카드를 남겨 두지 않는다.
      dock.className = 'info-dock glass reward-dock empty'
      dock.innerHTML = `<div class="rd-hint">${text('rewardDetailHint', '카드에 마우스를 올리면 상세 정보가 표시된다.')}</div>`
    }
    this.root.querySelectorAll<HTMLElement>('.reward-pick').forEach((pick) => {
      pick.classList.remove('detailing')
    })
    el.classList.add('detailing')
  }

  /** 화면이 열린 직후의 보호 시간인가 — 이때 들어온 클릭은 구매로 치지 않는다. */
  private guarded(): boolean {
    return performance.now() < this.inputReadyAt
  }

  private take(el: HTMLElement, opt: RewardOption) {
    if (this.locked || this.guarded()) return
    const price = rewardPrice(opt)
    if (this.opts.inspiration < price) {
      this.denyPurchase(el, `영감이 ${price - this.opts.inspiration} 부족해 이 보상을 기록하지 못했다.`)
      return
    }
    this.locked = true
    this.disableChoices()
    this.playPurchase(el, opt, price)
  }

  /** 영감이 지갑에서 카드로 건너가고, 소년의 기록 도장이 찍힌 뒤에만 다음 단계로 간다. */
  private playPurchase(el: HTMLElement, opt: RewardOption, price: number) {
    const scene = this.root.querySelector<HTMLElement>('.reward-scene')
    const wallet = this.root.querySelector<HTMLElement>('.reward-wallet')
    const balance = wallet?.querySelector<HTMLElement>('.reward-wallet-balance b')
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const flightMs = reduceMotion ? 90 : 430
    const finishMs = reduceMotion ? 260 : 820

    scene?.classList.add('is-buying-reward')
    el.closest<HTMLElement>('.reward-choice')?.classList.add('is-purchasing')
    el.classList.add('is-purchasing')
    this.root.querySelectorAll<HTMLElement>('.reward-pick').forEach((pick) => {
      if (pick !== el) {
        pick.classList.add('is-passed-over')
        pick.closest<HTMLElement>('.reward-choice')?.classList.add('is-passed-over')
      }
    })
    wallet?.classList.add('is-spending')
    this.flyInspiration(wallet, el, price, flightMs)
    this.countWallet(balance, this.opts.inspiration, this.opts.inspiration - price, flightMs)

    window.setTimeout(() => {
      wallet?.classList.remove('is-spending')
      const stamp = el.querySelector<HTMLElement>('.rp-owned-stamp')
      stamp?.setAttribute('aria-hidden', 'false')
      stamp?.setAttribute('role', 'status')
      el.classList.add('is-owned')
      GameAudio.play('pencil')
      SquareBurst.playOn(el, 'gold', { count: 18, spread: 92, duration: reduceMotion ? 180 : 520 })
    }, flightMs)

    window.setTimeout(() => this.opts.onPick(opt), finishMs)
  }

  private countWallet(target: HTMLElement | null | undefined, from: number, to: number, duration: number) {
    if (!target) return
    const started = performance.now()
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / Math.max(1, duration))
      target.textContent = String(Math.round(from + (to - from) * progress))
      if (progress < 1 && this.root.isConnected) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    const wallet = target.closest<HTMLElement>('.reward-wallet')
    wallet?.setAttribute('aria-label', `${text('rewardWalletOwned', '보유 영감')} ${to}, ${this.opts.mode === 'shop' ? text('shopPurchased', '이번 상점 구매') : '이번 클리어'} ${this.opts.mode === 'shop' ? this.opts.purchases ?? 0 : `+${this.opts.earned}`}`)
  }

  private flyInspiration(wallet: HTMLElement | null, card: HTMLElement, price: number, duration: number) {
    if (!wallet) return
    const from = wallet.getBoundingClientRect()
    const to = card.getBoundingClientRect()
    const count = Math.max(2, Math.min(7, price))
    for (let i = 0; i < count; i += 1) {
      const mote = document.createElement('span')
      mote.className = 'reward-inspiration-flight'
      mote.textContent = '◈'
      mote.style.left = `${from.left + from.width * .24}px`
      mote.style.top = `${from.top + from.height * .5}px`
      document.body.append(mote)
      const dx = to.left + to.width * .5 - (from.left + from.width * .24)
      const dy = to.top + to.height * .48 - (from.top + from.height * .5)
      const arc = 28 + (i % 3) * 16
      const animation = mote.animate([
        { transform: 'translate(-50%, -50%) scale(.55) rotate(0deg)', opacity: 0 },
        { transform: `translate(${dx * .42}px, ${dy * .42 - arc}px) scale(1.18) rotate(90deg)`, opacity: 1, offset: .45 },
        { transform: `translate(${dx}px, ${dy}px) scale(.38) rotate(210deg)`, opacity: .15 },
      ], { duration, delay: i * 34, easing: 'cubic-bezier(.2,.72,.2,1)', fill: 'forwards' })
      const remove = () => mote.remove()
      animation.onfinish = remove
      window.setTimeout(remove, duration + i * 34 + 120)
    }
  }

  private denyPurchase(el: HTMLElement, message: string) {
    const wallet = this.root.querySelector<HTMLElement>('.reward-wallet')
    el.classList.remove('is-denied')
    wallet?.classList.remove('is-short')
    void el.offsetWidth
    el.classList.add('is-denied')
    wallet?.classList.add('is-short')
    this.showSystemMessage(message)
    window.setTimeout(() => {
      el.classList.remove('is-denied')
      wallet?.classList.remove('is-short')
    }, 620)
  }

  private refresh() {
    if (this.locked || this.guarded()) return
    if (this.opts.inspiration < rewardRefreshCost(this.opts.refreshes) || !this.opts.onRefresh()) {
      this.showSystemMessage('영감이 부족해 다른 발상을 떠올릴 수 없다.')
    }
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
    if (this.locked || this.guarded()) return
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
    const deck = this.root.querySelector<HTMLButtonElement>('.reward-deck')
    if (deck) deck.disabled = true
  }

  destroy() {
    window.clearTimeout(this.guardTimer)
    this.closeDeck?.()
    this.tooltips?.destroy()
    this.tooltips = null
  }
}
