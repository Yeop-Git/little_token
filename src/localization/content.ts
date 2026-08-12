import { currentLocale, type LocaleCode } from './index'
import { EARLY_WORDS, ALL_REWARD_WORDS, BOSS_TACTIC_WORDS, PUNCT_WORDS, GROW_WORDS } from '@data/earlyWords'
import { WORDS } from '@data/generated/sentenceData'
import { EARLY_COMBOS, COMBOS } from '@data/generated/sentenceData'
import { ALL_ITEMS, EXCLAIM_SLOTS } from '@data/items'
import { ENEMIES } from '@data/enemies'
import { FIELDS } from '@data/fields'
import { BASE_SLOTS } from '@data/slots'
import { EMOTION_LABEL, RARITY_LABEL, type Word } from '@core/types'

type ForeignLocale = Exclude<LocaleCode, 'ko'>

const WORD_IDS = [
  'na', 'eoje', 'nado', 'oneul', 'gyeop', 'naman', 'dachin', 'uri', 'utneun', 'ttatteutan',
  'andohan', 'hwanan', 'matseo', 'kkeutkkaji', 'ulmeogin', 'hollo', 'gogae', 'deultteun', 'sinnan', 'jangnan',
  'himkkeot', 'dandanhi', 'saljjak', 'naepda', 'kkuk', 'nunmullo', 'ttaeryeot', 'makat', 'gamssat', 'huryeo',
  'jikyeot', 'pumeot', 'jaeppalli', 'motdohage', 'naedeonjyeot', 'ureojyeot', 'michin', 'ipan', 'hwanhage', 'pogeunhage',
  'bangeopge', 'useumyeo', 'geochilge', 'sseulsseulhi', 'aesseo', 'sinnage', 'deulsseogimyeo', 'gyeongkwaehage',
  'neo', 'geu', 'holo', 'joy', 'mad', 'slow', 'neolli', 'war', 'fir', 'sil', 'mem', 'bit',
  'jin', 'hoi', 'jum', 'mang', 'hui', 'e1', 'e2', 'e3', 'e4', 'pt_bang', 'pt_dot', 'pt_q', 'gr',
  'focusStrike', 'pierceStrike', 'spreadTwo', 'splitTwo', 'scatterThree', 'pourThree', 'doubleTap', 'flurry',
  'counterOne', 'counterTwo', 'tearMend', 'riseAgain', 'queenBeeTactic', 'elderSpiderTactic', 'mantisTactic',
] as const

function mapValues(values: readonly string[]): Record<string, string> {
  if (values.length !== WORD_IDS.length) throw new Error(`locale word count ${values.length} != ${WORD_IDS.length}`)
  return Object.fromEntries(WORD_IDS.map((id, index) => [id, values[index]]))
}

