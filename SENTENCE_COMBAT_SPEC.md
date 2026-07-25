# 문장 조립 전투 — 현행 명세

> 기준 버전 v_0.2.9 · 코드에서 역으로 정리한 문서다.
> **코드가 정본이다.** 이 문서와 런타임이 다르면 코드를 먼저 확인하고 이 문서를 고친다.
> 잼 초기 1차 기획안(5슬롯·고정 위력·디메리트 중심)은 폐기됐다. 아래가 현재 규칙이다.

---

## 0. 한 줄 정의

단어를 골라 문장을 완성하면, 그 문장이 곧 전투 행동이 된다.
같은 단어라도 **앞뒤에 무엇이 오느냐에 따라 의미와 수치가 달라진다.**

```
나는 / 힘껏 / 내리친다
→ 「전력 강타」 발동 · 공격 ×2 = 6 × (1.2 × 1.7) = 12 피해
```

---

## 1. 설계 원칙

| 원칙 | 의미 |
|---|---|
| 맥락 = 메카닉 | 슬롯은 독립이 아니다. 태그가 맞물리면 관용구가 터진다. |
| 숨은 정답 금지 | 점수 규칙은 전부 화면에 드러난다. `breakdown`이 계산 내역을 그대로 넘긴다. |
| 곱셈은 관용구만 | 일반 배수는 가산 풀(`bonusPool`). 곱셈은 관용구와 룰렛만. |
| 깡수치는 스탯에서 | 단어에 고정 위력을 박지 않는다. 동사가 `스탯 × 계수`로 수치를 뽑는다. |
| **디메리트 없음** | 실패·자해·부조화 같은 "고르면 손해"는 폐지했다. 선택은 전부 이득의 종류가 다를 뿐이다. |
| 단어보다 관용구 | 조합 공간은 이미 충분하다. 늘릴 건 관용구다. |
| 컴파일러는 순수함수 | RNG·상태 없음. 그래야 전수 검사로 밸런싱한다. |

---

## 2. 아키텍처

```
[BattleView]        손패 카드 · 드래그 발동 · 연출        src/views/BattleView.ts
   ↓ Selection
[validator]         모순 판정 → 비활성 카드              src/core/validator.ts
   ↓
[compiler]          문장 → Intent    ★순수함수, 여기가 핵심  src/core/compiler.ts
   ↓ Intent
[reference]         Intent → 전투 상태 전이               src/sim/reference.ts
```

**시뮬은 "문장"을 모른다.** Compiler가 문장을 시뮬이 아는 행동 객체(`Intent`)로 번역한다.
배율 확정(`resolveMultiplier`)은 RNG가 필요하므로 컴파일러 밖, BattleView에서 굴려 `applyIntent`에 넘긴다.

---

## 3. 현재 살아 있는 규칙

일반 런(3슬롯)에서 실제로 발동하는 것 전부다.

| 규칙 | 근거 | 데이터 |
|---|---|---|
| 슬롯 3칸 `subj → adv → verb` | `EARLY_TEMPLATE` | — |
| 스탯 비례 깡수치 | `wordFlat()` | 동사 등 10개 |
| 가산 보너스 풀 | `bonusPool` | 12개 |
| 관용구 곱셈 | `matchCombos()` | **16개** |
| 대성공 룰렛 | `rouletteOdds()` | crit 보유 9개 |
| 도박(`variance`) | `resolveMultiplier()` | 4개 |
| 범위 공격(`aoe`) | `applyIntent()` | 1개 |
| 지연 발동(`timing`) | `applyIntent()` | 어미 슬롯(현재 미사용) |
| 운 배율 +2%/1 | `LUCK_MULT` | — |
| 보상등급 → 희귀도 가중치 | `src/core/grade.ts` | — |
| 반복강화 | `reinforceWord()` | — |
| 아이템 감탄사 | `src/data/items.ts` | 아이템 2종 |
| 아이템 패시브(규칙) | `src/core/passives.ts` | 전설 11종 |

### 현재 단어 풀

| 풀 | 구성 | 용도 |
|---|---|---|
| `EARLY_WORDS` | subj 7 · adv 6 · verb 6 = **19** | 런 시작 덱 |
| `REWARD_WORDS` | **9** | 보상으로 등장하는 신규 단어 |
| `EARLY_COMBOS` | **16** | 일반 런 관용구 |
| `WORDS` / `COMBOS` | 23단어 · 6관용구 | 5슬롯 확장용 보존 자료 (런에 미사용) |

