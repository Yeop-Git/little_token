/**
 * 점수 재기획안 단위 검사 (SCORE_REDESIGN.md §4·§5·§15의 예시 수치를 그대로 확인한다).
 * 실행: npm run score:check
 */
import { MAX_LEVEL, SCORE_CARDS, card as cardDef, leveled, startingStats } from '../score/data'
import { ScoreRun } from '../score/run'
import { HEART_TRADES, MIN_SLOT_CARDS } from '../score/shop'
import { critInfo, expectedRoller, expectedScore, scoreSentence, validatePick } from '../score/scoring'
import { applySentence, planStage, startStage } from '../score/stage'
import type { DeckCard, ScoreLoadout, ScoreStats, SentencePick, StageContext } from '../score/types'
import { EMPTY_CARRY, SCORE_EMOTIONS } from '../score/types'

let failures = 0
let passes = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) passes++
  else { failures++; console.error(`✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps

let uid = 0
const dc = (cardId: string, sticker?: string): DeckCard => ({ uid: ++uid, cardId, sticker, level: 0 })
const pick = (s: string, a: string | undefined, v: string, st: { s?: string; a?: string; v?: string } = {}): SentencePick => ({
  subj: dc(s, st.s), adv: a ? dc(a, st.a) : undefined, verb: dc(v, st.v),
})
const loadout = (stats: Partial<ScoreStats> = {}, relics: string[] = []): ScoreLoadout => ({
  stats: { ...startingStats(), ...stats }, relics,
})
const ctx = (over: Partial<StageContext> = {}): StageContext => ({
  formId: 'standard', weatherIds: ['clear'], chancesTotal: 3, chancesLeft: 3, sentencesUsed: 0, tears: 0,
  history: [], carry: { ...EMPTY_CARRY }, emotionsUsed: [...SCORE_EMOTIONS], angerWordsUsed: 0, wordUses: {},
  stageAdd: 0, oncePerStageUsed: [], ...over,
})
const NO_CRIT = 1
const CRIT = 0

// 데이터 모양.
check('카드 75장', SCORE_CARDS.length === 75)
check('시작 덱은 칸마다 3장', ['subj', 'adv', 'verb'].every((s) => SCORE_CARDS.filter((c) => c.slot === s && c.start).length === 3))

// 모든 카드가 효과 분기를 가진다(던지지 않는다).
for (const c of SCORE_CARDS) {
  const p = c.slot === 'subj' ? pick(c.id, 'dandan', 'gamssat') : c.slot === 'adv' ? pick('na', c.id, 'gamssat') : pick('na', 'dandan', c.id)
  try {
    const r = scoreSentence(p, ctx({ chancesLeft: 3, tears: 5 }), loadout(), expectedRoller, NO_CRIT)
    check(`${c.name} 점수는 유한한 양수`, Number.isFinite(r.score) && r.score > 0, String(r.score))
  } catch (e) {
    check(`${c.name} 효과 분기`, false, String(e))
  }
}

// §4-1: 배율 1에서 주어 +0.5, 수식어 ×1.5 → 2.25.
{
  const r = scoreSentence(pick('na', 'aesseo', 'ttaeryeot'), ctx({ tears: 3 }), loadout(), expectedRoller, NO_CRIT)
  check('§4-1 가산 뒤 곱셈 = 2.25', near(r.mult, 2.25), String(r.mult))
  check('§4-1 칩 = 분노 10 × 1.0', near(r.chips, 10), String(r.chips))
  check('애써는 눈물 3 소모', r.tearsAfter === 0, String(r.tearsAfter))
}

// §4-4: 배율 2에서 [밑줄, 느낌표, 각주] = 5.625, [느낌표, 밑줄, 각주] = 4.0.
{
  const base = () => ctx({ weatherIds: ['calm'] })
  const p = pick('sebeon', 'dwiseok', 'ttaeryeot')
  const a = scoreSentence(p, base(), loadout({ baseAdd: 1 }, ['underline', 'exclaim', 'footnote']), expectedRoller, NO_CRIT)
  const b = scoreSentence(p, base(), loadout({ baseAdd: 1 }, ['exclaim', 'underline', 'footnote']), expectedRoller, NO_CRIT)
  check('§4-4 [밑줄, 느낌표, 각주] = 5.625', near(a.mult, 5.625), String(a.mult))
  check('§4-4 [느낌표, 밑줄, 각주] = 4.0', near(b.mult, 4.0), String(b.mult))
}

// §3 감정 공명: 같은 감정 3장 ×1.30.
{
  const r = scoreSentence(pick('na', 'dandan', 'gamssat'), ctx(), loadout(), expectedRoller, NO_CRIT)
  check('공명 3장 ×1.30 단계가 있다', r.steps.some((s) => s.source === 'resonance' && s.label.includes('3장')))
  const calm = scoreSentence(pick('na', 'bangap', 'gamssat'), ctx({ weatherIds: ['calm'] }), loadout(), expectedRoller, NO_CRIT)
  check('무풍은 공명을 끈다', !calm.steps.some((s) => s.source === 'resonance'))
  const wild = scoreSentence(pick('utneun', 'himkkeot', 'ttaeryeot'), ctx(), loadout(), expectedRoller, NO_CRIT)
  check('웃는 나는은 공명 와일드', wild.steps.some((s) => s.source === 'resonance' && s.label.includes('3장')))
}

// §15 새 물감: 처음 쓰는 감정마다 ×1.15.
{
  const r = scoreSentence(pick('hwanan', 'kkuk', 'gamssat'), ctx({ emotionsUsed: [] }), loadout(), expectedRoller, NO_CRIT)
  const paint = r.steps.find((s) => s.source === 'paint')
  check('새 물감 3색', !!paint && paint.label.includes('3색'))
}

// §5 대성공: 기본 5%, 60%에서 수렴, 안개는 0.
{
  const p = pick('sinnan', 'deulsseok', 'deonjyeot', { v: 'guna' })
  check('대성공 60% 수렴', near(critInfo(p, ctx(), loadout({ crit: 0.5 })).chance, 0.6))
  check('들썩이며 대성공 배율 1.8', near(critInfo(p, ctx(), loadout()).mult, 1.8))
  check('안개는 대성공 없음', critInfo(p, ctx({ weatherIds: ['fog'] }), loadout()).chance === 0)
  check('기본 대성공 5%', near(critInfo(pick('na', 'dandan', 'gamssat'), ctx(), loadout()).chance, 0.05))
  const r = scoreSentence(pick('deultteun', 'dandan', 'gamssat'), ctx(), loadout(), expectedRoller, CRIT)
  check('들뜬 우리는 대성공이면 가산 ×2', near(r.subjectAdd, 0.6), String(r.subjectAdd))
}

// §2 날씨 제약과 열리는 길.
{
  const rain = ctx({ weatherIds: ['rain'] })
  check('폭우: 분노 단어 막힘', !validatePick(pick('hwanan', 'bangap', 'gamssat'), rain).ok)
  check('폭우: 하필이면은 막힌 감정을 연다', validatePick(pick('hwanan', 'hapil', 'ttaeryeot'), rain).ok)
  check('폭우: -조차 스티커', validatePick(pick('hwanan', 'dandan', 'gamssat', { s: 'jocha' }), rain).ok)
  check('폭우: 아무개는 제약 하나 무시', validatePick(pick('amugae', 'dandan', 'ttaeryeot'), rain).ok)
  check('폭우: 단단히는 제약 하나 무시', validatePick(pick('hwanan', 'dandan', 'gamssat'), rain).ok)
  check('폭우: 기쁨 문장은 통과', validatePick(pick('na', 'bangap', 'gamssat'), rain).ok)
  const drowsy = ctx({ weatherIds: ['drowsy'] })
  check('졸음: 수식어 있으면 막힘', !validatePick(pick('na', 'bangap', 'gamssat'), drowsy).ok)
  check('졸음: 수식어 없이 통과', validatePick(pick('na', undefined, 'gamssat'), drowsy).ok)
  check('맑음: 수식어 없으면 막힘', !validatePick(pick('na', undefined, 'gamssat'), ctx()).ok)
  const gust = ctx({ weatherIds: ['gust'] })
  check('돌풍: 같은 감정 3장 막힘', !validatePick(pick('na', 'bangap', 'gamssat'), gust).ok)
  const hail = ctx({ weatherIds: ['hail'], wordUses: { na: 2 } })
  check('우박: 같은 단어 2번까지', !validatePick(pick('na', 'kkuk', 'ureot'), hail).ok)
  const eclipse = scoreSentence(pick('hwanan', 'kkuk', 'ureot'), ctx({ weatherIds: ['eclipse'] }), loadout(), expectedRoller, NO_CRIT)
  check('일식: 주어 가산 0', eclipse.subjectAdd === 0)
}

// §6 동사 기회 비용.
{
  check('남은 기회 1이면 기회 2 동사 잠김', !validatePick(pick('na', 'dandan', 'nallyeo'), ctx({ chancesLeft: 1 })).ok)
  check('남은 기회 2면 기회 2 동사 가능', validatePick(pick('na', 'dandan', 'nallyeo'), ctx({ chancesLeft: 2 })).ok)
  const r = scoreSentence(pick('na', 'jaeppal', 'ttaeryeot'), ctx(), loadout(), expectedRoller, CRIT)
  check('재빨리: 대성공이면 기회를 쓰지 않음', r.chanceSpent === 0)
  const again = scoreSentence(pick('na', 'jaeppal', 'ttaeryeot'), ctx({ oncePerStageUsed: ['jaeppal'] }), loadout(), expectedRoller, CRIT)
  check('재빨리: 스테이지당 1번', again.chanceSpent === 1)
}

// 문장 사이 효과.
{
  const first = scoreSentence(pick('ttatteut', 'naepda', 'gamssat'), ctx(), loadout(), expectedRoller, NO_CRIT)
  check('따뜻한 우리는 + 냅다(첫 문장) = ×1.8²', first.steps.filter((s) => s.source === 'adv').length === 2)
  const tears = scoreSentence(pick('gogae', 'kkuk', 'ureot'), ctx(), loadout(), expectedRoller, NO_CRIT)
  check('눈물: 고개 숙인 2 + 꾹 1 + 울었다 2 = 5', tears.tearsAfter === 5, String(tears.tearsAfter))
  const s1 = scoreSentence(pick('hwanan', 'himkkeot', 'ttaeryeot'), ctx(), loadout(), expectedRoller, NO_CRIT)
  const c2 = applySentence(ctx(), s1)
  const s2 = scoreSentence(pick('eoje', 'kkuk', 'ureot'), c2, loadout(), expectedRoller, NO_CRIT)
  check('어제의 나는: 직전 주어 가산을 이어받음', near(s2.subjectAdd, s1.subjectAdd), `${s2.subjectAdd} vs ${s1.subjectAdd}`)
  const lg = scoreSentence(pick('na', 'dandan', 'gamssat', { v: 'lgeot' }), ctx(), loadout(), expectedRoller, NO_CRIT)
  check('-ㄹ 것이다: 다음 문장 ×1.5 예약', near(lg.carry.mult, 1.5))
  const lgLast = scoreSentence(pick('na', 'dandan', 'gamssat', { v: 'lgeot' }), ctx({ chancesLeft: 1 }), loadout(), expectedRoller, NO_CRIT)
  check('-ㄹ 것이다: 마지막 기회에선 ×1.0', !lgLast.steps.some((s) => s.source === 'sticker') && near(lgLast.carry.mult, 1))
}

// 기댓값 굴림.
{
  const r = scoreSentence(pick('na', 'sinnage', 'gamssat'), ctx({ weatherIds: ['calm'] }), loadout(), expectedRoller, NO_CRIT)
  check('신나게 기댓값 ×1.3', r.steps.some((s) => s.source === 'adv' && near(s.mult, 1.5 * 1.3)))
  const ev = expectedScore(pick('na', 'dandan', 'gamssat'), ctx(), loadout())
  check('기댓값 점수는 양수', ev > 0)
}

// §1 목표 곡선과 스테이지 진행.
{
  check('1층 목표 48', planStage(1).target === 48, String(planStage(1).target))
  check('모든 층의 목표와 기회가 양수', Array.from({ length: 15 }, (_, i) => planStage(i + 1)).every((p) => p.target > 0 && p.chances > 0))
  check('6층 장마 기회 10', planStage(6).chances === 10)
  const st = startStage(planStage(1), loadout({ startTears: 3 }, ['diary']))
  check('시작 눈물 = 스탯 3 + 낡은 일기장 3', st.tears === 6)
}

// 반복강화: grow 소문자는 값 전체, 대문자는 1을 넘는 몫만 키운다. 상한은 MAX_LEVEL.
{
  const na = cardDef('na')
  check('강화 1단계: 나는 가산 0.5 → 0.6', near(leveled(na, 1).a, 0.6))
  check('강화는 MAX_LEVEL에서 멈춘다', near(leveled(na, MAX_LEVEL + 5).a, leveled(na, MAX_LEVEL).a))
  const upper = SCORE_CARDS.find((c) => /[A-D]/.test(c.grow ?? ''))
  if (upper) {
    const key = (upper.grow!.match(/[A-D]/)![0].toLowerCase()) as 'a' | 'b' | 'c' | 'd'
    check('대문자 grow: 1을 넘는 몫만 20%', near(leveled(upper, 1)[key], 1 + (upper[key] - 1) * 1.2), `${upper.id}.${key}`)
  }
  const none = SCORE_CARDS.find((c) => !c.grow)
  if (none) check('grow가 없으면 그대로', leveled(none, 3) === none)
  const base = scoreSentence(pick('na', 'dandan', 'gamssat'), ctx(), loadout(), expectedRoller, NO_CRIT)
  const p2 = pick('na', 'dandan', 'gamssat'); p2.subj.level = 2
  const up = scoreSentence(p2, ctx(), loadout(), expectedRoller, NO_CRIT)
  check('강화한 카드는 점수가 오른다', up.score > base.score, `${base.score} → ${up.score}`)
}

// 겹주어·겹동사: 유물이 있어야 둘째 칸을 쓸 수 있고, 둘째 동사는 절반 칩.
{
  const one = pick('na', 'dandan', 'gamssat')
  const twoS: SentencePick = { ...pick('na', 'dandan', 'gamssat'), subj2: dc('hwanan') }
  const tr = new ScoreRun(1)
  check('겹주어 유물 없이 둘째 주어는 막힌다', !tr.validate(twoS).ok)
  tr.relics.push('twinSubj')
  check('겹주어 유물이 있으면 놓인다', tr.validate(twoS).ok)
  const r1 = scoreSentence(one, ctx(), loadout({}, ['twinSubj']), expectedRoller, NO_CRIT)
  const r2 = scoreSentence(twoS, ctx(), loadout({}, ['twinSubj']), expectedRoller, NO_CRIT)
  check('둘째 주어의 가산이 더해진다', r2.score > r1.score, `${r1.score} → ${r2.score}`)
  const twoV: SentencePick = { ...pick('na', 'dandan', 'gamssat'), verb2: dc('ttaeryeot') }
  check('겹동사 유물 없이 둘째 동사는 막힌다', !tr.validate(twoV).ok)
  const v1 = scoreSentence(one, ctx(), loadout({}, ['twinVerb']), expectedRoller, NO_CRIT)
  const v2 = scoreSentence(twoV, ctx(), loadout({}, ['twinVerb']), expectedRoller, NO_CRIT)
  check('둘째 동사는 절반 칩을 더한다', near(v2.chips - v1.chips, startingStats().anger * 0.5), `${v1.chips} → ${v2.chips}`)
}

// 런 엔진: 같은 씨앗은 같은 런, 전투 → 상점 → 재련 → 다음 층.
{
  const playOut = (seed: number) => {
    const run = new ScoreRun(seed)
    let guard = 0
    while (run.phase === 'battle' && run.floor === 1 && guard++ < 50) {
      if (!run.rescueHand()) break
      const best = run.handPicks().sort((a, b) => run.preview(b) - run.preview(a))[0]
      run.play(best)
    }
    return run
  }
  const a = playOut(11)
  const b = playOut(11)
  check('씨앗이 같으면 같은 런', a.money === b.money && a.stage.scored === b.stage.scored && JSON.stringify(a.shop?.stock) === JSON.stringify(b.shop?.stock))
  check('1층을 넘기면 상점', a.phase === 'shop' && !!a.shop && a.money > 0, a.phase)
  check('상점은 다음 두 층을 예보한다', a.shop!.forecast.length === 2 && a.shop!.forecast[0].floor === 2)

  // 살 수 없는 것은 막힌다.
  const dear = a.shop!.stock.find((o) => o.price > a.money)
  if (dear) check('돈이 모자라면 못 산다', !a.buy(dear))
  // 단어 사기.
  a.money = 99
  const word = a.shop!.stock.find((o) => o.kind === 'word' && o.upgradeUid == null)
  if (word) {
    const n = a.deck.length
    const m = a.money
    check('단어를 사면 단어장에 들어간다', a.buy(word) && a.deck.length === n + 1 && a.money === m - word.price)
  }
  // 소품 → 재련 3칸 → 상점 복귀.
  const item = a.shop!.stock.find((o) => o.kind === 'item')
  if (item) {
    const before = JSON.stringify(a.stats)
    check('소품을 사면 재련이 열린다', a.buy(item) && (a.phase as string) === 'forge' && !!a.forge)
    let steps = 0
    while ((a.phase as string) === 'forge' && steps++ < 5) a.forgeChoose(a.forge!.choices[a.forge!.step][0].id)
    check('재련은 세 칸을 고르면 끝난다', steps === 3 && (a.phase as string) === 'shop')
    check('재련이 스탯을 올린다', JSON.stringify(a.stats) !== before)
  }
  // 칸마다 최소 장수는 지킨다.
  const subj = a.deck.filter((c) => cardDef(c.cardId).slot === 'subj')
  let sold = 0
  for (const c of subj) if (a.sell(c.uid)) sold++
  check('칸의 단어는 최소 장수 아래로 못 판다', a.deck.filter((c) => cardDef(c.cardId).slot === 'subj').length === MIN_SLOT_CARDS && sold === subj.length - MIN_SLOT_CARDS)
  // 하트 거래: 현재 하트로 내고 마지막 하트는 못 낸다.
  const pieces = a.pieces
  const m2 = a.money
  check('환전: 조각을 내고 돈을 받는다', a.trade('exchange') && a.pieces === pieces - HEART_TRADES.exchange.pieces && a.money > m2)
  while (a.canTrade('exchange').ok) a.trade('exchange')
  check('하트 거래는 마지막 하트를 남긴다', a.pieces >= 1 && !a.canTrade('exchange').ok, String(a.pieces))
  check('상점을 나서면 2층 전투', a.leaveShop() && a.floor === 2 && (a.phase as string) === 'battle')

  // 구제: 손패로 문장을 못 만들면 새로 뽑는다.
  const r = new ScoreRun(5)
  check('시작 손패로 문장을 만들 수 있다', r.rescueHand() && r.handPicks().length > 0)
  // 연장전: 기회를 다 쓰면 하트를 낸다.
  r.stage.ctx = { ...r.stage.ctx, chancesLeft: 0 }
  r.stage.plan = { ...r.stage.plan, target: 1e12 }
  const hp = r.pieces
  r.play(r.handPicks()[0])
  check('연장전은 하트 조각을 깎는다', r.pieces < hp, `${hp} → ${r.pieces}`)
}

console.log(`score:check — 통과 ${passes} · 실패 ${failures}`)
if (failures) process.exit(1)