const WORD_TEXT: Record<ForeignLocale, Record<string, string>> = {
  en: mapValues([
    'I', 'Yesterday, I', 'I too', 'Today, I', 'I, gritting my teeth', 'I, standing firm', 'Wounded, I', 'We', 'Smiling brightly, I', 'Warmly, we',
    'Relieved, I', 'Angry, I', 'Standing together, we', 'Still here, I', 'Holding back tears, I', 'Left alone, I', 'Head bowed, I', 'Excited, I', 'Joyfully, we', 'Mischievously, I',
    'with all my might', 'gently', 'carefully', 'headlong', 'holding on', 'through tears', 'struck', 'blocked', 'embraced', 'dodged',
    'protected', 'curled up', 'swiftly', 'pretending to yield', 'mended', 'let it flow away', 'madly', 'with nothing to lose', 'brightly', 'warmly',
    'gladly', 'with a smile', 'fiercely', 'lonely', 'trying hard', 'cheerfully', 'to the beat', 'lightly',
    'You', 'That child', 'alone', 'quietly', 'madly', 'slowly', 'far and wide', 'the battle', 'the flame', 'the silence', 'the memory', 'the rain',
    'advanced', 'evaded', 'ignited', 'forgot', 'swept away', 'did it', 'tried to do it', 'did I do it?', 'ended up doing it!', '!', '.', '?', 'growing',
    'struck', 'pierced through', 'spread it', 'split it', 'scattered it', 'poured it out', 'tapped', 'pummeled',
    'gave it back', 'held firm', 'swallowed my tears', 'rose', 'scattered them', 'struck the weakness', 'braced for sacrifice',
  ]),
  ja: mapValues([
    'ぼくは', '昨日のぼくは', 'ぼくも', '今日のぼくは', '歯を食いしばったぼくは', '奮い立つぼくは', '傷ついたぼくは', 'ぼくたちは', '明るく笑うぼくは', 'あたたかなぼくたちは',
    'ほっとしたぼくは', '怒ったぼくは', '立ち向かうぼくたちは', '最後まで残ったぼくは', '涙ぐむぼくは', 'ひとり残ったぼくは', 'うつむいたぼくは', '浮き立つぼくは', 'わくわくするぼくたちは', 'いたずらっぽいぼくは',
    '力いっぱい', 'やさしく', 'そっと', 'いきなり', 'ぐっとこらえて', '涙ながらに', 'たたいた', '防いだ', '包みこんだ', 'かわした',
    '守った', '身を丸めた', 'すばやく', '負けたふりをして', '直した', '受け流した', '狂ったように', 'いちかばちか', '明るく', 'ふんわり',
    'うれしそうに', '笑いながら', '荒々しく', '寂しく', '懸命に', '楽しげに', '弾みながら', '軽やかに',
    'きみは', 'あの子は', 'ひとりで', '静かに', '狂ったように', 'ゆっくり', '広く', '戦い', '炎', '沈黙', '記憶', '雨',
    '進めた', 'かわした', '灯した', '忘れた', 'なぎ払った', 'した', 'しようとした', 'したっけ？', 'してしまった！', '！', '。', '？', 'すくすく',
    '打った', '貫いた', '広げた', '切り裂いた', 'まき散らした', '浴びせた', 'たたいた', '乱打した',
    '返した', '耐え抜いた', '涙を飲みこんだ', '立ち上がった', '散らした', '弱点を突いた', '犠牲を覚悟した',
  ]),
  ru: mapValues([
    'Я', 'Вчера я', 'Я тоже', 'Сегодня я', 'Стиснув зубы, я', 'Встав во весь рост, я', 'Раненый, я', 'Мы', 'Сияя улыбкой, я', 'Согретые теплом, мы',
    'С облегчением я', 'Разозлённый, я', 'Встав плечом к плечу, мы', 'Оставшийся до конца, я', 'Сдерживая слёзы, я', 'Оставшись один, я', 'Опустив голову, я', 'Воодушевлённый, я', 'Ликуя, мы', 'Озорной, я',
    'изо всех сил', 'ласково', 'осторожно', 'с ходу', 'терпеливо', 'сквозь слёзы', 'ударил', 'защитился', 'укрыл', 'увернулся',
    'защитил', 'сжался', 'молниеносно', 'будто уступая', 'исправил', 'отпустил', 'безумно', 'ва-банк', 'ярко', 'с теплом',
    'радостно', 'с улыбкой', 'яростно', 'одиноко', 'из последних сил', 'весело', 'в такт', 'легко',
    'Ты', 'Тот ребёнок', 'в одиночку', 'тихо', 'безумно', 'медленно', 'широко', 'битву', 'пламя', 'тишину', 'память', 'дождь',
    'продолжил', 'уклонился', 'зажёг', 'забыл', 'смёл', 'сделал это', 'попытался сделать', 'я сделал это?', 'всё-таки сделал!', '!', '.', '?', 'всё выше',
    'ударил', 'пронзил', 'распространил', 'рассёк', 'рассеял', 'обрушил', 'ударил', 'избил',
    'вернул удар', 'выстоял', 'сдержал слёзы', 'встал', 'рассеял их', 'ударил в слабое место', 'решился на жертву',
  ]),
  'zh-Hans': mapValues([
    '我', '昨天的我', '我也', '今天的我', '咬紧牙关的我', '挺身而出的我', '受伤的我', '我们', '灿烂笑着的我', '温暖的我们',
    '松了口气的我', '生气的我', '并肩迎战的我们', '坚持到最后的我', '含着泪的我', '独自留下的我', '低着头的我', '兴奋的我', '开心的我们', '调皮的我',
    '全力地', '温柔地', '轻轻地', '猛然', '强忍着', '含泪', '打了下去', '挡住了', '拥住了', '躲开了',
    '守住了', '蜷缩起来了', '飞快地', '装作不敌地', '修好了', '让它流走了', '疯狂地', '孤注一掷地', '明亮地', '暖暖地',
    '欣喜地', '笑着', '猛烈地', '寂寞地', '努力地', '开心地', '雀跃地', '轻快地',
    '你', '那个孩子', '独自', '安静地', '疯狂地', '慢慢地', '广泛地', '战斗', '火焰', '沉默', '记忆', '雨水',
    '推进了', '回避了', '点燃了', '忘却了', '横扫了', '做了', '本想去做', '做过吗？', '终究还是做了！', '！', '。', '？', '茁壮成长',
    '击中了', '钻了进去', '扩散开了', '劈开了', '挥洒开了', '倾泻而出了', '敲击了', '猛击了',
    '还了回去', '坚持住了', '咽下了眼泪', '站了起来', '驱散了', '刺中了弱点', '做好了牺牲的觉悟',
  ]),
  'zh-Hant': mapValues([
    '我', '昨天的我', '我也', '今天的我', '咬緊牙關的我', '挺身而出的我', '受傷的我', '我們', '燦爛笑著的我', '溫暖的我們',
    '鬆了口氣的我', '生氣的我', '並肩迎戰的我們', '堅持到最後的我', '含著淚的我', '獨自留下的我', '低著頭的我', '興奮的我', '開心的我們', '調皮的我',
    '全力地', '溫柔地', '輕輕地', '猛然', '強忍著', '含淚', '打了下去', '擋住了', '擁住了', '躲開了',
    '守住了', '蜷縮起來了', '飛快地', '裝作不敵地', '修好了', '讓它流走了', '瘋狂地', '孤注一擲地', '明亮地', '暖暖地',
    '欣喜地', '笑著', '猛烈地', '寂寞地', '努力地', '開心地', '雀躍地', '輕快地',
    '你', '那個孩子', '獨自', '安靜地', '瘋狂地', '慢慢地', '廣泛地', '戰鬥', '火焰', '沉默', '記憶', '雨水',
    '推進了', '迴避了', '點燃了', '忘卻了', '橫掃了', '做了', '本想去做', '做過嗎？', '終究還是做了！', '！', '。', '？', '茁壯成長',
    '擊中了', '鑽了進去', '擴散開了', '劈開了', '揮灑開了', '傾瀉而出了', '敲擊了', '猛擊了',
    '還了回去', '堅持住了', '嚥下了眼淚', '站了起來', '驅散了', '刺中了弱點', '做好了犧牲的覺悟',
  ]),
}