희귀도 분포(일반 런 28단어): 흔함 14 · 희귀 9 · 영웅 5 · 전설 0

---

## 4. 폐지·미사용 목록 ★

**타입과 엔진 코드는 남아 있지만 데이터가 0이라 발동하지 않는다.** 되살릴 때는 이 표를 먼저 갱신한다.

### 폐지 (되살리지 않는다)

| 항목 | 잔존 위치 | 폐지 사유 |
|---|---|---|
| 실패(`Word.fail`) | `types.ts` · `compiler.ts:189` | 디메리트 폐지. 데이터 0개, `failP`는 항상 0 |
| 부조화(`Dissonance`) | `compiler.ts:117` · `dissonances.csv` | 디메리트 폐지. CSV 헤더만, `coherence`는 항상 1 |
| 자해(`effects.recoil`) | `types.ts` · `reference.ts:115` | 디메리트 폐지. 데이터 0개 |
| 회피(`effects.evade`) | `types.ts` | 전투 규칙으로 구현된 적 없음. 데이터 0개 |
| 고정 위력(`Word.power`) | `compiler.ts:24` | 스탯 비례로 전면 대체. 일반 런 데이터 0개 |
| `effects.guard/heal` | `compiler.ts:129` | 동사 `kind` + `statMult`로 대체. 데이터 0개 |
| 배수 상한(`multCap`) | `types.ts:159` · `earlyWords.ts:20` | **컴파일러가 읽지 않는다.** 배율에 천장 없음(`compiler.ts:125`) |
| 맥락카드 등급 보너스 | `types.ts:81` | 다양성 + 반복강화로 대체 |

> `multCap`은 `Tables`에 값이 남아 있으나 소비처가 없다. 실제 상한은 **없다.**
> 남은 소비처는 `tools/dump-words.ts`의 설명 문구뿐이며, 그 문구는 현재 규칙과 다르다.

### 미사용 (되살릴 여지 있음)

| 항목 | 상태 |
|---|---|
| 모순(`Conflict`) | 엔진·UI 배선 전부 생존(`BattleView.ts:643,861`), `conflicts.csv` 비어 있음 |
| `obj` · `end` 슬롯 | 단어 데이터는 있으나 `EARLY_TEMPLATE`에 없어 런에 등장하지 않음 |
| 5슬롯 템플릿 | 가변 슬롯 컴파일러는 동작함. 활성화는 보류 범위 |
| 지연 발동(`timing`) | `reference.ts`에 구현됨. `end` 슬롯이 없어 실제로는 안 걸림 |

---

## 5. 데이터 스키마

### 5.1 슬롯

```ts
type SlotKey = string                              // 확장 가능
const EARLY_TEMPLATE = ['subj', 'adv', 'verb']     // 일반 런
```

역할(`SlotRole`)이 계산 규칙을 정한다. 컴파일러는 슬롯 키를 하드코딩하지 않는다.

| role | 하는 일 |
|---|---|
| `subject` | bonus 풀 · `targetMode` · `aoe` |
| `modifier` | bonus 풀 · 룰렛 기준 스탯(`stat`) 지정 |
| `verb` | 깡수치 · `kind`(공격/방어/회복) |
| `object` | 깡수치 *(현재 런 미사용)* |
| `ending` | bonus 풀 · `timing` · `variance` *(현재 런 미사용)* |

### 5.2 단어

```ts
interface Word {
  id: string
  text: string
  slot: SlotKey
  tags: string[]          // 관용구 멀티셋 매칭 + 모순 판정
  stat?: StatName         // 동사: 깡수치의 출처 / 수식: 룰렛을 미는 스탯
  statMult?: number       // 동사 전용. 깡수치 = stats[stat] × statMult
  bonus?: number          // subject/modifier/ending: 가산 배수 풀 기여
  crit?: number           // 대성공 확률(0..1)
  variance?: { p, hi, lo }
  kind?: IntentKind       // verb 전용 — attack/guard/heal/debuff
  targetMode?: TargetMode // subject 전용
  aoe?: AoeMode
  person?: 'first'        // 일기는 1인칭이라 주어는 first만 허용
  rarity?: Rarity
  level?: number          // 반복강화 단계
  art?: string            // 카드 일러스트 키
  note: string            // UI 한 줄 설명
  lore?: string
}
```

> `power` · `effects` · `fail`은 타입에 남아 있으나 일반 런 데이터에서 쓰지 않는다(4장 참조).

