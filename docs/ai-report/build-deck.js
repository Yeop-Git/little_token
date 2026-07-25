const pptxgen = require('pptxgenjs')
const path = require('path')

const IMG = path.join(__dirname, 'assets')
const SHOT = path.join(__dirname, 'assets', 'shots')
const i = (n) => path.join(IMG, n)
const s = (n) => path.join(SHOT, n)

// ── 팔레트 (Little Token: 밤빛 보라 + 등불 금빛 + 그림일기 종이) ──────────────
const C = {
  night: '150E28',
  panel: '2A1B48',
  panelSoft: '35245A',
  gold: 'F3C562',
  goldDeep: 'C99A34',
  cream: 'F6E9CC',
  creamDim: 'E9D8B4',
  ink: '32261B',
  inkSoft: '6E5B45',
  onDark: 'F4EAD6',
  onDarkSoft: 'B7A6D2',
  rose: 'E4707E',
  teal: '6BC5C9',
  leaf: 'A8C56B',
}
const F = 'Malgun Gothic'
const W = 13.333
const H = 7.5
const M = 0.62

const pres = new pptxgen()
pres.layout = 'LAYOUT_WIDE'
pres.author = '1팀'
pres.title = 'Little Token — AI 활용 보고서'

// ── helpers ───────────────────────────────────────────────────────────────────
const softShadow = (o = {}) => ({
  type: 'outer', color: '000000', blur: o.blur || 14, offset: o.offset || 4,
  angle: o.angle === undefined ? 90 : o.angle, opacity: o.opacity || 0.42,
})

function slide(bg) {
  const sl = pres.addSlide()
  sl.background = { color: C.night }
  if (bg) sl.addImage({ path: i(bg), x: 0, y: 0, w: W, h: H })
  return sl
}

function eyebrow(sl, text, x, y, color) {
  sl.addText(text, {
    x, y, w: 9.5, h: 0.28, fontFace: F, fontSize: 11.5, bold: true,
    color: color || C.gold, charSpacing: 3, margin: 0, valign: 'middle',
  })
}

function heading(sl, text, x, y, opt = {}) {
  sl.addText(text, {
    x, y, w: opt.w || 11.4, h: opt.h || 0.72, fontFace: F, fontSize: opt.size || 32,
    bold: true, color: opt.color || C.onDark, margin: 0, valign: 'middle',
    lineSpacingMultiple: 1.05,
  })
}

function subhead(sl, text, x, y, opt = {}) {
  sl.addText(text, {
    x, y, w: opt.w || 11.4, h: opt.h || 0.42, fontFace: F, fontSize: opt.size || 14,
    color: opt.color || C.onDarkSoft, margin: 0, valign: 'middle',
    lineSpacingMultiple: 1.25,
  })
}

function paper(sl, x, y, w, h, opt = {}) {
  sl.addShape(pres.ShapeType.roundRect, {
    x, y, w, h, rectRadius: opt.r === undefined ? 0.13 : opt.r,
    fill: { color: opt.fill || C.cream },
    line: { color: opt.lineColor || 'D9C69C', width: opt.lineWidth === undefined ? 0.75 : opt.lineWidth },
    shadow: softShadow({ blur: 16, offset: 5, opacity: 0.45 }),
  })
}

function glass(sl, x, y, w, h, opt = {}) {
  sl.addShape(pres.ShapeType.roundRect, {
    x, y, w, h, rectRadius: opt.r === undefined ? 0.13 : opt.r,
    fill: { color: opt.fill || C.panel, transparency: opt.t === undefined ? 12 : opt.t },
    line: { color: opt.lineColor || '5B4488', width: opt.lineWidth === undefined ? 0.75 : opt.lineWidth },
    shadow: softShadow({ blur: 14, offset: 4, opacity: 0.35 }),
  })
}

function pill(sl, text, x, y, w, h, opt = {}) {
  sl.addShape(pres.ShapeType.roundRect, {
    x, y, w, h, rectRadius: h / 2,
    fill: { color: opt.fill || C.gold },
    line: { color: opt.fill || C.gold, width: 0.5 },
  })
  sl.addText(text, {
    x, y, w, h, fontFace: F, fontSize: opt.size || 12, bold: true,
    color: opt.color || '3A2A08', align: 'center', valign: 'middle', margin: 0,
  })
}

function shotFrame(sl, file, x, y, w) {
  const h = (w * 1080) / 1920
  sl.addShape(pres.ShapeType.roundRect, {
    x: x - 0.055, y: y - 0.055, w: w + 0.11, h: h + 0.11, rectRadius: 0.12,
    fill: { color: C.gold, transparency: 65 }, line: { color: C.goldDeep, width: 1 },
    shadow: softShadow({ blur: 20, offset: 6, opacity: 0.5 }),
  })
  sl.addImage({ path: s(file), x, y, w, h })
  return h
}

function caption(sl, text, x, y, w) {
  sl.addText(text, {
    x, y, w, h: 0.3, fontFace: F, fontSize: 10.5, color: C.onDarkSoft,
    margin: 0, valign: 'middle', italic: true,
  })
}

