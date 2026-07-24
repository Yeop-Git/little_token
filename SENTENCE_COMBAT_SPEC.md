# 문장 조립 전투 — 1차 기획안

> 게임잼 3일 스코프. 웹(HTML/TS) 타깃.
> 이 문서는 Claude Code에 그대로 넣고 작업하기 위한 구현 명세다.

---

## 0. 한 줄 정의

단어를 골라 문장을 완성하면, 그 문장이 곧 전투 행동이 된다.
같은 단어라도 **앞뒤에 무엇이 오느냐에 따라 의미와 수치가 달라진다.**

```
나는 / 미친듯이 / 불꽃을 / 점화 / 하고 말았다!
→ 「화염광란」 발동 · 38 피해 · 자신 4 피해
```

---

## 1. 설계 원칙 (구현 중 흔들리면 여기로 돌아온다)

| 원칙 | 의미 |
|---|---|
| 맥락 = 메카닉 | 슬롯은 독립이 아니다. 앞 선택이 뒤 선택지를 **막거나 바꾼다**. |
| 숨은 정답 금지 | 점수 규칙은 전부 화면에 드러난다. 학습 가능해야 로그라이트가 된다. |
| 곱셈은 관용구만 | 일반 배수는 가산 풀. 안 그러면 5슬롯에서 수치가 폭발한다. |
| 단어보다 관용구 | 19단어 = 768문장. 조합 공간은 이미 충분하다. 늘릴 건 관용구다. |
| 컴파일러는 순수함수 | RNG·상태 없음. 그래야 전수 검사로 밸런싱한다. |

---

## 2. 아키텍처

```
[View]              단어 버튼 · 체인 로그 · 전투 뷰
   ↓ selection
[Validator]         모순 판정 → 비활성 슬롯 산출
   ↓
[Compiler]          문장 → Intent      ★순수함수, 여기가 핵심
   ↓ Intent
[SimAdapter]        Intent → 기존 헤드리스 시뮬 호출
   ↓ 
[Sim]               상태 전이 · 결과 반환
```

**시뮬은 "문장"이라는 개념을 몰라야 한다.** Compiler가 문장을 시뮬이 이미 아는 행동 객체로 번역한다. 이러면 기존 밸런싱이 보존되고, 시뮬은 계속 헤드리스로 테스트된다.

---

## 3. 데이터 스키마

전부 JSON. 코드에 수치를 박지 않는다.

### 3.1 슬롯

```ts
type SlotKey = 'subj' | 'adv' | 'obj' | 'verb' | 'end';
const SLOT_ORDER: SlotKey[] = ['subj', 'adv', 'obj', 'verb', 'end'];
```

### 3.2 단어

```ts
interface Word {
  id: string;
  text: string;
  slot: SlotKey;
  tags: string[];          // 모순 판정 + 관용구 매칭에 쓰임
  power?: number;          // obj/verb 전용 — 기본 위력 (가산)
  bonus?: number;          // subj/adv/end 전용 — 배수 풀 기여분 (가산)
  variance?: {             // '했었나?' 같은 도박형 전용
    p: number; hi: number; lo: number;
  };
  effects?: {
    guard?: number;
    heal?: number;
    recoil?: number;
    evade?: number;
  };
  timing?: 'immediate' | 'delayed';
  targetMode?: 'enemy' | 'self' | 'both';
  note: string;            // UI에 뜨는 한 줄 설명
}
```

### 3.3 관용구 (Combo)

```ts
interface Combo {
  id: string;
  name: string;            // 「고독한 전사」 — 발동 시 화면에 표시
  need: string[];          // 필요한 tag 목록 (멀티셋 매칭)
  mult: number;            // ★유일하게 곱셈으로 들어가는 값
  flavor?: string;
}
```

매칭은 **멀티셋** 기준. 선택된 5단어의 tag를 전부 모은 풀에서 `need`를 하나씩 소진할 수 있으면 발동.

