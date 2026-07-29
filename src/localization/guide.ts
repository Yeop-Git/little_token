import type { LocaleCode } from './index'

export interface LocalizedGuidePage { key: string; title: string; hint: string; body: string }
type ForeignLocale = Exclude<LocaleCode, 'ko'>

function page(key: string, title: string, hint: string, lead: string, bullets: string[]): LocalizedGuidePage {
  return { key, title, hint, body: `<h3 class="g-h3">${title}</h3><p class="g-lead">${lead}</p><ul class="g-bullets">${bullets.map((text) => `<li>${text}</li>`).join('')}</ul>` }
}

const en = [
  page('flow','Battle flow','What happens each turn','Choose a Subject, Modifier, then Verb. The completed sentence becomes your action.',['Preparation effects such as Guard resolve first.','First-strike enemies act before your main action; second-strike enemies act afterward.','Unused card draws improve the reward grade after victory.']),
  page('card','Reading cards','Everything is on the card','The front shows emotion at the upper left, Ink cost at the upper right, sentence text, and the current effect.',['Rarity and upgrade level appear in card details; borders and foil hint at rarity on the front.','Subjects and modifiers add to one multiplier pool.','Verbs turn a stat and scaling value into Attack, Guard, or Healing.']),
  page('damage','How values resolve','Base value × multiplier','The verb creates a base value. Additive bonuses form one pool; combos, resonance, luck, variance, and critical success then multiply it.',['There is no multiplier cap.','Critical success multiplies the whole sentence.','The breakdown always matches the value applied in battle.']),
  page('context','Emotion and context','Resonance · combos · weakness','Context changes what a word can do and how valuable it becomes.',['Matching emotions create resonance.','A named combo activates when its required tag set is present.','Match visible enemy weaknesses; segmented bosses require both a weakness and combo to pierce the next part.']),
  page('combat','Attack and defense','Area · pierce · shields','Choose the kind of benefit that fits the enemy formation.',['Multi-target attacks spread across the rail; multi-hit attacks focus the front enemy.','Pierce bypasses Guard, while multi-hit quickly removes Magic Shields.','Remaining Guard persists between stages and boss guard-breaking moves are telegraphed.']),
  page('journey','Journey and rewards','15 floors · bosses · loot','Enemies grow stronger as the diary advances. After victory, choose sentence cards and an item.',['Duplicate words become repeat upgrades.','Items gain stats from a three-word forging sentence.','Epic and Legendary items may change sentence rules; the final floor opens Endless mode.']),
]

const ja = [
  page('flow','戦闘の流れ','1ターンに起こること','主語 → 修飾語 → 動詞の順に選び、完成した文がそのまま行動になる。',['防御などの準備効果を先に適用する。','先攻の敵は本行動の前、後攻の敵は後に動く。','温存したドローは勝利後の報酬等級を上げる。']),
  page('card','カードの読み方','必要な情報はカードにある','左上に感情、右上にインク消費量、中央に言葉、下に現在の効果を表示する。',['等級と強化Lv.はカード詳細で確認でき、表面では枠と箔が等級を示す。','主語と修飾語は一つの倍率プールに加算する。','動詞は能力値と係数から攻撃・防御・回復を作る。']),
  page('damage','数値の決まり方','基礎値 × 倍率','動詞が基礎値を作る。加算ボーナスをまとめ、観用句・共鳴・運・分散・大成功を乗算する。',['倍率に上限はない。','大成功は文全体を強化する。','内訳の合計は実際の戦闘結果と一致する。']),
  page('context','感情と文脈','共鳴 · 観用句 · 弱点','前後の文脈によって言葉の役割と価値が変わる。',['同じ感情を集めると共鳴する。','必要なタグがそろうと名前付きの観用句が発動する。','部位ボスを貫通するには弱点と観用句を同時に満たす。']),
  page('combat','攻撃と防御','範囲 · 貫通 · 防御膜','敵の並びに合う利益を選ぶ。',['複数対象は敵列へ広がり、連打は先頭へ集中する。','貫通は防御を越え、連打はマジックシールドを早く剥がす。','残った防御は次のステージへ持ち越し、危険なボス技は予告される。']),
  page('journey','旅と報酬','15階 · ボス · 戦利品','日記が進むほど敵は強くなり、勝利後は文カードとアイテムを選ぶ。',['同じ言葉は反復強化になる。','アイテムは三語の鍛錬文で能力値を得る。','高等級アイテムは文のルールを変え、最終階の後はエンドレスへ進む。']),
]

