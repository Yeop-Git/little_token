/**
 * 폰트 매니저 — Griun(PolFairness)을 일괄 로드해 전역 폰트로 적용한다.
 * FontFace API로 로드 완료를 보장한 뒤 CSS 변수(--font)를 세팅해
 * 첫 렌더에서 폰트가 바뀌며 깜빡이는 현상(FOUT)을 줄인다.
 */

import { FONT_URL } from '@/assets'

const FALLBACK = `'Apple SD Gothic Neo', 'Malgun Gothic', 'Noto Sans KR', system-ui, sans-serif`

export const FontManager = {
  primary: 'Griun',

  async load(): Promise<void> {
    const face = new FontFace('Griun', `url(${FONT_URL}) format('woff2')`, {
      display: 'swap',
    })
    // 로드 실패해도 폴백으로 게임은 돌아가야 한다.
    const loaded = await face.load().catch(() => null)
    if (loaded) document.fonts.add(loaded)
    document.documentElement.style.setProperty(
      '--font',
      `'Griun', ${FALLBACK}`,
    )
  },
}
