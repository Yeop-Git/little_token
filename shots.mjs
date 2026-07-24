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

// 1) 전투 — 선택 중(3단어) + hover 상세 (나는 힘껏 [때렸다])
await page.goto(`${BASE}/?scene=battle`, { waitUntil: 'networkidle' })
await sleep(600)
await page.click('.word-cell[data-id="na"]')
await sleep(120)
await page.click('.word-cell[data-id="himkkeot"]')
await sleep(200)
await page.hover('.word-cell[data-id="ttaeryeot"]')
await sleep(350)
await shot('1-battle-select')

// 1b) 가방 토글
await page.click('#bag')
await sleep(500)
await page.hover('.bag-item[data-i="0"]').catch(() => {}) // 시작 시엔 비어 있을 수 있음
await sleep(300)
await shot('1b-bag')
await page.click('#bag')
await sleep(300)

// 2) 맥락 발동(정면돌파) — 나는 힘껏 때렸다 자동완성
async function runCombo() {
  await page.goto(`${BASE}/?scene=battle`, { waitUntil: 'networkidle' })
  await sleep(500)
  await page.click('.word-cell[data-id="na"]')
  await sleep(110)
  await page.click('.word-cell[data-id="himkkeot"]')
  await sleep(110)
  await page.click('.word-cell[data-id="ttaeryeot"]')
}
await runCombo()
await page.waitForSelector('.combo-flash .name', { state: 'visible', timeout: 5000 })
await sleep(280)
await shot('2-combo')

// 2b) 총합 롤업(띠리리릭)
await runCombo()
await page.waitForSelector('.big-total', { timeout: 6000 })
await sleep(200)
await shot('2b-roll')

// 2c) 돌진 + 사각 블라스트(꽂힘)
await runCombo()
await page.waitForSelector('.actor.you.lunge', { timeout: 6000 })
await sleep(120)
await shot('2c-strike')

// 2d) 단어장
await page.goto(`${BASE}/?scene=battle`, { waitUntil: 'networkidle' })
await sleep(500)
await page.click('#deck-btn')
await sleep(500)
await shot('2d-deck')

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