### 3.4 모순 (Conflict)

```ts
interface Conflict {
  a: string;               // tag
  b: string;               // tag
  reason: string;          // 비활성 버튼에 표시 — "혼자일 수 없다"
}
```

---

## 4. 초기 단어 풀 (19개)

| 슬롯 | 단어 | tags | 수치 |
|---|---|---|---|
| subj | 나는 | self | bonus 0 |
| subj | 너는 | enemy | bonus 0.25 · 방어 무효 |
| subj | 우리는 | both | bonus 0.5 · 피해 40% 자신에게 |
| adv | 홀로 | solo | bonus 0.3 · guard −2 |
| adv | 조용히 | quiet | bonus −0.1 · evade 3 |
| adv | 미친듯이 | mad | bonus 0.7 · recoil 3 |
| adv | 천천히 | slow | bonus 0.1 · guard 2 |
| obj | 전투 | war | power 6 |
| obj | 불꽃 | fire | power 8 |
| obj | 침묵 | quiet | power 3 · guard 4 |
| obj | 기억 | mind | power 4 · heal 3 |
| verb | 진행 | atk | power 4 |
| verb | 회피 | grd | power 1 · guard 5 |
| verb | 점화 | fire | power 6 |
| verb | 망각 | mind | power 2 · heal 4 |
| end | 했다 | — | bonus 0 · immediate |
| end | 하려고 했다 | — | bonus 0.9 · delayed |
| end | 했었나? | — | variance {p .5, hi 2.5, lo 0.3} |
| end | 하고 말았다! | — | bonus 0.4 · recoil 4 |

### 관용구 초기 5개

| 이름 | need | mult |
|---|---|---|
| 고독한 전사 | solo, war, atk | 1.4 |
| 화염광란 | mad, fire, fire | 1.8 |
| 완전한 정적 | quiet, quiet | 1.2 |
| 망각의 의식 | mind, mind | 1.3 |
| 공멸 | both, fire | 2.0 |

### 모순 초기 4개

| a | b | reason |
|---|---|---|
| both | solo | 혼자일 수 없다 |
| mad | quiet | 광기와 정적은 공존 못 한다 |
| quiet | fire | 조용히 불태울 수 없다 |
| slow | mad | 속도가 모순된다 |

---

## 5. 컴파일러 명세 ★

**가장 중요한 파일.** 순수함수. RNG 금지, 전역 상태 참조 금지.

```ts
interface Intent {
  sentence: string;              // 표시용 완성 문장
  targetMode: 'enemy'|'self'|'both';
  kind: 'attack'|'guard'|'heal'|'debuff';
  base: number;                  // 가산 위력
  multiplier: number;            // 최종 배수 (variance 미적용)
  variance?: {p:number; hi:number; lo:number};  // 시뮬이 굴린다
  timing: 'immediate'|'delayed';
  guard: number;
  heal: number;
  recoil: number;
  tags: string[];
  combos: string[];              // 발동한 관용구 이름
}

function compile(sel: Record<SlotKey, Word>, tables: Tables): Intent
```

### 데미지 공식

```
base       = obj.power + verb.power
bonusPool  = subj.bonus + adv.bonus + end.bonus        // ★가산
comboMult  = combos.reduce((m,c) => m * c.mult, 1)      // ★여기만 곱셈
multiplier = min((1 + bonusPool) * comboMult, MULT_CAP)
```

```ts
const MULT_CAP = 4.0;   // 상수로 분리. 튜닝 대상.
```

`variance`는 컴파일러가 **적용하지 않고 그대로 넘긴다.** 시뮬이 굴린다. 이래야 전수 검사에서 hi/lo 양쪽을 다 검증할 수 있다.

### 조사 처리