### 5.3 관용구 (Combo)

```ts
interface Combo {
  id: string
  name: string     // 「전력 강타」 — 발동 시 화면 표시
  need: string[]   // 필요 tag 멀티셋
  mult: number     // ★유일하게 곱셈으로 들어가는 값
  flavor?: string
}
```

매칭은 **멀티셋**. 선택 단어의 tag를 전부 모은 풀에서 `need`를 하나씩 소진할 수 있으면 발동.
현재 배수 대역은 **1.45 ~ 1.70**이다.

---

## 6. 컴파일러 명세 ★

순수함수. RNG 금지, 전역 상태 참조 금지. `src/core/compiler.ts`

### 깡수치

```
wordFlat(w, stats) = w.stat && w.statMult != null
                       ? max(0, round(stats[w.stat] × w.statMult))
                       : w.power || 0            // 현재 데이터에서는 도달하지 않음
```

동사의 `kind`가 수치가 들어갈 자리를 정한다.

```
kind === 'guard' → guard 풀
kind === 'heal'  → heal 풀
그 외            → base(피해) 풀
```

### 배율

```
bonusPool  = Σ (subject/modifier/ending 의 bonus)        ← 가산
comboMult  = Π combo.mult                                 ← 곱셈, 유일
coherence  = Π dissonance.penalty                         ← 현재 항상 1

multiplier = (1 + bonusPool) × comboMult × coherence      ← 상한 없음
```

### 최종 확정 (`resolveMultiplier`, BattleView가 RNG와 함께 호출)

```
최종배율 = multiplier
         × variance          (있으면 p 확률로 hi, 아니면 lo / 없으면 1)
         × (1 + luck × 0.02)
         × roulette          (대성공 1.5 / 보통 1 / 실패 0.25 — 실패는 현재 발생 안 함)

피해 = round(base  × 최종배율)
회복 = round(heal  × 최종배율)
방어 = round(guard × 최종배율)
```

### 룰렛 확률

```
statBias = 수식이 지정한 stat, 없으면 문장 맥락(kind)에서 — heal→회복 / guard→방어 / 그 외→공격

critP = min(0.60, Σ word.crit + statBias × 0.01)
failP = Σ word.fail > 0 ? max(0.05, Σ word.fail − statBias × 0.01) : 0
```

`Σ word.fail`이 항상 0이므로 **failP는 항상 0이다.** 실패 분기는 도달하지 않는다.

### variance

컴파일러는 굴리지 않고 그대로 넘긴다. 그래야 전수 검사에서 hi/lo 양쪽을 검증한다.
어느 슬롯이든 가질 수 있고, 뒤 슬롯이 지정하면 덮어쓴다.

### 조사

`src/core/josa.ts`. `josa: true`인 슬롯에만 부착한다. 주어는 단어에 조사를 포함해 저장(나는/너는).

---

## 7. 스탯

```ts
{ hp: 20, atk: 3, guard: 3, heal: 3, luck: 2 }   // startingPlayer()
```

| 스탯 | 하는 일 |
|---|---|
| 체력 | 최대 체력 |
| 공격 | 공격 동사의 깡수치 출처 (`atk × statMult`) |
| 방어 | 방어 동사의 깡수치 출처 |
| 회복 | 회복 동사의 깡수치 출처 |
| 운 | 보상등급의 **바닥과 시작값** · 최종배율 +2%/1 · 룰렛과 무관 |

스탯은 아이템으로만 오른다. 단어 보상은 스탯을 주지 않는다.

---

## 8. 보상등급

`src/core/grade.ts` — 등급은 **희귀도의 확률 가중치**이지 상한 캡이 아니다.

```
gradeFloor  = clamp(round(luck), 0, 10)      // 운이 보장하는 바닥
startGrade  = gradeFloor + 2                  // 전투 시작값
decayGrade  = 턴마다 −1, 바닥까지만
overkillGain = kills ≥ 2 → kills (+1 전멸 마무리)
```

```
common    = max(8, 70 − g×6)
rare      = 24 + g×2
epic      = max(0, (g − 2)×3)
legendary = max(0, (g − 5)×3)
```

보상은 3택이며 **최소 한 칸은 아이템이 보장된다**(`rewards.ts:108`).
단어 보상은 신규 등록 또는 보유 단어 반복강화 중 하나로 뜬다.

### 반복강화

