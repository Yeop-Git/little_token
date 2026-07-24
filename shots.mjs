// 스샷 캡처 — 4개 뷰를 1920x1080 원본 크기로 담는다.
import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const BASE = 'http://localhost:4173'
const OUT = 'screenshots'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── 1) 전투 — 선택 중 + 단어 hover 상세 ──
await page.goto(`${BASE}/?scene=battle`, { waitUntil: 'networkidle' })
await sleep(600)
await page.click('.word-cell[data-id="na"]')   // 나는
await sleep(120)
await page.click('.word-cell[data-id="mad"]')   // 미친듯이
await sleep(120)
await page.click('.word-cell[data-id="fir"]')   // 불꽃
await sleep(300)
await page.hover('.word-cell[data-id="jum"]')   // 점화 hover → 상세 툴팁
await sleep(350)
await shot('1-battle-select')

// ── 2) 맥락 발동 — 화염광란 ──
await page.click('.word-cell[data-id="jum"]')   // 점화
await sleep(120)
await page.click('.word-cell[data-id="e1"]')    // 했다
await sleep(200)
await page.click('#go')
await page.waitForSelector('.combo-flash .name', { state: 'visible', timeout: 4000 })
await sleep(320)
await shot('2-battle-combo')

// ── 2b) 단어장 오버레이 ──
await page.goto(`${BASE}/?scene=battle`, { waitUntil: 'networkidle' })
await sleep(500)
await page.click('#deck-btn')
await sleep(500)
await shot('2c-deck')
await page.click('.ov-close')
await sleep(200)
// 가방 오버레이
await page.click('#bag')
await sleep(500)
await shot('2d-bag')

// ── 3) 보상 ──
await page.goto(`${BASE}/?scene=reward`, { waitUntil: 'networkidle' })
await sleep(900)
await shot('3-reward')

// ── 4) 아이템 감탄사 — 순차 선택 ──
await page.goto(`${BASE}/?scene=item`, { waitUntil: 'networkidle' })
await sleep(500)
await page.click('.word-cell[data-id="wow"]')     // 와!
await sleep(200)
await page.click('.word-cell[data-id="really"]')  // 정말
await sleep(200)
await page.click('.word-cell[data-id="pretty"]')  // 예뻐!
await sleep(300)
await shot('4-item-exclaim')

await browser.close()
console.log('screenshots saved')
