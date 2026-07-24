/**
 * 플랫 인라인 SVG 아트. 이모지 금지(언멜팅 규칙 계승) — 크레용/그림일기 톤의
 * 단색 계열 도형으로 그린다. currentColor를 쓰는 아이콘과, 색을 품은 일러스트를
 * 구분해 둔다. 크기는 호출부에서 width/height로 조절.
 */

// ── 전투 배우 ──

// 주인공: 그림일기를 쓰는 아이(촛불 머리). 따뜻한 크림/주황.
export const diarist = (): string => `
<svg class="sprite" viewBox="0 0 200 220" width="150" height="165" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="100" cy="205" rx="52" ry="11" fill="rgba(0,0,0,0.15)"/>
  <!-- 몸(멜빵 원피스) -->
  <path d="M62 150 q38 -22 76 0 l10 55 q-48 16 -96 0 z" fill="#7c8fd6"/>
  <rect x="86" y="120" width="10" height="40" fill="#f0d9b0"/>
  <rect x="104" y="120" width="10" height="40" fill="#f0d9b0"/>
  <!-- 팔 + 연필 -->
  <path d="M60 158 q-20 8 -22 34" stroke="#f0d9b0" stroke-width="12" fill="none" stroke-linecap="round"/>
  <g transform="rotate(38 40 196)">
    <rect x="28" y="176" width="9" height="44" rx="2" fill="#e0a92e"/>
    <path d="M28 220 l4.5 10 l4.5 -10 z" fill="#3a3226"/>
  </g>
  <path d="M140 158 q20 8 22 34" stroke="#f0d9b0" stroke-width="12" fill="none" stroke-linecap="round"/>
  <!-- 머리 -->
  <circle cx="100" cy="86" r="46" fill="#f6e2bd"/>
  <!-- 촛불 머리카락/불꽃 -->
  <path d="M62 70 q-6 -40 38 -46 q44 6 38 46 q-18 -18 -38 -14 q-20 -4 -38 14z" fill="#e0893a"/>
  <path d="M96 26 q6 -14 12 0 q-2 8 -6 10 q-8 -2 -6 -10z" fill="#f6c453"/>
  <!-- 얼굴 -->
  <circle cx="84" cy="90" r="5" fill="#3a3226"/>
  <circle cx="116" cy="90" r="5" fill="#3a3226"/>
  <circle cx="76" cy="102" r="6" fill="#eaa9a0" opacity="0.7"/>
  <circle cx="124" cy="102" r="6" fill="#eaa9a0" opacity="0.7"/>
  <path d="M92 104 q8 7 16 0" stroke="#3a3226" stroke-width="3" fill="none" stroke-linecap="round"/>
</svg>`

// 좀벌레: 통통한 초록 애벌레 + 동그란 안경(책벌레).
export const worm = (): string => `
<svg class="sprite" viewBox="0 0 200 160" width="140" height="112" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="100" cy="146" rx="60" ry="10" fill="rgba(0,0,0,0.15)"/>
  <g>
    <circle cx="52" cy="104" r="26" fill="#8bbf5a"/>
    <circle cx="86" cy="110" r="24" fill="#9ccb66"/>
    <circle cx="118" cy="106" r="26" fill="#8bbf5a"/>
    <circle cx="150" cy="98" r="30" fill="#a7d472"/>
  </g>
  <!-- 얼굴(오른쪽 머리) -->
  <circle cx="158" cy="88" r="9" fill="#fff"/><circle cx="160" cy="90" r="4" fill="#2a2a2a"/>
  <circle cx="140" cy="90" r="9" fill="#fff"/><circle cx="142" cy="92" r="4" fill="#2a2a2a"/>
  <path d="M131 88 h36" stroke="#4a5c2c" stroke-width="2.5"/>
  <path d="M150 106 q8 6 16 0" stroke="#4a5c2c" stroke-width="3" fill="none" stroke-linecap="round"/>
  <path d="M160 60 q4 -14 -4 -20" stroke="#6a8a3a" stroke-width="4" fill="none" stroke-linecap="round"/>
  <circle cx="155" cy="40" r="4" fill="#6a8a3a"/>
</svg>`