```ts
REINFORCE_STEP = { power: +2, bonus: +0.15, guard: +2, heal: +2, crit: +0.05 }
```

`crit`은 0.6에서 수렴한다. 같은 단어를 다시 받으면 덱에 중복 등록하지 않고 단계를 올린다.

---

## 9. 아이템과 감탄사

`src/data/items.ts` · `src/views/ItemExclaimView.ts`

획득 시 아이템은 등급에 맞는 낮은 기본 스탯으로 나오고, 플레이어가 감탄 문장을 조립하면
그 단어들의 보정이 더해진다. 코어 루프(문장 조립)의 축소판이라 규칙이 일관된다.

```
감탄 / 정도 / 평가
와!  / 엄청 / 날카로워!
```

- 보정은 스탯 +1씩, 체력만 +2. 세 슬롯 전부 체력에 몰면 +6이 한 아이템 몰빵의 상한이다.
- 기본 스탯 예산은 종합 4점(체력 2 = 다른 스탯 1).
- 확정된 스탯은 `applyItemReward()`가 `player.stats`에 **영구 가산**한다. 슬롯 제한이나 해제는 없다.

> 1차 기획안의 「근데?」 재감정, 「별로.」 판매가 2배는 구현되지 않았다. 채택 여부 미결.

---

## 9-1. 아이템 패시브 (규칙 아이템) ★

`src/core/passives.ts` · `LEGENDARY_ITEMS` in `src/data/items.ts`

흔함·희귀 아이템은 **스탯**을 준다. 전설 아이템은 기본 스탯이 0이고 **문장을 읽는 규칙**을 바꾼다.
축이 갈려 있어서 전설만 모아서는 깡수치가 거의 안 늘고, 단어 보상을 계속 골라야 한다 —
아이템과 단어가 같은 축에서 경쟁하지 않게 하는 장치다.

| 아이템 | 패시브 | 하는 일 | 구현 지점 |
|---|---|---|---|
| 누댕의 메아리 | `echo` | 대성공하면 그 문장이 한 번 더 발동 | `BattleView.echoStrike()` |
| 신데렐라의 황금사과 | `retry` | 대성공에 실패하면 룰렛을 한 번 더 굴림 | `BattleView.rouletteRoll()` |
| 올림프의 당근 | `punct` | 문장 끝에 문장부호 칸 | `slotOrderFor()` + `PUNCT_WORDS` |
| 맛동사 | `twinVerb` | 동사 칸이 둘 | `slotOrderFor()` + `words.verb2` |
| 미녀의 거울 | `twinSubj` | 주어 칸이 둘 | `slotOrderFor()` + `words.subj2` |
| 백설공주의 구두 | `heavyShoe` | 피해 깡수치에 문장당 +7 | `CompileMods.verbFlat` |
| 빨간망토의 성냥 | `matchFire` | 배율 칸마다 보너스 +0.10 | `CompileMods.bonusEach` |
| 성냥팔이 소녀의 망토 | `luckCloak` | 모든 동사가 운만큼 깡수치를 더 받음 | `CompileMods.verbLuck` |
| 아기돼지 바베큐 | `bbq` | 이번 전투 처치 1마리당 배율 +5% | `CompileMods.stageMult` |
| 피노키오의 미아핑 | `doubt` | 맥락마다 ×1.00~1.30을 따로 굴림 | `doubtMults()` |
| 잭과 숙주나물 | `beanstalk` | 무럭무럭 카드 + 맥락마다 최대체력 성장 | `CompileMods.grow` |

### 컴파일러 수정자

컴파일러는 순수함수라 플레이어를 모른다. `modsFor(player, kills)`가 보유 아이템을
`CompileMods` 데이터로 바꿔 `compile()`의 4번째 인자로 넘긴다. RNG가 필요한 것
(재시도 굴림·근데? 굴림)은 컴파일러 밖에서 굴려 `resolveMultiplier`에 넘긴다.

```
compile(sel, tables, stats, mods)          ← 순수
resolveMultiplier(intent, ctx, rouletteRoll, varRoll, doubtRolls)  ← 굴림은 전부 인자
```

**신데렐라의 황금사과**는 룰렛을 두 번 굴려 낮은 쪽을 쓴다. 낮은 굴림일수록
대성공이므로 `Math.min(a, b)`이 곧 "실패하면 한 번 더"와 같다.

### 슬롯 확장

`slotOrderFor(base, player)`가 보유 패시브를 읽어 슬롯 순서를 만든다.
`makeEarlyTables(deck, player)`가 늘어난 칸의 단어 목록까지 함께 채운다.