```ts
const hasJong = (w: string) =>
  (w.charCodeAt(w.length - 1) - 0xAC00) % 28 !== 0;

export const josa = (w: string, withJong: string, without: string) =>
  w + (hasJong(w) ? withJong : without);

// 불꽃을 / 전투를 / 침묵을 / 기억을
```

목적어에만 적용. 주어는 단어에 조사를 포함해서 저장한다(나는/너는/우리는).

---

## 6. 어댑터 계약

기존 헤드리스 시뮬을 붙이는 유일한 지점.

```ts
interface SimAdapter {
  apply(state: BattleState, intent: Intent, rng: () => number): BattleResult;
  enemyTurn(state: BattleState, rng: () => number): BattleResult;
}
```

### 분기 — 기존 시뮬 상태에 따라

**A. 기존 시뮬이 TS/JS이고 행동이 데이터 구조인 경우**
`sim/adapter.ts`에서 Intent를 기존 행동 타입으로 매핑만 한다. 30줄 이내.

**B. 기존 시뮬이 TS/JS인데 행동이 하드코딩 분기인 경우**
먼저 행동을 데이터로 빼는 리팩터링이 필요하다. **이게 반나절 이상 걸릴 것 같으면 하지 마라.** C의 레퍼런스 구현으로 가고, 기존 시뮬은 잼 끝나고 붙인다.

**C. 기존 시뮬이 C#이거나 붙이기 애매한 경우**
`sim/reference.ts`에 폴백 구현을 둔다. 수치 테이블만 기존 시뮬에서 가져온다. Compiler와 View는 어댑터만 보므로 나중에 교체 가능하다.

> **어느 경로든 Compiler와 View는 건드리지 않는다.** 이게 이 아키텍처의 목적이다.

---

## 7. 단어 가용성 전략

전략 인터페이스로 분리한다. 잼 중에 갈아끼울 수 있어야 한다.

```ts
interface WordPool {
  available(slot: SlotKey, state: BattleState): Word[];
  consume(sel: Record<SlotKey, Word>, state: BattleState): void;
}
```

**기본값: 소모형** — 사용한 단어는 그 전투 동안 봉인. 턴이 갈수록 문장이 이상해지는 게 그 자체로 압박이자 개그다. 구현 비용 최소.

**대안: 손패형** — 매 턴 7장 드로우. 슬롯을 못 채우면 어색한 문장이라도 우겨넣는다. 덱빌딩 로그라이트로 확장할 때 이쪽으로 스위치.

---

## 8. 밸런스 전수 검사 도구 ★

`tools/sweep.ts` — 헤드리스로 돌린다. **Day 2 오전에 반드시 만든다.**

```
전 조합 순회 (모순 제외) → 각 Intent의 damage 산출 → 통계 출력
```

출력 항목:
- 유효 문장 총 개수
- damage 분포 (min / p25 / median / p75 / max)
- 상위 10개 조합과 그 배수 구성
- **불변식 위반 목록**

### 불변식 (테스트로 강제)

| # | 조건 |
|---|---|
| INV-1 | 즉발 단일 문장 damage ≤ 적 최대 체력의 40% |
| INV-2 | 최고 damage / 중앙값 ≤ 3.5 (지배 전략 방지) |
| INV-3 | 관용구 미발동 문장도 최소 1개는 상위 25%에 든다 (관용구 강제 방지) |
| INV-4 | 모순으로 인해 완성 불가능한 슬롯 조합이 존재하지 않는다 (막다른 길 방지) |

INV-4가 특히 중요하다. 모순 규칙을 늘리다 보면 **어떤 단어를 고른 순간 문장을 완성할 수 없는 상태**가 생긴다. 이게 잼에서 제일 흔한 소프트락이다.

---

## 9. 파일 구조

