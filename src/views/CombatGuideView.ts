/**
 * 로비(타이틀)에서만 여는 전투 설명서. 전투 화면을 가리지 않는 독립 씬이다.
 *
 * 여기 적히는 수치는 전부 실제 전투가 쓰는 모듈에서 읽어 온다 — 단어 데이터,
 * 컴파일러, 전투 규칙 상수, 적 정의, 스테이지 곡선. 예시 문장의 피해도 글로
 * 적지 않고 진짜 `compile()`을 돌려 그 자리에서 계산한다. 규칙이 바뀌면
 * 설명서가 같이 바뀌고, 설명과 결과가 어긋날 자리를 남기지 않는다.
 */

import {
  CRIT_CAP,
  CRIT_STAT_K,
  compile,
  effectiveBase,
  LUCK_MULT,
  resolveMultiplier,
  rouletteOdds,
  ROULETTE,
  statBiasOf,
  STAT_NAME,
} from '@core/compiler'
import {
  BOSS_ATTACK_MULTIPLIER,
  EMOTION_RESONANCE,
  PART_WEAKNESS_MULT,
  TARGET_FALLOFF,
  WEAKNESS_MULT,
} from '@core/combatRules'
import { josa } from '@core/josa'
import { selectionInkCost, SENTENCE_INK } from '@core/ink'
import { STARTING_COMBAT_STATS, STAT_META } from '@core/player'
import {
  EMOTION_LABEL,
  RARITY_LABEL,
  type Combo,
  type Emotion,
  type Selection,
  type Word,
} from '@core/types'
import { ALL_REWARD_WORDS, EARLY_WORDS, makeEarlyTables, SPECIAL_REWARD_WORDS } from '@data/earlyWords'
import { ENEMIES } from '@data/enemies'
import { EXCLAIM_RARITY_BONUS, EXCLAIM_SLOTS } from '@data/items'
import { BOSS_BY_FLOOR, bossHealthBarsForFloor, MAX_ENCOUNTER, STORY_FLOORS } from '@data/stages'
import { CARD_HAND_CONFIG } from '@/ui/CardHand'
import { emotionBadgeContent } from '@/ui/EmotionBadge'
import { wordCardHtml } from '@/ui/WordCardFace'
import { currentLocale } from '@/localization'
import { localizedGuidePages } from '@/localization/guide'

interface Opts {
  onBack: () => void
}

interface Chapter {
  key: string
  title: string
  hint: string
  body: () => string
}

/** 설명서가 예시로 세우는 문장. 슬롯에서 사라진 단어면 그 칸의 첫 카드로 떨어진다. */
const EXAMPLE_IDS: Record<string, string> = { subj: 'na', adv: 'himkkeot', verb: 'ttaeryeot' }

const TABLES = makeEarlyTables()
const STATS = STARTING_COMBAT_STATS

const pct = (ratio: number) => `${Math.round(ratio * 100)}%`
const mult = (value: number) => `×${value.toFixed(2)}`

function slotWord(slot: string, id?: string): Word | null {
  const pool = EARLY_WORDS[slot] ?? []
  return (id ? pool.find((w) => w.id === id) : null) ?? pool[0] ?? null
}

function specialWord(id: string): Word | null {
  return SPECIAL_REWARD_WORDS.find((w) => w.id === id) ?? null
}

/** 태그 하나를 실제로 들고 있는 카드 이름 — 관용구 조건을 카드 말로 옮긴다. */
const TAG_SAMPLE = new Map<string, string>()
for (const word of [...Object.values(EARLY_WORDS).flat(), ...ALL_REWARD_WORDS]) {
  for (const tag of word.tags) if (!TAG_SAMPLE.has(tag)) TAG_SAMPLE.set(tag, word.text)
}

/** 카드 한 장을 설명서 칸에 세운다. 손패와 완전히 같은 앞면을 쓴다. */
function cardSlot(word: Word | null, caption?: string): string {
  if (!word) return ''
  return `<figure class="g-card">
      <span class="g-card-frame">${wordCardHtml(word)}</span>
      ${caption ? `<figcaption>${caption}</figcaption>` : ''}
    </figure>`
}

