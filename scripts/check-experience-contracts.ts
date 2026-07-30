import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')
const failures: string[] = []

function expect(file: string, pattern: RegExp, label: string): void {
  if (!pattern.test(read(file))) failures.push(`${file}: ${label}`)
}

function reject(file: string, pattern: RegExp, label: string): void {
  if (pattern.test(read(file))) failures.push(`${file}: ${label}`)
}

reject('src/index.html', /user-scalable=no|maximum-scale=1(?:\.0)?/, 'browser zoom must remain available')
expect('src/audio/GameAudio.ts', /visibilitychange/, 'background audio suspension is missing')
expect('src/audio/GameAudio.ts', /pageshow/, 'restored pages must recover background audio')
expect('src/ui/GameSettings.ts', /deviceMemory[\s\S]*low/, 'low-memory PCs need a conservative first-run graphics preset')

expect('src/core/comboDiscovery.ts', /Partial<Record<LocaleCode, string\[\]>>/, 'combo discovery must be separated by locale')
expect('src/core/comboDiscovery.ts', /IS_DEMO/, 'demo and full combo discoveries must be isolated')
expect('src/views/BattleView.ts', /discoverCombos\(/, 'battle activation does not record combo discoveries')
expect('src/views/BattleView.ts', /combo-discovery-note/, 'first-discovery presentation is missing')
expect('src/views/BattleView.ts', /data-codex-tab="combo"/, 'combo codex tab is missing')
expect('src/ui/ComboHint.ts', /discoveredComboIds/, 'card hints expose undiscovered combo information')
expect('src/views/RewardView.ts', /discoveredComboIds/, 'reward view exposes undiscovered combo information')
expect('src/views/CombatGuideView.ts', /discoveredComboIds/, 'guide exposes undiscovered combo information')
expect('src/views/RewardView.ts', /rewardEarlyBuildReserve[\s\S]*REWARD_PRICE\.rare/, 'day 2 build offer must disclose the Inspiration reserve cost')
reject('src/views/BattleView.ts', /id="combat-forecast"/, 'card area forecast must not cover the hand')
expect('src/views/BattleView.ts', /action-order-item\.player[\s\S]*playerOrder\.dataset\.tooltip/, 'player action-order hover forecast is missing')
expect('src/views/BattleView.ts', /action-order-item\.enemy[\s\S]*enemyOrder\.dataset\.tooltip/, 'enemy action-order hover forecast is missing')
expect('src/views/BattleView.ts', /lastResolvedTally[\s\S]*forecastExact/, 'resolved sentence tally is not kept until the next selection')
expect('src/views/BattleView.ts', /enemyAttackForecast\(this\.state, enemy\)/, 'enemy forecast does not read the shared combat projection')
expect('src/sim/reference.ts', /enemyAttackDefense[\s\S]*enemyAttackForecast/, 'enemy execution and forecast do not share defense resolution')
reject('src/core/types.ts', /multCap/, 'removed multiplier cap field must not return')
expect('src/ui/SettingsModal.ts', /role="dialog" aria-modal="true"/, 'settings overlay is not exposed as a modal dialog')
expect('src/ui/SettingsModal.ts', /returnFocus[\s\S]*returnFocus\.focus\(\)/, 'settings dialog does not restore keyboard focus')
expect('src/ui/SettingsModal.ts', /event\.key === 'Escape'[\s\S]*event\.key !== 'Tab'/, 'settings dialog lacks Escape close or Tab focus containment')
expect('src/ui/SettingsModal.ts', /aria-controls[\s\S]*ArrowLeft[\s\S]*ArrowRight/, 'settings tabs lack keyboard navigation or panel relationships')
expect('src/style.css', /:focus-visible[\s\S]*outline: 3px solid #fff2b8/, 'shared keyboard focus indicator is missing')
expect('src/style.css', /prefers-reduced-motion: reduce[\s\S]*animation-duration: \.01ms !important/, 'global reduced-motion fallback is missing')
expect('src/views/BattleView.ts', /beanstalkGrownThisBattle[\s\S]*beanstalkGrowthFor/, 'battle does not limit beanstalk growth to once per encounter')
expect('src/tools/run-sim.ts', /beanstalkGrownThisBattle[\s\S]*beanstalkGrowthFor/, 'simulation does not model one beanstalk growth per encounter')

const comboCopy = read('src/localization/comboCodex.ts')
for (const locale of ['ko', 'en', 'ja', 'ru', 'zh-Hans', 'zh-Hant']) {
  const marker = locale.includes('-') ? `'${locale}'` : `${locale}:`
  if (!comboCopy.includes(marker)) failures.push(`src/localization/comboCodex.ts: missing ${locale}`)
}

if (failures.length) {
  console.error(`experience contract failures: ${failures.length}\n- ${failures.join('\n- ')}`)
  process.exit(1)
}

console.log('PC 경험 계약 통과 · 관용구 발견·정보 차단 · 보상 예고 · 키보드 접근성 · 모션 감소 · 전투 계산 일치')
