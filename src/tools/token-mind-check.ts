/**
 * 토큰의 자아 계약 검사 — 기분·유대·성향의 시간 축이 서로 섞이지 않는지, 그리고
 * 학습이 손으로 잡은 결의 감각을 뒤집지 못하는지 확인한다.
 *
 * 여기서 지키는 건 수치가 아니라 성격이다. "맞았는데 신나서 날아다닌다" 같은 첫인상은
 * 학습으로 고칠 게 아니라 애초에 일어나지 않아야 한다.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { STORAGE_PREFIX } from '@core/save'
import {
  BOND_EVENT_KEYS,
  MOOD_EVENT_KEYS,
  STOOD_BY_DISTANCE,
  STOOD_BY_HP_RATIO,
  stoodByThroughDanger,
  TOKEN_MIND_KEY,
  TOKEN_MIND_VERSION,
  TokenMind,
  type MindStorage,
} from '@core/tokenMind'
import {
  POLICY_ACTIONS,
  TOKEN_FEATURE_COUNT,
  TOKEN_POLICY_KEY,
  TokenPolicy,
  episodeReward,
  softmax,
  tokenFeatures,
  type TokenContext,
} from '@core/tokenPolicy'
import { TOKEN_STYLE_KEY, TOKEN_STYLE_VERSION, TokenPlaystyle } from '@core/tokenPlaystyle'

/** 검사용 저장소 한 장. 브라우저의 localStorage 자리를 그대로 메운다. */
class MemoryStorage implements MindStorage {
  private readonly map = new Map<string, string>()
  getItem(key: string) {
    return this.map.get(key) ?? null
  }
  setItem(key: string, value: string) {
    this.map.set(key, value)
  }
  raw() {
    return this.map
  }
}

// ── 기분: 런 안에서만 살고, 평정으로 돌아온다 ────────────────────────────────

{
  const mind = new TokenMind(new MemoryStorage())
  assert.equal(mind.mood, 0, '새 토큰의 기분은 평정에서 시작한다')

  mind.feel('playerHurt')
  assert(mind.mood < 0, '프롬이 맞으면 기분이 가라앉는다')
  assert.equal(mind.isWorried, true, '맞은 직후에는 걱정 상태가 된다')

  const hurt = mind.mood
  mind.passTurn()
  assert(mind.mood > hurt, '턴이 지나면 기분이 평정으로 조금 돌아온다')

  mind.feel('comboFired')
  assert(mind.mood > hurt, '맥락이 맞물리면 기분이 오른다')

  for (let i = 0; i < 200; i++) mind.feel('playerNearDeath')
  assert(mind.mood >= -1, '기분은 -1 아래로 내려가지 않는다')
  for (let i = 0; i < 400; i++) mind.feel('runCleared')
  assert(mind.mood <= 1, '기분은 1 위로 올라가지 않는다')

  mind.beginRun()
  assert.equal(mind.mood, 0, '새 런은 기분을 평정에서 다시 시작한다')
  assert.equal(mind.isWorried, false, '새 런은 지난 런의 걱정을 물려받지 않는다')
}

// ── 유대: 런을 넘어 남고, 줄지 않는다 ────────────────────────────────────────

{
  const storage = new MemoryStorage()
  const mind = new TokenMind(storage)
  const start = mind.bond
  mind.bindCloser('adviceHeard')
  assert(mind.bond > start, '조언을 끝까지 들려주면 유대가 는다')

  const grown = mind.bond
  mind.beginRun()
  assert.equal(mind.bond, grown, '새 런이 유대를 되돌리지 않는다')
  mind.feel('runLost')
  assert.equal(mind.bond, grown, '런이 무너져도 유대는 줄지 않는다')

  for (let i = 0; i < 500; i++) mind.bindCloser('bossDown')
  assert(mind.bond <= 1, '유대는 1을 넘지 않는다')

  // 저장을 거쳐 다시 읽어도 같은 값이어야 한다.
  const revived = new TokenMind(storage)
  assert.equal(revived.bond, mind.bond, '유대는 저장을 건너 살아남는다')
  assert.deepEqual(revived.traits, mind.traits, '성향도 저장을 건너 살아남는다')
}

