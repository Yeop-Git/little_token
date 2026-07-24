/**
 * 플랫 인라인 SVG 아이콘(이모지 금지). 배우/배경은 실제 PNG 에셋(assets/)을 쓰고,
 * 여기서는 날씨·아이템/보상 같은 단색 아이콘만 currentColor로 그린다.
 */

// ── 날씨 아이콘 ──
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

// ── 아이템/보상 아이콘 ──
export const itemArt = (key: string): string => {
  if (key === 'candle')
    return `<svg viewBox="0 0 100 100" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="4">
      <rect x="36" y="40" width="28" height="46" rx="4" fill="currentColor" fill-opacity="0.15"/>
      <path d="M50 40v-8" /><path d="M50 20c6 6 6 12 0 16-6-4-6-10 0-16z" fill="currentColor"/></svg>`
  if (key === 'ribbon')
    return `<svg viewBox="0 0 100 100" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="4">
      <circle cx="50" cy="46" r="8" fill="currentColor" fill-opacity="0.2"/>
      <path d="M42 42L18 30l6 20-6 8 28-6M58 42l24-12-6 20 6 8-28-6"/></svg>`
  if (key === 'word')
    return `<svg viewBox="0 0 100 100" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="4">
      <path d="M26 20h48v60H26z" fill="currentColor" fill-opacity="0.12"/>
      <path d="M36 38h28M36 50h28M36 62h18"/></svg>`
  return `<svg viewBox="0 0 100 100" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="4">
    <rect x="22" y="42" width="56" height="40" rx="4" fill="currentColor" fill-opacity="0.12"/>
    <path d="M18 42h64v10H18zM50 42v40"/><path d="M50 42c-8-16-24-12-16 0M50 42c8-16 24-12 16 0"/></svg>`
}