const BOSS_TACTIC_LORE: Record<ForeignLocale, Record<string, string>> = {
  en: {
    queenBeeTactic: 'Scatter the two front workers with a single sentence.',
    elderSpiderTactic: 'Read the weakness of the exposed leg and strike it precisely.',
    mantisTactic: 'If the sentence runs short of Ink, add health and withstand the great scythe.',
  },
  ja: {
    queenBeeTactic: '一つの文で前にいる働き蜂二体を散らす。',
    elderSpiderTactic: '今見えている脚の弱点を読み、正確に突く。',
    mantisTactic: '文を結ぶインクが足りなければ、体力を足してでも大鎌を受け止める。',
  },
  ru: {
    queenBeeTactic: 'Одной фразой рассеивает двух передних рабочих пчёл.',
    elderSpiderTactic: 'Определяет слабость открытой ноги и точно бьёт по ней.',
    mantisTactic: 'Если фразе не хватает чернил, отдаёт здоровье, чтобы выдержать удар большой косы.',
  },
  'zh-Hans': {
    queenBeeTactic: '用一句话驱散前方两只工蜂。',
    elderSpiderTactic: '看清当前露出的蛛腿弱点，精准刺中。',
    mantisTactic: '写完句子的墨水不足时，也要补上生命挡住巨镰。',
  },
  'zh-Hant': {
    queenBeeTactic: '用一句話驅散前方兩隻工蜂。',
    elderSpiderTactic: '看清目前露出的蛛腿弱點，精準刺中。',
    mantisTactic: '寫完句子的墨水不足時，也要補上生命擋住巨鐮。',
  },
}

const EXTRA_WORD_TEXT: Record<ForeignLocale, Record<string, string>> = {
  en: {
    magicVeil: 'raised a veil', storedResolve: 'pushed back',
    overflowingHeart: 'offered my heart', drinkInk: 'drank back the ink',
    stainedTomorrow: 'stained', savedBreath: 'gathered my breath',
    dampenMomentum: 'wrote', readAhead: 'read',
  },
  ja: {
    magicVeil: '幕をまとった', storedResolve: '押し返した',
    overflowingHeart: '想いを渡した', drinkInk: 'インクを飲み戻した',
    stainedTomorrow: '染めた', savedBreath: '息をためた',
    dampenMomentum: '書いた', readAhead: '読んだ',
  },
  ru: {
    magicVeil: 'воздвиг завесу', storedResolve: 'оттеснил',
    overflowingHeart: 'передал сердце', drinkInk: 'выпил чернила обратно',
    stainedTomorrow: 'окрасил', savedBreath: 'сберёг дыхание',
    dampenMomentum: 'записал', readAhead: 'прочитал',
  },
  'zh-Hans': {
    magicVeil: '披上了光幕', storedResolve: '推了回去',
    overflowingHeart: '递出了心意', drinkInk: '饮回了墨水',
    stainedTomorrow: '染上了', savedBreath: '存下了气息',
    dampenMomentum: '写下了', readAhead: '读过了',
  },
  'zh-Hant': {
    magicVeil: '披上了光幕', storedResolve: '推了回去',
    overflowingHeart: '遞出了心意', drinkInk: '飲回了墨水',
    stainedTomorrow: '染上了', savedBreath: '存下了氣息',
    dampenMomentum: '寫下了', readAhead: '讀過了',
  },
}

const UPDATED_LORE_IDS = [
  'focusStrike', 'pourThree', 'doubleTap', 'magicVeil', 'overflowingHeart', 'drinkInk', 'stainedTomorrow',
  'dampenMomentum', 'kkuk', 'ipan', 'pogeunhage', 'bangeopge', 'gyeongkwaehage', 'geochilge',
] as const