// ── 성향과 기억: 런이 끝날 때만, 아주 조금 ──────────────────────────────────

{
  const mind = new TokenMind(new MemoryStorage())
  const before = { ...mind.traits }
  mind.feel('playerHurt')
  mind.passTurn()
  assert.deepEqual(mind.traits, before, '런 도중에는 성향이 움직이지 않는다')

  mind.endRun({ day: 4, outcome: 'defeat', cause: '사마귀' })
  assert(mind.traits.caution > before.caution, '무너진 런은 토큰을 조심스럽게 만든다')
  assert(mind.traits.playfulness < before.playfulness, '무너진 런은 장난기를 덜어 낸다')

  const afterDefeat = { ...mind.traits }
  mind.endRun({ day: 15, outcome: 'clear' })
  assert(mind.traits.caution < afterDefeat.caution, '살아남은 런은 겁을 덜어 준다')

  // 한 번의 런이 성격을 뒤집어서는 안 된다.
  assert(Math.abs(mind.traits.caution - 0.5) < 0.2, '두어 번의 런으로 성격이 뒤집히지 않는다')

  const memory = mind.recall()
  assert(memory, '런을 마쳤으면 떠올릴 기억이 있다')
  assert([4, 15].includes(memory.day), '회상은 실제로 겪은 층을 말한다')

  for (let i = 0; i < 40; i++) mind.endRun({ day: i, outcome: 'clear' })
  assert.equal(mind.snapshot().runs.length, 12, '기억은 12개까지만 남는다')
  assert.equal(mind.snapshot().runs[0].day, 39, '가장 최근 런이 맨 앞에 온다')
}

// ── 저장: 손상·구버전은 조용히 버린다 ────────────────────────────────────────

{
  const broken = new MemoryStorage()
  broken.setItem(TOKEN_MIND_KEY, '{망가진 JSON')
  const fromBroken = new TokenMind(broken)
  assert.equal(fromBroken.bond, 0, '손상된 저장은 기본값으로 떨어진다')

  const stale = new MemoryStorage()
  stale.setItem(TOKEN_MIND_KEY, JSON.stringify({ version: TOKEN_MIND_VERSION + 1, bond: 0.9 }))
  assert.equal(new TokenMind(stale).bond, 0, '구버전 저장은 되살리지 않는다')

  const insane = new MemoryStorage()
  insane.setItem(TOKEN_MIND_KEY, JSON.stringify({
    version: TOKEN_MIND_VERSION,
    bond: 42,
    traits: { curiosity: -5, caution: 'x', playfulness: 0.7 },
    runs: [{ day: 3, outcome: 'clear' }, { nope: true }],
    runsTogether: 2,
  }))
  const sane = new TokenMind(insane)
  assert(sane.bond >= 0 && sane.bond <= 1, '범위를 벗어난 유대는 잘라 낸다')
  assert(sane.traits.curiosity >= 0 && sane.traits.curiosity <= 1, '범위를 벗어난 성향은 잘라 낸다')
  assert.equal(sane.traits.caution, 0.5, '숫자가 아닌 성향은 기본값으로 되돌린다')
  assert.equal(sane.snapshot().runs.length, 1, '모양이 깨진 기억은 버린다')
}

// ── 관측 벡터: 길이와 범위가 저장 규약이다 ──────────────────────────────────

const neutral: TokenContext = {
  hpRatio: 1, recentlyHurt: false, enemyCount: 1, turnProgress: 0,
  mood: 0, bond: 0, curiosity: 0.5, caution: 0.5, playfulness: 0.5, hesitation: 0,
}

