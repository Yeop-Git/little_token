/**
 * 점수 재기획 시험판 화면 (SCORE_REDESIGN.md §14-4). 기존 게임 화면과 독립된 페이지(`/score.html`)다.
 * 규칙·수치는 전부 `src/score` 엔진에서 오고 이 파일은 그리기와 입력만 맡는다(밸런스 수치를 View에 넣지 않는다).
 */
import {
  MAX_LEVEL, PIECES_PER_HEART, card as cardDef, form as formDef, leveled, relic as relicDef, sticker as stickerDef,
  weather as weatherDef, SCORE_CARDS, SCORE_FORMS, SCORE_RELICS, SCORE_STICKERS, SCORE_WEATHERS,
} from '../data'
import {
  LOCALE_LABEL, SCORE_LOCALES, contentName, contentRule, getLocale, setScoreLocale, t, type ContentKind,
  type ScoreLocale,
} from '../i18n'
import { ScoreRun } from '../run'
import { critInfo, expectedRoller, pickCost, scoreSentence } from '../scoring'
import {
  ERASER_PRICE, FORGE_SLOTS, HEAL_PRICE, HEART_TRADES, RARITY_BASE_POINTS, RARITY_BONUS, REROLL_PRICE, priceWithReceipt,
  wordPrice, type HeartTradeId, type ShopOffer,
} from '../shop'
import type { StagePlan } from '../stage'
import { floorDef } from '../stage'
import { tryoutBaseline, tryoutRelic, tryoutSticker, tryoutWord, type OfferTryout } from '../tryout'
import type { DeckCard, ScoreSlot, ScoreStep, SentencePick, SentenceResult } from '../types'
import { STAT_EMOTIONS } from '../types'

type SelKey = 'subj' | 'adv' | 'verb' | 'subj2' | 'verb2'
type Mode =
  | { kind: 'swap' }
  | { kind: 'stickerTarget'; offer: ShopOffer; viaTrade: boolean }
  | { kind: 'tradeSticker' }
  | { kind: 'recall' }

const root = document.getElementById('app')!
const params = new URLSearchParams(location.search)
let seed = Number(params.get('seed')) || Math.floor(Math.random() * 1e9)
let run = new ScoreRun(seed)
let sel: Partial<Record<SelKey, DeckCard>> = {}
let mode: Mode | undefined
let rollup: { res: SentenceResult; shown: number; timer: number; words: string; cleared: boolean; earned?: number } | undefined

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!))
const fmt = (n: number) => Math.round(n).toLocaleString(getLocale())
const fmt2 = (n: number) => (Math.round(n * 100) / 100).toLocaleString(getLocale())

// ── 이름·규칙 ──

function cardRule(c: DeckCard): string {
  const d = leveled(cardDef(c.cardId), c.level)
  return contentRule('card', c.cardId, { a: d.a, b: d.b, c: d.c, d: d.d })
}
const stickerRule = (id: string) => { const d = stickerDef(id); return contentRule('sticker', id, { a: d.a, b: d.b }) }
const relicRule = (id: string) => { const d = relicDef(id); return contentRule('relic', id, { a: d.a, b: d.b }) }
const weatherRule = (id: string) => contentRule('weather', id, { a: weatherDef(id).a })
const formRule = (id: string) => contentRule('form', id, { a: formDef(id).a })

/** 롤업 단계 이름을 현재 언어로. 계산기는 한국어 이름을 남기므로 이름 → id 역참조로 옮긴다. */
const NAME_INDEX = new Map<string, { kind: ContentKind; id: string }>()
for (const [kind, rows] of [['card', SCORE_CARDS], ['sticker', SCORE_STICKERS], ['relic', SCORE_RELICS], ['weather', SCORE_WEATHERS], ['form', SCORE_FORMS]] as const) {
  for (const r of rows) if (!NAME_INDEX.has(r.name)) NAME_INDEX.set(r.name, { kind, id: r.id })
}
function stepLabel(s: ScoreStep): string {
  if (s.source === 'stat') return t('step_stat')
  if (s.source === 'stage') return t('step_stage')
  if (s.source === 'carry') return t('step_carry')
  const n = Number(s.label.match(/\d+/)?.[0] ?? 0)
  if (s.source === 'resonance') return t('step_resonance', { n })
  if (s.source === 'paint') return t('step_paint', { n })
  const bare = s.label.replace(/^나도: /, '').replace(/ \(두 번 읽기\)$/, '')
  const ref = NAME_INDEX.get(bare)
  return ref ? contentName(ref.kind, ref.id) : s.label
}

