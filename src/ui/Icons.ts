/**
 * 플랫 인라인 SVG 아이콘(이모지 금지). 단색 currentColor, 작은 크기 가독성 유지.
 * 배낭/단어장/스탯 등 UI 아이콘을 모아 둔다.
 */

export const icon = (key: string): string => {
  switch (key) {
    case 'backpack':
      return `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">
        <path d="M14 18c0-6 4-10 10-10s10 4 10 10v22a2 2 0 01-2 2H16a2 2 0 01-2-2z" fill="currentColor" fill-opacity="0.16"/>
        <path d="M18 18v-2a6 6 0 0112 0v2"/>
        <rect x="19" y="26" width="10" height="10" rx="2" fill="currentColor" fill-opacity="0.25"/>
        <path d="M14 24h-3a2 2 0 00-2 2v8M34 24h3a2 2 0 012 2v8"/></svg>`
    case 'book': // 단어장
      return `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">
        <path d="M8 10h13a5 5 0 015 5v25a4 4 0 00-4-4H8z" fill="currentColor" fill-opacity="0.14"/>
        <path d="M40 10H27a5 5 0 00-5 5v25a4 4 0 014-4h14z" fill="currentColor" fill-opacity="0.14"/>
        <path d="M22 15v25"/></svg>`
    case 'close':
      return `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"><path d="M14 14l20 20M34 14L14 34"/></svg>`
    case 'sword':
      return `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">
        <path d="M34 8l6 6-16 16-6-6z" fill="currentColor" fill-opacity="0.2"/><path d="M12 30l6 6M10 34l4 4M18 30l-8 8"/></svg>`
    case 'shield':
      return `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round">
        <path d="M24 6l14 5v10c0 9-6 16-14 21-8-5-14-12-14-21V11z" fill="currentColor" fill-opacity="0.18"/></svg>`
    case 'heart':
      return `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round">
        <path d="M24 40S8 30 8 18a8 8 0 0116-4 8 8 0 0116 4c0 12-16 22-16 22z" fill="currentColor" fill-opacity="0.18"/></svg>`
    case 'clover': // 행운
      return `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round">
        <path d="M24 24c-4-4-4-10 0-13 4 3 4 9 0 13zM24 24c4-4 10-4 13 0-3 4-9 4-13 0zM24 24c4 4 4 10 0 13-4-3-4-9 0-13zM24 24c-4 4-10 4-13 0 3-4 9-4 13 0z" fill="currentColor" fill-opacity="0.18"/>
        <path d="M24 26v12"/></svg>`
    default:
      return ''
  }
}

// 아이템/보상 일러스트 아이콘(sprites.ts에서 이동).
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
