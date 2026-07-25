# AI 활용 보고서 (2026 넥슨 게임잼「재밌넥」· 1팀)

`LittleToken_AI_Report.pptx` — 17장, 16:9.
Little Token을 만들면서 AI를 어떻게 나눠 썼고, 그 결과를 어떻게 검증했는지 정리한 발표 자료다.

## 구성

| # | 슬라이드 | 내용 |
|---|---|---|
| 1 | 표지 | 한 줄 주장과 핵심 지표 |
| 2 | 숫자로 보는 결과 | 저장소에서 직접 센 8개 지표 |
| 3 | 주제 해석 — Context | 게임의 맥락 ↔ 작업의 맥락 |
| 4 | 무엇을 만들었나 | 게임 소개와 플레이 루프 |
| 5 | 도구별 역할 분담 | ChatGPT · Claude Code · Codex · Suno · Meshy |
| 6 | 제작 흐름 6단계 | 기획 → 맥락 공유 → 생성 → 통합 → 검증 → 플레이 테스트 |
| 7 | 공통 기억 | AGENTS.md · SPEC · VERSION.md · CSV 계약 |
| 8 | 코어 구현 | 레이어 책임과 AI가 지켜야 했던 불변식 |
| 9 | 자동 검증 6종 | `sweep` · `check` · `boss:sim` · `effects/assets/resources:check` |
| 10 | 사례 ① 문장 전수 검사 | `npm run sweep` 실행 결과 |
| 11 | 사례 ② 보스 시뮬레이터 | `npm run boss:sim` 3보스 × 20전 |
| 12 | 2D 아트 파이프라인 | 시안 생성과 WebP 규격 자동화 |
| 13 | 3D 파이프라인 | GLB 12종, 1K 텍스처, 공용 idle 규칙 |
| 14 | 사운드 | 28트랙과 재생 방식 분리 |
| 15 | 사람과 AI의 경계 | 위임한 것과 위임하지 않은 것 |
| 16 | 한계와 보완 | 겪은 문제 4가지와 대응 |
| 17 | 마무리 | 결론 |

## 수치의 출처

슬라이드의 모든 숫자는 이 저장소에서 직접 센 값이다. 재확인 방법:

```bash
git rev-list --count --all              # 110 커밋
grep -c '^### v_' VERSION.md            # 159 버전 기록
git ls-files '*.webp' | wc -l           # 113 WebP
git ls-files '*.glb' | wc -l            # 12 GLB
git ls-files 'src/assets/audio/*' | wc -l  # 28 오디오
git ls-files '*.ts' | xargs wc -l       # 17,694 줄 / 68 파일
npm run sweep                           # 유효 문장 1625 · 막다른 길 0 · INV-1~3
npm run boss:sim                        # 보스별 20전 승률·턴·패턴 발동 횟수
```

인용한 개발 기록은 `AGENTS.md`(기획 원칙·전투 불변식·에셋 규격)와
`VERSION.md`(v_0.3.42 · v_0.3.48 · v_0.5.3 · v_0.5.4 · v_0.5.8)에 있다.

## 다시 굽기

```bash
npm install pptxgenjs        # 저장소 의존성은 아니다. 문서 빌드용으로만 설치한다
node docs/ai-report/build-deck.js
```

`assets/`는 발표 자료 전용 사본이다.

- 배경 4종 — `src/assets/backgrounds`의 실제 전장 배경을 흐리고 어둡게 구워 슬라이드 배경으로 쓴다
- 토큰 6종 · 감정 4종 · 보스 초상 3종 — `src/assets/sprites`에서 알파를 살려 PNG로 변환
- `assets/shots/` — `npm run build && npx vite preview` 뒤 `?scene=`·`?day=` 로 진입해 1920×1080으로 캡처한 실제 플레이 화면

원본을 바꿨다면 같은 방식으로 다시 만들어 넣으면 된다. 슬라이드 문구와 배치는
`build-deck.js` 한 파일에 전부 들어 있다.
