// 스샷 캡처 — 1920x1080 원본.
import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const BASE = 'http://localhost:4173'
const OUT = 'screenshots'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 1) 전투 — 선택 중 + 단어 hover(무드색/정보 패널)
await page.goto(`${BASE}/?scene=battle`, { waitUntil: 'networkidle' })
await sleep(600)
await page.click('.word-cell[data-id="na"]')
await sleep(120)
await page.click('.word-cell[data-id="mad"]')
await sleep(120)
await page.click('.word-cell[data-id="fir"]')
await sleep(250)
await page.hover('.word-cell[data-id="jum"]')
await sleep(350)
await shot('1-battle-select')

// 1b) 가방 토글(단어 자리에 아이템, 우측 아이템 정보)
await page.click('#bag')
await sleep(500)
await page.hover('.bag-item[data-i="0"]')
await sleep(350)
await shot('1b-bag')
await page.click('#bag')
await sleep(400)

// 2) 맥락 발동 — 5단어 채우면 자동 완성
await page.goto(`${BASE}/?scene=battle`, { waitUntil: 'networkidle' })
await sleep(500)
for (const id of ['na', 'mad', 'fir', 'jum', 'e1']) {
  await page.click(`.word-cell[data-id="${id}"]`)
  await sleep(120)
}
await page.waitForSelector('.combo-flash .name', { state: 'visible', timeout: 5000 })
await sleep(320)
await shot('2-battle-combo')

// 2c) 단어장 오버레이
await page.goto(`${BASE}/?scene=battle`, { waitUntil: 'networkidle' })
await sleep(500)
await page.click('#deck-btn')
await sleep(500)
await shot('2c-deck')

// 3) 보상
await page.goto(`${BASE}/?scene=reward`, { waitUntil: 'networkidle' })
await sleep(900)
await shot('3-reward')

// 4) 아이템 감탄사
await page.goto(`${BASE}/?scene=item`, { waitUntil: 'networkidle' })
await sleep(500)
await page.click('.word-cell[data-id="wow"]')
await sleep(180)
await page.click('.word-cell[data-id="really"]')
await sleep(180)
await page.click('.word-cell[data-id="pretty"]')
await sleep(300)
await shot('4-item-exclaim')

await browser.close()
console.log('screenshots saved')
