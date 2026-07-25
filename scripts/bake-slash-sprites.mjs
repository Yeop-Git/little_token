// 검기·타격점 스프라이트를 미리 굽는다 (npm run sprites:bake) — SVG 안에서 blur를 끝내 두면 브라우저가 한 번만
// 래스터화하고, 그 뒤로는 그냥 이미지라 매 프레임 비용이 0이다.
// 이미 구워진 style.css에 다시 돌려도 되게 만들었다(기존 data URI를 자리표로 되돌린 뒤 다시 채운다).
import fs from 'node:fs'

/**
 * 엄격한 퍼센트 인코딩. 순서가 중요하다 — %를 먼저 막지 않으면 나중에 넣는 %23이
 * 다시 인코딩되고, 공백을 남기면 SVG가 조용히 디코딩 실패한다(실측으로 그랬다).
 */
const enc = (svg) => 'data:image/svg+xml,' + svg
  .replace(/\s+/g, ' ')
  .trim()
  .replace(/> </g, '><')
  .replace(/"/g, "'")
  .replace(/%/g, '%25')
  .replace(/#/g, '%23')
  .replace(/</g, '%3C')
  .replace(/>/g, '%3E')
  .replace(/ /g, '%20')

// 날의 실루엣 — 직선 폴리곤으로 잡았더니 납작한 마름모로 읽혔다(실측). 베지에로
// 휜 초승달을 그린다: 양 끝은 바늘처럼 뾰족하고, 60% 지점이 가장 두껍고, 위로 휜다.
/** 몸통 — 위 곡선으로 올라가 앞머리에서 만나고, 아래 곡선으로 돌아온다. */
const BODY = 'M14 100 C 150 26 320 6 464 38 C 340 62 180 92 14 100 Z'
/** 번짐용 — 몸통보다 조금 크게 부풀린 같은 곡선. */
const BLOOM = 'M8 104 C 148 20 320 0 472 36 C 340 66 178 98 8 104 Z'
/** 프리즘 — 위쪽 날등에만 얇게 얹는다. 몸통 가운데를 덮으면 청록으로 죽는다. */
const RIM = 'M20 96 C 152 30 320 10 462 38 C 330 28 168 50 20 96 Z'
/** 백열 심 — 안쪽에 한 겹 더 좁게. */
const CORE = 'M66 92 C 176 46 320 28 438 44 C 332 58 192 80 66 92 Z'
/** 척추 — 가장 밝은 실선 한 줄. */
const SPINE = 'M116 86 C 214 56 330 42 424 50 C 330 56 222 70 116 86 Z'

/** 두꺼운 검기 — 넓은 주황 블룸 + 금빛 몸통 + 프리즘 띠 + 흰 심 + 백열 척추. */
const blade = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 160">
  <defs>
    <linearGradient id="b" x1="0" x2="1">
      <stop offset="0" stop-color="#ff8f34" stop-opacity="0"/>
      <stop offset="0.2" stop-color="#ffab4d" stop-opacity="0.5"/>
      <stop offset="0.5" stop-color="#ffe3a4" stop-opacity="0.9"/>
      <stop offset="0.78" stop-color="#ffffff"/>
      <stop offset="0.94" stop-color="#fff7e0"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="p" x1="0" x2="1">
      <stop offset="0" stop-color="#ff8ac6" stop-opacity="0"/>
      <stop offset="0.26" stop-color="#ca98ff" stop-opacity="0.8"/>
      <stop offset="0.5" stop-color="#8ccaff" stop-opacity="0.85"/>
      <stop offset="0.72" stop-color="#96ffe2" stop-opacity="0.85"/>
      <stop offset="0.9" stop-color="#ffe68c" stop-opacity="0.9"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <filter id="g" x="-25%" y="-70%" width="150%" height="240%">
      <feGaussianBlur stdDeviation="15"/>
    </filter>
    <filter id="s" x="-12%" y="-45%" width="124%" height="190%">
      <feGaussianBlur stdDeviation="4"/>
    </filter>
    <filter id="t" x="-10%" y="-40%" width="120%" height="180%">
      <feGaussianBlur stdDeviation="1.6"/>
    </filter>
  </defs>
  <path d="${BLOOM}" fill="#ff6f14" opacity="0.85" filter="url(#g)"/>
  <path d="${BODY}" fill="url(#b)" filter="url(#s)"/>
  <path d="${RIM}" fill="url(#p)" opacity="0.85" filter="url(#t)"/>
  <path d="${CORE}" fill="#ffffff" opacity="0.9" filter="url(#t)"/>
  <path d="${SPINE}" fill="#ffffff"/>
</svg>`

/** 잔상 — 같은 실루엣을 색 없이 옅게. 뒤에 여러 겹 깔아 지나간 자리를 만든다. */
const tail = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 160">
  <defs>
    <linearGradient id="a" x1="0" x2="1">
      <stop offset="0" stop-color="#ffb968" stop-opacity="0"/>
      <stop offset="0.4" stop-color="#ffd88f" stop-opacity="0.62"/>
      <stop offset="0.82" stop-color="#fffaf0" stop-opacity="0.92"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <filter id="f" x="-14%" y="-50%" width="128%" height="200%">
      <feGaussianBlur stdDeviation="7"/>
    </filter>
  </defs>
  <path d="${BODY}" fill="url(#a)" filter="url(#f)"/>
</svg>`

/** 타격점 — 백열 심 + 프리즘 링 + 십자 섬광을 한 장에 구워 둔다. */
const burst = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">
  <defs>
    <radialGradient id="c">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.28" stop-color="#fff8e2"/>
      <stop offset="0.52" stop-color="#ffc669" stop-opacity="0.8"/>
      <stop offset="0.76" stop-color="#ff7d24" stop-opacity="0.38"/>
      <stop offset="1" stop-color="#ff6a12" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="r" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#ff8ac6" stop-opacity="0.9"/>
      <stop offset="0.3" stop-color="#ca98ff" stop-opacity="0.85"/>
      <stop offset="0.55" stop-color="#8ccaff" stop-opacity="0.9"/>
      <stop offset="0.8" stop-color="#96ffe2" stop-opacity="0.85"/>
      <stop offset="1" stop-color="#ffe68c" stop-opacity="0.9"/>
    </linearGradient>
    <filter id="bl" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="9"/>
    </filter>
    <filter id="bs" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="2.4"/>
    </filter>
  </defs>
  <circle cx="120" cy="120" r="98" fill="url(#c)" filter="url(#bl)"/>
  <circle cx="120" cy="120" r="64" fill="none" stroke="url(#r)" stroke-width="12" opacity="0.9" filter="url(#bs)"/>
  <circle cx="120" cy="120" r="36" fill="url(#c)"/>
  <!-- 섬광 십자는 내리친 궤적과 같은 사선으로 눕힌다. 수직으로 세우면 베인 방향이 안 읽힌다. -->
  <g filter="url(#bs)" fill="#ffffff" transform="rotate(-38 120 120)">
    <polygon points="0,120 108,131 240,120 108,109"/>
    <polygon points="120,26 130,112 120,214 110,112" opacity="0.62"/>
  </g>
</svg>`

let css = fs.readFileSync('src/style.css', 'utf8')

// 이미 구워진 자리를 자리표로 되돌린다 — 색을 고쳐 다시 구울 수 있어야 한다.
css = css
  .replace(/--blade:\s*url\("data:image\/svg\+xml,[^"]*"\)/g, '--blade: url("__BLADE__")')
  .replace(/--blade-tail:\s*url\("data:image\/svg\+xml,[^"]*"\)/g, '--blade-tail: url("__BLADE_TAIL__")')
  .replace(/url\("data:image\/svg\+xml,[^"]*"\) center\/100% 100% no-repeat/g, 'url("__BURST__") center/100% 100% no-repeat')

const map = { __BLADE__: enc(blade), __BLADE_TAIL__: enc(tail), __BURST__: enc(burst) }
for (const [key, value] of Object.entries(map)) {
  if (!css.includes(key)) throw new Error(`style.css에 ${key} 자리가 없다`)
  css = css.split(key).join(value)
  console.log(`${key} → ${value.length}자`)
}
fs.writeFileSync('src/style.css', css)

// 나중에 색만 고쳐 다시 구울 때 원본을 잃지 않도록 스크립트 자체가 원본이다.
fs.writeFileSync(
  process.argv[2] ?? 'slash-sprites-preview.html',
  `<body style="margin:0;background:#2b2118;display:grid;gap:24px;place-items:center;height:100vh">
   <img src="${map.__BLADE__}" width="720">
   <img src="${map.__BLADE_TAIL__}" width="720">
   <img src="${map.__BURST__}" width="260">
   </body>`,
)