// ── 공용 조각 ──

function hearts(pieces: number, max: number): string {
  const total = Math.ceil(max / PIECES_PER_HEART)
  let out = ''
  for (let i = 0; i < total; i++) {
    const fill = Math.max(0, Math.min(PIECES_PER_HEART, pieces - i * PIECES_PER_HEART))
    out += `<span class="heart" style="--fill:${(fill / PIECES_PER_HEART) * 100}%"></span>`
  }
  return `<span class="hearts" title="${pieces}/${max}">${out}</span>`
}

function hud(): string {
  const st = run.stage
  const locales = SCORE_LOCALES.map((l) => `<option value="${l}"${l === getLocale() ? ' selected' : ''}>${LOCALE_LABEL[l]}</option>`).join('')
  return `<header class="hud">
    <div class="hud-left">
      <strong class="floor">${t('floor', { n: run.floor })}${st.plan.boss ? ` · ${t('boss')}` : ''}</strong>
      <span class="chip form" title="${esc(formRule(st.plan.formId))}">${esc(contentName('form', st.plan.formId))}</span>
      ${st.plan.weatherIds.map((id) => `<span class="chip weather w-${weatherDef(id).kind}" title="${esc(weatherRule(id))}">${esc(contentName('weather', id))}</span>`).join('')}
    </div>
    <div class="hud-right">
      <span class="stat" title="${t('hearts')}">${hearts(run.pieces, run.maxPieces)}</span>
      ${run.guard ? `<span class="stat guard" title="${t('guard')}">◈ ${run.guard}</span>` : ''}
      <span class="stat money" title="${t('money')}">● ${run.money}</span>
      <select class="lang" data-act="lang" aria-label="${t('language')}">${locales}</select>
    </div>
  </header>`
}

function relicRow(editable: boolean): string {
  const cells = []
  for (let i = 0; i < run.relicSlots; i++) {
    const id = run.relics[i]
    if (!id) { cells.push(`<div class="relic empty">${t('relicEmpty')}</div>`); continue }
    cells.push(`<div class="relic k-${relicDef(id).kind}" title="${esc(relicRule(id))}">
      <b>${esc(contentName('relic', id))}</b><small>${esc(relicRule(id))}</small>
      ${editable ? `<div class="relic-ops">
        <button data-act="relicLeft" data-i="${i}" title="${t('moveLeft')}" ${i === 0 ? 'disabled' : ''}>◀</button>
        <button data-act="relicSell" data-i="${i}">${t('sell', { n: Math.floor(relicDef(id).price / 2) })}</button>
        <button data-act="relicRight" data-i="${i}" title="${t('moveRight')}" ${i >= run.relics.length - 1 ? 'disabled' : ''}>▶</button>
      </div>` : ''}
    </div>`)
  }
  return `<section class="relics"><h3>${t('relics')}</h3><div class="relic-row">${cells.join('')}</div>${editable ? `<p class="hint">${t('relicOrderHint')}</p>` : ''}</section>`
}

function wordCard(c: DeckCard, opts: { act?: string; cls?: string; extra?: string; reason?: string } = {}): string {
  const d = cardDef(c.cardId)
  const stars = c.level ? `<span class="lv" title="${t('level', { n: c.level })}">${'★'.repeat(c.level)}</span>` : ''
  const st = c.sticker ? `<span class="sticker" title="${esc(stickerRule(c.sticker))}">${esc(contentName('sticker', c.sticker))}</span>` : ''
  const cost = d.slot === 'verb' && d.cost > 1 ? `<span class="cost">${t('cost', { n: d.cost })}</span>` : ''
  return `<button class="word e-${d.emotion} ${opts.cls ?? ''}" ${opts.act ? `data-act="${opts.act}"` : ''} data-uid="${c.uid}" data-slot="${d.slot}" ${opts.reason ? `title="${esc(opts.reason)}"` : ''}>
    <span class="word-top"><i class="emo">${t(`emotion_${d.emotion}`)}</i>${cost}${stars}</span>
    <b class="word-name">${esc(contentName('card', c.cardId))}${st}</b>
    <span class="word-rule">${esc(cardRule(c))}</span>
    ${c.sticker ? `<span class="word-rule sticker-rule">${esc(stickerRule(c.sticker))}</span>` : ''}
    ${opts.extra ?? ''}
  </button>`
}