{
  const x = tokenFeatures(neutral)
  assert.equal(x.length, TOKEN_FEATURE_COUNT, '관측 벡터 길이는 계약이다')
  assert.equal(x[0], 1, '0번은 상수항이다')
  assert(x.every((v) => v >= 0 && v <= 1), '모든 관측은 0~1로 정규화된다')

  const wild = tokenFeatures({ ...neutral, hpRatio: 9, mood: -7, enemyCount: 99, hesitation: -3 })
  assert(wild.every((v) => v >= 0 && v <= 1), '범위를 벗어난 입력도 0~1로 잘린다')

  const probabilities = softmax([1, 2, 3, 4])
  assert(Math.abs(probabilities.reduce((a, b) => a + b, 0) - 1) < 1e-9, '소프트맥스 합은 1이다')
}

// ── 사전 성향: 배우기 전에도 알아야 하는 것들 ───────────────────────────────

{
  const policy = new TokenPolicy(new MemoryStorage(), () => 0.5)
  const at = (action: string, context: TokenContext) =>
    policy.distribution(context)[POLICY_ACTIONS.indexOf(action as never)]

  const calm = policy.distribution(neutral)
  assert.equal(calm.length, POLICY_ACTIONS.length, '결마다 확률이 하나씩 나온다')
  assert.equal(
    POLICY_ACTIONS[calm.indexOf(Math.max(...calm))],
    'orbit',
    '평상시 가장 흔한 결은 맴돌기다',
  )

  // 이 세 줄이 이 파일의 핵심이다 — 학습 이전에 지켜야 하는 성격.
  const hurt = { ...neutral, recentlyHurt: true, hpRatio: 0.2 }
  assert(at('orbit', hurt) > at('orbit', neutral), '프롬이 다치면 곁을 더 지킨다')
  assert(at('wander', hurt) < at('wander', neutral) * 0.5, '프롬이 다쳤는데 무대를 가로지르지 않는다')

  const hesitating = { ...neutral, hesitation: 1 }
  assert(at('orbit', hesitating) > at('orbit', neutral), '사람이 망설이면 곁에서 기다린다')
  assert(at('inspect', hesitating) < at('inspect', neutral), '고르는 사람 앞에서 딴 데를 들여다보지 않는다')

  const curious = { ...neutral, curiosity: 1 }
  assert(at('inspect', curious) > at('inspect', neutral), '호기심은 들여다보기로 나간다')
  const playful = { ...neutral, playfulness: 1, caution: 0 }
  assert(at('wander', playful) > at('wander', neutral), '장난기는 가로지르기로 나간다')
  const bonded = { ...neutral, bond: 1 }
  assert(at('peer', bonded) > at('peer', neutral), '유대가 깊을수록 사람 쪽을 자주 본다')
}

// ── 보상: 부호가 뜻하는 바는 하나뿐이다 ─────────────────────────────────────

{
  const safe = { tookDamage: false, distanceWhenHurt: 0, occludedHand: false, decidedQuickly: true }
  assert(episodeReward(safe) > 0, '무사히 지나가고 사람이 거침없이 골랐으면 좋은 구간이다')

  const far = { tookDamage: true, distanceWhenHurt: 900, occludedHand: false, decidedQuickly: false }
  const near = { tookDamage: true, distanceWhenHurt: 60, occludedHand: false, decidedQuickly: false }
  assert(episodeReward(far) < episodeReward(near), '맞는 순간 멀리 있었던 쪽이 더 나쁘다')
  assert(episodeReward(far) < 0, '곁에 없을 때 맞은 구간은 음수다')

  const blocking = { ...safe, occludedHand: true }
  assert(episodeReward(blocking) < episodeReward(safe), '고르는 동안 손패를 가리면 깎인다')
}

// ── 학습: 방향은 맞되, 결의 감각을 뒤집지는 못한다 ──────────────────────────

