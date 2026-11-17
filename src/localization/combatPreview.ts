import { currentLocale, type LocaleCode } from './index'

/** 전투 계산값과 적에게 실제 적용되는 결과를 구분하는 안내. */
const TEXT: Record<LocaleCode, { estimate: string; caveat: string; calculation: string; applied: string; actual: string; adjustment: string }> = {
  ko: { estimate: '예상 합계', caveat: '적 행동과 약점·방어에 따라 달라져요.', calculation: '문장 계산값', applied: '적중 합계', actual: '실제 적용', adjustment: '대상·자원 반영' },
  en: { estimate: 'Estimated total', caveat: 'Enemy actions, weaknesses and Guard can change the result.', calculation: 'Sentence calculation', applied: 'Total hits', actual: 'Applied', adjustment: 'Target and resources' },
  ja: { estimate: '予想合計', caveat: '敵の行動や弱点・防御で結果が変わります。', calculation: '文の計算値', applied: '命中合計', actual: '実際の効果', adjustment: '対象・資源を反映' },
  ru: { estimate: 'Предварительный итог', caveat: 'Действия, слабости и защита врага могут изменить результат.', calculation: 'Расчёт фразы', applied: 'Сумма попаданий', actual: 'Применено', adjustment: 'Цель и ресурсы' },
  'zh-Hans': { estimate: '预计总值', caveat: '敌人行动、弱点和防御会改变结果。', calculation: '句子计算值', applied: '命中总计', actual: '实际生效', adjustment: '计入目标与资源' },
  'zh-Hant': { estimate: '預計總值', caveat: '敵人行動、弱點和防禦會改變結果。', calculation: '句子計算值', applied: '命中總計', actual: '實際生效', adjustment: '計入目標與資源' },
}

export function combatPreviewText(locale: LocaleCode = currentLocale) { return TEXT[locale] }