function footNote(sl, text) {
  sl.addText(text, {
    x: M, y: 6.94, w: W - M * 2, h: 0.3, fontFace: F, fontSize: 9.5,
    color: '8E7DAE', margin: 0, valign: 'middle',
  })
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. 표지
// ══════════════════════════════════════════════════════════════════════════════
{
  const sl = slide('bg_cover.jpg')
  eyebrow(sl, '1팀   ·   2026 넥슨 게임잼「재밌넥」   ·   AI 활용 보고서', M, 1.02)
  sl.addText('AI를 팀원으로 합류시켜\n플레이 가능한 게임을 만들었습니다', {
    x: M, y: 1.5, w: 8.8, h: 1.9, fontFace: F, fontSize: 34, bold: true,
    color: C.cream, margin: 0, valign: 'middle', lineSpacingMultiple: 1.16,
    shadow: softShadow({ blur: 12, offset: 3, opacity: 0.7 }),
  })
  sl.addText([
    { text: 'Little Token', options: { bold: true, color: C.gold, fontSize: 19 } },
    { text: '   단어를 조립해 싸우고, 그림일기를 완성하는 덱빌딩 로그라이트', options: { color: C.onDark, fontSize: 14 } },
  ], { x: M, y: 3.62, w: 7.9, h: 0.4, fontFace: F, margin: 0, valign: 'middle' })

  sl.addText('주제「Context(맥락)」를 게임의 규칙으로 삼았고,\n같은 원리를 팀이 AI와 일하는 방식으로도 썼습니다.', {
    x: M, y: 4.18, w: 7.4, h: 0.86, fontFace: F, fontSize: 14.5, color: C.onDarkSoft,
    margin: 0, valign: 'middle', lineSpacingMultiple: 1.35,
  })

  // 하단 지표 스트립
  const stats = [['5', 'AI 도구'], ['110', 'Git 커밋'], ['159', '버전 기록'], ['153', '이미지·모델·오디오']]
  stats.forEach((st, n) => {
    const x = M + n * 1.86
    sl.addText(st[0], { x, y: 5.28, w: 1.7, h: 0.52, fontFace: F, fontSize: 30, bold: true, color: C.gold, margin: 0, valign: 'middle' })
    sl.addText(st[1], { x, y: 5.79, w: 1.7, h: 0.28, fontFace: F, fontSize: 11, color: C.onDarkSoft, margin: 0, valign: 'middle' })
  })

  sl.addText('2026.07.24 – 07.26   ·   v_0.5.26   ·   Git 히스토리와 저장소 에셋을 기준으로 정리', {
    x: M, y: 6.5, w: 8.2, h: 0.3, fontFace: F, fontSize: 10.5, color: '9C8CBC', margin: 0, valign: 'middle',
  })
  sl.addNotes('1팀 넥슨 게임잼 AI 활용 보고서 표지. Little Token은 문장을 조립해 싸우는 덱빌딩 로그라이트이며, 주제인 Context를 게임 메카닉과 AI 협업 방식 양쪽에 적용했다.')
}

// ══════════════════════════════════════════════════════════════════════════════
// 2. 숫자로 보는 결과
// ══════════════════════════════════════════════════════════════════════════════
{
  const sl = slide('bg_night.jpg')
  eyebrow(sl, 'BY THE NUMBERS', M, 0.52)
  heading(sl, '3일 동안 AI와 함께 남긴 것', M, 0.84)
  subhead(sl, '팀이 쓴 도구 사용 내역과, 저장소가 실제로 들고 있는 결과물을 함께 셌습니다.', M, 1.55)

  const tiles = [
    ['5', 'AI 도구', 'ChatGPT · Claude Code\nCodex · Suno · Meshy'],
    ['110', 'Git 커밋', '전 브랜치 기준\n버전 기록 159건'],
    ['17,694', 'TypeScript 줄', '68개 파일\nstyle.css 7,105줄'],
    ['1,625', '자동 검사한 문장', '전 조합 순회\n막다른 길 0'],
    ['113', 'WebP 이미지', '카드 일러스트 62종\n배경·아이템·적 초상'],
    ['12', 'GLB 3D 모델', '플레이어·동행 토큰\n일반 적 6 · 보스 3'],
    ['28', '오디오 트랙', '보스 테마 3\n감정 공명 4 · 효과음'],
    ['22', '관용구(맥락)', '유일한 곱셈 요소\n모순 0 · 부조화 0'],
  ]
  const tw = 2.78, th = 1.72, gx = 0.32, gy = 0.3
  tiles.forEach((t, n) => {
    const col = n % 4, row = Math.floor(n / 4)
    const x = M + col * (tw + gx), y = 2.02 + row * (th + gy)
    glass(sl, x, y, tw, th)
    sl.addText(t[0], { x: x + 0.24, y: y + 0.14, w: tw - 0.48, h: 0.62, fontFace: F, fontSize: 34, bold: true, color: C.gold, margin: 0, valign: 'middle' })
    sl.addText(t[1], { x: x + 0.24, y: y + 0.74, w: tw - 0.48, h: 0.3, fontFace: F, fontSize: 13, bold: true, color: C.onDark, margin: 0, valign: 'middle' })
    sl.addText(t[2], { x: x + 0.24, y: y + 1.03, w: tw - 0.48, h: 0.56, fontFace: F, fontSize: 10.5, color: C.onDarkSoft, margin: 0, valign: 'top', lineSpacingMultiple: 1.2 })
  })

  paper(sl, M, 5.94, W - M * 2 - 1.15, 0.86)
  sl.addText([
    { text: '사람의 책임   ', options: { bold: true, color: C.goldDeep, fontSize: 13 } },
    { text: '콘셉트·세계관·최종 채택과 「지금 재미있는가」의 판정은 사람이 맡고, AI는 생성·구현·반복 검증을 맡았습니다.', options: { color: C.ink, fontSize: 13 } },
  ], { x: M + 0.3, y: 5.94, w: W - M * 2 - 1.75, h: 0.86, fontFace: F, margin: 0, valign: 'middle' })
  sl.addImage({ path: i('token_5.png'), x: W - M - 1.32, y: 5.5, w: 1.28, h: 1.28 })
  footNote(sl, '집계 기준: Git 히스토리(전 브랜치) · HEAD 추적 에셋 · VERSION.md 변경 이력 · npm run sweep 출력')
  sl.addNotes('숫자는 모두 저장소에서 직접 센 값. 1,625는 sweep이 순회한 유효 문장 조합 수.')
}

// ══════════════════════════════════════════════════════════════════════════════
// 3. 주제 해석 — Context 두 겹
// ══════════════════════════════════════════════════════════════════════════════
{
  const sl = slide('bg_night3.jpg')
  eyebrow(sl, 'THEME · CONTEXT', M, 0.52)
  heading(sl, '「맥락」을 게임의 규칙이자 팀의 작업 방식으로 썼습니다', M, 0.84, { size: 30 })

  const cw = 5.72, cy = 1.9, ch = 3.72
  // 왼쪽 — 게임 속 맥락
  paper(sl, M, cy, cw, ch)
  pill(sl, '게임 속 맥락', M + 0.32, cy + 0.3, 1.72, 0.36)
  sl.addText('단어 하나의 값은 고정되어 있지 않다', {
    x: M + 0.32, y: cy + 0.8, w: cw - 0.64, h: 0.4, fontFace: F, fontSize: 17, bold: true, color: C.ink, margin: 0, valign: 'middle',
  })
  sl.addText([
    { text: '앞뒤에 어떤 단어가 오느냐에 따라 선택 가능 여부·행동 종류·배수가 달라집니다. 같은 동사도 「조용히」와 「미친듯이」 사이에서 완전히 다른 문장이 됩니다.', options: { breakLine: true } },
    { text: '' , options: { breakLine: true, fontSize: 6 } },
    { text: '· 관용구 22종 — 태그 멀티셋이 맞을 때만 발동하는 유일한 곱셈 요소', options: { breakLine: true } },
    { text: '· 디메리트 없음 — 실패·자해·부조화를 전부 폐지, 이득의 종류로만 갈린다', options: { breakLine: true } },
    { text: '· 벌점이 아니라 배수로 격차를 만든다 (최대 336 피해까지 확인)', options: {} },
  ], { x: M + 0.32, y: cy + 1.24, w: cw - 0.64, h: 2.2, fontFace: F, fontSize: 12.5, color: C.ink, margin: 0, valign: 'top', lineSpacingMultiple: 1.34 })

  // 오른쪽 — 작업 속 맥락
  const rx = M + cw + 0.55
  paper(sl, rx, cy, cw, ch, { fill: '2E1F4E', lineColor: '6A52A0' })
  pill(sl, '작업 속 맥락', rx + 0.32, cy + 0.3, 1.72, 0.36, { fill: C.teal, color: '10333A' })
  sl.addText('AI의 결과도 앞에 무엇을 읽었느냐가 바꾼다', {
    x: rx + 0.32, y: cy + 0.8, w: cw - 0.64, h: 0.4, fontFace: F, fontSize: 17, bold: true, color: C.cream, margin: 0, valign: 'middle',
  })
  sl.addText([
    { text: '세션이 바뀌어도 같은 판단이 나오도록, 매번 설명하는 대신 규칙·이력·사양을 저장소에 남겨 모든 작업이 같은 맥락 위에서 이어지게 했습니다.', options: { breakLine: true } },
    { text: '', options: { breakLine: true, fontSize: 6 } },
    { text: '· AGENTS.md 249줄 — 기획 원칙과 전투 불변식을 계약으로 명시', options: { breakLine: true } },
    { text: '· VERSION.md 159건 — 무엇을 왜 바꿨는지의 이력', options: { breakLine: true } },
    { text: '· 실행 가능한 검사 6종 — 규칙 위반을 사람 대신 빌드가 잡는다', options: {} },
  ], { x: rx + 0.32, y: cy + 1.24, w: cw - 0.64, h: 2.2, fontFace: F, fontSize: 12.5, color: C.onDark, margin: 0, valign: 'top', lineSpacingMultiple: 1.34 })

  sl.addText('맥락을 잘 쌓으면 결과가 폭발한다 — 게임 안에서도, 팀 밖에서도 같은 규칙이 작동했습니다.', {
    x: M, y: 6.0, w: W - M * 2 - 1.4, h: 0.5, fontFace: F, fontSize: 15, bold: true, color: C.gold, margin: 0, valign: 'middle',
  })
  sl.addImage({ path: i('token_1.png'), x: W - M - 1.18, y: 5.62, w: 1.14, h: 1.14 })
  sl.addNotes('재밌넥 주제 Context. 게임 메카닉과 AI 협업 방식이 같은 원리를 공유한다는 것이 이번 보고서의 축.')
}

// ══════════════════════════════════════════════════════════════════════════════
// 4. 무엇을 만들었나
// ══════════════════════════════════════════════════════════════════════════════
{
  const sl = slide('bg_night.jpg')
  eyebrow(sl, 'WHAT WE BUILT', M, 0.52)
  heading(sl, '문장이 곧 전투 행동이 되는 그림일기 로그라이트', M, 0.84, { size: 30 })

  shotFrame(sl, '1-battle.jpg', 6.02, 1.78, 6.69)
  caption(sl, '실제 플레이 화면 — 하단 손패에서 주어 → 수식 → 동사를 골라 한 문장을 완성한다', 6.02, 5.62, 6.69)

  const rows = [
    ['한 줄 요약', '단어를 순서대로 골라 문장을 완성하면, 그 문장이 그대로 전투 행동이 된다.'],
    ['플레이 루프', '날짜·날씨 결정 → 슬롯대로 단어 선택 → Validator 차단·Compiler 번역 → 관용구 배수와 대성공 → 보상으로 단어장 확장'],
    ['구조', '15층 한 권 · 5·10·15층 보스(사마귀·여왕벌·장로거미) · 일반 적 6종 · 전설 규칙 아이템 11종'],
    ['화면', '전투 · 보상 · 감탄 · 엔딩 · 패배 · 시네마틱 등 13종'],
  ]
  let y = 1.84
  const rowH = [0.94, 1.24, 1.24, 0.98]
  rows.forEach((r, ri) => {
    const h = rowH[ri]
    paper(sl, M, y, 5.16, h)
    sl.addText(r[0], { x: M + 0.26, y: y + 0.13, w: 4.7, h: 0.3, fontFace: F, fontSize: 12, bold: true, color: C.goldDeep, margin: 0, valign: 'middle' })
    sl.addText(r[1], { x: M + 0.26, y: y + 0.42, w: 4.66, h: h - 0.55, fontFace: F, fontSize: 12, color: C.ink, margin: 0, valign: 'top', lineSpacingMultiple: 1.26 })
    y += h + 0.18
  })
  footNote(sl, '웹(TypeScript + Vite) · 고정 1920×1080 · GitHub Actions로 GitHub Pages 배포')
  sl.addNotes('게임 자체 소개. 이후 슬라이드에서 이 결과물의 각 부분을 어떤 AI가 어떻게 만들었는지 다룬다.')
}

// ══════════════════════════════════════════════════════════════════════════════
// 5. 도구별 역할 분담
// ══════════════════════════════════════════════════════════════════════════════
{
  const sl = slide('bg_night2.jpg')
  eyebrow(sl, 'HOW WE WORKED', M, 0.5)
  heading(sl, 'AI 활용은 「무엇을 잘하는가」로 나눴습니다', M, 0.82, { size: 30 })
  subhead(sl, '도구마다 맡긴 일이 다르고, 결과는 전부 실제 게임 안에서 확인했습니다.', M, 1.5)

  const head = [['도구', 1.9], ['맡긴 일', 2.5], ['게임에 남은 결과', 7.35]]
  let hx = M + 0.3
  head.forEach((h) => {
    sl.addText(h[0], { x: hx, y: 1.94, w: h[1], h: 0.3, fontFace: F, fontSize: 11, bold: true, color: C.gold, charSpacing: 1.5, margin: 0, valign: 'middle' })
    hx += h[1] + 0.12
  })

  const tools = [
    ['ChatGPT', 'F0A6B4', '2D 시안 · 콘셉트', '카드 일러스트 62종, 배경·아이템·적 초상의 초안. 채택된 것만 게임에 배선했다.'],
    ['Claude Code', 'F3C562', '코어 · UI · 검증 도구', '문장 컴파일러와 Validator, 전투 뷰, 전수 검사·보스 시뮬레이터. Git 저자 기록 15커밋.'],
    ['Codex', '8FD3E8', '구현 · 통합 · 배선', '기능 수정과 에셋 연결, 병렬 브랜치의 충돌 통합. 버전 이력에 「원격 변경과 통합」으로 남았다.'],
    ['Suno', 'A8C56B', '음악 · 효과음', '보스 테마 3곡, 전투 BGM 3곡 순환, 감정 공명 4종과 UI·전투 효과음까지 28트랙.'],
    ['Meshy', 'C6A8F0', '3D 메시', '적·보스 GLB 초안 12종. 1K 텍스처와 공용 idle 규격으로 다듬어 전장에 세웠다.'],
  ]
  let ty = 2.26
  tools.forEach((t) => {
    paper(sl, M, ty, W - M * 2, 0.8)
    sl.addShape(pres.ShapeType.roundRect, { x: M + 0.3, y: ty + 0.21, w: 1.72, h: 0.38, rectRadius: 0.19, fill: { color: t[1] }, line: { color: t[1], width: 0.5 } })
    sl.addText(t[0], { x: M + 0.3, y: ty + 0.21, w: 1.72, h: 0.38, fontFace: F, fontSize: 11.5, bold: true, color: '2E2312', align: 'center', valign: 'middle', margin: 0 })
    sl.addText(t[2], { x: M + 2.32, y: ty, w: 2.5, h: 0.8, fontFace: F, fontSize: 12, bold: true, color: C.ink, margin: 0, valign: 'middle' })
    sl.addText(t[3], { x: M + 4.94, y: ty, w: 7.02, h: 0.8, fontFace: F, fontSize: 11.5, color: C.inkSoft, margin: 0, valign: 'middle', lineSpacingMultiple: 1.2 })
    ty += 0.9
  })

  sl.addText('AI는 초안·구현·반복 작업을, 사람은 방향·재미·최종 결정을 맡았습니다.', {
    x: M, y: 6.86, w: W - M * 2, h: 0.36, fontFace: F, fontSize: 13, bold: true, color: C.gold, margin: 0, valign: 'middle',
  })
  sl.addNotes('도구 5종의 역할 분담표. 오른쪽 열은 전부 저장소에 실제로 남은 결과물.')
}

// ══════════════════════════════════════════════════════════════════════════════
// 6. 제작 흐름 6단계
// ══════════════════════════════════════════════════════════════════════════════
{
  const sl = slide('bg_night.jpg')
  eyebrow(sl, 'PIPELINE', M, 0.52)
  heading(sl, '한 번의 수정은 항상 이 여섯 칸을 지납니다', M, 0.84, { size: 30 })
  subhead(sl, '생성물을 그대로 두지 않고, 통합과 검증을 거쳐 사람의 플레이까지 도달해야 한 바퀴가 끝납니다.', M, 1.52)

  const steps = [
    ['기획', '사람이 콘셉트와\n규칙의 뼈대를 정한다'],
    ['맥락 공유', 'AGENTS.md · SPEC ·\nVERSION.md를 먼저 읽힌다'],
    ['생성 · 구현', '코드 · 아트 · 사운드 ·\n3D 초안을 만든다'],
    ['게임 통합', '문서가 아니라 실제\n플레이 흐름에 배선한다'],
    ['자동 검증', 'sweep · boss:sim 등이\n규칙 위반을 먼저 잡는다'],
    ['플레이 테스트', '사람이 직접 해 보고\n다음 수정의 기준을 준다'],
  ]
  const cw = 1.88, gap = 0.235, cy = 2.16, ch = 2.5
  steps.forEach((st, n) => {
    const x = M + n * (cw + gap)
    glass(sl, x, cy, cw, ch, { fill: n === 4 ? '3B2A0E' : C.panel, t: n === 4 ? 6 : 12, lineColor: n === 4 ? C.goldDeep : '5B4488' })
    sl.addShape(pres.ShapeType.ellipse, { x: x + cw / 2 - 0.24, y: cy + 0.24, w: 0.48, h: 0.48, fill: { color: C.gold }, line: { color: C.gold, width: 0.5 } })
    sl.addText(String(n + 1), { x: x + cw / 2 - 0.24, y: cy + 0.24, w: 0.48, h: 0.48, fontFace: F, fontSize: 15, bold: true, color: '3A2A08', align: 'center', valign: 'middle', margin: 0 })
    sl.addText(st[0], { x: x + 0.1, y: cy + 0.86, w: cw - 0.2, h: 0.4, fontFace: F, fontSize: 14, bold: true, color: C.onDark, align: 'center', valign: 'middle', margin: 0 })
    sl.addText(st[1], { x: x + 0.14, y: cy + 1.3, w: cw - 0.28, h: 1.0, fontFace: F, fontSize: 10, color: C.onDarkSoft, align: 'center', valign: 'top', margin: 0, lineSpacingMultiple: 1.25 })
    if (n < 5) {
      sl.addText('›', { x: x + cw, y: cy + 0.9, w: gap, h: 0.4, fontFace: F, fontSize: 20, bold: true, color: C.gold, align: 'center', valign: 'middle', margin: 0 })
    }
  })

  paper(sl, M, 5.06, W - M * 2, 1.16)
  sl.addText([
    { text: '한 바퀴가 끝나면 다시 2번으로 돌아갑니다.   ', options: { bold: true, color: C.goldDeep, fontSize: 13 } },
    { text: '플레이 테스트에서 나온 관찰을 문서와 검사 항목에 반영해야, 다음 세션의 AI가 같은 실수를 반복하지 않습니다. ', options: { color: C.ink, fontSize: 13, breakLine: true } },
    { text: '실제로 「보스가 자기 패턴을 다 못 보여 준다」는 플레이 관찰은 ', options: { color: C.ink, fontSize: 13 } },
    { text: 'npm run boss:sim', options: { color: C.goldDeep, fontSize: 12.5, bold: true } },
    { text: '이라는 새 검사 도구로 바뀌었습니다.', options: { color: C.ink, fontSize: 13 } },
  ], { x: M + 0.3, y: 5.06, w: W - M * 2 - 0.6, h: 1.16, fontFace: F, margin: 0, valign: 'middle', lineSpacingMultiple: 1.3 })
  footNote(sl, '근거: AGENTS.md「작업 및 검증 규칙」 · VERSION.md v_0.5.3')
  sl.addNotes('6단계 파이프라인. 5번 자동 검증 칸을 금색으로 강조해 다음 슬라이드로 연결.')
}

// ══════════════════════════════════════════════════════════════════════════════
// 7. 공통 기억 — AI에게 먼저 준 것
// ══════════════════════════════════════════════════════════════════════════════
{
  const sl = slide('bg_night3.jpg')
  eyebrow(sl, 'SHARED MEMORY', M, 0.52)
  heading(sl, '프롬프트를 길게 쓰는 대신, 저장소가 프롬프트가 되게 했습니다', M, 0.84, { size: 28 })
  subhead(sl, '세션·사람·브랜치가 갈라져도 같은 판단이 나오도록, 규칙과 이력을 파일로 남겼습니다.', M, 1.52)

  const docs = [
    ['AGENTS.md', '249줄', '기획 원칙과 전투 불변식', '「컴파일러는 순수함수로 유지한다」, 「슬롯 키를 하드코딩하지 않는다」, 「디메리트를 두지 않는다」처럼 지켜야 할 계약을 문장으로 못 박았습니다. 새 세션의 AI도 이 파일을 먼저 읽고 같은 전제 위에서 작업합니다.'],
    ['SENTENCE_COMBAT_SPEC.md', '전투 사양', '살아 있는 규칙 + 폐지한 규칙', '현재 규칙만이 아니라 폐지한 규칙(실패·자해·부조화·고정 위력·배수 상한)을 따로 남겼습니다. 되살리면 안 되는 것을 적어 두는 편이, 매번 하지 말라고 말하는 것보다 쌉니다.'],
    ['VERSION.md', '159건', '무엇을 왜 바꿨는가', '모든 커밋이 버전을 올리고 이유를 남깁니다. 병렬로 갈라진 브랜치를 합칠 때, 다음 작업이 앞선 결정을 모르고 지우는 사고를 막아 줍니다.'],
    ['src/data/csv + README', '데이터 원본', '데이터의 계약', '단어·관용구의 원본은 CSV이고 생성물은 직접 고치지 않는다는 규칙까지 문서에 있습니다. 슬롯별 역할(주어=배율, 수식=확률, 동사=깡수치)도 여기서 고정됩니다.'],
  ]
  const cw = 6.02, ch = 2.16, gx = 0.45, gy = 0.3
  docs.forEach((d, n) => {
    const col = n % 2, row = Math.floor(n / 2)
    const x = M + col * (cw + gx), y = 2.0 + row * (ch + gy)
    paper(sl, x, y, cw, ch)
    sl.addText(d[0], { x: x + 0.3, y: y + 0.18, w: cw - 1.5, h: 0.32, fontFace: F, fontSize: 14.5, bold: true, color: C.ink, margin: 0, valign: 'middle' })
    sl.addShape(pres.ShapeType.roundRect, { x: x + cw - 1.42, y: y + 0.2, w: 1.12, h: 0.3, rectRadius: 0.15, fill: { color: C.goldDeep }, line: { color: C.goldDeep, width: 0.5 } })
    sl.addText(d[1], { x: x + cw - 1.42, y: y + 0.2, w: 1.12, h: 0.3, fontFace: F, fontSize: 10, bold: true, color: 'FFF6E0', align: 'center', valign: 'middle', margin: 0 })
    sl.addText(d[2], { x: x + 0.3, y: y + 0.52, w: cw - 0.6, h: 0.28, fontFace: F, fontSize: 11.5, bold: true, color: C.goldDeep, margin: 0, valign: 'middle' })
    sl.addText(d[3], { x: x + 0.3, y: y + 0.84, w: cw - 0.6, h: 1.2, fontFace: F, fontSize: 11.5, color: C.inkSoft, margin: 0, valign: 'top', lineSpacingMultiple: 1.28 })
  })

  sl.addText('결과적으로 「어떻게 물어보는가」보다 「무엇을 남겨 두는가」가 산출물의 품질을 갈랐습니다.', {
    x: M, y: 6.72, w: W - M * 2 - 1.2, h: 0.4, fontFace: F, fontSize: 14, bold: true, color: C.gold, margin: 0, valign: 'middle',
  })
  sl.addImage({ path: i('token_2.png'), x: W - M - 1.05, y: 6.16, w: 1.02, h: 1.02 })
  sl.addNotes('컨텍스트 운영이 이번 프로젝트의 핵심 AI 활용법. 문서 4종이 모든 세션의 공통 입력.')
}

// ══════════════════════════════════════════════════════════════════════════════
// 8. 코어 구현
// ══════════════════════════════════════════════════════════════════════════════
{
  const sl = slide('bg_night.jpg')
  eyebrow(sl, 'CORE · CODE', M, 0.52)
  heading(sl, 'AI가 쓴 코드에도 경계선을 그어 두었습니다', M, 0.84, { size: 30 })
  subhead(sl, '레이어마다 책임을 문서로 고정해, 어느 세션이 손대도 규칙이 View로 새지 않게 했습니다.', M, 1.52)

  const layers = [
    ['core/', '타입 · 문장 컴파일 · 모순 검증 · 플레이어와 런 상태', 'F3C562'],
    ['data/', '단어 · 관용구 · 적 · 필드 · 아이템 · 보상 수치 (CSV 원본에서 생성)', '8FD3E8'],
    ['sim/', 'Intent를 실제 전투 상태 변화로 적용하는 헤드리스 시뮬레이션', 'A8C56B'],
    ['views/', '입력 · 표시 · 연출. 핵심 규칙을 새로 정의하지 않는다', 'F0A6B4'],
    ['tools/', '전수 밸런스 검사 · 보스 패턴 검수 · 리소스 수명 검사', 'C6A8F0'],
  ]
  let ly = 2.0
  layers.forEach((l) => {
    glass(sl, M, ly, 6.4, 0.68)
    sl.addShape(pres.ShapeType.roundRect, { x: M + 0.24, y: ly + 0.18, w: 0.94, h: 0.32, rectRadius: 0.16, fill: { color: l[2] }, line: { color: l[2], width: 0.5 } })
    sl.addText(l[0], { x: M + 0.24, y: ly + 0.18, w: 0.94, h: 0.32, fontFace: F, fontSize: 10.5, bold: true, color: '2E2312', align: 'center', valign: 'middle', margin: 0 })
    sl.addText(l[1], { x: M + 1.32, y: ly, w: 4.9, h: 0.68, fontFace: F, fontSize: 11, color: C.onDark, margin: 0, valign: 'middle', lineSpacingMultiple: 1.14 })
    ly += 0.76
  })

  const rx = M + 6.8
  paper(sl, rx, 2.0, W - rx - M, 3.66)
  sl.addText('AI가 지켜야 했던 불변식', { x: rx + 0.3, y: 2.16, w: 5.0, h: 0.34, fontFace: F, fontSize: 15, bold: true, color: C.ink, margin: 0, valign: 'middle' })
  sl.addText([
    { text: 'core/compiler.ts는 순수함수로 유지한다.', options: { bold: true, breakLine: true } },
    { text: 'RNG와 화면 상태를 참조하지 않는다. 확률은 바깥에서 굴린다.', options: { color: C.inkSoft, breakLine: true } },
    { text: '', options: { breakLine: true, fontSize: 6 } },
    { text: '슬롯 키와 개수를 하드코딩하지 않는다.', options: { bold: true, breakLine: true } },
    { text: '문장 슬롯은 가변 길이다. 아이템이 칸을 늘려도 컴파일러는 그대로 돈다.', options: { color: C.inkSoft, breakLine: true } },
    { text: '', options: { breakLine: true, fontSize: 6 } },
    { text: '밸런스 수치를 View에 넣지 않는다.', options: { bold: true, breakLine: true } },
    { text: '수치는 src/data 또는 공용 로직에만 둔다. 화면 총합은 실제 수치와 같아야 한다.', options: { color: C.inkSoft, breakLine: true } },
    { text: '', options: { breakLine: true, fontSize: 6 } },
    { text: '소프트락을 허용하지 않는다.', options: { bold: true, breakLine: true } },
    { text: '모순 판정 뒤 어떤 슬롯에서도 선택지가 0개가 되어서는 안 된다.', options: { color: C.inkSoft } },
  ], { x: rx + 0.3, y: 2.56, w: W - rx - M - 0.6, h: 3.0, fontFace: F, fontSize: 11.5, color: C.ink, margin: 0, valign: 'top', lineSpacingMultiple: 1.22 })

  const nums = [['68', 'TypeScript 파일'], ['17,694', '코드 줄'], ['7,105', 'style.css 줄'], ['13', '게임 화면']]
  nums.forEach((n, k) => {
    const x = M + k * 3.09
    glass(sl, x, 5.9, 2.81, 0.92, { fill: '241A3E', t: 8 })
    sl.addText(n[0], { x: x + 0.22, y: 5.98, w: 2.37, h: 0.42, fontFace: F, fontSize: 21, bold: true, color: C.gold, margin: 0, valign: 'middle' })
    sl.addText(n[1], { x: x + 0.22, y: 6.4, w: 2.37, h: 0.26, fontFace: F, fontSize: 10.5, color: C.onDarkSoft, margin: 0, valign: 'middle' })
  })
  sl.addText('근거: AGENTS.md「전투 로직 불변식」·「코드 구조와 책임」 · 저장소 파일 집계', { x: M, y: 7.02, w: W - M * 2, h: 0.28, fontFace: F, fontSize: 9.5, color: '8E7DAE', margin: 0, valign: 'middle' })
  sl.addNotes('AI에게 자유롭게 코드를 맡기되, 어디에 무엇을 두는지는 문서로 고정했다.')
}

// ══════════════════════════════════════════════════════════════════════════════
// 9. 자동 검증 6종
// ══════════════════════════════════════════════════════════════════════════════
{
  const sl = slide('bg_night2.jpg')
  eyebrow(sl, 'VERIFICATION', M, 0.5)
  heading(sl, '규칙을 「실행 가능한 검사」로 바꿔 AI에게 되돌려 줬습니다', M, 0.82, { size: 28 })
  subhead(sl, '생성물의 품질을 사람이 매번 눈으로 세지 않도록, 여섯 개의 검사가 빌드에서 먼저 실패합니다.', M, 1.5)

  const checks = [
    ['npm run sweep', '문장 전수 밸런스', '모순을 제외한 전 조합을 순회해 즉발 피해 분포와 불변식 INV-1~3을 검사한다. 실게임과 같은 컴파일러 함수를 호출한다.'],
    ['npm run check', '등급 예산 계약', 'core/budget.ts의 예산과 카드 수치를 대조한다. 일러스트 누락, 「무럭무럭」 칸 커버리지도 함께 본다.'],
    ['npm run boss:sim', '보스 패턴 검수', '3보스 × 20전을 치러 승률·턴 수와 함께 패턴이 몇 번 발동했는지를 센다.'],
    ['npm run effects:check', '전투 효과 회귀', '관통·거미줄 상한·다리 파훼 순서 같은 규칙을 고정해 뒤늦은 회귀를 막는다.'],
    ['npm run assets:check', '에셋 규격', '남아 있는 PNG와 1K를 넘긴 GLB 텍스처를 실패로 처리한다.'],
    ['npm run resources:check', '리소스 수명', '직접 Image·Audio·Video·GLTF 생성이 다시 늘면 빌드에서 차단한다.'],
  ]
  const cw = 3.84, ch = 1.66, gx = 0.27, gy = 0.26
  checks.forEach((c, n) => {
    const col = n % 3, row = Math.floor(n / 3)
    const x = M + col * (cw + gx), y = 1.98 + row * (ch + gy)
    paper(sl, x, y, cw, ch)
    sl.addText(c[0], { x: x + 0.26, y: y + 0.16, w: cw - 0.52, h: 0.3, fontFace: F, fontSize: 13, bold: true, color: C.goldDeep, margin: 0, valign: 'middle' })
    sl.addText(c[1], { x: x + 0.26, y: y + 0.46, w: cw - 0.52, h: 0.28, fontFace: F, fontSize: 11.5, bold: true, color: C.ink, margin: 0, valign: 'middle' })
    sl.addText(c[2], { x: x + 0.26, y: y + 0.76, w: cw - 0.52, h: 0.78, fontFace: F, fontSize: 10.5, color: C.inkSoft, margin: 0, valign: 'top', lineSpacingMultiple: 1.24 })
  })

  glass(sl, M, 5.62, W - M * 2 - 1.28, 1.06, { fill: '3B2A0E', t: 4, lineColor: C.goldDeep })
  sl.addText([
    { text: 'npm run build', options: { bold: true, color: C.gold, fontSize: 13 } },
    { text: '  는 데이터 생성 → 에셋 규격 → 리소스 수명 → 타입 검사를 차례로 통과해야 끝납니다. ', options: { color: C.onDark, fontSize: 12.5 } },
    { text: '검사가 하나라도 실패하면 배포되지 않으므로, AI가 만든 변경도 사람과 같은 관문을 지납니다.', options: { color: C.onDark, fontSize: 12.5 } },
  ], { x: M + 0.3, y: 5.62, w: W - M * 2 - 1.88, h: 1.06, fontFace: F, margin: 0, valign: 'middle', lineSpacingMultiple: 1.3 })
  sl.addImage({ path: i('token_1.png'), x: W - M - 1.14, y: 5.56, w: 1.1, h: 1.1 })
  sl.addNotes('AI 산출물의 품질 관리 방법. 검사 6종은 모두 AI가 함께 만든 도구다.')
}

// ══════════════════════════════════════════════════════════════════════════════
// 10. 검증 사례 ① 문장 전수 검사
// ══════════════════════════════════════════════════════════════════════════════
{
  const sl = slide('bg_night.jpg')
  eyebrow(sl, 'CASE ① · SWEEP', M, 0.52)
  heading(sl, '사람이 셀 수 없는 조합을, 실게임과 같은 함수로 전부 돌렸습니다', M, 0.84, { size: 27 })

  glass(sl, M, 1.72, 7.0, 3.0, { fill: '120C22', t: 0, lineColor: '4B3A78' })
  sl.addText('$ npm run sweep', { x: M + 0.3, y: 1.86, w: 6.4, h: 0.3, fontFace: F, fontSize: 12, bold: true, color: C.teal, margin: 0, valign: 'middle' })
  sl.addText([
    { text: '문장 CSV 생성 완료: 단어 75개 · 관용구 22개 · 모순 0개 · 부조화 0개', options: { color: 'C9BBE4', breakLine: true } },
    { text: '유효 문장 1625 · 차단된 선택 2 · 막다른 길 0', options: { color: C.onDark, bold: true, breakLine: true } },
    { text: '즉발(단일) min 5 / p25 14 / med 24 / p75 47 / max 336', options: { color: 'C9BBE4', breakLine: true } },
    { text: '', options: { breakLine: true, fontSize: 6 } },
    { text: '통과  INV-1  전형(median)이 즉사 아님 (24 vs 90)', options: { color: C.leaf, breakLine: true } },
    { text: '통과  INV-2  관용구 없이 p75 도달 (64 vs 47)', options: { color: C.leaf, breakLine: true } },
    { text: '통과  INV-3  막다른 길 없음 (0)', options: { color: C.leaf } },
  ], { x: M + 0.3, y: 2.22, w: 6.4, h: 2.36, fontFace: F, fontSize: 11.5, margin: 0, valign: 'top', lineSpacingMultiple: 1.34 })

  const rx = M + 7.4
  paper(sl, rx, 1.72, W - rx - M, 3.2)
  sl.addText('무엇을 지켜 주는가', { x: rx + 0.3, y: 1.88, w: 4.6, h: 0.32, fontFace: F, fontSize: 14.5, bold: true, color: C.ink, margin: 0, valign: 'middle' })
  sl.addText([
    { text: '카드를 한 장 더할 때마다 조합은 곱으로 늘어납니다. 사람이 다 셀 수 없으니, 화면을 거치지 않고 컴파일러를 직접 호출해 전 조합을 계산합니다.', options: { breakLine: true } },
    { text: '', options: { breakLine: true, fontSize: 6 } },
    { text: '「막다른 길 0」', options: { bold: true, color: C.goldDeep } },
    { text: ' 은 어떤 선택 경로에서도 고를 카드가 사라지지 않는다는 뜻입니다. 소프트락은 플레이 테스트로는 거의 잡히지 않습니다.', options: { breakLine: true } },
    { text: '', options: { breakLine: true, fontSize: 6 } },
    { text: '중앙값 24는 즉사가 아니고, 최댓값 336은 맥락이 완벽히 맞았을 때만 나옵니다 — 격차를 벌점이 아니라 배수로 만든다는 기획 원칙이 수치로 확인됩니다.', options: {} },
  ], { x: rx + 0.3, y: 2.26, w: W - rx - M - 0.6, h: 2.56, fontFace: F, fontSize: 11, color: C.ink, margin: 0, valign: 'top', lineSpacingMultiple: 1.28 })

  paper(sl, M, 5.14, W - M * 2, 1.5, { fill: '2E1F4E', lineColor: '6A52A0' })
  sl.addText('가장 센 문장 (전수 검사 상위)', { x: M + 0.3, y: 5.24, w: 6.0, h: 0.3, fontFace: F, fontSize: 12, bold: true, color: C.gold, margin: 0, valign: 'middle' })
  const tops = [
    ['336', '우리는 미친듯이 불꽃을 점화 하고 말았다!', '화염광란 · 공멸'],
    ['266', '우리는 미친듯이 불꽃을 점화 했다', '화염광란 · 공멸'],
    ['198', '우리는 미친듯이 빗물을 점화 하고 말았다!', '공멸 · 장맛비'],
  ]
  tops.forEach((t, n) => {
    const y = 5.6 + n * 0.33
    sl.addText(t[0], { x: M + 0.3, y, w: 0.8, h: 0.3, fontFace: F, fontSize: 13, bold: true, color: C.rose, margin: 0, valign: 'middle' })
    sl.addText('「' + t[1] + '」', { x: M + 1.16, y, w: 6.6, h: 0.3, fontFace: F, fontSize: 12, color: C.cream, margin: 0, valign: 'middle' })
    sl.addText(t[2], { x: M + 7.9, y, w: 4.0, h: 0.3, fontFace: F, fontSize: 11, color: C.gold, margin: 0, valign: 'middle' })
  })
  footNote(sl, '2026-07-26 실행 결과 · src/tools/sweep.ts')
  sl.addNotes('전수 검사는 밸런스뿐 아니라 소프트락 방지 장치이기도 하다.')
}

// ══════════════════════════════════════════════════════════════════════════════
// 11. 검증 사례 ② 보스 시뮬레이터
// ══════════════════════════════════════════════════════════════════════════════
{
  const sl = slide('bg_night.jpg')
  eyebrow(sl, 'CASE ② · BOSS SIM', M, 0.52)
  heading(sl, '「수치만 큰 허수아비」를 잡아낸 것도 AI가 만든 도구였습니다', M, 0.84, { size: 27 })

  paper(sl, M, 1.72, 7.62, 3.42)
  sl.addText('npm run boss:sim — 보스별 20전', { x: M + 0.28, y: 1.86, w: 5.0, h: 0.3, fontFace: F, fontSize: 12.5, bold: true, color: C.goldDeep, margin: 0, valign: 'middle' })
  const cols = [['보스', 1.7], ['greedy', 1.55], ['smart', 1.55], ['패턴이 실제로 발동한 횟수', 2.5]]
  let cx = M + 0.28
  cols.forEach((c) => {
    sl.addText(c[0], { x: cx, y: 2.2, w: c[1], h: 0.28, fontFace: F, fontSize: 10.5, bold: true, color: C.inkSoft, margin: 0, valign: 'middle' })
    cx += c[1] + 0.1
  })
  const bossRows = [
    ['5층 · 사마귀', '14 / 20', '19 / 20', '방어 성공 49회'],
    ['10층 · 여왕벌', '14 / 20', '17 / 20', '일벌 퇴치 280 · 그로기 66'],
    ['15층 · 장로거미', '5 / 20', '20 / 20', '부위 파괴 100 · 관통 23'],
  ]
  bossRows.forEach((r, n) => {
    const y = 2.54 + n * 0.62
    sl.addShape(pres.ShapeType.roundRect, { x: M + 0.2, y: y - 0.04, w: 7.22, h: 0.54, rectRadius: 0.08, fill: { color: n === 2 ? 'F0E2C0' : 'EFE2C4', transparency: n === 2 ? 0 : 45 }, line: { color: 'DDCBA4', width: 0.5 } })
    sl.addText(r[0], { x: M + 0.28, y, w: 1.7, h: 0.46, fontFace: F, fontSize: 12, bold: true, color: C.ink, margin: 0, valign: 'middle' })
    sl.addText(r[1], { x: M + 2.08, y, w: 1.55, h: 0.46, fontFace: F, fontSize: 13, bold: true, color: '9A5A5A', margin: 0, valign: 'middle' })
    sl.addText(r[2], { x: M + 3.73, y, w: 1.55, h: 0.46, fontFace: F, fontSize: 13, bold: true, color: '3F7A52', margin: 0, valign: 'middle' })
    sl.addText(r[3], { x: M + 5.38, y, w: 2.04, h: 0.46, fontFace: F, fontSize: 10.5, color: C.inkSoft, margin: 0, valign: 'middle' })
  })
  sl.addText('greedy = 패턴을 무시하고 늘 최대 피해 · smart = 예고·체력·위협을 보고 방어와 회복을 섞는 플레이어', {
    x: M + 0.28, y: 4.6, w: 7.06, h: 0.4, fontFace: F, fontSize: 10.5, italic: true, color: C.inkSoft, margin: 0, valign: 'middle', lineSpacingMultiple: 1.2,
  })

  const rx = M + 8.02
  const sh = shotFrame(sl, 'b10-queenbee.jpg', rx, 1.72, W - rx - M)
  caption(sl, '10층 여왕벌 — 일벌 넷이 살아 있으면 본체는 무적', rx, 1.72 + sh + 0.14, W - rx - M)

  paper(sl, M, 5.34, W - M * 2, 1.34, { fill: '2E1F4E', lineColor: '6A52A0' })
  sl.addText([
    { text: '도구가 없었으면 못 봤을 것   ', options: { bold: true, color: C.gold, fontSize: 13 } },
    { text: '「세 보스 모두 자기 패턴이 끝까지 재생되기 전에 전투가 끝나고 있었다.」 승률만 보면 정상이라 아무도 눈치채지 못했습니다. ', options: { color: C.cream, fontSize: 12.5, breakLine: true } },
    { text: '발동 횟수를 세는 항목을 추가한 뒤에야 문제가 드러났고, 그 수치를 기준으로 보스 체력·소환·부위 규칙을 다시 맞췄습니다. 두 플레이어의 승률 차이(15층 5/20 → 20/20)가 곧 「패턴을 읽을 이유」의 크기입니다.', options: { color: C.creamDim, fontSize: 12.5 } },
  ], { x: M + 0.3, y: 5.34, w: W - M * 2 - 0.6, h: 1.34, fontFace: F, margin: 0, valign: 'middle', lineSpacingMultiple: 1.28 })
  footNote(sl, '근거: VERSION.md v_0.5.3 / v_0.5.8 · 2026-07-26 npm run boss:sim 실행 결과')
  sl.addNotes('플레이 관찰 → 검사 항목으로의 전환을 보여 주는 대표 사례.')
}

// ══════════════════════════════════════════════════════════════════════════════
// 12. 2D 아트 파이프라인
// ══════════════════════════════════════════════════════════════════════════════
{
  const sl = slide('bg_night2.jpg')
  eyebrow(sl, 'PIPELINE · 2D ART', M, 0.5)
  heading(sl, '시안은 AI가, 채택과 규격은 파이프라인이 맡았습니다', M, 0.82, { size: 29 })

  const sh = shotFrame(sl, '3-reward.jpg', 6.42, 1.68, 6.29)
  caption(sl, '보상 화면 — 카드마다 일러스트·감정·수치가 한 장에 붙는다', 6.42, 1.68 + sh + 0.14, 6.29)

  const steps = [
    ['① 생성', 'ChatGPT로 카드·배경·아이템 시안을 뽑고, 톤이 맞는 것만 남깁니다.'],
    ['② 확장', '맥락카드 일러스트를 27종에서 62종으로 늘려, 일러스트 없는 단어를 0개로 만들었습니다.'],
    ['③ 일관성', '감정 4종(기쁨·분노·슬픔·즐거움)에서 뽑은 색을 손패·도감·보상·적 약점에 같은 규칙으로 적용했습니다.'],
    ['④ 규격 자동화', 'assets:optimize가 용도별 해상도·품질로 WebP를 굽고 원본 PNG를 삭제합니다.\n배경 1920×1080 q84 · 카드 512×768 q82 · 토큰 900×900 q85.'],
  ]
  let y = 1.68
  const stepH = [0.84, 0.94, 1.0, 1.26]
  steps.forEach((st, si) => {
    const h = stepH[si]
    paper(sl, M, y, 5.5, h)
    sl.addText(st[0], { x: M + 0.26, y: y + 0.12, w: 4.9, h: 0.28, fontFace: F, fontSize: 12, bold: true, color: C.goldDeep, margin: 0, valign: 'middle' })
    sl.addText(st[1], { x: M + 0.26, y: y + 0.4, w: 4.98, h: h - 0.52, fontFace: F, fontSize: 11.5, color: C.ink, margin: 0, valign: 'top', lineSpacingMultiple: 1.26 })
    y += h + 0.14
  })

  // 감정 아이콘 줄
  glass(sl, M, 6.18, 5.5, 0.8, { fill: '241A3E', t: 8 })
  const emo = [['emo_joy.png', '기쁨'], ['emo_anger.png', '분노'], ['emo_sorrow.png', '슬픔'], ['emo_pleasure.png', '즐거움']]
  emo.forEach((e, n) => {
    const x = M + 0.3 + n * 1.28
    sl.addImage({ path: i(e[0]), x, y: 6.3, w: 0.56, h: 0.56 })
    sl.addText(e[1], { x: x + 0.62, y: 6.3, w: 0.66, h: 0.56, fontFace: F, fontSize: 11, color: C.onDark, margin: 0, valign: 'middle' })
  })

  glass(sl, 6.42, 6.18, 6.29, 0.8, { fill: '3B2A0E', t: 6, lineColor: C.goldDeep })
  sl.addText([
    { text: 'WebP 113장', options: { bold: true, color: C.gold, fontSize: 13 } },
    { text: '   —  PNG가 남아 있으면 ', options: { color: C.onDark, fontSize: 11.5 } },
    { text: 'npm run assets:check', options: { color: C.gold, fontSize: 11 } },
    { text: ' 가 빌드를 실패시킵니다.', options: { color: C.onDark, fontSize: 11.5 } },
  ], { x: 6.72, y: 6.18, w: 5.7, h: 0.8, fontFace: F, margin: 0, valign: 'middle' })
  sl.addNotes('2D는 생성보다 규격 관리가 어려웠고, 그 부분을 스크립트로 고정했다.')
}

// ══════════════════════════════════════════════════════════════════════════════
// 13. 3D 파이프라인
// ══════════════════════════════════════════════════════════════════════════════
{
  const sl = slide('bg_night.jpg')
  eyebrow(sl, 'PIPELINE · 3D', M, 0.5)
  heading(sl, '생성된 메시를 그대로 쓰지 않고, 전장 규격에 맞춰 다시 구웠습니다', M, 0.82, { size: 27 })

  const sh = shotFrame(sl, 'b15-spider.jpg', 6.42, 1.62, 6.29)
  caption(sl, '15층 장로거미 — 다리 하나가 곧 체력 한 막, 약점이 순서대로 드러난다', 6.42, 1.62 + sh + 0.14, 6.29)

  const items = [
    ['Meshy로 초안 생성', '적·보스 메시를 뽑고, 실루엣이 읽히는 것만 게임 규격으로 넘겼습니다. GLB 12종(플레이어·동행 토큰·일반 적 6·보스 3).'],
    ['텍스처 1K 통일', '텍스처를 모델 안에 임베드하고 가로·세로 어느 축도 1,024px를 넘지 않게 다시 굽습니다. bufferView와 뒤따르는 모든 오프셋 재정렬은 스크립트가 하고, 바이너리는 손대지 않습니다.'],
    ['공용 애니메이션 규칙', '모든 적은 측면에서 화면 쪽 60°를 공유하고, idle 마지막 0.5초를 첫 자세로 쿼터니언 구면 보간해 루프 경계의 꺾임을 없앴습니다.'],
    ['언릿 카툰 셰이딩', 'PBR 실사풍 대신 4단 카툰 명암에 배경 팔레트를 섞어, 3D 모델이 그림일기 UI와 같은 톤으로 보이게 했습니다.'],
  ]
  let y = 1.62
  items.forEach((it) => {
    const h = it[1].length > 75 ? 1.18 : 1.0
    paper(sl, M, y, 5.5, h)
    sl.addText(it[0], { x: M + 0.26, y: y + 0.12, w: 4.98, h: 0.3, fontFace: F, fontSize: 12.5, bold: true, color: C.goldDeep, margin: 0, valign: 'middle' })
    sl.addText(it[1], { x: M + 0.26, y: y + 0.42, w: 4.98, h: h - 0.54, fontFace: F, fontSize: 11, color: C.ink, margin: 0, valign: 'top', lineSpacingMultiple: 1.24 })
    y += h + 0.14
  })

  // 보스 스프라이트 3종
  glass(sl, 6.42, 5.72, 6.29, 1.1, { fill: '241A3E', t: 8 })
  const bosses = [['boss_mantis.png', '사마귀'], ['boss_queen_bee.png', '여왕벌'], ['boss_elder_spider.png', '장로거미']]
  bosses.forEach((b, n) => {
    const x = 6.62 + n * 2.06
    sl.addImage({ path: i(b[0]), x, y: 5.8, w: 0.92, h: 0.92 })
    sl.addText(b[1], { x: x + 0.98, y: 5.8, w: 1.0, h: 0.92, fontFace: F, fontSize: 11.5, bold: true, color: C.onDark, margin: 0, valign: 'middle' })
  })
  footNote(sl, '근거: AGENTS.md「에셋 최적화 규격」·「캐릭터 표현」 · scripts/optimize-assets.ts')
  sl.addNotes('3D는 생성 이후의 정리 작업이 더 길었다. 규칙을 공용 상수와 스크립트로 묶었다.')
}

// ══════════════════════════════════════════════════════════════════════════════
// 14. 사운드
// ══════════════════════════════════════════════════════════════════════════════
{
  const sl = slide('bg_night3.jpg')
  eyebrow(sl, 'PIPELINE · AUDIO', M, 0.5)
  heading(sl, '소리는 만든 다음이 더 중요했습니다 — 전투 흐름에 맞춰 잘랐습니다', M, 0.82, { size: 27 })
  subhead(sl, 'Suno로 곡과 효과음을 만들고, 채택본만 실제 전투 타이밍에 맞춰 배선했습니다. 총 28트랙.', M, 1.5)

  const groups = [
    ['보스 테마 3', '사마귀 · 여왕벌 · 장로거미', 'F0A6B4'],
    ['전투 BGM 3', '순환 재생 · 패배 화면 곡 분리', '8FD3E8'],
    ['감정 공명 4', '기쁨 · 분노 · 슬픔 · 즐거움', 'A8C56B'],
    ['UI · 전투 효과음', '카드 · 강타 · 방어 · 회복 · 종이', 'C6A8F0'],
  ]
  groups.forEach((g, n) => {
    const x = M + n * 3.06
    glass(sl, x, 1.96, 2.84, 1.32)
    sl.addShape(pres.ShapeType.ellipse, { x: x + 0.24, y: 2.18, w: 0.34, h: 0.34, fill: { color: g[2] }, line: { color: g[2], width: 0.5 } })
    sl.addText(g[0], { x: x + 0.68, y: 2.14, w: 2.0, h: 0.42, fontFace: F, fontSize: 13, bold: true, color: C.onDark, margin: 0, valign: 'middle' })
    sl.addText(g[1], { x: x + 0.24, y: 2.62, w: 2.36, h: 0.56, fontFace: F, fontSize: 10.5, color: C.onDarkSoft, margin: 0, valign: 'top', lineSpacingMultiple: 1.2 })
  })

  const notes = [
    ['연출과 소리의 길이를 맞췄다', '감정 공명 효과음은 배율 정산 연출과 붙어 있어, 길면 전투 흐름을 가립니다. 분노 테마를 레퀴엠식 두 화음으로 바꾸면서 재생 길이를 짧게 제한했습니다. (v_0.3.48)'],
    ['재생 방식을 소리 성격별로 나눴다', 'Howler로 통합해 짧은 효과음은 Web Audio 버퍼와 재사용 보이스 풀로, 긴 배경음악은 전체 PCM 디코딩 없이 HTML5로 스트리밍합니다. (v_0.5.4)'],
    ['예외는 예외로 적어 두었다', '48초 원본 중 1초만 쓰는 연필 소리는 스트리밍 예외로 분리해, 불필요한 전체 디코딩과 메모리 점유를 막았습니다.'],
  ]
  let y = 3.5
  notes.forEach((n) => {
    paper(sl, M, y, W - M * 2 - 1.3, 0.96)
    sl.addText(n[0], { x: M + 0.3, y: y + 0.12, w: 10.0, h: 0.3, fontFace: F, fontSize: 12.5, bold: true, color: C.ink, margin: 0, valign: 'middle' })
    sl.addText(n[1], { x: M + 0.3, y: y + 0.42, w: 10.6, h: 0.46, fontFace: F, fontSize: 11, color: C.inkSoft, margin: 0, valign: 'top', lineSpacingMultiple: 1.22 })
    y += 1.08
  })
  sl.addImage({ path: i('token_4.png'), x: W - M - 1.16, y: 4.5, w: 1.12, h: 1.12 })
  footNote(sl, '근거: src/assets/audio 28개 파일 · VERSION.md v_0.3.46 ~ v_0.5.26')
  sl.addNotes('AI 생성 자체보다 게임 흐름에 맞추는 후처리가 작업의 대부분이었다.')
}

// ══════════════════════════════════════════════════════════════════════════════
// 15. 사람과 AI의 경계
// ══════════════════════════════════════════════════════════════════════════════
{
  const sl = slide('bg_night.jpg')
  eyebrow(sl, 'THE LINE', M, 0.52)
  heading(sl, '무엇을 맡기고 무엇을 맡지 않았는가', M, 0.84)

  const cw = 6.02, cy = 1.9, ch = 3.66
  paper(sl, M, cy, cw, ch, { fill: '2E1F4E', lineColor: '6A52A0' })
  pill(sl, 'AI가 맡은 일', M + 0.32, cy + 0.28, 1.86, 0.38, { fill: C.teal, color: '10333A' })
  sl.addText([
    { text: '초안 생성 — 코드 · 아트 · 사운드 · 3D 메시', options: { bullet: true, breakLine: true } },
    { text: '반복 구현과 리팩터링, 대규모 수정의 일괄 적용', options: { bullet: true, breakLine: true } },
    { text: '병렬로 갈라진 브랜치의 충돌 통합', options: { bullet: true, breakLine: true } },
    { text: '전수 검사·시뮬레이터 같은 검증 도구 제작', options: { bullet: true, breakLine: true } },
    { text: '버전 이력과 사양 문서의 정리·갱신', options: { bullet: true, breakLine: true } },
    { text: '규격 변환 자동화 (WebP · 1K GLB · 리소스 수명)', options: { bullet: true } },
  ], { x: M + 0.34, y: cy + 0.9, w: cw - 0.68, h: 2.7, fontFace: F, fontSize: 12.5, color: C.onDark, margin: 0, valign: 'top', paraSpaceAfter: 9, lineSpacingMultiple: 1.2 })

  const rx = M + cw + 0.55
  paper(sl, rx, cy, cw, ch)
  pill(sl, '사람이 맡은 일', rx + 0.32, cy + 0.28, 1.86, 0.38)
  sl.addText([
    { text: '콘셉트와 세계관 — 무엇을 만드는 게임인가', options: { bullet: true, breakLine: true } },
    { text: '규칙의 뼈대와 폐지 결정 (디메리트를 두지 않는다)', options: { bullet: true, breakLine: true } },
    { text: '생성물의 채택과 기각', options: { bullet: true, breakLine: true } },
    { text: '「지금 재미있는가」의 판정', options: { bullet: true, breakLine: true } },
    { text: '우선순위 — 무엇을 먼저 고칠 것인가', options: { bullet: true, breakLine: true } },
    { text: '릴리스와 배포의 최종 결정', options: { bullet: true } },
  ], { x: rx + 0.34, y: cy + 0.9, w: cw - 0.68, h: 2.7, fontFace: F, fontSize: 12.5, color: C.ink, margin: 0, valign: 'top', paraSpaceAfter: 9, lineSpacingMultiple: 1.2 })

  sl.addText('생성은 옮겼지만, 판단의 책임은 옮기지 않았습니다.', {
    x: M, y: 5.86, w: W - M * 2 - 1.3, h: 0.5, fontFace: F, fontSize: 17, bold: true, color: C.gold, margin: 0, valign: 'middle',
  })
  sl.addText('AI에게 맡긴 범위는 3일 내내 넓어졌지만, 오른쪽 칸은 한 번도 옮기지 않았습니다.', {
    x: M, y: 6.42, w: W - M * 2 - 1.3, h: 0.4, fontFace: F, fontSize: 12.5, color: C.onDarkSoft, margin: 0, valign: 'middle',
  })
  sl.addImage({ path: i('token_3.png'), x: W - M - 1.16, y: 5.86, w: 1.12, h: 1.12 })
  sl.addNotes('AI 활용의 경계선. 왼쪽은 위임, 오른쪽은 비위임.')
}

// ══════════════════════════════════════════════════════════════════════════════
// 16. 한계와 보완
// ══════════════════════════════════════════════════════════════════════════════
{
  const sl = slide('bg_night2.jpg')
  eyebrow(sl, 'LIMITS & COUNTERMEASURES', M, 0.5)
  heading(sl, '겪은 한계와, 그 자리에 넣은 보완', M, 0.82)

  const limits = [
    ['시각 생성은 비싸다', '원하는 한 장을 얻기까지 반복이 많고, 투명 배경·해상도·톤이 어긋나면 그대로 못 씁니다.', '용도별 규격을 스크립트로 못 박고, 어긋난 에셋은 빌드에서 실패시켰습니다.'],
    ['재미는 자동으로 판정되지 않는다', '검사 도구는 「규칙이 맞는가」까지만 답합니다. 보스가 지루한지는 수치에 나오지 않습니다.', '사람의 플레이 피드백을 다음 수정의 기준으로 삼고, 그 관찰을 다시 검사 항목으로 바꿨습니다.'],
    ['맥락은 계속 갱신해야 한다', '문서가 현재 런타임과 어긋나면, AI는 낡은 규칙을 자신 있게 따릅니다.', '커밋마다 버전 이력을 갱신하고, 코드와 문서가 충돌하면 런타임을 먼저 확인하도록 규정했습니다.'],
    ['동시 작업은 충돌한다', '여러 명이 각자 AI와 동시에 고치면 같은 파일이 갈라집니다.', '커밋을 하나의 논리 단위로 유지하고, 통합 내역을 「원격 변경과 통합」으로 버전 기록에 남겼습니다.'],
  ]
  const cw = 6.02, ch = 2.0, gx = 0.45, gy = 0.28
  limits.forEach((l, n) => {
    const col = n % 2, row = Math.floor(n / 2)
    const x = M + col * (cw + gx), y = 1.86 + row * (ch + gy)
    paper(sl, x, y, cw, ch)
    sl.addShape(pres.ShapeType.ellipse, { x: x + 0.28, y: y + 0.22, w: 0.36, h: 0.36, fill: { color: C.rose }, line: { color: C.rose, width: 0.5 } })
    sl.addText(String(n + 1), { x: x + 0.28, y: y + 0.22, w: 0.36, h: 0.36, fontFace: F, fontSize: 12, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0 })
    sl.addText(l[0], { x: x + 0.76, y: y + 0.2, w: cw - 1.06, h: 0.4, fontFace: F, fontSize: 14, bold: true, color: C.ink, margin: 0, valign: 'middle' })
    sl.addText(l[1], { x: x + 0.3, y: y + 0.66, w: cw - 0.6, h: 0.56, fontFace: F, fontSize: 11.5, color: C.inkSoft, margin: 0, valign: 'top', lineSpacingMultiple: 1.24 })
    sl.addText([
      { text: '보완   ', options: { bold: true, color: C.goldDeep, fontSize: 11 } },
      { text: l[2], options: { color: C.ink, fontSize: 11.5 } },
    ], { x: x + 0.3, y: y + 1.24, w: cw - 0.6, h: 0.64, fontFace: F, margin: 0, valign: 'top', lineSpacingMultiple: 1.24 })
  })

  sl.addImage({ path: i('token_6.png'), x: W - M - 1.12, y: 6.18, w: 1.08, h: 1.08 })
  sl.addText('한계를 적어 두는 것도 맥락입니다 — 다음 팀이 같은 자리에서 다시 넘어지지 않도록.', {
    x: M, y: 6.44, w: 10.6, h: 0.4, fontFace: F, fontSize: 13.5, bold: true, color: C.gold, margin: 0, valign: 'middle',
  })
  sl.addNotes('한계 4가지와 각각의 대응. 대응은 전부 실제로 저장소에 반영된 것.')
}

// ══════════════════════════════════════════════════════════════════════════════
// 17. 마무리
// ══════════════════════════════════════════════════════════════════════════════
{
  const sl = slide('bg_cover.jpg')
  sl.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: W, h: H, fill: { color: '0F0A1E', transparency: 32 }, line: { color: '0F0A1E', width: 0 } })
  eyebrow(sl, 'CLOSING', M, 1.42)
  sl.addText('맥락을 남겨 두면,\n다음 사람도 다음 AI도 이어 쓸 수 있습니다.', {
    x: M, y: 1.82, w: 9.4, h: 1.8, fontFace: F, fontSize: 36, bold: true, color: C.cream,
    margin: 0, valign: 'middle', lineSpacingMultiple: 1.2,
    shadow: softShadow({ blur: 14, offset: 4, opacity: 0.75 }),
  })
  sl.addText('3일 동안 우리가 익힌 것은 프롬프트를 잘 쓰는 법이 아니라, 맥락을 잘 남기는 법이었습니다.\n저장소에 남은 규칙 · 이력 · 검사는 그 자체로 다음 세션의 시작점이 되었고, 게임 안에서는 그 원리가 그대로 전투 규칙이 되었습니다.', {
    x: M, y: 3.86, w: 8.6, h: 1.1, fontFace: F, fontSize: 14.5, color: C.onDark,
    margin: 0, valign: 'middle', lineSpacingMultiple: 1.4,
  })

  const tags = [['5 AI 도구', 1.5], ['110 커밋', 1.5], ['1,625 문장 전수 검사', 2.5], ['113 WebP · 12 GLB', 2.4]]
  let tx = M
  tags.forEach((tg) => {
    const t = tg[0], w = tg[1]
    sl.addShape(pres.ShapeType.roundRect, { x: tx, y: 5.2, w, h: 0.44, rectRadius: 0.22, fill: { color: C.gold, transparency: 82 }, line: { color: C.gold, width: 0.75 } })
    sl.addText(t, { x: tx, y: 5.2, w, h: 0.44, fontFace: F, fontSize: 11, bold: true, color: C.gold, align: 'center', valign: 'middle', margin: 0 })
    tx += w + 0.18
  })

  sl.addText('1팀   ·   Little Token   ·   v_0.5.26   ·   2026 넥슨 게임잼「재밌넥」', {
    x: M, y: 6.34, w: 9.0, h: 0.36, fontFace: F, fontSize: 12, color: C.onDarkSoft, margin: 0, valign: 'middle',
  })
  sl.addImage({ path: i('token_5.png'), x: W - M - 2.1, y: 4.62, w: 2.0, h: 2.0 })
  sl.addNotes('마무리. 맥락(Context)이라는 주제로 시작해 같은 단어로 닫는다.')
}

const OUT = path.join(__dirname, 'LittleToken_AI_Report.pptx')
pres.writeFile({ fileName: OUT }).then(() => console.log('written', OUT))