// ── 전투 ──

function currentPick(): SentencePick | undefined {
  const drowsy = run.stage.ctx.weatherIds.includes('drowsy')
  if (!sel.subj || !sel.verb || (!sel.adv && !drowsy)) return undefined
  return { subj: sel.subj, adv: sel.adv, verb: sel.verb, subj2: sel.subj2, verb2: sel.verb2 }
}

const samePick = (p: SentencePick, key: SelKey, c: DeckCard | undefined) => (p[key]?.uid ?? -1) === (c?.uid ?? -1)

/** 지금 고른 칸과 함께 놓을 수 있는 문장들. */
function compatiblePicks(picks: SentencePick[], skip?: SelKey): SentencePick[] {
  return picks.filter((p) => (['subj', 'adv', 'verb', 'subj2', 'verb2'] as SelKey[]).every((k) => k === skip || !sel[k] || samePick(p, k, sel[k])))
}

function battle(): string {
  const st = run.stage
  const ctx = st.ctx
  const picks = run.handPicks()
  const left = Math.max(0, st.plan.target - st.scored)
  const hp = floorDef(run.floor).hp
  const pips = Array.from({ length: ctx.chancesTotal }, (_, i) => `<i class="pip ${i < ctx.chancesLeft ? 'on' : ''}"></i>`).join('')
  const drowsy = ctx.weatherIds.includes('drowsy')
  const twinS = run.relics.includes('twinSubj')
  const twinV = run.relics.includes('twinVerb')

  // 눈에 보이는 맞물림(§15): 고른 카드와 같은 감정에 연결 표시, 두 장이 같으면 "한 장 더".
  const chosen = (['subj', 'adv', 'verb'] as SelKey[]).map((k) => sel[k]).filter((c): c is DeckCard => !!c)
  const chosenEmotions = chosen.map((c) => cardDef(c.cardId).emotion)
  const pairEmotion = chosenEmotions.length === 2 && chosenEmotions[0] === chosenEmotions[1] ? chosenEmotions[0] : undefined

  const column = (slot: ScoreSlot) => {
    const locked = slot === 'adv' && drowsy
    const cards = st.hand[slot].hand.map((c) => {
      const d = cardDef(c.cardId)
      const isSel = sel[slot] === c || (slot === 'subj' && sel.subj2 === c) || (slot === 'verb' && sel.verb2 === c)
      const usable = !locked && picks.some((p) => [p.subj, p.adv, p.verb, p.subj2, p.verb2].includes(c))
      const fits = usable && compatiblePicks(picks, slot).some((p) => p[slot] === c || p.subj2 === c || p.verb2 === c)
      let reason = ''
      if (!usable && !locked) {
        const probe: SentencePick = {
          subj: slot === 'subj' ? c : st.hand.subj.hand[0], adv: drowsy ? undefined : slot === 'adv' ? c : st.hand.adv.hand[0],
          verb: slot === 'verb' ? c : st.hand.verb.hand[0],
        }
        reason = run.validate(probe).reason ?? ''
      }
      const linked = !isSel && chosenEmotions.includes(d.emotion)
      const more = !isSel && pairEmotion === d.emotion && !sel[slot]
      const cls = [isSel ? 'sel' : '', fits ? '' : 'off', linked ? 'linked' : '', mode?.kind === 'swap' ? 'swappable' : ''].join(' ')
      return wordCard(c, { act: 'hand', cls, reason, extra: more ? `<em class="one-more">${t('oneMore')}</em>` : '' })
    }).join('')
    return `<div class="col ${locked ? 'locked' : ''}"><h3>${t(`slot_${slot}`)}${locked ? ` · ${t('slotLocked')}` : ''}</h3>${cards}</div>`
  }

  // 예상 점수: 칸을 채울 때마다 보인다(§0 기대). 다 채우기 전에는 지금 선택으로 닿을 수 있는 최고값.
  const pick = currentPick()
  const valid = pick ? run.validate(pick) : undefined
  let preview = `<p class="preview-hint">${t('pickAll')}</p>`
  if (pick && valid?.ok) {
    const res = scoreSentence(pick, ctx, run.loadout, expectedRoller, 1)
    const ci = critInfo(pick, ctx, run.loadout)
    preview = `<p class="preview-line"><span>${t('chips')} <b>${fmt2(res.chips)}</b></span> × <span>${t('mult')} <b>${fmt2(res.mult * res.amp)}</b></span>
      = <strong>${fmt(run.preview(pick))}</strong> <small>${t('critChance', { p: Math.round(ci.chance * 100) })} ×${fmt2(ci.mult)}</small></p>`
  } else if (pick && valid && !valid.ok) {
    preview = `<p class="preview-hint bad">${esc(valid.reason ?? '')}</p>`
  } else if (chosen.length) {
    const best = Math.max(0, ...compatiblePicks(picks).map((p) => run.preview(p)))
    preview = `<p class="preview-hint">${t('preview')} ≤ <b>${fmt(best)}</b></p>`
  }
  const cost = pick ? pickCost(pick) : 1
  const overtime = ctx.chancesLeft <= 0
  const writeLabel = overtime ? t('writeOvertime') : t('writeCost', { n: cost })
  const slots = (['subj', ...(twinS ? ['subj2'] : []), 'adv', 'verb', ...(twinV ? ['verb2'] : [])] as SelKey[])
    .map((k) => `<div class="slot ${sel[k] ? `filled e-${cardDef(sel[k]!.cardId).emotion}` : ''}"><small>${t(`slot_${k}`)}</small><b>${sel[k] ? esc(contentName('card', sel[k]!.cardId)) : '…'}</b></div>`).join('')

  return `${hud()}
  <section class="goal">
    <div class="goal-bar"><i style="width:${Math.min(100, (st.scored / st.plan.target) * 100)}%"></i>
      <span>${fmt(st.scored)} / ${fmt(st.plan.target)}</span></div>
    <div class="goal-info">
      <span>${t('enemiesLeft', { n: Math.ceil(left / hp) })}</span>
      <span class="chances ${overtime ? 'over' : ''}">${overtime ? t('overtime') : `${t('chances', { n: ctx.chancesLeft, total: ctx.chancesTotal })} ${pips}`}</span>
      <span>${t('tears')} <b>${fmt2(ctx.tears)}</b></span>
      ${ctx.weakness ? `<span>${t('weakness', { name: t(`emotion_${ctx.weakness}`) })}</span>` : ''}
    </div>
    <div class="rules">
      <span><b>${esc(contentName('form', st.plan.formId))}</b> ${esc(formRule(st.plan.formId))}</span>
      ${st.plan.weatherIds.map((id) => `<span><b>${esc(contentName('weather', id))}</b> ${esc(weatherRule(id))}</span>`).join('')}
    </div>
  </section>
  ${relicRow(false)}
  <section class="sentence">
    <div class="slots">${slots}</div>
    <div class="preview">${preview}</div>
    <div class="sentence-ops">
      ${st.swapsLeft > 0 ? `<button data-act="swapMode" class="${mode?.kind === 'swap' ? 'on' : ''}">${mode?.kind === 'swap' ? t('swapHint') : t('swap', { n: st.swapsLeft })}</button>` : ''}
      <button class="write" data-act="write" ${pick && valid?.ok ? '' : 'disabled'}>${writeLabel}</button>
    </div>
  </section>
  <section class="hand">${column('subj')}${column('adv')}${column('verb')}</section>`
}

