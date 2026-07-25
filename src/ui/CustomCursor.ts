/**
 * CustomCursor — 마우스 포인터를 소년의 연필로 바꾼다.
 * 이야기를 직접 써 내려가는 게임이므로 포인터도 화살표가 아니라 필기구여야 한다.
 *
 * 상태는 다섯 가지다.
 *   idle    — 그냥 들고 있는 연필(기본)
 *   write   — 쓸 수 있는 곳(버튼·단어 카드) 위. 심 옆에 금빛 반짝임이 붙는다
 *   read    — 올려 두고 읽는 곳(수치·벌레 정보). 물음표가 붙는다
 *   blocked — 쓸 수 없는 곳(모순 차단·비활성). 색이 빠지고 ✕가 붙는다
 *   turn    — 전장 3D 모델처럼 끌어서 돌리는 곳. 회전 화살표가 붙는다
 *
 * 기존 CSS의 pointer·help·grab 선언을 전역 `*` 규칙이 !important로 덮으므로,
 * 의미가 있는 커서는 아래 선택자 목록에서 다시 세워 준다.
 * 이미지는 전부 data URI라 번들 경로나 Electron 패키징(file://)에 의존하지 않는다.
 */

/** 심 끝 = 클릭 지점. SVG 좌표와 CSS 핫스팟이 같은 값을 쓴다. */
const TIP = 3
/** 윈도우가 확대 없이 그대로 그리는 크기. 더 키우면 OS가 뭉갠다. */
const SIZE = 30

interface Palette {
  wood: string
  lead: string
  barrelHi: string
  barrelLo: string
  band: string
  eraser: string
}

const IDLE: Palette = {
  wood: '#f7e6c0',
  lead: '#2a2320',
  barrelHi: '#ffdf9c',
  barrelLo: '#e79a3c',
  band: '#cbb28a',
  eraser: '#f2907f',
}

const MUTED: Palette = {
  wood: '#e6ded0',
  lead: '#5b544c',
  barrelHi: '#b6ac9c',
  barrelLo: '#7c7263',
  band: '#a89e8e',
  eraser: '#b9a99a',
}

