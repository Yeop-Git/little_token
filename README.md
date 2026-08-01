# Little Token

단어를 순서대로 골라 **문장**을 완성하면, 그 문장이 곧 전투 행동이 되는
그림일기 테마의 단어장 덱빌딩 로그라이트. 같은 단어라도 앞뒤 맥락과 관용구에
따라 행동과 수치가 달라진다.

- **타깃**: 데스크톱 웹(TypeScript + Vite), 1920×1080 기준
- **테마**: 밝은 낮 그림일기 종이 → 날씨/밤 필드에 따라 촛불 다크 톤으로 전환
- **배포**: GitHub Actions → GitHub Pages (`.github/workflows/deploy.yml`)
- **현재 여정**: 15스테이지, 5·10·15스테이지 보스, 클리어 후 엔드리스

## 구현된 흐름

타이틀과 오프닝 → 전투 설명 → 전투 → 3단계 단어·아이템 보상 → 감탄 문장 →
5·10·15스테이지 보스 → 런 결과와 엔딩 → 엔드리스로 이어진다. 패배 화면,
단어장·가방·관용구·캐릭터 상세와 행동 순서 패널도 연결돼 있다.

## 실행

기준 도구는 Node.js 24.18.1과 npm 11.16.0이다. Node.js 24.18.0 이상 25 미만을
지원하며, 저장소 루트의 `.nvmrc`와 `package.json`을 로컬 개발 및 배포가 함께 사용한다.

```powershell
npm.cmd ci
npm.cmd run dev          # 개발 서버 (localhost:3000)
npm.cmd run dev -- --mode qa       # 정식판 QA: 필수 자원 실패를 즉시 보고
npm.cmd run dev -- --mode demo-qa  # 5스테이지 데모 QA
npm.cmd test             # 타입·데이터·현지화·전투·보스·밸런스 검사
npm.cmd run build        # 프로덕션 빌드 → dist/
npm.cmd run build:demo   # 5스테이지 데모 빌드 → dist-demo/
npm.cmd run release:check # 태그를 포함한 출시 전 전체 검사
```

출시 커밋 전에 같은 게이트를 미리 확인할 때는
`npm.cmd run release:check -- --allow-dirty`를 사용한다. 실제 출시 검사는 현재 버전의
annotated 태그가 HEAD를 가리키고 작업 트리가 깨끗해야 통과한다.

데모는 `.env.demo`의 `VITE_APP_EDITION=demo`로 5층 사마귀에서 완결된다. 배포용
설문 주소는 커밋하지 않는 `.env.demo.local` 또는 배포 환경의
`VITE_FEEDBACK_URL`에 설정한다. 정식 빌드는 15스테이지와 엔드리스를 유지하며
두 에디션의 저장 데이터는 서로 분리된다.

`qa`와 `demo-qa` 모드는 이미지 디코딩, GLB 파싱, 오디오와 영상 로드 실패를
조용히 대체하지 않는다. 일반 개발·배포 모드는 플레이가 멈추지 않도록 기존 2D·무음
폴백을 유지한다. QA 수집기 자체는 `?qaMissingResource=image`를 붙여 누락 이미지가
실패로 기록되는지 시험할 수 있다.

CSV를 수정한 뒤에는 `npm.cmd run data:generate`를 실행한다. 개발용 씬 직접 진입과
치트는 개발 빌드에서만 사용한다.

## 구조 (SPEC 아키텍처)
```
src/core/          타입 · 문장 컴파일 · 검증 · 런 상태
src/data/          단어 · 관용구 · 적 · 아이템 · 스테이지
src/data/csv/      단어와 관용구의 정본 CSV
src/sim/           화면과 공유하는 전투 상태 변화
src/views/         화면 · 입력 · 연출
src/localization/  한국어·영어·일본어·러시아어·중국어 간체·번체
src/tools/         전수 검사 · 보스 및 런 시뮬레이션
```
문장 슬롯은 **가변 길이**다: `data/slots.ts`의 템플릿을 바꾸면 덱/아이템이
칸을 더하거나 뺄 수 있고, 컴파일러는 슬롯 키를 하드코딩하지 않는다.

단어와 관용구의 원본은 `src/data/csv/`에서 관리한다. CSV 수정 후
`npm run data:generate`를 실행하며, 개발·검사·빌드 명령도 이 단계를 자동 수행한다.
`src/data/generated/`는 생성물이므로 직접 고치지 않는다.

문서의 역할은 다음과 같다.

- `AGENTS.md`: 프로젝트 정체성과 구현 불변식
- `SENTENCE_COMBAT_SPEC.md`: 현재 전투 규칙
- `ROADMAP.md`: 플레이테스트 근거, 현재 부족한 점과 출시 순서
- `VERSION.md`: 버전 규칙과 최근 변경 이력