function rollupPanel(): string {
  const r = rollup!
  const steps = r.res.steps.slice(0, r.shown)
  const cur = steps[steps.length - 1] ?? { chips: 0, mult: 1 }
  const done = r.shown >= r.res.steps.length
  const rows = steps.map((s) => `<li class="s-${s.source}"><span>${esc(stepLabel(s))}</span><em>${fmt2(s.chips)} × ${fmt2(s.mult)}</em></li>`).join('')
  return `<div class="rollup" data-act="rollup">
    <div class="rollup-box">
      <p class="rollup-words">${esc(r.words)}</p>
      <ol>${rows}</ol>
      <p class="rollup-now"><b>${fmt2(cur.chips)}</b> × <b>${fmt2(cur.mult)}</b></p>
      ${done ? `<p class="rollup-total ${r.res.crit ? 'crit' : ''}">${r.res.crit ? `${t('crit')}! ×${fmt2(r.res.critMult)} · ` : ''}${t('scored', { n: fmt(r.res.score) })}</p>
        ${r.cleared ? `<p class="rollup-clear">${t('stageClear')}${r.earned != null ? ` · ${t('earned', { n: r.earned })}` : ''}</p>` : ''}` : ''}
      <small>${t('rollupSkip')}</small>
    </div>
  </div>`
}

