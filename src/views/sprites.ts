/**
 * 날씨 아이콘(플랫 인라인 SVG, currentColor). 배우/배경은 실제 PNG 에셋(assets/),
 * UI/아이템 아이콘은 ui/Icons.ts를 쓴다.
 */

export const weatherIcon = (w: string): string => {
  if (w === 'rain')
    return `<svg class="weather-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
      <path d="M14 26a8 8 0 010-16 10 10 0 0119 3 7 7 0 011 13H15z" fill="currentColor" fill-opacity="0.18"/>
      <path d="M16 36l-2 5M24 36l-2 5M32 36l-2 5"/></svg>`
  if (w === 'night')
    return `<svg class="weather-icon" viewBox="0 0 48 48" fill="currentColor">
      <path d="M31 6a17 17 0 100 34 14 14 0 01 0-34z"/>
      <circle cx="16" cy="12" r="1.6"/><circle cx="12" cy="24" r="1.2"/><circle cx="20" cy="30" r="1.4"/></svg>`
  return `<svg class="weather-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
    <circle cx="24" cy="24" r="9" fill="currentColor" fill-opacity="0.2"/>
    <path d="M24 5v6M24 37v6M5 24h6M37 24h6M11 11l4 4M33 33l4 4M37 11l-4 4M15 33l-4 4"/></svg>`
}