export class CombatGuideView {
  private chapters: Chapter[] = currentLocale === 'ko' ? [
    { key: 'flow', title: '전투의 흐름', hint: '한 턴에 벌어지는 일', body: () => this.pageFlow() },
    { key: 'card', title: '카드 읽는 법', hint: '카드에 적힌 것이 전부', body: () => this.pageCard() },
    { key: 'damage', title: '피해가 정해지는 순서', hint: '깡수치 × 배율', body: () => this.pageDamage() },
    { key: 'context', title: '감정과 맥락', hint: '공명 · 관용구 · 약점', body: () => this.pageContext() },
    { key: 'combat', title: '공격과 방어', hint: '범위 · 관통 · 방어막', body: () => this.pageCombat() },
    { key: 'journey', title: '여정과 보상', hint: '15층 · 보스 · 전리품', body: () => this.pageJourney() },
  ] : localizedGuidePages(currentLocale).map((entry) => ({ ...entry, body: () => entry.body }))

  private active = 0

  private onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') return this.opts.onBack()
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    const target = event.target
    if (target instanceof Element && !target.closest('.g-rail')) return
    event.preventDefault()
    const next = (this.active + (event.key === 'ArrowDown' ? 1 : this.chapters.length - 1)) % this.chapters.length
    this.select(next, true)
  }

  constructor(private root: HTMLElement, private opts: Opts) {
    this.mount()
  }

  destroy() {
    window.removeEventListener('keydown', this.onKey)
  }

  private mount() {
    const tabs = this.chapters.map((chapter, index) => `
        <button type="button" role="tab" class="g-tab${index === this.active ? ' is-on' : ''}"
          id="g-tab-${chapter.key}" aria-controls="g-page-${chapter.key}" aria-selected="${index === this.active}"
          tabindex="${index === this.active ? 0 : -1}" data-index="${index}">
          <b>${String(index + 1).padStart(2, '0')}</b>
          <span><em>${chapter.title}</em><small>${chapter.hint}</small></span>
        </button>`).join('')

    const pages = this.chapters.map((chapter, index) => `
        <section class="g-page${index === this.active ? ' is-on' : ''}" role="tabpanel"
          id="g-page-${chapter.key}" aria-labelledby="g-tab-${chapter.key}" ${index === this.active ? '' : 'hidden'}>
          <h2 class="g-page-title"><i>${String(index + 1).padStart(2, '0')}</i>${chapter.title}</h2>
          ${chapter.body()}
        </section>`).join('')

    this.root.innerHTML = `
      <main class="scene guide-scene">
        <article class="guide-sheet" aria-labelledby="guide-title">
          <header class="guide-head">
            <p class="guide-eyebrow">그림일기 · 전투 설명서</p>
            <h1 id="guide-title">오늘의 전투는 이렇게 쓴다</h1>
            <p class="guide-lede">단어 카드를 이어 문장 하나를 완성하면, 그 문장이 그대로 이번 턴의 행동이 된다.
              여기 적힌 수치는 모두 지금 돌아가는 전투 규칙에서 그대로 읽어 온 값이다.</p>
            <button type="button" class="guide-back">로비로 돌아가기<kbd>Esc</kbd></button>
          </header>
          <div class="guide-body">
            <nav class="g-rail" role="tablist" aria-label="설명서 차례" aria-orientation="vertical">${tabs}</nav>
            <div class="g-stack">${pages}</div>
          </div>
        </article>
      </main>`

    this.root.querySelector<HTMLButtonElement>('.guide-back')?.addEventListener('click', () => this.opts.onBack())
    this.root.querySelectorAll<HTMLButtonElement>('.g-tab').forEach((tab) => {
      tab.addEventListener('click', () => this.select(Number(tab.dataset.index ?? 0)))
    })
    window.addEventListener('keydown', this.onKey)
  }

  private select(index: number, focus = false) {
    if (index === this.active) return
    this.active = index
    this.root.querySelectorAll<HTMLButtonElement>('.g-tab').forEach((tab, i) => {
      const on = i === index
      tab.classList.toggle('is-on', on)
      tab.setAttribute('aria-selected', String(on))
      tab.tabIndex = on ? 0 : -1
      if (on && focus) tab.focus()
    })
    this.root.querySelectorAll<HTMLElement>('.g-page').forEach((page, i) => {
      const on = i === index
      page.classList.toggle('is-on', on)
      page.hidden = !on
    })
    const stack = this.root.querySelector<HTMLElement>('.g-stack')
    if (stack) stack.scrollTop = 0
  }

  /* ── 01 전투의 흐름 ─────────────────────────────────────────── */

  private pageFlow(): string {
    const slots = TABLES.template.slots
    const cards = slots.map((slot) => {
      return cardSlot(slotWord(slot.key, EXAMPLE_IDS[slot.key]), `<b>${slot.label}</b>`)
    }).join('<span class="g-plus" aria-hidden="true">+</span>')

    const sentence = slots.map((slot) => slotWord(slot.key, EXAMPLE_IDS[slot.key])?.text ?? '____').join(' ')
    const exampleSelection = Object.fromEntries(slots.map((slot) => [slot.key, slotWord(slot.key, EXAMPLE_IDS[slot.key]) ?? undefined]))
    const exampleInk = selectionInkCost(exampleSelection)

    const phases: [string, string, string][] = [
      ['1', '단어 고르기', `${slots.map((s) => s.label).join(' → ')} 순서로 카드를 한 장씩 확정한다`],
      ['2', '준비 효과', '방어처럼 맞기 전에 의미가 있는 효과를 먼저 세운다'],
      ['3', '선공 상대 행동', '선공 표식이 달린 적이 내 문장보다 먼저 때린다'],
      ['4', '본인 캐릭터 행동', '완성한 문장이 공격·회복으로 실제로 꽂힌다'],
      ['5', '후공 상대 행동', '남은 적이 마지막으로 움직이고 다음 턴이 열린다'],
    ]

    const stats = STAT_META.map((meta) => `
      <li><b>${meta.label}</b><i>${STARTING_COMBAT_STATS[meta.key]}</i><span>${meta.desc}</span></li>`).join('')

    return `
      <p class="g-lead">카드에 적힌 위력·배율·효과가 곧 완성 문장의 결과다. 앞에 무엇을 놓았는지가
        뒤 카드의 값을 바꾸므로, 문장을 고르는 일이 곧 이번 턴의 전략이다.</p>

      <div class="g-cardrow">${cards}</div>
      <p class="g-sentence">“${sentence}”<span>세 장이 이어져 한 문장이 된다</span></p>
      <p class="g-note"><b>잉크 ${exampleInk}/${SENTENCE_INK}</b> · 문장마다 잉크 ${SENTENCE_INK}을 새로 채운다. 합계가 넘더라도 완성할 수 있지만 초과분만큼 체력을 지불한다.</p>

      <h3 class="g-h3">한 턴의 순서</h3>
      <ol class="g-flow">
        ${phases.map(([n, title, desc]) => `<li><i>${n}</i><b>${title}</b><span>${desc}</span></li>`).join('')}
      </ol>
      <p class="g-note">방어는 <b>2단계</b>에서 먼저 세워지므로 선공 적의 공격도 막아 낸다.
        문장부호 <b>!</b>가 붙은 문장은 3단계를 통째로 건너뛰어 선공 적보다 먼저 움직인다.</p>

      <div class="g-split">
        <section class="g-panel">
          <h3 class="g-h3">손패와 뽑기</h3>
          <ul class="g-bullets">
            <li>칸을 열면 카드가 <b>${CARD_HAND_CONFIG.initialHand}장</b> 깔린다. 선택지가 넓은 동사 칸만 <b>${CARD_HAND_CONFIG.verbInitialHand}장</b>이다.</li>
            <li>한 스테이지에서 추가로 뽑을 수 있는 횟수는 <b>${CARD_HAND_CONFIG.drawsPerStage}회</b>, 손패는 최대 <b>${CARD_HAND_CONFIG.maxHand}장</b>까지 늘어난다.</li>
            <li>쓰지 않고 아낀 뽑기는 승리할 때 <b>보상등급 +1</b>씩으로 돌아온다 — 참는 것도 하나의 수다.</li>
            <li>카드를 클릭하면 그 칸이 곧바로 확정된다. 되돌릴 수 없으니 앞 칸이 뒤 칸을 어떻게 바꾸는지 먼저 본다.</li>
          </ul>
        </section>
        <section class="g-panel">
          <h3 class="g-h3">시작 스탯</h3>
          <ul class="g-stats">${stats}</ul>
          <p class="g-note g-tight">동사의 깡수치는 카드에 박힌 고정 위력이 아니라 <b>스탯 × 계수</b>에서 나온다.
            그래서 같은 카드도 스탯이 오르면 함께 세진다.</p>
        </section>
      </div>`
  }

  /* ── 02 카드 읽는 법 ────────────────────────────────────────── */

  private pageCard(): string {
    const subject = slotWord('subj', 'eoje')
    const verb = slotWord('verb', 'ttaeryeot')
    const special = specialWord('spreadTwo')

    const parts: [string, string][] = [
      ['왼쪽 위 · 감정', `기쁨·분노·슬픔·즐거움 중 하나. 같은 감정을 모으면 공명 배율이 붙는다.`],
      ['가운데 위 · 행동', '동사 카드에만 붙는 표식으로 공격·방어·회복을 가린다.'],
      ['오른쪽 위 · 등급', `${Object.values(RARITY_LABEL).join(' · ')}. 반복해서 얻으면 <b>Lv.</b>가 함께 오른다.`],
      ['가운데 · 이름', '문장에 실제로 적히는 말. 조사는 칸에 맞춰 자동으로 붙는다.'],
      ['아래 · 한 줄 효과', '이 카드가 문장에 보태는 값 전부. 숨은 수치는 없다.'],
    ]

    const notes: [string, string][] = [
      ['배율 ×1.20', '주어·수식이 배율 풀에 보태는 몫. 여러 장이면 <b>더해서</b> 한 번에 곱한다.'],
      ['공격 ×1', '동사가 스탯에서 뽑아내는 깡수치. 공격 스탯이 5면 5가 된다.'],
      ['75% 확률로 배율 ×1.80', '도박 카드. 확률로 높은 배율과 낮은 배율 중 하나가 정해진다.'],
      ['대성공 10%', '대성공 룰렛 확률을 올린다. 대성공이면 문장 전체가 ' + mult(ROULETTE.crit) + '가 된다.'],
      ['공격 ×0.9 · 2명(100%·70%)', '여러 적을 때리는 카드. 뒷줄일수록 피해가 줄어든다.'],
    ]

    return `
      <p class="g-lead">카드 한 장에 필요한 정보가 모두 적혀 있다. 아래는 실제 전투에서 집게 되는 카드
        그대로이며, 표시 방식도 손패와 동일하다.</p>

      <div class="g-anatomy">
        <div class="g-cardrow g-cardrow-tight">
          ${cardSlot(subject, '<b>주어</b><span>도박 배율</span>')}
          ${cardSlot(verb, '<b>동사</b><span>스탯 비례</span>')}
          ${cardSlot(special, '<b>동사</b><span>다중 대상</span>')}
        </div>
        <ul class="g-legend">
          ${parts.map(([label, desc]) => `<li><b>${label}</b><span>${desc}</span></li>`).join('')}
        </ul>
      </div>

      <h3 class="g-h3">한 줄 효과 읽는 법</h3>
      <table class="g-table">
        <thead><tr><th>이렇게 적혀 있으면</th><th>이런 뜻이다</th></tr></thead>
        <tbody>${notes.map(([code, desc]) => `<tr><td><code>${code}</code></td><td>${desc}</td></tr>`).join('')}</tbody>
      </table>

      <p class="g-note">카드를 눌러 두면 열리는 상세에는 <b>가능한 맥락</b>이 함께 뜬다.
        지금 가진 덱에서 그 카드와 이어 볼 수 있는 관용구 목록이라, 숨은 정답을 외울 필요가 없다.</p>`
  }

  /* ── 03 피해가 정해지는 순서 ────────────────────────────────── */

  private pageDamage(): string {
    const selection: Selection = {}
    for (const slot of TABLES.template.slots) {
      const word = slotWord(slot.key, EXAMPLE_IDS[slot.key])
      if (word) selection[slot.key] = word
    }
    const intent = compile(selection, TABLES, STATS)
    const statBias = statBiasOf(intent, STATS)
    const odds = rouletteOdds(intent, statBias)
    const normal = resolveMultiplier(intent, { luck: STATS.luck, statBias }, 1)
    const crit = resolveMultiplier(intent, { luck: STATS.luck, statBias }, 0)
    const base = effectiveBase(intent)
    const damageOf = (m: number) => Math.round(base * m)

    const flats = intent.breakdown.flats.map((part) => `
      <li><b>${part.label}</b><i>+${part.value}</i><span>${part.hint ?? '카드 고정 위력'}</span></li>`).join('')

    const mults = intent.breakdown.mults.map((part) => `
      <li><b>${part.label}</b><i>${mult(part.value)}</i><span>${part.hint ?? ''}</span></li>`).join('')

    const luckMult = 1 + STATS.luck * LUCK_MULT

    return `
      <p class="g-lead">피해는 <b>깡수치</b>를 만들고 거기에 <b>배율</b>을 곱해 정해진다.
        아래 계산은 시작 덱과 시작 스탯으로 실제 컴파일러를 돌린 결과다.</p>

      <p class="g-sentence g-sentence-sm">“${intent.sentence}”</p>

      <div class="g-calc">
        <section class="g-calc-col">
          <h3 class="g-h3">① 깡수치</h3>
          <ul class="g-parts">${flats}</ul>
          <p class="g-calc-sum">합계 <b>${base}</b></p>
          <p class="g-note g-tight">동사가 정한다. 공격이면 피해, 방어·회복이면 그쪽 수치로 들어간다.</p>
        </section>
        <span class="g-calc-op" aria-hidden="true">×</span>
        <section class="g-calc-col">
          <h3 class="g-h3">② 배율</h3>
          <ul class="g-parts">
            ${mults}
            <li class="is-extra"><b>운</b><i>${mult(luckMult)}</i><span>운 ${STATS.luck} × ${pct(LUCK_MULT)}</span></li>
          </ul>
          <p class="g-calc-sum">합계 <b>${mult(normal.mult)}</b></p>
          <p class="g-note g-tight">배율 풀은 <b>더해서</b> 한 번, 관용구·공명·운은 <b>곱해서</b> 붙는다. 상한은 없다.</p>
        </section>
        <span class="g-calc-op" aria-hidden="true">=</span>
        <section class="g-calc-col g-calc-out">
          <h3 class="g-h3">③ 결과</h3>
          <p class="g-result"><b>${damageOf(normal.mult)}</b><span>피해</span></p>
          <p class="g-result is-crit"><b>${damageOf(crit.mult)}</b><span>대성공 ${pct(odds.critP)} 확률</span></p>
          <p class="g-note g-tight">대성공은 문장 전체를 ${mult(ROULETTE.crit)}로 만든다.</p>
        </section>
      </div>

      <div class="g-split">
        <section class="g-panel">
          <h3 class="g-h3">대성공 확률</h3>
          <p>수식 카드가 가진 확률에 <b>기준 스탯 1당 ${pct(CRIT_STAT_K)}</b>가 더해진다. 기준 스탯은 수식이
            지정하며(힘껏 → ${STAT_NAME.atk}, 다정히 → ${STAT_NAME.guard}) 없으면 문장의 종류를 따른다.
            아무리 올려도 <b>${pct(CRIT_CAP)}</b>에서 수렴한다.</p>
          <p class="g-note g-tight">지금 예시: ${intent.critP ? pct(intent.critP) : '0%'} + ${statBias} × ${pct(CRIT_STAT_K)} = <b>${pct(odds.critP)}</b></p>
        </section>
        <section class="g-panel">
          <h3 class="g-h3">고르면 손해인 카드는 없다</h3>
          <p>실패·자해·부조화 페널티는 전부 없앴다. 선택지는 손해와 이득이 아니라
            <b>이득의 종류</b>로 갈린다. 큰 격차는 벌점이 아니라 좋은 맥락에 붙는 큰 배수에서 나온다.</p>
          <p class="g-note g-tight">함께 성립할 수 없는 조합만 뒤 카드를 잠그고, 그때는 이유를 카드에 그대로 적는다.</p>
        </section>
      </div>`
  }

  /* ── 04 감정과 맥락 ─────────────────────────────────────────── */

  private pageContext(): string {
    const emotions: Emotion[] = ['joy', 'anger', 'sorrow', 'pleasure']
    const emotionCards = emotions.map((emotion) => {
      const sample = Object.values(EARLY_WORDS).flat().find((word) => word.emotion === emotion)
      return `<li class="g-emotion emotion-${emotion}">
          <span class="g-emotion-head">${emotionBadgeContent(emotion)}</span>
          ${sample ? `<small>예: ${sample.text}</small>` : ''}
        </li>`
    }).join('')

    const comboRow = (combo: Combo) => {
      const cards = combo.need.map((tag) => TAG_SAMPLE.get(tag) ?? tag).join(' + ')
      return `<li><b>「${combo.name}」</b><i>${mult(combo.mult)}</i><span>${cards}</span></li>`
    }
    const combos = [...TABLES.combos].sort((a, b) => b.mult - a.mult)

    return `
      <div class="g-split">
        <section class="g-panel">
          <h3 class="g-h3">감정 공명</h3>
          <ul class="g-emotions">${emotionCards}</ul>
          <p>한 문장에 같은 감정이 <b>2장이면 ${mult(EMOTION_RESONANCE.pair)}</b>,
            <b>3장이면 ${mult(EMOTION_RESONANCE.triple)}</b>가 곱해진다. 겹주어·겹동사로 더 모이면
            한 장마다 <b>+${EMOTION_RESONANCE.perExtra.toFixed(2)}</b>씩 계속 쌓인다. 주어도 함께 센다.</p>
          <p class="g-note g-tight"><b>${EMOTION_LABEL.neutral}</b> 카드는 효과는 그대로지만 공명 수에는 세지 않는다.</p>
        </section>
        <section class="g-panel">
          <h3 class="g-h3">적의 약점</h3>
          <p>적 체력바 옆에 감정이 떠 있으면 그게 약점이다. 그 감정을 문장에 실으면 피해가
            <b>${mult(WEAKNESS_MULT)}</b>가 된다.</p>
          <p>부위가 나뉜 보스는 <b>지금 드러난 부위</b>의 약점만 통하고, 맞히면 <b>${mult(PART_WEAKNESS_MULT)}</b>다.
            약점을 빗나간 공격은 아무리 세도 그 부위에서 멈춘다.</p>
          <p class="g-note g-tight">약점과 관용구를 <b>함께</b> 맞힌 문장만 남은 피해로 다음 부위까지 관통한다.</p>
        </section>
      </div>

      <h3 class="g-h3">완벽한 맥락 — 관용구 ${combos.length}종</h3>
      <p class="g-lead g-tight">카드마다 보이지 않는 태그가 붙어 있고, 한 문장 안에 필요한 태그가 모두 모이면
        이름 있는 관용구가 터진다. 지금 덱으로 만들 수 있는 조합은 전부 아래에 있다 — 배율은 곱해서 붙는다.</p>
      <ul class="g-combos">${combos.map(comboRow).join('')}</ul>`
  }

  /* ── 05 공격과 방어 ─────────────────────────────────────────── */

  private pageCombat(): string {
    const falloff = TARGET_FALLOFF.map((v) => pct(v)).join(' · ')
    const spread = specialWord('scatterThree')
    const flurry = specialWord('flurry')
    const pierce = specialWord('pierceStrike')
    const counter = specialWord('counterOne')
    const counterMult = counter?.effects?.counterMultiplier ?? 0
    const roach = ENEMIES.roach
    const pillbug = ENEMIES.pillbug
    const mosquito = ENEMIES.mosquito

    return `
      <div class="g-cardrow g-cardrow-tight">
        ${cardSlot(spread, '<b>범위</b><span>여러 명을 한 번에</span>')}
        ${cardSlot(flurry, '<b>연타</b><span>한 명을 여러 번</span>')}
        ${cardSlot(pierce, '<b>관통</b><span>방어를 지나쳐</span>')}
        ${cardSlot(counter, '<b>카운터</b><span>막은 만큼 되돌려</span>')}
      </div>

      <div class="g-split">
        <section class="g-panel">
          <h3 class="g-h3">내가 때리는 방식</h3>
          <ul class="g-bullets">
            <li><b>2명·3명</b> — 앞줄부터 <b>${falloff}</b>로 피해가 줄어든다.</li>
            <li><b>전체</b> — 살아 있는 모든 적을 같은 위력으로 때린다.</li>
            <li><b>2연타·3연타</b> — 최전방 하나만 여러 번 때린다. 쓰러지면 남은 타격은 다음 적으로 넘어가지 않는다.</li>
            <li><b>관통</b> — 적의 방어막을 지나쳐 체력에 직접 꽂히고, 방어막을 깎지도 않는다.</li>
            <li><b>다음 턴 발동</b> — 타격 수·범위·관통·감정까지 그대로 보존해 다음 턴에 실행한다.</li>
            <li>단일 공격이 적을 넘겨 죽이면 <b>초과 피해가 뒷줄로 관통</b>한다.</li>
          </ul>
        </section>
        <section class="g-panel">
          <h3 class="g-h3">적이 두르는 것</h3>
          <ul class="g-bullets">
            <li><b>방어막</b> — 피해를 먼저 받아 낸다. ${roach ? `${josa(roach.name, '은', '는')} 방어 ${roach.guard}짜리 껍질을 두르고 나온다.` : ''}</li>
            <li><b>매직실드</b> — 한 타격을 통째로 막고 1겹이 사라진다. 관통도 넘지 못하니 <b>연타</b>로 먼저 벗긴다.
              ${pillbug ? `${josa(pillbug.name, '이', '가')} 1겹을 들고 나온다.` : ''}</li>
            <li><b>관통하는 적</b> — ${mosquito ? `${mosquito.name}처럼` : '일부 적은'} 내 방어막을 소모시키지 않고 체력에 직접 꽂는다.</li>
            <li>보스는 저마다 방어를 무력화하는 수단을 하나씩 갖는다. 대신 반드시 미리 읽히게 예고하고,
              왼쪽 토큰이 붉은 쪽지로 경고한다.</li>
          </ul>
        </section>
      </div>

      <div class="g-split">
        <section class="g-panel">
          <h3 class="g-h3">내 방어막</h3>
          <ul class="g-bullets">
            <li>피해를 <b>흡수한 만큼만</b> 줄어들고 남은 양은 그대로 유지된다.</li>
            <li>새 방어는 기존 방어에 <b>합산</b>되며, <b>최대 체력만큼</b>까지 비축할 수 있다.</li>
            <li>체력과 방어막은 <b>다음 스테이지에도 그대로 이어진다.</b> 스테이지가 바뀐다고 회복되지 않는다.</li>
          </ul>
        </section>
        <section class="g-panel">
          <h3 class="g-h3">카운터</h3>
          <p>방어 문장에 카운터가 붙어 있으면, 방어막이 <b>실제로 흡수한 피해</b>에 계수를 곱해
            즉시 최전방 적에게 되돌린다.</p>
          ${counterMult ? `<p class="g-example">방어로 <b>4</b>를 막고 카운터 ${mult(counterMult)} → <b>${Math.round(4 * counterMult)}</b> 피해</p>` : ''}
          <p class="g-note g-tight">방어막이 상한에 걸려 비축량이 0이어도, 그 턴을 방어에 썼다면 카운터는 살아 있다.</p>
        </section>
      </div>`
  }

  /* ── 06 여정과 보상 ─────────────────────────────────────────── */

  private pageJourney(): string {
    const bosses = Object.entries(BOSS_BY_FLOOR)
      .map(([floor, id]) => ({ floor: Number(floor), def: ENEMIES[id] }))
      .filter((entry) => !!entry.def)
      .sort((a, b) => a.floor - b.floor)

    const normals = ['termite', 'moth', 'flea', 'roach', 'pillbug', 'mosquito']
      .map((id) => ENEMIES[id])
      .filter((def) => !!def)

    const stages = [1, 2, 3] as const
    const bossStages = stages.map((stage) => `<li><b>${stage}단계</b><i>${mult(BOSS_ATTACK_MULTIPLIER[stage])}</i></li>`).join('')

    // 감탄사는 칸마다 기본 1점, 거기에 등급 보너스가 무작위 칸으로 흩어져 얹힌다.
    const budget = (rarity: keyof typeof EXCLAIM_RARITY_BONUS) =>
      EXCLAIM_SLOTS.length + EXCLAIM_RARITY_BONUS[rarity]

    return `
      <p class="g-lead">한 권은 <b>${STORY_FLOORS}층</b>이다. 층이 오를수록 벌레가 늘고(최대 <b>${MAX_ENCOUNTER}마리</b>)
        개체 체력도 함께 오른다. ${STORY_FLOORS}층을 넘기면 같은 한 권을 더 강하게 다시 쓴다.</p>

      <h3 class="g-h3">길에서 만나는 벌레</h3>
      <ul class="g-foes">
        ${normals.map((def) => `<li><b>${def.name}</b><i>체력 ${def.hp} · 공격 ${def.atk}</i><span>${def.note ?? ''}</span></li>`).join('')}
      </ul>

      <div class="g-split">
        <section class="g-panel">
          <h3 class="g-h3">보스</h3>
          <ul class="g-bosses">
            ${bosses.map(({ floor, def }) => `<li><b>${floor}층 · ${def.name}</b><i>체력 ${bossHealthBarsForFloor(floor)}막</i></li>`).join('')}
          </ul>
          <p class="g-note g-tight">보스는 남은 체력이 2/3, 1/3 아래로 내려갈 때마다 공격이 함께 세진다.</p>
          <ul class="g-chips">${bossStages}</ul>
        </section>
        <section class="g-panel">
          <h3 class="g-h3">승리 뒤 보상</h3>
          <ul class="g-bullets">
            <li><b>주어·수식 → 아이템 → 동사</b> 순서로 세 번, 각각 세 장 중 하나를 고른다.</li>
            <li>이미 가진 단어를 다시 얻으면 덱에 겹쳐 쌓이지 않고 <b>반복강화</b>로 단계가 오른다.</li>
            <li>아낀 카드 뽑기 횟수는 <b>보상등급</b>이 되고, 운 스탯은 등급의 바닥을 올린다.</li>
            <li>보스를 잡은 층에서는 등급이 높은 스킬카드가 최소 한 장 보장된다.</li>
          </ul>
        </section>
      </div>

      <h3 class="g-h3">아이템은 감탄사로 완성된다</h3>
      <p class="g-lead g-tight">아이템의 기본 스탯은 모두 <b>0</b>이다. 소년이 붙이는
        <b>${EXCLAIM_SLOTS.map((slot) => slot.label).join(' → ')}</b> 세 마디가 실제 능력치를 정한다.
        같은 검도 평범한 소품이 되기도, 용사의 성검이 되기도 한다.</p>
      <ul class="g-chips g-chips-wide">
        ${(['common', 'rare', 'epic', 'legendary'] as const).map((rarity) =>
          `<li><b>${RARITY_LABEL[rarity]}</b><i>${budget(rarity)}점</i></li>`).join('')}
      </ul>
      <p class="g-note">세 마디는 저마다 <b>1점</b>을 보장하고, 등급 보너스가 그 위에 무작위 칸으로
        얹힌다 — 어느 마디가 크게 터질지는 골라 보기 전까지 모른다.
        영웅·전설 아이템은 여기에 <b>문장 규칙 자체를 바꾸는 고유효과</b>까지 더한다 —
        칸을 하나 더 열거나, 동사를 둘로 가르거나, 문장 끝에 물음표를 붙이는 식이다.</p>`
  }
}