// ── 상점 ──

function forecastCard(p: StagePlan): string {
  return `<div class="forecast-card">
    <b>${t('floor', { n: p.floor })}${p.boss ? ` · ${t('boss')}` : ''}</b>
    <span>${esc(contentName('form', p.formId))} · ${t('target')} ${fmt(p.target)}</span>
    ${p.weatherIds.map((id) => `<span class="chip weather w-${weatherDef(id).kind}" title="${esc(weatherRule(id))}">${esc(contentName('weather', id))}</span><small>${esc(weatherRule(id))}</small>`).join('')}
  </div>`
}

function tryoutLine(tr: OfferTryout | undefined): string {
  if (!tr) return ''
  return Math.round(tr.to) > Math.round(tr.from)
    ? `<span class="tryout up">${t('tryout', { from: fmt(tr.from), to: fmt(tr.to) })}</span>`
    : `<span class="tryout">${t('tryoutNone')}</span>`
}

function shopView(): string {
  const sh = run.shop!
  const base = tryoutBaseline(run.deck, run.loadout)
  const lo = run.loadout
  const offerCard = (o: ShopOffer) => {
    let title = ''
    let rule = ''
    let cls = ''
    let tr: OfferTryout | undefined
    let tag = ''
    if (o.kind === 'word') {
      const d = cardDef(o.id)
      const owned = o.upgradeUid != null ? run.deck.find((c) => c.uid === o.upgradeUid) : undefined
      const probe: DeckCard = owned ? { ...owned, level: Math.min(MAX_LEVEL, owned.level + 1) } : { uid: -1, cardId: o.id, level: 0 }
      title = contentName('card', o.id)
      rule = cardRule(probe)
      cls = `e-${d.emotion}`
      tag = `${t(`slot_${d.slot}`)} · ${t(`emotion_${d.emotion}`)}${d.cost > 1 ? ` · ${t('cost', { n: d.cost })}` : ''}${owned ? ` · ${t('upgrade')} ${'★'.repeat(probe.level)}` : ''}`
      tr = tryoutWord(base, run.deck, lo, o.id, o.upgradeUid)
    } else if (o.kind === 'sticker') {
      const d = stickerDef(o.id)
      title = contentName('sticker', o.id)
      rule = stickerRule(o.id)
      cls = 'offer-sticker'
      tag = t(`slot_${d.slot}`)
      tr = tryoutSticker(base, run.deck, lo, o.id, d.slot)
    } else if (o.kind === 'relic') {
      title = contentName('relic', o.id)
      rule = relicRule(o.id)
      cls = `offer-relic k-${relicDef(o.id).kind}`
      tr = run.relics.length < run.relicSlots ? tryoutRelic(base, lo, o.id) : undefined
    } else {
      title = `${t('item')} · ${t(`rarity_${o.rarity}`)}`
      rule = t('itemRule', { n: 3 + RARITY_BONUS[o.rarity] + RARITY_BASE_POINTS[o.rarity] + run.pledge })
      cls = `offer-item r-${o.rarity}`
    }
    const can = o.kind === 'sticker' ? { ok: o.price <= run.money, reason: t('reason_noMoney') } : run.canBuy(o)
    const picking = mode?.kind === 'tradeSticker' && o.kind === 'sticker'
    const reason = can.ok ? '' : o.price > run.money ? t('reason_noMoney') : o.kind === 'relic' ? t('reason_relicFull') : (can.reason ?? '')
    return `<div class="offer ${cls} ${picking ? 'pickable' : ''}">
      ${tag ? `<small class="offer-tag">${esc(tag)}</small>` : ''}
      <b>${esc(title)}</b><span class="offer-rule">${esc(rule)}</span>${tryoutLine(tr)}
      <button data-act="buy" data-i="${sh.stock.indexOf(o)}" ${can.ok || picking ? '' : 'disabled'} title="${esc(reason)}">${picking ? t('trade_sticker') : `${t('buy')} · ${t('price', { n: o.price })}`}</button>
    </div>`
  }
  const store = (title: string, offers: ShopOffer[]) => `<div class="store"><h3>${title}</h3><div class="offers">${offers.map(offerCard).join('') || '—'}</div></div>`
  const targetMode = mode?.kind === 'stickerTarget' || mode?.kind === 'recall'
  const targetSlot = mode?.kind === 'stickerTarget' && mode.offer.kind === 'sticker' ? stickerDef(mode.offer.id).slot : undefined
  const bag = (['subj', 'adv', 'verb'] as ScoreSlot[]).map((slot) => {
    const cards = run.deck.filter((c) => cardDef(c.cardId).slot === slot).map((c) => {
      const d = cardDef(c.cardId)
      const isTarget = mode?.kind === 'stickerTarget' ? slot === targetSlot : mode?.kind === 'recall' ? c.level < MAX_LEVEL && !!d.grow : false
      const ops = targetMode ? '' : `<span class="bag-ops">
        <span role="button" data-act="sellWord" data-uid="${c.uid}">${t('sell', { n: Math.floor(wordPrice(d.cost) / 2) })}</span>
        <span role="button" data-act="eraseWord" data-uid="${c.uid}">${t('erase', { n: priceWithReceipt(ERASER_PRICE, run.relics) })}</span></span>`
      return wordCard(c, { act: isTarget ? 'target' : undefined, cls: targetMode ? (isTarget ? 'target' : 'off') : 'bagged', extra: ops })
    }).join('')
    return `<div class="col"><h3>${t(`slot_${slot}`)}</h3>${cards}</div>`
  }).join('')
  const trades = (Object.keys(HEART_TRADES) as HeartTradeId[]).map((id) => {
    const can = run.canTrade(id)
    return `<button class="trade" data-act="trade" data-id="${id}" ${can.ok ? '' : 'disabled'} title="${esc(can.reason ?? '')}">
      <b>${t(`trade_${id}`)}</b><span>${t(`trade_${id}_rule`)}</span><em>♥ ${t('pieces', { n: HEART_TRADES[id].pieces })}</em></button>`
  }).join('')
  const healPrice = priceWithReceipt(HEAL_PRICE, run.relics)
  const banner = mode?.kind === 'stickerTarget' ? t('chooseTarget') : mode?.kind === 'recall' ? t('chooseRecall') : mode?.kind === 'tradeSticker' ? t('trade_sticker_rule') : ''
  return `${hud()}
  <section class="shop">
    <h2>${t('shop')}</h2>
    <div class="forecast"><h3>${t('forecast')}</h3>${sh.forecast.map(forecastCard).join('')}</div>
    ${banner ? `<p class="banner">${banner} <button data-act="cancel">${t('cancel')}</button></p>` : ''}
    ${sh.haggle ? `<div class="store haggle"><h3>${t('haggleChoose')}</h3><div class="offers">${sh.haggle.map((id) => `<div class="offer offer-relic k-${relicDef(id).kind}">
      <b>${esc(contentName('relic', id))}</b><span class="offer-rule">${esc(relicRule(id))}</span><button data-act="haggle" data-id="${id}">${t('buy')}</button></div>`).join('')}</div></div>` : ''}
    ${store(t('store_words'), sh.stock.filter((o) => o.kind === 'word'))}
    ${store(t('store_stickers'), sh.stock.filter((o) => o.kind === 'sticker' || o.kind === 'item'))}
    ${store(t('store_relics'), sh.stock.filter((o) => o.kind === 'relic'))}
    <div class="shop-ops">
      <button data-act="reroll" ${sh.freeRerolls > 0 || run.money >= REROLL_PRICE ? '' : 'disabled'}>${sh.freeRerolls > 0 ? t('rerollFree', { n: sh.freeRerolls }) : t('reroll', { n: REROLL_PRICE })}</button>
      <button data-act="heal" ${run.money >= healPrice && run.pieces < run.maxPieces ? '' : 'disabled'}>${t('heal', { n: healPrice })}</button>
      <button class="write" data-act="leave">${t('leave')}</button>
    </div>
    <div class="store"><h3>${t('heartTrade')}</h3><p class="hint">${t('heartTradeHint')}</p><div class="trades">${trades}</div></div>
  </section>
  ${relicRow(true)}
  <section class="bag"><h2>${t('bag')} · ${t('deck')}</h2><div class="hand">${bag}</div>${statsPanel()}</section>`
}