const EXTRA_WORD_LORE: Record<ForeignLocale, Record<(typeof UPDATED_LORE_IDS)[number], string>> = {
  en: {
    focusStrike:'Anger drives every drop of Ink into one decisive point.', pourThree:'Poured-out tears wash the wound, and the overflow bursts against the enemy.', doubleTap:'A rough tap restarts the heart, and the excess beat strikes back at the enemy.', magicVeil:'A bright veil braces the body and pushes the enemy back with its force.', overflowingHeart:'Healing that cannot fit becomes damage and reaches the enemy.', drinkInk:'Drinking the Ink back turns overflowing life into a lively counterblow.', stainedTomorrow:'The stain reaches tomorrow’s line and draws life back.', dampenMomentum:'Writing the scattered feeling down restores its calm.', kkuk:'It blocks one painful hit and saves the remaining breath for the next sentence.', ipan:'Only a sentence paid with life gains these fierce extra hits.', pogeunhage:'Warmth steadies the guard and carries breath into the next sentence.', bangeopge:'A welcome story opens across three foes and opens the next choices too.', gyeongkwaehage:'A light rhythm restores both Ink and choices for a flowing chain.', geochilge:'A fierce rhythm repeats the verb and raises the attack stance.',
  },
  ja: {
    focusStrike:'怒りで全てのインクを一点へ叩き込む決め技。', pourThree:'こらえた涙で傷を洗い、あふれた思いを敵へ爆ぜさせる。', doubleTap:'止まりかけた心を叩き、あふれた鼓動を敵へ打ち返す。', magicVeil:'光の幕で身を固め、その力で敵を押し返す。', overflowingHeart:'収まりきらない回復をダメージに変えて敵へ渡す。', drinkInk:'インクを飲み戻し、あふれた命を楽しい反撃に変える。', stainedTomorrow:'明日の行まで染めた跡から命を取り戻す。', dampenMomentum:'乱れた気持ちを日記に書き、静かに整える。', kkuk:'痛い一撃を防ぎ、残った息を次の文へためる。', ipan:'体力をインクにした文だけに激しい追加打撃を乗せる。', pogeunhage:'温もりで守りながら、残った息を次の文へつなぐ。', bangeopge:'懐かしい物語を三体へ広げ、次の選択も開く。', gyeongkwaehage:'軽いリズムがインクと選択肢を戻し、連鎖を始める。', geochilge:'荒い勢いで動詞をもう一度繰り返し、攻撃態勢を上げる。',
  },
  ru: {
    focusStrike:'Гнев вбивает всю силу и чернила в одну решающую точку.', pourThree:'Пролитые слёзы смывают рану, а избыток чувств взрывается на враге.', doubleTap:'Толчок запускает сердце вновь, а лишний удар возвращается врагу.', magicVeil:'Светлая завеса укрепляет тело и своей силой отталкивает врага.', overflowingHeart:'Лишнее лечение превращается в урон и достигает врага.', drinkInk:'Возвращённые чернила превращают избыток жизни в весёлый ответный удар.', stainedTomorrow:'След на завтрашней строке возвращает часть жизни.', dampenMomentum:'Записанное в дневнике смятение снова становится спокойным.', kkuk:'Блокирует болезненный удар и бережёт дыхание для следующей фразы.', ipan:'Лишь фраза, оплаченная здоровьем, получает эти яростные удары.', pogeunhage:'Тепло укрепляет защиту и переносит дыхание в следующую фразу.', bangeopge:'Знакомая история раскрывается на трёх врагов и открывает новые варианты.', gyeongkwaehage:'Лёгкий ритм возвращает чернила и выбор для непрерывной цепочки.', geochilge:'Яростный ритм повторяет глагол и усиливает атакующую стойку.',
  },
  'zh-Hans': {
    focusStrike:'将愤怒与全部墨水压进一点的决胜一击。', pourThree:'倾泻泪水洗净伤口，让溢出的心绪在敌人身上爆发。', doubleTap:'敲醒将停的心，把溢出的心跳反击给敌人。', magicVeil:'披上明亮光幕，借它的力量推开敌人。', overflowingHeart:'把容不下的恢复化成伤害送向敌人。', drinkInk:'饮回墨水，把溢出的生命化为欢快反击。', stainedTomorrow:'从染到明日一行的墨痕中取回生命。', dampenMomentum:'把纷乱心绪写进日记，重新平静下来。', kkuk:'挡住痛苦一击，把剩余气息留到下一句。', ipan:'只有以生命支付墨水的句子才会获得猛烈追加攻击。', pogeunhage:'温暖稳住防御，也把余力带到下一句。', bangeopge:'把重逢的故事铺向三名敌人，也打开下一次选择。', gyeongkwaehage:'轻快节奏同时补回墨水与选择，开启连写。', geochilge:'猛烈节奏让动词再发动一次，并抬高攻击态势。',
  },
  'zh-Hant': {
    focusStrike:'將憤怒與全部墨水壓進一點的決勝一擊。', pourThree:'傾瀉淚水洗淨傷口，讓溢出的心緒在敵人身上爆發。', doubleTap:'敲醒將停的心，把溢出的心跳反擊給敵人。', magicVeil:'披上明亮光幕，借它的力量推開敵人。', overflowingHeart:'把容不下的恢復化成傷害送向敵人。', drinkInk:'飲回墨水，把溢出的生命化為歡快反擊。', stainedTomorrow:'從染到明日一行的墨痕中取回生命。', dampenMomentum:'把紛亂心緒寫進日記，重新平靜下來。', kkuk:'擋住痛苦一擊，把剩餘氣息留到下一句。', ipan:'只有以生命支付墨水的句子才會獲得猛烈追加攻擊。', pogeunhage:'溫暖穩住防禦，也把餘力帶到下一句。', bangeopge:'把重逢的故事鋪向三名敵人，也打開下一次選擇。', gyeongkwaehage:'輕快節奏同時補回墨水與選擇，開啟連寫。', geochilge:'猛烈節奏讓動詞再發動一次，並抬高攻擊態勢。',
  },
}

