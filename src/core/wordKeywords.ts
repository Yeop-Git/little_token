import { currentLocale, type LocaleCode } from '@/localization'
import { PREEMPT_TAG } from './compiler'
import type { Word } from './types'

export type WordKeywordId =
  | 'pierce' | 'counter' | 'preempt' | 'critical' | 'renewal' | 'spread'
  | 'multiHit' | 'repeat' | 'frenzy' | 'magicShield' | 'lifesteal'
  | 'weaken' | 'empower' | 'guardEmpower' | 'redraw' | 'discount'
  | 'guardEcho' | 'overflow' | 'protect' | 'shatter' | 'lingering'
  | 'fortify' | 'recuperate'

interface KeywordCopy { label: string; detail: string }

const COPY: Record<LocaleCode, Record<WordKeywordId, KeywordCopy>> = {
  ko: {
    pierce: { label: '관통', detail: '공격 피해가 일반 실드와 매직실드를 무시합니다.' },
    counter: { label: '카운터', detail: '이 문장을 쓴 턴에 받은 피해의 50%를 돌려줍니다. 방어·회복 행동이면 100%를 돌려줍니다.' },
    preempt: { label: '선공', detail: '선공하는 상대보다 먼저 행동합니다.' },
    critical: { label: '대성공', detail: '표시된 확률로 최종 배율이 ×1.5가 됩니다.' },
    renewal: { label: '재생', detail: '다음 피격으로 잃은 체력의 표시 비율만큼 회복합니다. 회복 동사와 조합하면 비율이 두 배가 됩니다.' },
    spread: { label: '확산', detail: '하나의 행동이 앞줄의 여러 적에게 차례로 적용됩니다.' },
    multiHit: { label: '연격', detail: '한 번의 동작으로 같은 적을 여러 번 적중시킵니다.' },
    repeat: { label: '연타', detail: '선택한 동사의 행동 전체를 표시된 비율로 다시 실행합니다.' },
    frenzy: { label: '초과타', detail: '잉크 초과로 체력을 지불한 문장에 추가 타격을 더합니다.' },
    magicShield: { label: '매직실드', detail: '다음 공격 한 번을 완전히 막습니다. 관통 공격에는 뚫립니다.' },
    lifesteal: { label: '흡혈', detail: '실제로 입힌 체력 피해의 일부를 회복합니다.' },
    weaken: { label: '공격 약화', detail: '현재 적의 공격 랭크를 낮춥니다.' },
    empower: { label: '공격 강화', detail: '이번 전투 동안 플레이어의 공격 랭크를 높입니다.' },
    guardEmpower: { label: '방어 강화', detail: '이번 전투 동안 플레이어의 방어 랭크를 높입니다.' },
    redraw: { label: '재뽑기', detail: '이번 전투에서 사용할 수 있는 다시 뽑기 횟수를 늘립니다.' },
    discount: { label: '리필', detail: '이 문장의 최종 잉크 비용을 표시된 만큼 줄입니다.' },
    guardEcho: { label: '방패치기', detail: '현재 실드에 비례한 피해를 줍니다. 실드는 소모하지 않습니다.' },
    overflow: { label: '생명력 폭발', detail: '최대 체력을 넘긴 회복량에 비례해 피해를 줍니다.' },
    protect: { label: '초과 회복 실드', detail: '최대 체력을 넘긴 회복량에 비례해 실드를 얻습니다.' },
    shatter: { label: '실드 파괴 회복', detail: '이번 공격으로 부순 적 실드에 비례해 체력을 회복합니다.' },
    lingering: { label: '출혈', detail: '적중 후 표시된 턴 동안 기준 피해의 일부를 반복해서 줍니다.' },
    fortify: { label: '피해 비례 실드', detail: '실제로 입힌 체력 피해에 비례해 실드를 얻습니다.' },
    recuperate: { label: '실드 비례 회복', detail: '현재 실드에 비례해 체력을 회복합니다. 실드는 소모하지 않습니다.' },
  },
  en: {
    pierce:{label:'Pierce',detail:'Damage bypasses normal Guard and Magic Shield.'}, counter:{label:'Counter',detail:'Returns part of incoming damage. Returns twice as much if you had a shield before the hit.'}, preempt:{label:'First Strike',detail:'Acts before enemies with First Strike.'}, critical:{label:'Critical',detail:'At the shown chance, final multiplier becomes ×1.5.'}, renewal:{label:'Renew',detail:'Heals from the Heal stat after acting; doubled on Heal actions.'}, spread:{label:'Spread',detail:'Applies the action to multiple enemies in the front row.'}, multiHit:{label:'Multi-hit',detail:'Hits the same enemy multiple times.'}, repeat:{label:'Repeat',detail:'Repeats the whole verb action at the shown rate.'}, frenzy:{label:'Frenzy',detail:'Adds hits when the sentence pays health for Ink overdraw.'}, magicShield:{label:'Magic Shield',detail:'Negates the next attack. Pierce bypasses it.'}, lifesteal:{label:'Lifesteal',detail:'Heals for part of HP damage actually dealt.'}, weaken:{label:'Weaken',detail:'Lowers the current enemy Attack rank.'}, empower:{label:'Empower',detail:'Raises player Attack rank for this battle.'}, redraw:{label:'Refine',detail:'Adds redraw uses for this battle.'}, discount:{label:'Refill',detail:'Reduces this sentence’s final Ink cost by the shown amount.'}, guardEmpower:{label:'Guard Up',detail:'Raises player Guard rank for this battle.'}, guardEcho:{label:'Echo',detail:'Deals damage from current Guard without consuming it.'}, overflow:{label:'Overflow',detail:'Deals damage from healing beyond max HP.'}, protect:{label:'Protect',detail:'Turns healing beyond max HP into Guard.'}, shatter:{label:'Shatter',detail:'Heals from enemy Guard broken by this attack.'}, lingering:{label:'Lingering',detail:'Repeats part of base damage for the shown turns.'}, fortify:{label:'Fortify',detail:'Gains Guard from HP damage actually dealt.'}, recuperate:{label:'Recuperate',detail:'Heals from current Guard without consuming it.'},
  },
  ja: {
    pierce:{label:'貫通',detail:'通常シールドとマジックシールドを無視してダメージを与えます。'}, counter:{label:'カウンター',detail:'受けたダメージの一部を返します。被弾前にシールドがあれば返す量が2倍になります。'}, preempt:{label:'先攻',detail:'先攻する敵より先に行動します。'}, critical:{label:'大成功',detail:'表示確率で最終倍率が×1.5になります。'}, renewal:{label:'再生',detail:'行動後、回復ステータスに応じて回復します。回復行動なら2倍です。'}, spread:{label:'拡散',detail:'前列の複数の敵へ順に行動を適用します。'}, multiHit:{label:'連撃',detail:'同じ敵に複数回命中します。'}, repeat:{label:'連続',detail:'動詞の行動全体を表示比率で繰り返します。'}, frenzy:{label:'激昂',detail:'インク超過で体力を払った文に追加打撃を加えます。'}, magicShield:{label:'マジックシールド',detail:'次の攻撃を完全に防ぎます。貫通には破られます。'}, lifesteal:{label:'吸血',detail:'実際に与えた体力ダメージの一部を回復します。'}, weaken:{label:'弱体',detail:'現在の敵の攻撃ランクを下げます。'}, empower:{label:'高揚',detail:'この戦闘中、攻撃ランクを上げます。'}, redraw:{label:'再整備',detail:'この戦闘の引き直し回数を増やします。'}, discount:{label:'補充',detail:'この文の最終インク費用を表示分だけ減らします。'}, guardEmpower:{label:'防御強化',detail:'この戦闘中、防御ランクを上げます。'}, guardEcho:{label:'反響',detail:'現在のシールドに応じたダメージを与え、シールドは消費しません。'}, overflow:{label:'溢れ',detail:'最大体力を超えた回復量に応じてダメージを与えます。'}, protect:{label:'保護',detail:'最大体力を超えた回復量をシールドに変えます。'}, shatter:{label:'破砕',detail:'この攻撃で壊した敵シールドに応じて回復します。'}, lingering:{label:'持続',detail:'表示ターンの間、基準ダメージの一部を繰り返します。'}, fortify:{label:'要塞化',detail:'実際に与えた体力ダメージに応じてシールドを得ます。'}, recuperate:{label:'回生',detail:'現在のシールドに応じて回復し、シールドは消費しません。'},
  },
  ru: {
    pierce:{label:'Пробитие',detail:'Урон игнорирует обычный и магический щит.'}, counter:{label:'Контратака',detail:'Возвращает часть полученного урона; при наличии щита — вдвое больше.'}, preempt:{label:'Первый ход',detail:'Действует раньше врагов с первым ходом.'}, critical:{label:'Критический успех',detail:'С указанным шансом итоговый множитель становится ×1,5.'}, renewal:{label:'Регенерация',detail:'Лечит после действия от параметра лечения; для лечения эффект удваивается.'}, spread:{label:'Рассеивание',detail:'Применяет действие к нескольким врагам переднего ряда.'}, multiHit:{label:'Серия',detail:'Несколько раз поражает одну цель.'}, repeat:{label:'Повтор',detail:'Повторяет всё действие глагола с указанной силой.'}, frenzy:{label:'Ярость',detail:'Добавляет удары при оплате перерасхода чернил здоровьем.'}, magicShield:{label:'Магический щит',detail:'Полностью отменяет следующую атаку; пробитие его игнорирует.'}, lifesteal:{label:'Вампиризм',detail:'Лечит на часть фактически нанесённого урона здоровью.'}, weaken:{label:'Ослабление',detail:'Снижает ранг атаки текущего врага.'}, empower:{label:'Подъём',detail:'Повышает ранг атаки игрока в этом бою.'}, redraw:{label:'Пересборка',detail:'Даёт дополнительные обновления руки.'}, discount:{label:'Пополнение',detail:'Снижает стоимость этой фразы на указанное количество чернил.'}, guardEmpower:{label:'Усиление защиты',detail:'Повышает ранг защиты игрока в этом бою.'}, guardEcho:{label:'Отзвук',detail:'Наносит урон от текущего щита, не расходуя его.'}, overflow:{label:'Перелив',detail:'Наносит урон от лечения сверх максимума здоровья.'}, protect:{label:'Защита',detail:'Превращает избыточное лечение в щит.'}, shatter:{label:'Разлом',detail:'Лечит от щита врага, разрушенного этой атакой.'}, lingering:{label:'Длительный',detail:'Повторяет часть базового урона указанное число ходов.'}, fortify:{label:'Укрепление',detail:'Даёт щит от фактически нанесённого урона здоровью.'}, recuperate:{label:'Восстановление',detail:'Лечит от текущего щита, не расходуя его.'},
  },
  'zh-Hans': {
    pierce:{label:'贯穿',detail:'伤害无视普通护盾和魔法盾。'}, counter:{label:'反击',detail:'返还部分所受伤害；受击前有护盾时返还量翻倍。'}, preempt:{label:'先攻',detail:'比拥有先攻的敌人更早行动。'}, critical:{label:'大成功',detail:'按显示概率使最终倍率变为×1.5。'}, renewal:{label:'再生',detail:'行动后按治疗属性恢复；进行治疗行动时效果翻倍。'}, spread:{label:'扩散',detail:'依次对前排多个敌人应用行动。'}, multiHit:{label:'连击',detail:'对同一敌人命中多次。'}, repeat:{label:'连续',detail:'按显示比例重复整个动词行动。'}, frenzy:{label:'激昂',detail:'因墨水超支支付生命时追加攻击。'}, magicShield:{label:'魔法盾',detail:'完全抵消下一次攻击；会被贯穿。'}, lifesteal:{label:'吸血',detail:'按实际造成的生命伤害恢复。'}, weaken:{label:'弱化',detail:'降低当前敌人的攻击阶级。'}, empower:{label:'激励',detail:'本场战斗中提高玩家攻击阶级。'}, redraw:{label:'整备',detail:'增加本场战斗的重抽次数。'}, discount:{label:'补充',detail:'按显示数值降低该句的最终墨水费用。'}, guardEmpower:{label:'防御强化',detail:'本场战斗中提高玩家防御阶级。'}, guardEcho:{label:'回响',detail:'按当前护盾造成伤害且不消耗护盾。'}, overflow:{label:'溢出',detail:'按超过最大生命的治疗量造成伤害。'}, protect:{label:'保护',detail:'把超过最大生命的治疗量转化为护盾。'}, shatter:{label:'破碎',detail:'按本次攻击打破的敌方护盾恢复生命。'}, lingering:{label:'持续',detail:'在显示回合内重复部分基础伤害。'}, fortify:{label:'筑垒',detail:'按实际造成的生命伤害获得护盾。'}, recuperate:{label:'回生',detail:'按当前护盾恢复生命且不消耗护盾。'},
  },
  'zh-Hant': {
    pierce:{label:'貫穿',detail:'傷害無視普通護盾和魔法盾。'}, counter:{label:'反擊',detail:'返還部分所受傷害；受擊前有護盾時返還量翻倍。'}, preempt:{label:'先攻',detail:'比擁有先攻的敵人更早行動。'}, critical:{label:'大成功',detail:'按顯示機率使最終倍率變為×1.5。'}, renewal:{label:'再生',detail:'行動後按治療屬性恢復；進行治療行動時效果翻倍。'}, spread:{label:'擴散',detail:'依次對前排多個敵人套用行動。'}, multiHit:{label:'連擊',detail:'對同一敵人命中多次。'}, repeat:{label:'連續',detail:'按顯示比例重複整個動詞行動。'}, frenzy:{label:'激昂',detail:'因墨水超支支付生命時追加攻擊。'}, magicShield:{label:'魔法盾',detail:'完全抵消下一次攻擊；會被貫穿。'}, lifesteal:{label:'吸血',detail:'按實際造成的生命傷害恢復。'}, weaken:{label:'弱化',detail:'降低目前敵人的攻擊階級。'}, empower:{label:'激勵',detail:'本場戰鬥中提高玩家攻擊階級。'}, redraw:{label:'整備',detail:'增加本場戰鬥的重抽次數。'}, discount:{label:'補充',detail:'按顯示數值降低該句的最終墨水費用。'}, guardEmpower:{label:'防禦強化',detail:'本場戰鬥中提高玩家防禦階級。'}, guardEcho:{label:'回響',detail:'按目前護盾造成傷害且不消耗護盾。'}, overflow:{label:'溢出',detail:'按超過最大生命的治療量造成傷害。'}, protect:{label:'保護',detail:'把超過最大生命的治療量轉化為護盾。'}, shatter:{label:'破碎',detail:'按本次攻擊打破的敵方護盾恢復生命。'}, lingering:{label:'持續',detail:'在顯示回合內重複部分基礎傷害。'}, fortify:{label:'築壘',detail:'按實際造成的生命傷害獲得護盾。'}, recuperate:{label:'回生',detail:'按目前護盾恢復生命且不消耗護盾。'},
  },
}