/** 연필 한 자루 + 상태 장식. 심 끝이 (TIP, TIP)에 오도록 대각선으로 눕혔다. */
function pencilSvg(palette: Palette, deco: string, glow: boolean): string {
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <linearGradient id="barrel" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${palette.barrelHi}"/>
      <stop offset="100%" stop-color="${palette.barrelLo}"/>
    </linearGradient>
    <filter id="drop" x="-50%" y="-50%" width="200%" height="200%">
      <feDropShadow dx="1" dy="1.2" stdDeviation="0.9" flood-color="#241408" flood-opacity="0.5"/>
    </filter>
  </defs>
  <g filter="url(#drop)" stroke="#33251b" stroke-width="1.1" stroke-linejoin="round" stroke-linecap="round">
    <path d="M22 16.6 L24.6 19.2 A2.6 2.6 0 0 1 19.2 24.6 L16.6 22 Z" fill="${palette.eraser}"/>
    <path d="M11 5.6 L22 16.6 L16.6 22 L5.6 11 Z" fill="url(#barrel)"/>
    <path d="M${TIP} ${TIP} L11 5.6 L5.6 11 Z" fill="${palette.wood}"/>
    <path d="M${TIP} ${TIP} L6.4 4.1 L4.1 6.4 Z" fill="${palette.lead}" stroke-width="0.8"/>
  </g>
  <path d="M19.5 14.1 L14.1 19.5" stroke="${palette.band}" stroke-width="2.2" stroke-linecap="butt"/>
  <path d="M9.9 6.9 L20.4 17.4" stroke="rgba(255,248,226,0.5)" stroke-width="1.2" stroke-linecap="round"/>
  ${glow ? `<path d="M11 5.6 L22 16.6" stroke="rgba(255,226,150,0.55)" stroke-width="2.4" stroke-linecap="round" opacity="0.7"/>` : ''}
  ${deco}
</svg>`.trim()
}

/** 쓸 수 있는 곳 — 심 옆에서 튀는 금빛 반짝임. */
const SPARK_DECO = `
  <path d="M14.4 2.2 L15.2 4.4 L17.4 5.2 L15.2 6 L14.4 8.2 L13.6 6 L11.4 5.2 L13.6 4.4 Z"
        fill="#fff0bf" stroke="#c98d2c" stroke-width="0.6" stroke-linejoin="round"/>
  <circle cx="19.6" cy="3.4" r="1" fill="#ffe6a2"/>`

/** 쓸 수 없는 곳 — 연필 위쪽에 그어 둔 취소 표시. */
const BLOCK_DECO = `
  <g stroke="#e07a63" stroke-width="2" stroke-linecap="round">
    <path d="M18.4 3.4 L23.6 8.6"/>
    <path d="M23.6 3.4 L18.4 8.6"/>
  </g>`

/** 설명을 읽는 곳 — 밝은 종이에서도 읽히도록 어두운 밑선을 깔고 물음표를 얹는다. */
const READ_DECO = `
  <g fill="none" stroke-linecap="round">
    <path d="M18.2 4.8 A2.7 2.7 0 1 1 20.9 7.5 L20.9 8.8" stroke="#33251b" stroke-width="3.4"/>
    <path d="M18.2 4.8 A2.7 2.7 0 1 1 20.9 7.5 L20.9 8.8" stroke="#ffe0a0" stroke-width="1.7"/>
  </g>
  <circle cx="20.9" cy="11.2" r="1.5" fill="#33251b"/>
  <circle cx="20.9" cy="11.2" r="0.8" fill="#ffe0a0"/>`

/** 끌어서 돌리는 곳 — 연필 위쪽을 도는 화살표. */
const TURN_DECO = `
  <g fill="none" stroke="#ffe0a0" stroke-width="1.8" stroke-linecap="round">
    <path d="M15.4 8.2 A4.4 4.4 0 1 1 22.6 6.2"/>
  </g>
  <path d="M23.6 3 L23.4 7.2 L19.6 5.6 Z" fill="#ffe0a0"/>`

function cursorValue(svg: string, fallback: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${TIP} ${TIP}, ${fallback}`
}

/** 이 게임에서 "쓸 수 있는 곳"으로 취급하는 것들. 버튼 판정은 효과음 규칙과 같다. */
const WRITE_TARGETS = [
  'button',
  '[role="button"]',
  'a[href]',
  'summary',
  'label',
  'select',
  'input',
  '.codex-selectable',
].join(', ')

/** 눌러서 쓰는 게 아니라 올려 두고 읽는 곳(기존 `cursor: help` 자리). */
const READ_TARGETS = ['.hud-stat', '.relic-icon', '.enemy-intel-icon', '.first-mark'].join(', ')

/** 모순 차단·비활성. 클래스 선택자라 위의 요소 선택자보다 항상 뒤에 이긴다. */
const BLOCKED_TARGETS = [':disabled', '[aria-disabled="true"]', '.blocked'].join(', ')

const STYLE_ID = 'custom-cursor-style'

export const CustomCursor = {
  install(): void {
    if (document.getElementById(STYLE_ID)) return
    const idle = cursorValue(pencilSvg(IDLE, '', false), 'auto')
    const write = cursorValue(pencilSvg(IDLE, SPARK_DECO, true), 'pointer')
    const read = cursorValue(pencilSvg(IDLE, READ_DECO, false), 'help')
    const blocked = cursorValue(pencilSvg(MUTED, BLOCK_DECO, false), 'not-allowed')
    const turn = cursorValue(pencilSvg(IDLE, TURN_DECO, false), 'grab')

    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = `
* { cursor: ${idle} !important; }
${WRITE_TARGETS} { cursor: ${write} !important; }
${READ_TARGETS} { cursor: ${read} !important; }
.model-shell { cursor: ${turn} !important; }
${BLOCKED_TARGETS} { cursor: ${blocked} !important; }
`
    document.head.appendChild(style)
  },
}