const REVISED_RANK_LORE: Record<ForeignLocale, Record<string, string>> = {
  en: {
    andohan:'A relieved breath becomes a veil that erases the next hit.', kkeutkkaji:'Resolve held to the final line raises the attack stance.', kkuk:'It blocks one painful hit and firmly raises the guard stance.', motdohage:'A feigned opening receives the impact, then raises the guard stance.', ipan:'Relentless momentum pierces guard and raises the attack stance.', pogeunhage:'Warmth settles into a firmer guard stance.', bangeopge:'A welcome story spreads across three foes with a bright decisive stroke.', aesseo:'Gritting through the strain raises the guard stance.', gyeongkwaehage:'A light rhythm saves Ink and moves before the enemy.',
  },
  ja: {
    andohan:'安堵の息が次の一撃を消す光の幕になる。', kkeutkkaji:'最後の一行まで残った意志が攻撃態勢を高める。', kkuk:'痛い一撃を防ぎ、防御態勢をしっかり高める。', motdohage:'隙を見せたふりで衝撃を受け、防御態勢を高める。', ipan:'止まらない勢いで防御を貫き、攻撃態勢を高める。', pogeunhage:'温もりが防御態勢をしっかり整える。', bangeopge:'懐かしい物語を三体へ明るい決め手として広げる。', aesseo:'歯を食いしばって耐え、防御態勢を高める。', gyeongkwaehage:'軽いリズムでインクを節約し、敵より先に動く。',
  },
  ru: {
    andohan:'Облегчённый вздох становится завесой, стирающей следующий удар.', kkeutkkaji:'Решимость дойти до последней строки повышает ранг атаки.', kkuk:'Блокирует болезненный удар и укрепляет ранг защиты.', motdohage:'Ложная слабость принимает удар и повышает ранг защиты.', ipan:'Неудержимый напор пробивает защиту и повышает ранг атаки.', pogeunhage:'Тепло укрепляет защитную стойку.', bangeopge:'Радостная история ярким решающим штрихом охватывает трёх врагов.', aesseo:'Упрямое сопротивление повышает ранг защиты.', gyeongkwaehage:'Лёгкий ритм экономит чернила и позволяет действовать первым.',
  },
  'zh-Hans': {
    andohan:'安心的呼吸化作抹去下一击的光幕。', kkeutkkaji:'坚持到最后一行的决心提高攻击阶级。', kkuk:'挡住痛苦一击，并稳稳提高防御阶级。', motdohage:'故意露出破绽承受冲击，同时提高防御阶级。', ipan:'一往无前的气势贯穿防御并提高攻击阶级。', pogeunhage:'温暖让防御架势更加稳固。', bangeopge:'把重逢的故事化作明亮决胜一笔，铺向三名敌人。', aesseo:'咬牙坚持，提高防御阶级。', gyeongkwaehage:'轻快节奏节省墨水，并抢先于敌人行动。',
  },
  'zh-Hant': {
    andohan:'安心的呼吸化作抹去下一擊的光幕。', kkeutkkaji:'堅持到最後一行的決心提高攻擊階級。', kkuk:'擋住痛苦一擊，並穩穩提高防禦階級。', motdohage:'故意露出破綻承受衝擊，同時提高防禦階級。', ipan:'一往無前的氣勢貫穿防禦並提高攻擊階級。', pogeunhage:'溫暖讓防禦架勢更加穩固。', bangeopge:'把重逢的故事化作明亮決勝一筆，鋪向三名敵人。', aesseo:'咬牙堅持，提高防禦階級。', gyeongkwaehage:'輕快節奏節省墨水，並搶先於敵人行動。',
  },
}

const COMBO_IDS = [...Array.from({ length: 31 }, (_, i) => `ec${i + 1}`), ...Array.from({ length: 6 }, (_, i) => `c${i + 1}`)]
const COMBO_NAMES: Record<ForeignLocale, string[]> = {
  en: ['Head-on Charge','Iron Wall','Together','Standing Alone','Today’s Resolve','Pain’s Price','Echo','Leave Yesterday Behind','A Careful Touch','One Step Through Grit','Unstoppable','Gritted Teeth','Drying Tears','Turn and Sway','Joyful Flame','Rise Again','Warm Embrace','In a Blink','Frenzied Blow','No Way Back','Bright Mending','Welcome Touch','Mending with a Smile','Angry Blow','Lonely Shield','Struggling Up','Dancing Attack','Lively Recovery','Shine and Spread','Joyful Barrage','Mischief Wave','Lone Warrior','Flame Frenzy','Perfect Silence','Rite of Forgetting','Mutual Ruin','Monsoon Rain'],
  ja: ['正面突破','鉄壁','一緒なら','ひとり立ち','今日の決意','傷の代価','こだま','昨日を忘れて','慎重な手当て','歯を食いしばる一歩','ためらいなく','歯を食いしばって','涙をぬぐって','くるりと回って','弾む炎','もう一度立つ','あたたかな手','あっという間','狂乱の一撃','退路なし','明るい修繕','うれしい手当て','笑顔で直す','怒りの一撃','寂しい盾','懸命に立つ','弾む攻撃','軽やかな回復','明るく広がれ','楽しい連打','いたずらの波','孤独な戦士','炎の狂乱','完全な静寂','忘却の儀式','共倒れ','梅雨の雨'],
  ru: ['Лобовая атака','Железная стена','Вместе','Стоять одному','Сегодняшняя клятва','Цена раны','Эхо','Оставить вчера позади','Осторожное прикосновение','Шаг сквозь боль','Без удержу','Стиснув зубы','Вытереть слёзы','Кружась','Весёлое пламя','Подняться снова','Тёплые руки','В мгновение ока','Безумный удар','Некуда отступать','Светлая починка','Желанная помощь','Исправить с улыбкой','Яростный удар','Одинокий щит','Подняться через силу','Ритмичная атака','Лёгкое исцеление','Сияние вширь','Весёлая очередь','Озорная волна','Одинокий воин','Огненное безумие','Полная тишина','Обряд забвения','Общая гибель','Сезонный ливень'],
  'zh-Hans': ['正面突破','铁壁','只要在一起','独自站立','今天的决心','伤痛的代价','回声','忘掉往事','小心的触碰','咬牙迈步','势不可挡','咬紧牙关','擦干眼泪','旋身躲闪','欢快火焰','重新站起','温暖的手','转瞬之间','狂乱一击','无路可退','明亮修补','欣喜之手','笑着修好','愤怒一击','孤独之盾','努力站起','跃动攻击','轻快恢复','明亮扩散','快乐连击','顽皮浪潮','孤独战士','烈焰狂乱','绝对寂静','忘却仪式','同归于尽','梅雨'],
  'zh-Hant': ['正面突破','鐵壁','只要在一起','獨自站立','今天的決心','傷痛的代價','回聲','忘掉往事','小心的觸碰','咬牙邁步','勢不可擋','咬緊牙關','擦乾眼淚','旋身躲閃','歡快火焰','重新站起','溫暖的手','轉瞬之間','狂亂一擊','無路可退','明亮修補','欣喜之手','笑著修好','憤怒一擊','孤獨之盾','努力站起','躍動攻擊','輕快恢復','明亮擴散','快樂連擊','頑皮浪潮','孤獨戰士','烈焰狂亂','絕對寂靜','忘卻儀式','同歸於盡','梅雨'],
}