// 종이나방: 회갈색 날개, 파닥임.
export const moth = (): string => `
<svg class="sprite" viewBox="0 0 200 180" width="150" height="135" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="100" cy="164" rx="46" ry="9" fill="rgba(0,0,0,0.12)"/>
  <path d="M100 96 q-70 -60 -78 6 q6 44 78 22z" fill="#cbb79a"/>
  <path d="M100 96 q70 -60 78 6 q-6 44 -78 22z" fill="#bda684"/>
  <path d="M100 100 q-44 -28 -52 6 q6 22 52 12z" fill="#e5d7bd" opacity="0.55"/>
  <path d="M100 100 q44 -28 52 6 q-6 22 -52 12z" fill="#e5d7bd" opacity="0.4"/>
  <ellipse cx="100" cy="104" rx="12" ry="34" fill="#6b5c46"/>
  <circle cx="100" cy="74" r="13" fill="#7a6a52"/>
  <circle cx="95" cy="72" r="3.5" fill="#2a2a2a"/><circle cx="105" cy="72" r="3.5" fill="#2a2a2a"/>
  <path d="M94 64 q-10 -18 -20 -14" stroke="#5a4c38" stroke-width="3" fill="none" stroke-linecap="round"/>
  <path d="M106 64 q10 -18 20 -14" stroke="#5a4c38" stroke-width="3" fill="none" stroke-linecap="round"/>
</svg>`

// 좀나방(은색 좀): 길쭉한 은회색, 단단.
export const silverfish = (): string => `
<svg class="sprite" viewBox="0 0 220 150" width="165" height="112" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="110" cy="136" rx="70" ry="9" fill="rgba(0,0,0,0.15)"/>
  <path d="M40 96 q70 -34 150 -8 q-16 26 -40 30 q-60 8 -110 -22z" fill="#a9b0bd"/>
  <path d="M50 92 q60 -24 130 -4" stroke="#c7ccd6" stroke-width="6" fill="none" opacity="0.7"/>
  <path d="M60 108 q54 -16 118 -2" stroke="#8a92a2" stroke-width="4" fill="none"/>
  <circle cx="176" cy="82" r="14" fill="#b6bcc8"/>
  <circle cx="180" cy="80" r="4" fill="#2a2a2a"/>
  <path d="M186 72 q14 -12 26 -6" stroke="#8a92a2" stroke-width="3" fill="none" stroke-linecap="round"/>
  <path d="M186 84 q14 4 26 14" stroke="#8a92a2" stroke-width="3" fill="none" stroke-linecap="round"/>
  <path d="M42 96 q-16 -8 -28 -2 M42 100 q-18 2 -30 12" stroke="#8a92a2" stroke-width="3" fill="none" stroke-linecap="round"/>
</svg>`

export const SPRITE: Record<string, () => string> = {
  diarist,
  worm,
  moth,
  silverfish,
}

// ── 날씨 아이콘(currentColor) ──
export const weatherIcon = (w: string): string => {
  if (w === 'rain')
    return `<svg class="weather-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
      <path d="M14 26a8 8 0 010-16 10 10 0 0119 3 7 7 0 011 13H15z" fill="currentColor" fill-opacity="0.18"/>
      <path d="M16 36l-2 5M24 36l-2 5M32 36l-2 5"/></svg>`
  if (w === 'night')
    return `<svg class="weather-icon" viewBox="0 0 48 48" fill="currentColor">
      <path d="M31 6a17 17 0 100 34 14 14 0 01 0-34z"/>
      <circle cx="16" cy="12" r="1.6"/><circle cx="12" cy="24" r="1.2"/><circle cx="20" cy="30" r="1.4"/></svg>`
  // sunny
  return `<svg class="weather-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
    <circle cx="24" cy="24" r="9" fill="currentColor" fill-opacity="0.2"/>
    <path d="M24 5v6M24 37v6M5 24h6M37 24h6M11 11l4 4M33 33l4 4M37 11l-4 4M15 33l-4 4"/></svg>`
}

// ── 아이템/보상 아이콘(currentColor) ──
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
  // gift(item reward)
  return `<svg viewBox="0 0 100 100" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="4">
    <rect x="22" y="42" width="56" height="40" rx="4" fill="currentColor" fill-opacity="0.12"/>
    <path d="M18 42h64v10H18zM50 42v40"/><path d="M50 42c-8-16-24-12-16 0M50 42c8-16 24-12 16 0"/></svg>`
}