function statsPanel(): string {
  const s = run.stats
  const rows: [string, string][] = [
    ...STAT_EMOTIONS.map((e): [string, string] => [contentName('stat', e), fmt2(s[e])]),
    [contentName('stat', 'baseChips'), fmt2(s.baseChips)], [contentName('stat', 'baseAdd'), `+${fmt2(s.baseAdd)}`],
    [contentName('stat', 'crit'), `+${Math.round(s.crit * 100)}%`], [contentName('stat', 'startTears'), fmt2(s.startTears)],
    [contentName('stat', 'amp'), `+${Math.round(s.amp * 100)}%`], [contentName('stat', 'allowance'), fmt2(s.allowance)],
    [contentName('stat', 'luck'), fmt2(s.luck)], [contentName('stat', 'freeReroll'), fmt2(s.freeReroll)],
  ]
  return `<div class="stats"><h3>${t('stats')}</h3>${rows.map(([k, v]) => `<span>${esc(k)} <b>${v}</b></span>`).join('')}</div>`
}

// ── 재련 ──

function forgeView(): string {
  const f = run.forge!
  const slot = FORGE_SLOTS[f.step]
  const points = 1 + f.bonus[f.step]
  const steps = FORGE_SLOTS.map((s, i) => `<span class="${i === f.step ? 'on' : i < f.step ? 'done' : ''}">${t(`forge_${s}`)}${f.bonus[i] ? ` +${f.bonus[i]}` : ''}</span>`).join(' → ')
  const choices = f.choices[f.step].map((s) => `<button class="forge-choice" data-act="forge" data-id="${s.id}">
    <b>${esc(contentName('stat', s.id))}</b><span>${esc(contentRule('stat', s.id, { p: s.perPoint * points }))}</span><em>${t('forgePoints', { n: points })}</em></button>`).join('')
  return `${hud()}<section class="forge r-${f.rarity}">
    <h2>${t('forge')} · ${t(`rarity_${f.rarity}`)}</h2>
    ${f.baseStat ? `<p>${t('forgeBase', { name: contentName('stat', f.baseStat), n: RARITY_BASE_POINTS[f.rarity] * 3 })}</p>` : ''}
    <p class="forge-steps">${steps}</p>
    <h3>${t(`forge_${slot}`)}</h3>
    <div class="forge-choices">${choices}</div>
    ${statsPanel()}
  </section>`
}

