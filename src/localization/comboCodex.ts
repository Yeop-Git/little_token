import { currentLocale, type LocaleCode } from './index'

const COPY = {
  ko: {
    tab: '관용구 도감', intro: '모험에서 직접 완성한 관용구가 한 줄씩 기록된다.',
    unknown: '미발견 관용구', unknownHint: '문장 속에서 처음 완성하면 기록된다.',
    found: '발견', context: '필요한 맥락', multiplier: '관용구 배율', knownHint: '모험에서 확인한 맥락',
    discovery: '새 관용구 발견', recorded: '도감에 기록했다',
  },
  en: {
    tab: 'Combo codex', intro: 'Combos you complete during adventures are recorded one line at a time.',
    unknown: 'Undiscovered combo', unknownHint: 'Complete it in a sentence to record it.',
    found: 'Discovered', context: 'Required context', multiplier: 'Combo multiplier', knownHint: 'Context confirmed in an adventure',
    discovery: 'New combo discovered', recorded: 'Recorded in the codex',
  },
  ja: {
    tab: '慣用句図鑑', intro: '冒険で実際に完成させた慣用句が、一つずつ記録される。',
    unknown: '未発見の慣用句', unknownHint: '文の中で初めて完成させると記録される。',
    found: '発見', context: '必要な文脈', multiplier: '慣用句倍率', knownHint: '冒険で確かめた文脈',
    discovery: '新しい慣用句を発見', recorded: '図鑑に記録した',
  },
  ru: {
    tab: 'Альбом выражений', intro: 'Выражения, составленные в приключении, записываются по одному.',
    unknown: 'Неоткрытое выражение', unknownHint: 'Составьте его впервые в предложении, чтобы записать.',
    found: 'Открыто', context: 'Нужный контекст', multiplier: 'Множитель выражения', knownHint: 'Контекст, найденный в приключении',
    discovery: 'Открыто новое выражение', recorded: 'Записано в альбом',
  },
  'zh-Hans': {
    tab: '惯用语图鉴', intro: '在冒险中亲自组成的惯用语会逐条记录。',
    unknown: '未发现惯用语', unknownHint: '首次在句子中组成后即可记录。',
    found: '已发现', context: '所需语境', multiplier: '惯用语倍率', knownHint: '在冒险中确认的语境',
    discovery: '发现新惯用语', recorded: '已记录到图鉴',
  },
  'zh-Hant': {
    tab: '慣用語圖鑑', intro: '在冒險中親自組成的慣用語會逐條記錄。',
    unknown: '未發現慣用語', unknownHint: '首次在句子中組成後即可記錄。',
    found: '已發現', context: '所需語境', multiplier: '慣用語倍率', knownHint: '在冒險中確認的語境',
    discovery: '發現新慣用語', recorded: '已記錄到圖鑑',
  },
} as const satisfies Record<LocaleCode, Record<string, string>>

export type ComboCodexTextKey = keyof typeof COPY.ko

export function comboCodexText(key: ComboCodexTextKey, locale: LocaleCode = currentLocale): string {
  return COPY[locale][key]
}