export interface WordKeyword { id: WordKeywordId; label: string; detail: string }

const percent = (value: number) => `${Math.round(value * 100)}%`

export function wordKeywords(word: Word): WordKeyword[] {
  const effects = word.effects
  const entries: Array<[WordKeywordId, string | null]> = [
    ['pierce', effects?.pierceGuard ? '' : null],
    ['counter', effects?.counter ? '' : null],
    ['preempt', word.tags.includes(PREEMPT_TAG) ? '' : null],
    ['critical', word.crit ? percent(word.crit) : null],
    ['repeat', (effects?.hitCount ?? 1) > 1
      ? `${effects!.hitCount}회`
      : (effects?.castCount ?? 1) > 1
        ? `${effects!.castCount}회·${percent(effects?.castScale ?? 1)}`
        : null],
    ['magicShield', effects?.magicShield ? String(effects.magicShield) : null],
    ['lifesteal', effects?.lifeStealRate ? percent(effects.lifeStealRate) : null],
    ['discount', effects?.inkDiscount ? String(effects.inkDiscount) : null],
    ['guardEcho', effects?.guardAttackMultiplier ? percent(effects.guardAttackMultiplier) : null],
    ['overflow', effects?.overhealDamageMultiplier ? percent(effects.overhealDamageMultiplier) : null],
  ]
  const keywords = entries.flatMap(([id, value]) => value == null ? [] : [{ id, label: `${COPY[currentLocale][id].label}${value ? ` ${value}` : ''}`, detail: COPY[currentLocale][id].detail }])
  if ((effects?.enemyAttackRank ?? 0) < 0) keywords.push({ id: 'weaken', label: `상대 공격 ${effects!.enemyAttackRank}랭크`, detail: '현재 상대의 공격 랭크를 표시된 만큼 낮춥니다.' })
  if ((effects?.attackRank ?? 0) > 0) keywords.push({ id: 'empower', label: `자신 공격 +${effects!.attackRank}랭크`, detail: '이번 전투 동안 자신의 공격 랭크를 표시된 만큼 높입니다.' })
  if ((effects?.guardRank ?? 0) > 0) keywords.push({ id: 'guardEmpower', label: `자신 방어 +${effects!.guardRank}랭크`, detail: '이번 전투 동안 자신의 방어 랭크를 표시된 만큼 높입니다.' })
  return keywords
}