function endView(): string {
  const softlocked = run.events[run.events.length - 1]?.kind === 'softlock'
  const msg = run.phase === 'won' ? t('won') : softlocked ? t('softlock') : t('lost', { n: run.floor })
  return `${hud()}<section class="end ${run.phase}"><h2>${msg}</h2><p>${t('seed', { n: seed })}</p>
    <button class="write" data-act="restart">${t('restart')}</button> <a href="./">${t('back')}</a></section>`
}

// ── 그리기와 입력 ──

function render() {
  document.title = t('title')
  document.documentElement.lang = getLocale()
  let html = ''
  if (run.phase === 'battle') html = battle()
  else if (run.phase === 'shop') html = shopView()
  else if (run.phase === 'forge') html = forgeView()
  else html = endView()
  root.innerHTML = html
}

function showRollup() {
  root.querySelector('.rollup')?.remove()
  root.insertAdjacentHTML('beforeend', rollupPanel())
}

function finishRollup() {
  if (!rollup) return
  if (rollup.shown < rollup.res.steps.length) {
    rollup.shown = rollup.res.steps.length
    window.clearInterval(rollup.timer)
    showRollup()
    return
  }
  window.clearInterval(rollup.timer)
  rollup = undefined
  render()
}

function write() {
  const pick = currentPick()
  if (!pick || !run.validate(pick).ok) return
  const words = [pick.subj, pick.subj2, pick.adv, pick.verb, pick.verb2].filter((c): c is DeckCard => !!c).map((c) => contentName('card', c.cardId)).join(' ')
  const floor = run.floor
  const moneyBefore = run.money
  const res = run.play(pick)
  const cleared = run.phase !== 'battle' ? run.phase !== 'lost' : run.floor !== floor
  sel = {}
  mode = undefined
  // 롤업(§0 폭발): 주어 → 수식어 → 동사 → 유물 순서로 한 단계씩 숫자가 올라간다.
  rollup = { res, shown: 0, words, cleared, earned: cleared ? run.money - moneyBefore : undefined, timer: 0 }
  if (run.phase === 'battle') { run.rescueHand(); render() }
  rollup.timer = window.setInterval(() => {
    if (!rollup) return
    rollup.shown++
    showRollup()
    if (rollup.shown >= rollup.res.steps.length) window.clearInterval(rollup.timer)
  }, 260)
  showRollup()
}