const ITEM_IDS = ['ribbon','candle','emptyShell','lostMap','starLantern','oilLantern','oldCompass','gardenSpray','storyBrush','paperShield','stargazerScope','blueInkwell','yesterdayHourglass','forestRemedy','keepersSatchel','echoChime','tastyVerb','snowShoe','matchCloak','pinoDoubt','olymCarrot','goldenApple','beautyMirror','redMatch','pigBbq','beanSprout']
const ITEM_NAMES: Record<ForeignLocale, string[]> = {
  en: ["Father's Old Storybook","Boy's Pencil Stub",'Empty Seaside Shell',"Lost Traveler's Map",'Starlight Hand Lamp',"Night Watcher's Lantern",'Traveler’s Compass',"Gardener's Bug Spray",'Painter’s Black Brush',"Knight's Paper Shield",'Stargazer’s Telescope',"Writer's Blue Ink",'Yesterday’s Hourglass','Forest Remedy',"Keeper's Worn Satchel",'Patchwork Echo','Double-layer Sentence Cookie',"Snow White's Glass Slipper",'Match Seller’s Red Cloak',"Pinocchio's Question Mark",'Golden Carrot of Olympus',"Cinderella's Golden Apple",'Beauty’s Silver Mirror',"Red Hood's Ember",'Little Pig’s Charcoal Brazier',"Jack's Sky Sprout"],
  ja: ['父の古い物語本','少年のちびた鉛筆','浜辺の空の貝殻','迷い人の地図','星明かりの手提げ灯','夜番のランタン','旅人の方位磁針','庭師の虫よけ','画家の黒い筆','騎士の紙盾','星読みの望遠鏡','作家の青インク','昨日の砂時計','森の薬','記録係の古い鞄','つぎはぎのこだま','二重の文クッキー','白雪姫のガラスの靴','マッチ売りの赤いマント','ピノキオの疑問符','オリュンポスの黄金ニンジン','シンデレラの黄金リンゴ','美女の銀鏡','赤ずきんの火種','こぶたの炭火炉','ジャックの空豆'],
  ru: ['Старая книга отца','Огрызок карандаша мальчика','Пустая морская раковина','Карта заблудившегося','Звёздный фонарик','Фонарь ночного сторожа','Компас путешественника','Спрей садовника от жуков','Чёрная кисть художника','Бумажный щит рыцаря','Телескоп звездочёта','Синие чернила писателя','Вчерашние песочные часы','Лесное лекарство','Старая сумка летописца','Лоскутное эхо','Двойное печенье-фраза','Хрустальная туфелька Белоснежки','Красный плащ продавщицы спичек','Вопрос Пиноккио','Золотая морковь Олимпа','Золотое яблоко Золушки','Серебряное зеркало Красавицы','Уголёк Красной Шапочки','Угольная жаровня поросёнка','Небесный росток Джека'],
  'zh-Hans': ['父亲的旧故事书','少年的短铅笔','海边的空海螺','迷路者的地图','星光手提灯','守夜人的灯','旅行者的指南针','园丁的驱虫剂','画家的黑画笔','骑士的纸盾','观星者的望远镜','作家的蓝墨水','昨日沙漏','森林恢复药','记录者的旧背包','补丁的回声','双层句子饼干','白雪公主的玻璃鞋','卖火柴人的红斗篷','匹诺曹的问号','奥林匹斯的金胡萝卜','灰姑娘的金苹果','美女的银镜','小红帽的火种','小猪的炭火炉','杰克的天豆'],
  'zh-Hant': ['父親的舊故事書','少年的短鉛筆','海邊的空海螺','迷路者的地圖','星光手提燈','守夜人的燈','旅行者的指南針','園丁的驅蟲劑','畫家的黑畫筆','騎士的紙盾','觀星者的望遠鏡','作家的藍墨水','昨日沙漏','森林恢復藥','記錄者的舊背包','補丁的回聲','雙層句子餅乾','白雪公主的玻璃鞋','賣火柴人的紅斗篷','皮諾丘的問號','奧林匹斯的金胡蘿蔔','灰姑娘的金蘋果','美女的銀鏡','小紅帽的火種','小豬的炭火爐','傑克的天豆'],
}