```
기본      subj → adv → verb
거울      subj → subj2 → adv → verb                    (subj2의 단어 = subj 목록 그대로)
맛동사    subj → adv → verb → verb2                     (verb2의 단어 = verb 목록 그대로)
당근      subj → adv → verb → punct                     (punct의 단어 = PUNCT_WORDS)
전부      subj → subj2 → adv → verb → verb2 → punct     (6칸)
```

겹슬롯은 원본 칸의 **최종 목록**을 그대로 다시 쓴다 — 무럭무럭이 뿌려진 뒤에
복사하므로 겹동사 칸에도 무럭무럭이 들어 있다.

### 무럭무럭 (잭과 숙주나물)

`Word.growHp`는 **배율을 받지 않는 고정 성장**이다. 배율 정산과 별개로 준비 효과
직전에 적용되며, `player.stats.hp`까지 올려 런 전체에 남는다.

```
무럭무럭 카드   열려 있는 슬롯(subj·verb·punct)마다 한 장씩 · 각 +1
맥락 성장       발동한 관용구 하나당 +1
```

겹칠수록 화면 이름이 길어진다: `무럭무럭` → `무럭무럭무럭무럭`.

### 배율 풀은 한 칩으로 센다 ★

보너스 풀은 **가산**인데 집계판에 단어마다 칩을 세우면 화면이 곱셈으로 읽힌다.

```
표시(틀림)  (1+0.20) × (1+0.15) = 1.38
실제        1 + 0.35            = 1.35
```

그래서 컴파일러가 `배율 풀` 칩 **하나**만 세우고 기여 단어는 힌트로 붙인다.
빨간망토의 성냥처럼 모든 칸에 보너스를 얹는 아이템이 있으면 이 어긋남이 커지므로
칩을 쪼개지 않는다.

### 문장부호

`punct` 슬롯은 `attach: true`라 앞 단어에 **공백 없이** 붙는다(`joinTokens`).

| 부호 | 효과 | 구현 |
|---|---|---|
| `!` | 선공 상대 행동을 건너뛴다 | `PREEMPT_TAG` → `Intent.preempt` |
| `.` | 보너스 풀 +0.10 | 기존 `bonus` |
| `?` | 대성공 확률 +30% | 기존 `crit` |

> `.`은 **가산 풀**에 들어가므로 실제 체감은 ×1.05~1.07이다. ×1.10이 아니다.
> 곱셈은 관용구만이라는 원칙을 지킨 결과이고, 카드 설명도 그렇게 적혀 있다.

`!`는 선공 적의 **쿨다운을 소모시키지 않는다.** 이번 턴을 미룰 뿐 공격을 없애지 않는다.

### 겹동사와 문장의 종류

동사가 둘이면 `kind`가 충돌한다. 규칙은 **피해 깡수치가 하나라도 쌓이면 공격 문장**이다.

```
공격 + 공격  →  base 2배
공격 + 회복  →  피해와 회복이 모두 나간다 (kind=attack)
공격 + 방어  →  피해와 방어가 모두 나간다 (kind=attack)
회복 + 회복  →  heal 2배 (kind=heal)
```

이 규칙이 없으면 뒤에 온 회복 동사가 `kind`를 덮어써서 앞 동사의 공격 깡수치가
통째로 버려진다 — 디메리트를 폐지한 게임에서 조용한 손해가 생기므로 막았다.

깡수치에는 `IntentPart.lane`이 붙어 어느 풀(피해/방어/회복)로 갔는지 남는다.
집계판은 자기 풀만 더한다 — 안 그러면 화면 숫자와 실제 피해가 어긋난다.

### 지급

```ts
LEGENDARY_GIFT_DAY = 3
```

전설 확률은 등급 6에서도 3.5%라 짧은 런에서는 대부분 못 본다. 규칙을 뒤집는 물건은
모든 플레이어가 한 번은 만나야 의미가 있으므로 **날짜로 박는다** — 3일차 이상이고
규칙 아이템이 하나도 없으면 보상 첫 칸을 전설로 덮는다. 나머지 두 칸은 정상 굴림이라
"규칙 하나 vs 성장 둘"의 선택은 남고, 하나를 얻으면 평범한 보상으로 돌아간다.

> 전설 아이템도 감탄사 화면을 거친다. 기본 스탯은 0이지만 감탄사로 붙는 소량(+3~4)은
> 받는다 — 감탄사는 코어 루프라 건너뛰지 않는다.