{
  const policy = new TokenPolicy(new MemoryStorage(), () => 0.999)
  const before = policy.distribution(neutral)

  // 마지막 결(peer)만 계속 뽑히게 해 놓고 계속 나쁜 구간을 돌려준다.
  const punished = { tookDamage: true, distanceWhenHurt: 900, occludedHand: true, decidedQuickly: false }
  for (let i = 0; i < 60; i++) {
    policy.choose(neutral)
    policy.learn(punished)
  }
  const after = policy.distribution(neutral)
  const peer = POLICY_ACTIONS.indexOf('peer')
  assert(after[peer] < before[peer], '벌을 받은 결은 덜 뽑히게 된다')

  // 그래도 "다치면 곁을 지킨다"는 뒤집히지 않는다 — 학습분에 상한이 있기 때문이다.
  const hurt = { ...neutral, recentlyHurt: true, hpRatio: 0.2 }
  const orbit = POLICY_ACTIONS.indexOf('orbit')
  const wander = POLICY_ACTIONS.indexOf('wander')
  assert(
    policy.distribution(hurt)[orbit] > policy.distribution(hurt)[wander],
    '아무리 배워도 다친 프롬을 두고 가로지르는 쪽이 우세해지지 않는다',
  )

  // 학습이 아무리 오래 돌아도 확률은 여전히 확률이다.
  const sum = policy.distribution(hurt).reduce((a, b) => a + b, 0)
  assert(Math.abs(sum - 1) < 1e-9, '학습 뒤에도 확률 합은 1이다')
  assert(policy.snapshot().delta.every((row) => row.every((v) => Math.abs(v) <= 1.2 + 1e-9)),
    '학습분은 상한을 넘지 않는다')
}

// ── 정책 저장: 차원이 어긋나면 되살리지 않는다 ──────────────────────────────

{
  const storage = new MemoryStorage()
  const trained = new TokenPolicy(storage, () => 0.1)
  for (let i = 0; i < 30; i++) {
    trained.choose(neutral)
    trained.learn({ tookDamage: false, distanceWhenHurt: 0, occludedHand: false, decidedQuickly: true })
  }
  const revived = new TokenPolicy(storage, () => 0.1)
  assert.deepEqual(revived.snapshot().delta, trained.snapshot().delta, '학습분은 저장을 건너 살아남는다')

  const mismatched = new MemoryStorage()
  mismatched.setItem(TOKEN_POLICY_KEY, JSON.stringify({
    ...trained.snapshot(),
    features: TOKEN_FEATURE_COUNT + 1,
  }))
  const fallback = new TokenPolicy(mismatched, () => 0.1)
  assert(
    fallback.snapshot().delta.every((row) => row.every((v) => v === 0)),
    '관측 차원이 어긋난 정책은 버리고 교사 정책에서 다시 시작한다',
  )

  const corrupt = new MemoryStorage()
  corrupt.setItem(TOKEN_POLICY_KEY, '{')
  assert(
    new TokenPolicy(corrupt, () => 0.1).snapshot().delta.every((row) => row.every((v) => v === 0)),
    '손상된 정책 저장은 조용히 버린다',
  )
}

// ── 결 고르기: 직전 결을 연달아 내지 않는다 ─────────────────────────────────

{
  const policy = new TokenPolicy(new MemoryStorage(), () => 0.5)
  for (const previous of POLICY_ACTIONS) {
    for (let i = 0; i < 40; i++) {
      assert.notEqual(policy.choose(neutral, previous), previous, '직전 결이 연달아 나오지 않는다')
    }
  }
  // 고른 적이 없으면 배울 것도 없다 — 바깥이 부른 attend·alert가 그렇다.
  const untouched = new TokenPolicy(new MemoryStorage(), () => 0.5)
  untouched.learn({ tookDamage: true, distanceWhenHurt: 900, occludedHand: true, decidedQuickly: false })
  assert(
    untouched.snapshot().delta.every((row) => row.every((v) => v === 0)),
    '고른 적 없는 정책은 갱신되지 않는다',
  )
}

// ── 취향 관찰: 세어 둔 것만 말한다 ──────────────────────────────────────────

