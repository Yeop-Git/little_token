import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { localizationCoverageErrors, wordTextFor } from '@/localization/content'
import { TWIN_VERB_CONNECTOR } from '@/localization/sentenceGrammar'
import { growthText } from '@/localization/growth'
import { ALL_REWARD_WORDS, EARLY_WORDS, makeEarlyTables, PUNCT_WORDS } from '@data/earlyWords'
import { LOCALE_EARLY_COMBOS, WORDS } from '@data/generated/sentenceData'
import { availableCombos } from '@core/deckInsights'
import { sentenceText, sentenceTokens } from '@core/compiler'
import { buildTemplate } from '@data/slots'
import { PROPER_NAMES, SUPPORTED_LOCALES } from '@/localization'
import { localizedGuidePages } from '@/localization/guide'
import { domLocalizationErrors, missingLocalizationTexts, translateText } from '@/localization/dom'
import { bossTokenLocalizationErrors } from '@/localization/bossToken'
import { enemySentenceLocalizationErrors } from '@/localization/enemySentences'
import { TACTICAL_CARD_GUIDES } from '@data/tacticalCards'

function introDialogueSourceErrors(): string[] {
  const source = readFileSync(new URL('../views/IntroDialogue.ts', import.meta.url), 'utf8')
  const file = ts.createSourceFile('IntroDialogue.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const errors: string[] = []
  const expected = new Set(SUPPORTED_LOCALES)
  const textParts = (node: ts.Node): string[] => {
    if (ts.isStringLiteralLike(node)) return [node.text]
    if (ts.isTemplateExpression(node)) return [node.head.text, ...node.templateSpans.flatMap((span) => [span.literal.text])]
    return node.getChildren(file).flatMap(textParts)
  }
  for (const tableName of ['PLAYER_LINES', 'TOKEN_LINES']) {
    let table: ts.ObjectLiteralExpression | null = null
    const find = (node: ts.Node) => {
      if (ts.isVariableDeclaration(node) && node.name.getText(file) === tableName && node.initializer && ts.isObjectLiteralExpression(node.initializer)) table = node.initializer
      node.forEachChild(find)
    }
    find(file)
    if (!table) {
      errors.push(`tutorial: ${tableName} table missing`)
      continue
    }
    const found = new Set<string>()
    for (const property of (table as ts.ObjectLiteralExpression).properties) {
      if (!ts.isPropertyAssignment(property)) continue
      const locale = ts.isStringLiteralLike(property.name) ? property.name.text : property.name.getText(file)
      found.add(locale)
      for (const text of textParts(property.initializer)) {
        if (!text.trim()) {
          errors.push(`${locale}: empty text in ${tableName}`)
          continue
        }
        if (locale !== 'ko' && /[가-힣]/.test(text)) errors.push(`${locale}: Korean remains in ${tableName}`)
      }
    }
    for (const locale of expected) if (!found.has(locale)) errors.push(`${locale}: ${tableName} locale missing`)
  }
  return errors
}

function tacticalContentSourceErrors(): string[] {
  const source = readFileSync(new URL('../localization/contentDetails.ts', import.meta.url), 'utf8')
  const file = ts.createSourceFile('contentDetails.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const errors: string[] = []
  let table: ts.ObjectLiteralExpression | null = null
  const find = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === 'TACTICAL_TEXT' && node.initializer && ts.isObjectLiteralExpression(node.initializer)) table = node.initializer
    node.forEachChild(find)
  }
  find(file)
  if (!table) return ['contentDetails: TACTICAL_TEXT table missing']

  const found = new Set<string>()
  for (const property of (table as ts.ObjectLiteralExpression).properties) {
    if (!ts.isPropertyAssignment(property) || !ts.isArrayLiteralExpression(property.initializer)) continue
    const locale = property.name.getText(file).replace(/^['"]|['"]$/g, '')
    found.add(locale)
    const rows = property.initializer.elements
    if (rows.length !== TACTICAL_CARD_GUIDES.length) errors.push(`${locale}: tactical guide translations ${rows.length} != ${TACTICAL_CARD_GUIDES.length}`)
    rows.forEach((row, index) => {
      if (!ts.isArrayLiteralExpression(row) || row.elements.length !== 2 || row.elements.some((entry) => !ts.isStringLiteralLike(entry) || !entry.text.trim())) {
        errors.push(`${locale}: tactical guide ${index} must contain a non-empty title and description`)
      }
    })
  }
  for (const locale of SUPPORTED_LOCALES.filter((value) => value !== 'ko')) {
    if (!found.has(locale)) errors.push(`${locale}: tactical guide translation table missing`)
  }
  return errors
}

function eliteContentSourceErrors(): string[] {
  const source = readFileSync(new URL('../localization/contentDetails.ts', import.meta.url), 'utf8')
  const file = ts.createSourceFile('contentDetails.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const errors: string[] = []
  let table: ts.ObjectLiteralExpression | null = null
  const find = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === 'ELITE_TEXT' && node.initializer && ts.isObjectLiteralExpression(node.initializer)) table = node.initializer
    node.forEachChild(find)
  }
  find(file)
  if (!table) return ['contentDetails: ELITE_TEXT table missing']

  const found = new Set<string>()
  const texts = (node: ts.Node): string[] => ts.isStringLiteralLike(node)
    ? [node.text]
    : node.getChildren(file).flatMap(texts)
  for (const property of (table as ts.ObjectLiteralExpression).properties) {
    if (!ts.isPropertyAssignment(property) || !ts.isObjectLiteralExpression(property.initializer)) continue
    const locale = property.name.getText(file).replace(/^['"]|['"]$/g, '')
    found.add(locale)
    const localeTable = property.initializer
    const field = (name: string) => localeTable.properties.find((entry) =>
      ts.isPropertyAssignment(entry) && entry.name.getText(file).replace(/^['"]|['"]$/g, '') === name) as ts.PropertyAssignment | undefined
    const rarity = field('rarity')?.initializer
    const traits = field('traits')?.initializer
    if (!rarity || !ts.isArrayLiteralExpression(rarity) || rarity.elements.length !== 3) errors.push(`${locale}: elite rarity labels must contain three entries`)
    if (!traits || !ts.isArrayLiteralExpression(traits) || traits.elements.length !== 4) errors.push(`${locale}: elite traits must contain four entries`)
    for (const text of texts(localeTable)) {
      if (!text.trim()) errors.push(`${locale}: empty elite text`)
      if (/[가-힣]/.test(text)) errors.push(`${locale}: Korean remains in elite text`)
    }
  }
  for (const locale of SUPPORTED_LOCALES.filter((value) => value !== 'ko')) {
    if (!found.has(locale)) errors.push(`${locale}: elite translation table missing`)
  }
  return errors
}

function variableSentenceErrors(locale: (typeof SUPPORTED_LOCALES)[number]): string[] {
  const errors: string[] = []
  const early = makeEarlyTables(EARLY_WORDS, undefined, locale)
  const tablesFor = (order: string[]) => ({ ...early, template: buildTemplate(order) })
  const subj = EARLY_WORDS.subj[0]
  const adv = EARLY_WORDS.adv[0]
  const verb = EARLY_WORDS.verb[0]
  const verb2 = EARLY_WORDS.verb[1]
  const cases = [
    { name: 'early-3', tables: tablesFor(['subj', 'adv', 'verb']), selection: { subj, adv, verb } },
    { name: 'twin-verb', tables: tablesFor(['subj', 'adv', 'verb', 'verb2']), selection: { subj, adv, verb, verb2 } },
    { name: 'full-5', tables: tablesFor(['subj', 'adv', 'obj', 'verb', 'end']), selection: {
      subj: WORDS.subj[0], adv: WORDS.adv[0], obj: WORDS.obj[0], verb: WORDS.verb[0], end: WORDS.end[0],
    } },
    { name: 'punctuation', tables: tablesFor(['subj', 'adv', 'verb', 'punct']), selection: { subj, adv, verb, punct: PUNCT_WORDS[0] } },
  ]

  for (const sample of cases) {
    const tokens = sentenceTokens(sample.selection, sample.tables, locale)
    const sentence = sentenceText(sample.selection, sample.tables, locale)
    if (tokens.some((token) => token === '____')) errors.push(`${locale}: ${sample.name} leaves an empty slot`)
    if (!sentence.trim() || /\s{2,}/.test(sentence)) errors.push(`${locale}: ${sample.name} has empty text or repeated spacing`)
  }

  const twinSentence = sentenceText(cases[1].selection, cases[1].tables, locale)
  const connector = TWIN_VERB_CONNECTOR[locale]
  if (twinSentence.split(connector).length !== 2) errors.push(`${locale}: twin verb connector is missing or repeated`)
  for (const word of [verb, verb2]) {
    const text = wordTextFor(locale, word)
    if (twinSentence.split(text).length !== 2) errors.push(`${locale}: twin verb sentence repeats or loses '${text}'`)
  }

  const fullTokens = sentenceTokens(cases[2].selection, cases[2].tables, locale)
  if (locale === 'ko' && !/[을를]$/.test(fullTokens[2])) errors.push('ko: object particle is missing from full sentence')
  if (locale === 'ja' && !fullTokens[2].endsWith('を')) errors.push('ja: object particle is missing from full sentence')
  const punctText = wordTextFor(locale, PUNCT_WORDS[0])
  const punctSentence = sentenceText(cases[3].selection, cases[3].tables, locale)
  if (!punctSentence.endsWith(punctText) || punctSentence.endsWith(` ${punctText}`)) errors.push(`${locale}: punctuation is not attached to the sentence`)
  return errors
}

const errors = [
  ...localizationCoverageErrors(),
  ...domLocalizationErrors(),
  ...bossTokenLocalizationErrors(),
  ...enemySentenceLocalizationErrors(),
  ...tacticalContentSourceErrors(),
  ...eliteContentSourceErrors(),
  ...introDialogueSourceErrors(),
]
const samples = Object.values(EARLY_WORDS).flat()
const EXPECTED_PROPER_NAMES = {
  ko: { player: '프롬', token: '토큰' },
  en: { player: 'Prompt', token: 'Token' },
  ja: { player: 'プロンプト', token: 'トークン' },
  ru: { player: 'Промпт', token: 'Токен' },
  'zh-Hans': { player: '提示词', token: '词元' },
  'zh-Hant': { player: '提示詞', token: '詞元' },
} as const

for (const locale of SUPPORTED_LOCALES) {
  const expectedNames = EXPECTED_PROPER_NAMES[locale]
  if (PROPER_NAMES[locale].player !== expectedNames.player) errors.push(`${locale}: player proper name is not ${expectedNames.player}`)
  if (PROPER_NAMES[locale].token !== expectedNames.token) errors.push(`${locale}: token proper name is not ${expectedNames.token}`)
  if (locale !== 'ko' && translateText('프롬', locale) !== expectedNames.player) errors.push(`${locale}: player name translation is not canonical`)
  if (locale !== 'ko' && translateText('토큰', locale) !== expectedNames.token) errors.push(`${locale}: token name translation is not canonical`)
  const rendered = samples.map((word) => wordTextFor(locale, word))
  if (rendered.some((text) => !text.trim())) errors.push(`${locale}: empty starting word`)
  const nativeCombos = LOCALE_EARLY_COMBOS[locale] ?? []
  if (nativeCombos.length !== 3) errors.push(`${locale}: expected exactly three locale-native idioms, got ${nativeCombos.length}`)
  if (locale !== 'ko' && nativeCombos.some((combo) => /[가-힣]/.test(`${combo.name}${combo.flavor ?? ''}`))) {
    errors.push(`${locale}: Korean remains in locale-native idiom`)
  }
  const nativeNeeds = nativeCombos.map((combo) => [...combo.need].sort().join('|'))
  if (new Set(nativeNeeds).size !== nativeNeeds.length) errors.push(`${locale}: locale-native idioms repeat the same requirement tags`)
  const fullDeck = Object.fromEntries(Object.entries(EARLY_WORDS).map(([slot, words]) => [slot, [...words]]))
  for (const word of ALL_REWARD_WORDS) {
    if (!fullDeck[word.slot]) fullDeck[word.slot] = []
    fullDeck[word.slot].push(word)
  }
  const tables = makeEarlyTables(fullDeck, undefined, locale)
  const completable = new Set(availableCombos(fullDeck, tables.combos).map((combo) => combo.id))
  for (const combo of nativeCombos) if (!completable.has(combo.id)) errors.push(`${locale}: locale-native idiom ${combo.id} cannot be completed by the reward catalog`)
  errors.push(...variableSentenceErrors(locale))
  const growth = growthText(1, locale)
  if (!growth.pop.trim() || !growth.log.trim()) errors.push(`${locale}: growth feedback is empty`)
  if (locale !== 'ko' && /[가-힣]/.test(`${growth.pop}${growth.log}`)) errors.push(`${locale}: Korean remains in growth feedback`)
  console.log(`${locale.padEnd(7)} 시작 카드 ${rendered.length}장 · ${rendered.slice(0, 3).join(' / ')}`)
}

for (const locale of SUPPORTED_LOCALES.filter((value) => value !== 'ko')) {
  const pages = localizedGuidePages(locale)
  if (pages.length !== 6) errors.push(`${locale}: guide chapter count ${pages.length} != 6`)
  for (const chapter of pages) {
    if (!chapter.title.trim() || !chapter.body.trim()) errors.push(`${locale}: empty guide chapter ${chapter.key}`)
    if (/[가-힣]/.test(`${chapter.title}${chapter.hint}${chapter.body}`)) errors.push(`${locale}: Korean remains in guide chapter ${chapter.key}`)
  }
  missingLocalizationTexts.clear()
  const uiSamples = [
    '전투 상태', '지금 배율', '새 단어', '제련 완료', '일기장이 너무 상했다…',
    '카드 9 / 51', '적 2 / 10', '운 ×1.06', '9종', '문장부호', '행동',
    '그래픽 품질', '해상도 배율', '최대 FPS', '이펙트 품질', '후처리 품질',
    '안티앨리어싱 품질', '마스터 볼륨', '쓰러진 장로거미', '고개를 떨군 토큰',
  ]
  for (const sample of uiSamples) {
    if (/[가-힣]/.test(translateText(sample, locale))) errors.push(`${locale}: UI phrase not localized: ${sample}`)
  }
  for (const missing of missingLocalizationTexts) errors.push(`${locale}: UI phrase uses missing-translation fallback: ${missing}`)
}

if (errors.length) {
  errors.forEach((error) => console.error(`위반  ${error}`))
  throw new Error(`현지화 검사 ${errors.length}건 실패`)
}

console.log('현지화 데이터 완전성 통과')
