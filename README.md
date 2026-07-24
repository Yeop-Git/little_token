# 그림일기 — 단어 조립 전투 (Diary Word Battle)

단어를 순서대로 골라 **문장**을 완성하면, 그 문장이 곧 전투 행동이 되는
그림일기 테마 덱빌딩 로그라이트. 같은 단어라도 앞뒤 맥락(관용구)에 따라
의미와 수치가 달라진다. 언멜팅의 톤/UI를 참고해 파생했다.

- **타깃**: 웹(TypeScript + Vite), 고정 **1920×1080** 풀스크린(유니티 이식 대비 기준 해상도 고정)
- **테마**: 밝은 낮 그림일기 종이 → 날씨/밤 필드에 따라 촛불 다크 톤으로 전환
- **배포**: GitHub Actions → GitHub Pages (`.github/workflows/deploy.yml`)

## 구현된 화면(4)
1. **전투 뷰** — 그림일기 한 페이지(머리글=날짜/날씨/제목 필드효과, 그림 칸=측면 전투, 글 칸=단어 선택). 벌레 무리(1~3) + 범위 단어.
2. **맥락 발동 뷰** — 문장 완성 시 "타다다닥" 체인 웨이브 → 관용구 배너(위력 ×n) → 효과 로그.
3. **보상 뷰** — 일기 페이지 넘김 + 다음 필드 예고 + 단어/아이템 3택.
4. **아이템 감탄사 뷰** — 획득 시 감탄 문장(감탄/정도/평가)을 조립해 스탯 보정.

## 실행
```bash
npm install
npm run dev          # 개발 서버 (localhost:3000)
npm run data:generate # CSV → 타입이 있는 런타임 데이터 생성
npm run type-check   # 타입 검사
npm run sweep        # 밸런스 전수 검사(INV-1~4)
npm run build        # 프로덕션 빌드 → dist/
```
씬 직접 진입: `?scene=battle` | `?scene=reward` | `?scene=item` (상단 개발 점퍼로도 이동).

## 구조 (SPEC 아키텍처)
```
core/     types · josa · compiler(순수함수·가변 슬롯) · validator
data/     slots(문장 템플릿) · words · combos · enemies · fields · items · tables
sim/      reference (다중 적 + 범위 전투)
views/    main(스테이지 스케일러/라우터) · BattleView · RewardView · ItemExclaimView · sprites
tools/    sweep (전수 밸런스 검사)
```
문장 슬롯은 **가변 길이**다: `data/slots.ts`의 템플릿을 바꾸면 덱/아이템이
칸을 더하거나 뺄 수 있고, 컴파일러는 슬롯 키를 하드코딩하지 않는다.

단어, 관용구, 모순과 부조화의 원본은 `src/data/csv/`에서 관리한다. CSV 수정 후
`npm run data:generate`를 실행하며, 개발·검사·빌드 명령도 이 단계를 자동 수행한다.