```
src/
  data/
    words.json
    combos.json
    conflicts.json
    enemies.json
  core/
    josa.ts
    compiler.ts        # 순수함수. 테스트 우선.
    validator.ts       # 모순 판정 · 선택지 필터
    pool.ts            # 단어 가용성 전략
    types.ts
  sim/
    adapter.ts         # 기존 시뮬 연결
    reference.ts       # 폴백 구현
  view/
    chain.ts           # 상단 발광 체인 로그
    slots.ts           # 하단 단어 분기
    battle.ts          # 포켓로그형 전투 뷰
    log.ts             # 전투 로그
  tools/
    sweep.ts           # 전수 밸런스 검사
tests/
  compiler.test.ts
  invariants.test.ts
```

---

## 10. 구현 순서

각 단계에 **완료 기준**이 붙어 있다. 기준을 못 만족하면 다음으로 넘어가지 않는다.

### Day 1

| # | 작업 | 완료 기준 |
|---|---|---|
| 1 | types + JSON 데이터 5종 | `words.json` 19개 로드됨 |
| 2 | `josa.ts` | 4개 목적어 전부 올바른 조사 출력 |
| 3 | `compiler.ts` | 임의 문장 → Intent 콘솔 출력 |
| 4 | `validator.ts` | 모순 조합이 비활성화되고 이유가 뜸 |
| 5 | `reference.ts` + 최소 View | **1전투 완주 가능** |

> Day 1 저녁까지 5번이 안 되면 슬롯을 5개 → 4개로 줄인다 (adv 제거).

### Day 2

| # | 작업 | 완료 기준 |
|---|---|---|
| 6 | `sweep.ts` + 불변식 테스트 | INV-1~4 전부 통과 |
| 7 | 기존 시뮬 어댑터 연결 | 6장 분기 중 하나 확정 |
| 8 | 적 3종 | 각 적이 서로 다른 대응을 요구함 |
| 9 | **외부인 플레이테스트** | 첫 문장까지 30초 이내 |
| 10 | 관용구 20개로 확장 | 발동 연출 있음 |

> 9번이 이 잼의 진짜 분기점이다. 30초를 넘으면 선택지가 많은 것이므로 단어를 **줄인다**.

### Day 3

| # | 작업 |
|---|---|
| 11 | 아이템 감탄사 시스템 (아래 12장) |
| 12 | 사운드 · 문장 완성 연출 |
| 13 | 5연전 구성 + 결과 화면 |

> **Day 3에 새 시스템 추가 금지.**

---

## 11. 스코프 컷 라인

처음부터 만들지 않는다. 목록으로 박아두고 유혹이 올 때 여기를 본다.

- 절차적 맵
- 세이브 / 로드
- 메타 프로그레션
- 엔딩 / 스토리 씬
- 단어 획득 상점
- 튜토리얼 (툴팁으로 대체)

---

## 12. 아이템 감탄사 (Day 3, 여유 있으면)

코어 루프의 축소판이라 컴파일러를 재사용한다. 슬롯 구성만 다르다.

```
감탄 / 정도 / 평가
와! / 정말 / 예뻐!
```

| 반응 | 스탯 | 대가 |
|---|---|---|
| 와! 정말 예뻐! | +3 전 스탯 | 무게 증가 |
| 근데? | +1 | 재감정 1회 |
| 별로. | +0 | 즉시 판매가 2배 |

**「별로」에 반드시 다른 종류의 이득을 붙인다.** 그냥 손해면 아무도 고르지 않고, 선택지가 아니게 된다.

---

## 13. Claude Code 첫 프롬프트 예시

```
이 저장소에서 SENTENCE_COMBAT_SPEC.md를 읽고 3~5장의 타입과 
JSON 데이터부터 만들어줘. 그 다음 core/compiler.ts를 구현하되 
순수함수로 유지하고 tests/compiler.test.ts를 함께 써줘.
View는 아직 건드리지 마.
```

컴파일러가 테스트를 통과한 뒤에 View로 넘어간다. 순서를 바꾸면 밸런싱이 UI에 섞여서 못 빼낸다.