{
  const style = new TokenPlaystyle(new MemoryStorage())
  const blank = style.read()
  assert.equal(blank.sentences, 0, '아무것도 안 봤으면 센 문장도 0이다')
  assert.equal(blank.favoriteEmotion, null, '고른 적 없는 감정을 즐겨 쓴다고 하지 않는다')
  assert.equal(blank.tentative, true, '표본이 없으면 사람을 규정하지 않는다')

  // 공격 문장만 쭉 쓰면 때리는 사람으로 읽혀야 한다.
  for (let i = 0; i < 14; i++) {
    style.noteSentence({
      words: [{ id: 'na', emotion: 'anger' }, { id: 'himkkeot', emotion: 'anger' }],
      action: 'attack', combo: i % 4 === 0, overdraw: false,
    })
  }
  const striker = style.read()
  assert.equal(striker.archetype, 'striker', '공격만 쓰면 때리는 사람이다')
  assert.equal(striker.tentative, false, '충분히 봤으면 단정한다')
  assert.equal(striker.favoriteEmotion, 'anger', '가장 자주 고른 감정을 집어낸다')
  assert.equal(striker.sentences, 14, '문장 수는 실제로 센 값이다')
  assert(striker.comboRate > 0 && striker.comboRate < 1, '관용구 성사율은 비율이다')
  assert.equal(striker.boldness, 0, '여백 밖으로 안 나갔으면 무모함은 0이다')
  assert.equal(striker.favoriteWord, 'na', '가장 많이 쓴 단어를 집어낸다')

  // 방어로 갈아타면 결론도 따라 움직인다 — 사람은 바뀔 수 있다.
  for (let i = 0; i < 40; i++) {
    style.noteSentence({ words: [{ id: 'makat', emotion: 'joy' }], action: 'guard', combo: false, overdraw: true })
  }
  const keeper = style.read()
  assert.equal(keeper.archetype, 'keeper', '방어가 우세해지면 막는 사람으로 바뀐다')
  assert(keeper.boldness > 0, '여백 밖 집필이 무모함으로 잡힌다')

  style.noteDecision(1200)
  style.noteDecision(9000)
  const paced = style.read()
  assert(paced.averageDecisionMs > 1200 && paced.averageDecisionMs < 9000, '평균 결정 시간은 두 값 사이에 있다')
  assert.equal(paced.decisiveness, 0.5, '망설임 없이 고른 비율을 센다')
  style.noteDecision(-5)
  assert.equal(style.read().decisiveness, 0.5, '말이 안 되는 시간은 세지 않는다')
}

{
  // 취향도 저장을 건너 살아남고, 손상·구버전은 조용히 버린다.
  const storage = new MemoryStorage()
  const style = new TokenPlaystyle(storage)
  style.noteSentence({ words: [{ id: 'na', emotion: 'joy' }], action: 'heal', combo: false, overdraw: false })
  assert.equal(new TokenPlaystyle(storage).read().sentences, 1, '취향은 저장을 건너 살아남는다')

  const broken = new MemoryStorage()
  broken.setItem(TOKEN_STYLE_KEY, '{망가진')
  assert.equal(new TokenPlaystyle(broken).read().sentences, 0, '손상된 취향 저장은 버린다')

  const stale = new MemoryStorage()
  stale.setItem(TOKEN_STYLE_KEY, JSON.stringify({ version: TOKEN_STYLE_VERSION + 1, sentences: 99 }))
  assert.equal(new TokenPlaystyle(stale).read().sentences, 0, '구버전 취향 저장은 되살리지 않는다')

  const insane = new MemoryStorage()
  insane.setItem(TOKEN_STYLE_KEY, JSON.stringify({
    version: TOKEN_STYLE_VERSION, sentences: -3, combos: 'x',
    actions: { attack: -1, guard: 2, heal: null }, emotions: { joy: 'nope', anger: 4 },
  }))
  const sane = new TokenPlaystyle(insane).read()
  assert(sane.sentences >= 0, '음수 문장 수는 0으로 되돌린다')
  assert(sane.actions.attack >= 0 && sane.actions.heal >= 0, '망가진 갈래 수는 0으로 되돌린다')
  assert.equal(sane.favoriteEmotion, 'anger', '숫자가 아닌 감정 수치는 버리고 성한 것만 센다')
}