function clickHand(uid: number, slot: ScoreSlot) {
  const c = run.stage.hand[slot].hand.find((x) => x.uid === uid)
  if (!c) return
  if (mode?.kind === 'swap') { run.swap(slot, c); mode = undefined; sel = {}; return }
  const twin: SelKey | undefined = slot === 'subj' && run.relics.includes('twinSubj') ? 'subj2' : slot === 'verb' && run.relics.includes('twinVerb') ? 'verb2' : undefined
  if (sel[slot] === c) { sel[slot] = twin ? sel[twin] : undefined; if (twin) sel[twin] = undefined; return }
  if (twin && sel[twin] === c) { sel[twin] = undefined; return }
  if (twin && sel[slot] && !sel[twin]) { sel[twin] = c; return }
  sel[slot] = c
}

function clickBuy(i: number) {
  const o = run.shop?.stock[i]
  if (!o) return
  if (mode?.kind === 'tradeSticker') {
    if (o.kind === 'sticker') mode = { kind: 'stickerTarget', offer: o, viaTrade: true }
    return
  }
  if (o.kind === 'sticker') { mode = { kind: 'stickerTarget', offer: o, viaTrade: false }; return }
  run.buy(o)
}

function clickTarget(uid: number) {
  if (mode?.kind === 'stickerTarget') {
    if (mode.viaTrade) run.trade('sticker', { offer: mode.offer, targetUid: uid })
    else run.buy(mode.offer, { targetUid: uid })
  } else if (mode?.kind === 'recall') run.trade('recall', { targetUid: uid })
  mode = undefined
}

function clickTrade(id: HeartTradeId) {
  if (id === 'sticker') mode = { kind: 'tradeSticker' }
  else if (id === 'recall') mode = { kind: 'recall' }
  else run.trade(id)
}

root.addEventListener('click', (ev) => {
  const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-act]')
  if (!el || el.hasAttribute('disabled')) return
  const act = el.dataset.act!
  if (act === 'lang') return
  if (rollup) { finishRollup(); return }
  const i = Number(el.dataset.i)
  const uid = Number(el.dataset.uid)
  switch (act) {
    case 'hand': clickHand(uid, el.dataset.slot as ScoreSlot); break
    case 'write': write(); return
    case 'swapMode': mode = mode?.kind === 'swap' ? undefined : { kind: 'swap' }; break
    case 'buy': clickBuy(i); break
    case 'target': clickTarget(uid); break
    case 'cancel': mode = undefined; break
    case 'reroll': run.reroll(); break
    case 'heal': run.heal(); break
    case 'leave': mode = undefined; run.leaveShop(); break
    case 'sellWord': run.sell(uid); break
    case 'eraseWord': run.erase(uid); break
    case 'relicLeft': run.moveRelic(i, i - 1); break
    case 'relicRight': run.moveRelic(i, i + 1); break
    case 'relicSell': run.sellRelic(i); break
    case 'trade': clickTrade(el.dataset.id as HeartTradeId); break
    case 'haggle': run.chooseHaggle(el.dataset.id!); break
    case 'forge': run.forgeChoose(el.dataset.id!); break
    case 'restart': seed = Math.floor(Math.random() * 1e9); run = new ScoreRun(seed); sel = {}; mode = undefined; break
  }
  if (run.phase === 'battle') run.rescueHand()
  render()
})

root.addEventListener('change', (ev) => {
  const el = ev.target as HTMLSelectElement
  if (el.dataset.act !== 'lang') return
  setScoreLocale(el.value as ScoreLocale)
  render()
})

render()
