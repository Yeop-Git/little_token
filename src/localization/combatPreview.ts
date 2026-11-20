import { currentLocale, type LocaleCode } from './index'

/** 전투 계산값과 적에게 실제 적용되는 결과를 구분하는 안내. */
const TEXT: Record<LocaleCode, { estimate: string; caveat: string; calculation: string; applied: string; actual: string; adjustment: string; hits: string; overheal: string; guardCap: string; guardConvert: string; overhealConvert: string; converted: string }> = {
  ko: { estimate: '예상 합계', caveat: '적 행동과 약점·방어에 따라 달라져요.', calculation: '문장 계산값', applied: '적중 합계', actual: '실제 적용', adjustment: '대상·자원 반영', hits: '{count}회 타격', overheal: '넘친 회복', guardCap: '실드 한도 초과', guardConvert: '방어도 전환', overhealConvert: '초과 회복 전환', converted: '전환 피해' },
  en: { estimate: 'Estimated total', caveat: 'Enemy actions, weaknesses and Guard can change the result.', calculation: 'Sentence calculation', applied: 'Total hits', actual: 'Applied', adjustment: 'Target and resources', hits: '{count} hits', overheal: 'Overheal', guardCap: 'Over Shield limit', guardConvert: 'Guard converted', overhealConvert: 'Overheal converted', converted: 'Converted damage' },
  ja: { estimate: '予想合計', caveat: '敵の行動や弱点・防御で結果が変わります。', calculation: '文の計算値', applied: '命中合計', actual: '実際の効果', adjustment: '対象・資源を反映', hits: '{count}回攻撃', overheal: '超過回復', guardCap: 'シールド上限超過', guardConvert: '防御を変換', overhealConvert: '超過回復を変換', converted: '変換ダメージ' },
  ru: { estimate: 'Предварительный итог', caveat: 'Действия, слабости и защита врага могут изменить результат.', calculation: 'Расчёт фразы', applied: 'Сумма попаданий', actual: 'Применено', adjustment: 'Цель и ресурсы', hits: 'Ударов: {count}', overheal: 'Избыток лечения', guardCap: 'Сверх лимита щита', guardConvert: 'Защита в урон', overhealConvert: 'Избыток лечения в урон', converted: 'Урон от преобразования' },
  'zh-Hans': { estimate: '预计总值', caveat: '敌人行动、弱点和防御会改变结果。', calculation: '句子计算值', applied: '命中总计', actual: '实际生效', adjustment: '计入目标与资源', hits: '{count}次攻击', overheal: '溢出治疗', guardCap: '超出护盾上限', guardConvert: '防御转化', overhealConvert: '溢出治疗转化', converted: '转化伤害' },
  'zh-Hant': { estimate: '預計總值', caveat: '敵人行動、弱點和防禦會改變結果。', calculation: '句子計算值', applied: '命中總計', actual: '實際生效', adjustment: '計入目標與資源', hits: '{count}次攻擊', overheal: '溢出治療', guardCap: '超出護盾上限', guardConvert: '防禦轉化', overhealConvert: '溢出治療轉化', converted: '轉化傷害' },
}

export function combatPreviewText(locale: LocaleCode = currentLocale) { return TEXT[locale] }
