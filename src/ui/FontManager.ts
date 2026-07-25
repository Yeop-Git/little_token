/**
 * 폰트 매니저 — Griun(PolFairness)을 일괄 로드해 전역 폰트로 적용한다.
 * 첫 화면은 시스템 폴백으로 즉시 그리고, FontFace API 로드가 끝나면
 * CSS 변수(--font)를 교체한다. 폰트 다운로드가 앱 부팅을 막지 않는다.
 */

import { FONT_URL } from '@/assets'

const FALLBACK = `'Apple SD Gothic Neo', 'Malgun Gothic', 'Noto Sans KR', system-ui, sans-serif`
let fontLoad: Promise<void> | null = null

export const FontManager = {
  primary: 'Griun',

  load(): Promise<void> {
    fontLoad ??= (async () => {
      const face = new FontFace('Griun', `url(${FONT_URL}) format('woff2')`, {
        display: 'swap',
      })
      // 로드 실패해도 폴백으로 게임은 돌아가야 한다.
      const loaded = await face.load().catch(() => null)
      if (!loaded) {
        // 일시 실패는 다음 화면 진입에서 재시도할 수 있게 한다.
        fontLoad = null
        return
      }
      document.fonts.add(loaded)
      document.documentElement.style.setProperty(
        '--font',
        `'Griun', ${FALLBACK}`,
      )
    })()
    return fontLoad
  },
}
