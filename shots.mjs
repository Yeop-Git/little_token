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

// ── 1) 전투 뷰 — 선택 중(체인 3개) ──
await page.goto(`${BASE}/?scene=battle`, { waitUntil: 'networkidle' })
await sleep(500)
await page.click('.word-opt[data-id="na"]')   // 나는
await sleep(120)
await page.click('.word-opt[data-id="mad"]')   // 미친듯이
await sleep(120)
await page.click('.word-opt[data-id="fir"]')   // 불꽃
await sleep(300)
// 우측 상세 패널을 보여주기 위해 현재 슬롯(동사) 단어에 hover.
await page.hover('.word-opt[data-id="jum"]')    // 점화 hover
await sleep(300)
await shot('1-battle-select')

// ── 2) 맥락 발동 뷰 — 화염광란 콤보 배너 ──
await page.click('.word-opt[data-id="jum"]')   // 점화
await sleep(120)
await page.click('.word-opt[data-id="e1"]')    // 했다
await sleep(200)
await page.click('#go')
await page.waitForSelector('.combo-flash .name', { state: 'visible', timeout: 4000 })
await sleep(320)
await shot('2-battle-combo')

// ── 3) 보상 뷰 ──
await page.goto(`${BASE}/?scene=reward`, { waitUntil: 'networkidle' })
await sleep(900)
await shot('3-reward')

// ── 4) 아이템 감탄사 뷰 — 감탄 문장 완성 ──
await page.goto(`${BASE}/?scene=item`, { waitUntil: 'networkidle' })
await sleep(400)
await page.click('.exclaim-opt[data-slot="excl"][data-id="wow"]')
await sleep(120)
await page.click('.exclaim-opt[data-slot="deg"][data-id="really"]')
await sleep(120)
await page.click('.exclaim-opt[data-slot="val"][data-id="pretty"]')
await sleep(300)
await shot('4-item-exclaim')

await browser.close()
console.log('screenshots saved')