const ru = [
  page('flow','Ход боя','Что происходит за ход','Выберите подлежащее, модификатор и глагол. Готовая фраза становится действием.',['Подготовка, например Защита, срабатывает первой.','Враги первого хода действуют до вас, остальные — после.','Сохранённые доборы повышают уровень награды.']),
  page('card','Как читать карты','Всё указано на карте','Слева вверху показана эмоция, справа — стоимость чернил, в центре — слово, а снизу — текущий эффект.',['Редкость и уровень усиления указаны в подробностях; на лицевой стороне редкость передают рамка и фольга.','Подлежащие и модификаторы пополняют один пул множителя.','Глаголы создают Атаку, Защиту или Лечение из параметра и коэффициента.']),
  page('damage','Расчёт значений','База × множитель','Глагол создаёт базу. Бонусы складываются в пул, затем сочетания, резонанс, удача, разброс и критический успех перемножаются.',['Предела множителя нет.','Критический успех усиливает всю фразу.','Разбор совпадает с реальным результатом боя.']),
  page('context','Эмоции и контекст','Резонанс · сочетания · слабости','Контекст меняет роль и ценность каждого слова.',['Одинаковые эмоции создают резонанс.','Именованное сочетание требует определённого набора тегов.','Для пробития части босса нужны и слабость, и сочетание.']),
  page('combat','Атака и защита','Область · пробитие · щиты','Подбирайте пользу под построение врагов.',['Атаки по области идут вдоль ряда, серии ударов бьют переднего врага.','Пробитие обходит Защиту, а серии быстро снимают Магический щит.','Остаток Защиты переносится между этапами; опасные приёмы боссов предупреждаются.']),
  page('journey','Путь и награды','15 этажей · боссы · добыча','Враги крепнут по мере продвижения. После победы выбирайте карты слов и предмет.',['Повторное слово становится усилением.','Предмет получает параметры из фразы ковки из трёх слов.','Редкие правила предметов меняют фразы, а финальный этаж открывает бесконечный режим.']),
]

const zhHans = [
  page('flow','战斗流程','一回合中发生的事','依次选择主语、修饰语与动词，完成的句子就是本回合行动。',['防御等准备效果优先生效。','先攻敌人在主行动前行动，后攻敌人在之后行动。','保留的抽卡次数会提高奖励等级。']),
  page('card','卡牌阅读方法','信息都写在卡牌上','左上显示情绪，右上显示墨水费用，中间是词语，下方是当前效果。',['稀有度与强化等级可在卡牌详情中查看；正面的边框与闪面也会提示稀有度。','主语与修饰语加算到同一个倍率池。','动词以属性与系数生成攻击、防御或恢复。']),
  page('damage','数值结算顺序','基础值 × 倍率','动词生成基础值。加算奖励汇入倍率池，再乘上组合、共鸣、幸运、浮动与大成功。',['倍率没有上限。','大成功会强化整个句子。','结算明细始终与实际战斗结果一致。']),
  page('context','情绪与语境','共鸣 · 组合 · 弱点','前后语境会改变词语的作用与价值。',['相同情绪会产生共鸣。','凑齐所需标签会触发具名组合。','贯通Boss下一部位时，必须同时命中弱点与组合。']),
  page('combat','攻击与防御','范围 · 贯通 · 护盾','根据敌人队列选择合适的收益。',['多目标攻击沿队列扩散，连击集中攻击最前方敌人。','贯通绕过防御，连击能快速剥除魔法盾。','剩余防御保留至下一关，危险的Boss招式会提前预告。']),
  page('journey','旅程与奖励','15层 · Boss · 战利品','敌人随日记推进而变强。胜利后选择句子卡牌与道具。',['重复词语会变为重复强化。','道具通过三个词组成的锻造句子获得属性。','高稀有度道具可改变句子规则，最终层后会开启无尽模式。']),
]

const TRADITIONAL_PAIRS = Array.from('战戰发發奖獎励勵读讀击擊数數语語与與绪緒贯貫护護围圍层層敌敵动動词詞组組择擇复復结結显顯当當会會过過这這个個则則还還变變无無书書属屬强強进進后後开開关關余餘间間并並应應类類为為连連实實将將仅僅伤傷选選扩擴传傳难難终終预預')
const toTraditional = (value: string) => {
  let result = value
  for (let index = 0; index < TRADITIONAL_PAIRS.length; index += 2) {
    result = result.split(TRADITIONAL_PAIRS[index]).join(TRADITIONAL_PAIRS[index + 1])
  }
  return result
}

const zhHant = zhHans.map((entry) => ({ ...entry, title: toTraditional(entry.title), hint: toTraditional(entry.hint), body: toTraditional(entry.body) }))
const GUIDES: Record<ForeignLocale, LocalizedGuidePage[]> = { en, ja, ru, 'zh-Hans': zhHans, 'zh-Hant': zhHant }

export function localizedGuidePages(locale: ForeignLocale): LocalizedGuidePage[] { return GUIDES[locale] }