---

## 10. 데이터 파이프라인

원본은 CSV, 런타임 데이터는 생성물이다. **생성물을 직접 고치지 않는다.**

```
src/data/csv/words.csv          ─┐
src/data/csv/combos.csv          │  scripts/generate-sentence-data.ts
src/data/csv/conflicts.csv       ├────────────────────────────────────→ src/data/generated/sentenceData.ts
src/data/csv/dissonances.csv    ─┘
```

`pool` 열이 `early`(일반 런) / `reward`(보상) / `expansion`(5슬롯 확장) /
`punct`(문장부호) / `grow`(무럭무럭)를 가른다. 뒤 둘은 아이템 패시브 전용이라
일반 덱과 보상 풀에 섞이지 않는다.
`dev` · `build` · `type-check` · `sweep` 전부 `data:generate`를 선행한다.

---

## 11. 전투 페이즈

```
주어 선택 → 수식 선택 → 동사 선택 → 문장 완성
  → 준비 효과(방어 적용)
  → 선공 상대 행동
  → 플레이어 본행동
  → 후공 상대 행동
```

- 방어는 피격 전 준비 단계에서 적용하고, 적 공격 한 번에 소비된다.
- 미사용 방어는 다음 문장의 준비 단계까지 유지되되 **중첩하지 않고 교체된다**.
- 주어 태그에 `enemy`가 있으면 방어를 얻지 못한다(`applyPreparation`).
- 전투는 적 레일의 **최전방만** 참여한다. 단일 공격의 초과 피해는 다음 적에게 관통한다.
- 기본 선공 적은 공격 후 다음 공격이 후공으로 밀리고, 마치면 선공을 되찾는다.

---

## 12. 검증

```bash
npm run type-check   # data:generate + tsc --noEmit
npm run sweep        # 전 조합 순회 밸런스 검사
npm run check        # 테이블 정합성 검사
npm run build
```

### 불변식 (`src/tools/sweep.ts`)

**배율에 천장이 없으므로 캡 기반 상한·비율 검사는 폐지했다.** 최대 스파이크는 설계상 허용한다.

| # | 조건 | 최근 결과 |
|---|---|---|
| INV-1 | 전형(median)이 즉사가 아니다 — `med ≤ 90` | 통과 (22) |
| INV-2 | 관용구 없이도 p75에 도달한다 (관용구 강제 방지) | 통과 (56 vs 40) |
| INV-3 | 막다른 길이 없다 (소프트락 방지) | 통과 (0) |

기준 적 체력 `ENEMY_MAX = 90`. 단일 대상 즉발 문장만 분포에 넣고, 룰렛과 운은
제외한 기본 배율(`finalMultiplier`)로 계산한다.

> **sweep은 5슬롯 확장 데이터(`TABLES`)를 검사한다.** 실제 일반 런의 3슬롯 덱은
> 아직 검사 대상이 아니다. 3슬롯 sweep 추가는 TODO의 미해결 항목이다.
>
> INV-3은 모순 데이터가 0이라 현재 자동 충족된다. 모순을 되살리는 순간 다시
> 실질적인 검사가 된다. 잼에서 제일 흔한 소프트락이 여기다.

---

## 13. 열린 결정

- **모순을 되살릴 것인가.** 엔진과 UI는 전부 살아 있고 데이터만 0이다. 되살리면 INV-4 검사가 필수가 된다.
- **배율 천장을 다시 둘 것인가.** 현재 상한이 없다. `multCap`은 값만 남은 죽은 필드이므로, 천장을 안 둘 거면 필드째 지우고 `dump-words.ts`의 설명 문구도 고쳐야 한다.
- **전설 등급 단어가 0개다.** `rarityWeights`는 등급 6부터 전설을 굴리는데 후보가 없어 `nearestPool`이 아래로 떨어진다.
- **`obj`/`end` 슬롯과 5슬롯 활성화 시점.** 보류 범위. `punct`가 사실상 `ending` 역할을
  먼저 쓰고 있으므로, 5슬롯을 열 때 `end`와 `punct`의 관계를 정해야 한다.
- **규칙 아이템을 더 늘릴지.** 현재 3종(9-1장). 전설 풀이 곧 규칙 아이템 풀이다.
- **전설 등급 단어는 여전히 0개다.** 전설을 아이템 전용 등급으로 굳힐지, 단어도 만들지 미결.