const EXCLAIM_TEXT: Record<ForeignLocale, Record<string, string>> = {
  en: { wow:'Wow!',hmm:'Hmm?',oh:'Oh,',gasp:'Gasp!',huh:'Huh?',super:'so',kinda:'slightly',really:'truly',full:'brimming',firmly:'firmly',sharp:'sharp!',strong:'sturdy!',pretty:'beautiful!',hearty:'reassuring!',warm:'warm!' },
  ja: { wow:'わあ！',hmm:'うーん？',oh:'おお、',gasp:'はっ！',huh:'あれ？',super:'とても',kinda:'ちょっと',really:'本当に',full:'たっぷり',firmly:'しっかり',sharp:'鋭い！',strong:'丈夫だ！',pretty:'きれい！',hearty:'頼もしい！',warm:'あたたかい！' },
  ru: { wow:'Ух ты!',hmm:'Хм?',oh:'О,',gasp:'Ах!',huh:'Что?',super:'очень',kinda:'слегка',really:'по-настоящему',full:'сполна',firmly:'крепко',sharp:'остро!',strong:'прочно!',pretty:'красиво!',hearty:'надёжно!',warm:'тепло!' },
  'zh-Hans': { wow:'哇！',hmm:'嗯？',oh:'哦，',gasp:'啊！',huh:'咦？',super:'非常',kinda:'有点',really:'真的',full:'满满地',firmly:'牢牢地',sharp:'好锋利！',strong:'好结实！',pretty:'好漂亮！',hearty:'好可靠！',warm:'好温暖！' },
  'zh-Hant': { wow:'哇！',hmm:'嗯？',oh:'哦，',gasp:'啊！',huh:'咦？',super:'非常',kinda:'有點',really:'真的',full:'滿滿地',firmly:'牢牢地',sharp:'好鋒利！',strong:'好結實！',pretty:'好漂亮！',hearty:'好可靠！',warm:'好溫暖！' },
}

const LABELS: Record<ForeignLocale, { slots: string[]; rarities: string[]; emotions: string[] }> = {
  en: { slots:['Subject','Modifier','Object','Verb','Ending','Subject 2','Verb 2','Punctuation'], rarities:['Normal','Rare','Epic','Legendary'], emotions:['Joy','Anger','Sorrow','Delight','Neutral'] },
  ja: { slots:['主語','修飾','目的語','動詞','語尾','主語2','動詞2','句読点'], rarities:['ノーマル','レア','エピック','レジェンド'], emotions:['喜び','怒り','悲しみ','楽しさ','無感情'] },
  ru: { slots:['Подлежащее','Модификатор','Дополнение','Глагол','Окончание','Подлежащее 2','Глагол 2','Знак'], rarities:['Обычный','Редкий','Эпический','Легендарный'], emotions:['Радость','Гнев','Печаль','Веселье','Нейтрально'] },
  'zh-Hans': { slots:['主语','修饰语','宾语','动词','结尾','主语2','动词2','标点'], rarities:['普通','稀有','史诗','传说'], emotions:['喜悦','愤怒','悲伤','快乐','无情绪'] },
  'zh-Hant': { slots:['主語','修飾語','受詞','動詞','結尾','主語2','動詞2','標點'], rarities:['普通','稀有','史詩','傳說'], emotions:['喜悅','憤怒','悲傷','快樂','無情緒'] },
}

const ENEMY_NAMES: Record<ForeignLocale, Record<string, string>> = {
  en: { mantis:'Mantis',queenBee:'Queen Bee',elderSpider:'Elder Spider',termite:'Termite',moth:'Dust Bug',flea:'Clothes Moth',roach:'Roach',pillbug:'Pill Bug',mosquito:'Mosquito' },
  ja: { mantis:'カマキリ',queenBee:'女王蜂',elderSpider:'長老グモ',termite:'シロアリ',moth:'ホコリムシ',flea:'イガ',roach:'ゴキブリ',pillbug:'ダンゴムシ',mosquito:'蚊' },
  ru: { mantis:'Богомол',queenBee:'Пчелиная матка',elderSpider:'Старый паук',termite:'Термит',moth:'Пыльный жук',flea:'Моль',roach:'Таракан',pillbug:'Мокрица',mosquito:'Комар' },
  'zh-Hans': { mantis:'螳螂',queenBee:'蜂后',elderSpider:'长老蜘蛛',termite:'白蚁',moth:'尘虫',flea:'衣蛾',roach:'蟑螂',pillbug:'鼠妇',mosquito:'蚊子' },
  'zh-Hant': { mantis:'螳螂',queenBee:'蜂后',elderSpider:'長老蜘蛛',termite:'白蟻',moth:'塵蟲',flea:'衣蛾',roach:'蟑螂',pillbug:'鼠婦',mosquito:'蚊子' },
}

export function wordTextFor(locale: LocaleCode, word: Pick<Word, 'id' | 'text'>): string {
  return locale === 'ko' ? word.text : EXTRA_WORD_TEXT[locale][word.id] ?? WORD_TEXT[locale][word.id] ?? (word.id.startsWith('gr_') ? WORD_TEXT[locale].gr : undefined) ?? word.text
}

export function localizedWordText(word: Pick<Word, 'id' | 'text'>): string {
  return wordTextFor(currentLocale, word)
}

