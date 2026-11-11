/**
 * 점수 재기획안 단위 검사 (SCORE_REDESIGN.md §4·§5·§15의 예시 수치를 그대로 확인한다).
 * 실행: npm run score:check
 */
import { SCORE_CARDS, startingStats } from '../score/data'
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
  check('15층 보스 목표 90,000', planStage(15).target === 90000)
  check('6층 장마 기회 10', planStage(6).chances === 10)
  const st = startStage(planStage(1), loadout({ startTears: 3 }, ['diary']))
  check('시작 눈물 = 스탯 3 + 낡은 일기장 3', st.tears === 6)
}

console.log(`score:check — 통과 ${passes} · 실패 ${failures}`)
if (failures) process.exit(1)