// ── 곁을 지켰다는 판정 ──────────────────────────────────────────────────────

{
  const near = STOOD_BY_DISTANCE - 1
  const far = STOOD_BY_DISTANCE + 1
  const danger = STOOD_BY_HP_RATIO - 0.05
  const safe = STOOD_BY_HP_RATIO + 0.2

  assert.equal(stoodByThroughDanger({ hpRatio: danger, distanceToPlayer: near }), true,
    '위태로운 턴을 곁에서 넘겼으면 함께 넘긴 것이다')
  assert.equal(stoodByThroughDanger({ hpRatio: danger, distanceToPlayer: far }), false,
    '멀리 있었으면 곁을 지킨 게 아니다')
  assert.equal(stoodByThroughDanger({ hpRatio: safe, distanceToPlayer: near }), false,
    '위태롭지 않았으면 함께 넘길 위기도 없었다')
  assert.equal(stoodByThroughDanger({ hpRatio: 0, distanceToPlayer: near }), false,
    '체력 0은 쓰러진 것이지 넘긴 게 아니다')
  // 경계값에서 판정이 뒤집히지 않아야 한다 — 이하/이내가 모두 포함이다.
  assert.equal(stoodByThroughDanger({ hpRatio: STOOD_BY_HP_RATIO, distanceToPlayer: STOOD_BY_DISTANCE }), true,
    '경계값은 포함이다')
}

// ── 죽은 사건이 없어야 한다 ────────────────────────────────────────────────

{
  // 사건을 표에 적어 두고 부르는 곳을 안 만들면 조용히 죽은 코드가 된다. 실제로
  // stoodBy·rewardTaken·healed 셋이 그렇게 한동안 놀고 있었다. 이 검사가 그걸 막는다.
  const sources = ['src/views/BattleView.ts', 'src/views/TokenActor.ts', 'src/main.ts']
    .map((file) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'))
    .join('\n')

  for (const event of MOOD_EVENT_KEYS) {
    assert(sources.includes(`'${event}'`), `기분 사건 ${event}을(를) 부르는 곳이 없다`)
  }
  for (const event of BOND_EVENT_KEYS) {
    // runFinished는 endRun 안에서 스스로 부른다 — 바깥에 호출부가 없는 게 정상이다.
    if (event === 'runFinished') continue
    assert(sources.includes(`'${event}'`), `유대 사건 ${event}을(를) 부르는 곳이 없다`)
  }
}

// ── 기록 초기화: 토큰의 기억도 함께 지워진다 ──────────────────────────────

{
  // 기록 초기화는 키를 하나씩 지우지 않고 접두사로 쓸어 낸다. 하나씩 지우는 방식이면
  // 새로 늘어난 키가 조용히 살아남아, 전부 지웠다는 사람을 토큰이 계속 기억한다.
  assert(TOKEN_MIND_KEY.startsWith(STORAGE_PREFIX), '토큰의 기억 키는 초기화 접두사를 쓴다')
  assert(TOKEN_POLICY_KEY.startsWith(STORAGE_PREFIX), '토큰의 정책 키는 초기화 접두사를 쓴다')
  assert(TOKEN_STYLE_KEY.startsWith(STORAGE_PREFIX), '토큰의 취향 기록 키는 초기화 접두사를 쓴다')
}

console.log('토큰 자아 계약 통과 — 기분·유대·성향의 시간 축 · 저장 왕복과 구버전 거부 · 사전 성향 · 보상 부호 · 학습 상한 · 취향 관찰 · 곁을 지킨 판정 · 죽은 사건 없음 · 초기화 접두사')