export function localizationCoverageErrors(): string[] {
  const errors: string[] = []
  const sourceWordIds = new Set([
    ...Object.values(EARLY_WORDS).flat(), ...ALL_REWARD_WORDS, ...Object.values(WORDS).flat(),
    ...PUNCT_WORDS, ...GROW_WORDS, ...BOSS_TACTIC_WORDS,
  ].map((word) => word.id))
  for (const locale of ['en','ja','ru','zh-Hans','zh-Hant'] as ForeignLocale[]) {
    for (const id of sourceWordIds) if (!EXTRA_WORD_TEXT[locale][id] && !WORD_TEXT[locale][id] && !(id.startsWith('gr_') && WORD_TEXT[locale].gr)) errors.push(`${locale}: word ${id} missing`)
    for (const id of UPDATED_LORE_IDS) if (!EXTRA_WORD_LORE[locale][id]) errors.push(`${locale}: lore ${id} missing`)
    for (const word of BOSS_TACTIC_WORDS) if (!BOSS_TACTIC_LORE[locale][word.id]) errors.push(`${locale}: boss tactic lore ${word.id} missing`)
    if (COMBO_NAMES[locale].length !== COMBO_IDS.length) errors.push(`${locale}: combo count mismatch`)
    if (ITEM_NAMES[locale].length !== ITEM_IDS.length) errors.push(`${locale}: item count mismatch`)
    for (const slot of EXCLAIM_SLOTS) for (const word of slot.words) {
      if (!EXCLAIM_TEXT[locale][word.id]) errors.push(`${locale}: exclaim ${word.id} missing`)
    }
  }
  return errors
}

export function applyContentLocalization(): void {
  if (currentLocale === 'ko') return
  const locale = currentLocale as ForeignLocale
  const texts = WORD_TEXT[locale]
  const allWords = [
    ...Object.values(EARLY_WORDS).flat(), ...ALL_REWARD_WORDS,
    ...Object.values(WORDS).flat(), ...PUNCT_WORDS, ...GROW_WORDS, ...BOSS_TACTIC_WORDS,
  ]
  for (const word of allWords) {
    const text = EXTRA_WORD_TEXT[locale][word.id] ?? texts[word.id] ?? (word.id.startsWith('gr_') ? texts.gr : undefined)
    if (text) word.text = text
    const lore = REVISED_RANK_LORE[locale][word.id]
      ?? EXTRA_WORD_LORE[locale][word.id as (typeof UPDATED_LORE_IDS)[number]]
      ?? BOSS_TACTIC_LORE[locale][word.id]
    if (lore) word.lore = lore
  }

  const comboNames = Object.fromEntries(COMBO_IDS.map((id, index) => [id, COMBO_NAMES[locale][index]]))
  for (const combo of [...EARLY_COMBOS, ...COMBOS]) if (comboNames[combo.id]) combo.name = comboNames[combo.id]

  ITEM_IDS.forEach((id, index) => { if (ALL_ITEMS[id]) ALL_ITEMS[id].name = ITEM_NAMES[locale][index] })
  for (const slot of EXCLAIM_SLOTS) for (const word of slot.words) word.text = EXCLAIM_TEXT[locale][word.id] ?? word.text

  const labels = LABELS[locale]
  ;['subj','adv','obj','verb','end','subj2','verb2','punct'].forEach((key, index) => { if (BASE_SLOTS[key]) BASE_SLOTS[key].label = labels.slots[index] })
  ;(['common','rare','epic','legendary'] as const).forEach((key, index) => { RARITY_LABEL[key] = labels.rarities[index] })
  ;(['joy','anger','sorrow','pleasure','neutral'] as const).forEach((key, index) => { EMOTION_LABEL[key] = labels.emotions[index] })

  for (const enemy of Object.values(ENEMIES)) enemy.name = ENEMY_NAMES[locale][enemy.id] ?? enemy.name
  const fieldText: Record<ForeignLocale, Array<[string,string,string]>> = {
    en: [['June 3, Tuesday','A Sunny Commotion','Sunny — a bright, reassuring beginning.'],['June 7, Saturday','A Rainy Afternoon','Rain — wet paper carries water and wide attacks farther.'],['June 12, Thursday','A Sleepless Night','Night — bugs grow bold, but flames shine brighter.']],
    ja: [['6月3日 火曜日','晴れの日の大騒ぎ','晴れ — 日差しが心強く、軽やかな始まり。'],['6月7日 土曜日','雨の午後','雨 — 湿った紙では水と範囲の言葉がよく広がる。'],['6月12日 木曜日','眠れない夜','夜 — 虫は大胆になるが、炎はもっと明るい。']],
    ru: [['Вторник, 3 июня','Солнечная суматоха','Солнце — свет придаёт уверенности.'],['Суббота, 7 июня','Дождливый день','Дождь — вода и широкие атаки лучше расходятся по влажной бумаге.'],['Четверг, 12 июня','Бессонная ночь','Ночь — жуки смелеют, но огонь светит ярче.']],
    'zh-Hans': [['6月3日 星期二','晴天的骚动','晴天——阳光让人安心，开局格外轻快。'],['6月7日 星期六','下雨的午后','雨——纸张潮湿，水与范围词语更容易扩散。'],['6月12日 星期四','难眠之夜','夜晚——虫子更加大胆，但火焰也更明亮。']],
    'zh-Hant': [['6月3日 星期二','晴天的騷動','晴天——陽光讓人安心，開局格外輕快。'],['6月7日 星期六','下雨的午後','雨——紙張潮濕，水與範圍詞語更容易擴散。'],['6月12日 星期四','難眠之夜','夜晚——蟲子更加大膽，但火焰也更明亮。']],
  }
  FIELDS.forEach((field, index) => { const row = fieldText[locale][index]; if (row) [field.date, field.title, field.desc] = row })
}
