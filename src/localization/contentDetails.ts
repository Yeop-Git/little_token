import { PROPER_NAMES, type LocaleCode } from './index'
import { CHARACTER_VISUALS } from '@data/characters'
import { ENEMIES } from '@data/enemies'
import { ALL_ITEMS, EXCLAIM_SLOTS, STAT_LABEL } from '@data/items'
import { PASSIVES, type PassiveId } from '@core/passives'
import { STAT_META } from '@core/player'
import { TACTICAL_CARD_GUIDES } from '@data/tacticalCards'

type ForeignLocale = Exclude<LocaleCode, 'ko'>
type TextPair = readonly [title: string, description: string]

const CHARACTER_TEXT: Record<ForeignLocale, Record<string, TextPair>> = {
  en: {
    player:['The boy who protects stories','Holding his rain-soaked diary close, he protects each story with the right sentence.'], token:['An anxious story guide','Token circles Prompt and signals frantically whenever a dangerous scribble appears.'],
    termite:['White teeth in the paper','It folds its clear wings and steadily gnaws through the fibers of old sentences.'], moth:['Dust sweeper between pages','Its dusty brush erases the edges of sentences piece by piece.'], flea:['A paper predator that strikes first','It flies in before the sentence is finished and tears at the scraps.'], roach:['A hard stain between sentences','Its thick shell endures attacks while it burrows deep into the diary.'], pillbug:['A shell that erases one hit','It curls up and lets the first blow roll away completely.'], mosquito:['A needle through the shield','Its long proboscis reaches the HP behind Guard.'], workerBee:['Escort of the queen’s sentence','The workers guard both sides of the Queen Bee and make her invulnerable until they fall.'], mantis:['The great scythe that trims sentences','After ordinary cuts, it raises its scythe to telegraph a heavy attack. Blocking it opens a long gap.'], queenBee:['Queen of the torn-paper hive','Sweet ink and wax turn every blank space into a honeycomb.'], elderSpider:['The old editor who stitches endings','An old diary and webbing bind the story to a false ending.'],
  },
  ja: {
    player:['物語を守る少年','雨に濡れた日記を抱き、正しい文で物語を守る。'], token:['心配性な物語の案内役','トークンはプロンプトのそばを飛び回り、危険な落書きに慌ただしく合図する。'],
    termite:['紙の中の白い歯','透明な羽をたたみ、古い文の繊維から少しずつかじる。'], moth:['本棚のほこり掃除屋','ほこりまみれの刷毛で文の端を少しずつ消す。'], flea:['先に飛び込む紙の捕食者','文が完成する前に飛来し、紙片を先に食いちぎる。'], roach:['文の間の固い染み','厚い殻で耐えながら日記の奥へ潜り込む。'], pillbug:['一撃を消す甲羅','体を丸めて最初の一撃を丸ごと受け流す。'], mosquito:['防御の隙間を刺す針','長い針で防御の奥の体力を直接削る。'], workerBee:['女王の文を守る護衛','女王蜂の両側を守り、全滅するまで本体を無敵にする。'], mantis:['文を裁つ大鎌','通常攻撃の後に大鎌を掲げて強攻撃を予告する。防げば大きな隙ができる。'], queenBee:['破れ紙の巣の女王','甘いインクと蜜蝋で空欄を蜂の巣に変える。'], elderSpider:['結末を縫う古い編集者','古い日記と蜘蛛の糸で物語を偽の結末へ縛る。'],
  },
  ru: {
    player:['Мальчик — хранитель историй','Прижимая промокший дневник, он защищает историю правильными фразами.'], token:['Тревожный проводник по истории','Токен кружит рядом с Промптом и подаёт сигналы при опасных каракулях.'],
    termite:['Белые зубы внутри бумаги','Сложив прозрачные крылья, он медленно грызёт волокна старых фраз.'], moth:['Пыльный уборщик книжных полок','Стирает края фраз пыльной щёткой, кусочек за кусочком.'], flea:['Бумажный хищник первого хода','Прилетает до завершения фразы и рвёт бумажные обрывки.'], roach:['Твёрдое пятно между фразами','Толстый панцирь помогает ему пробраться вглубь дневника.'], pillbug:['Панцирь, стирающий один удар','Сворачивается и полностью отводит первый удар.'], mosquito:['Игла сквозь щит','Длинный хоботок достаёт здоровье за Защитой.'], workerBee:['Охрана фразы королевы','Рабочие пчёлы делают матку неуязвимой, пока не будут побеждены.'], mantis:['Большая коса — редактор фраз','После обычных взмахов поднимает косу, предупреждая о мощном ударе. Успешная защита открывает уязвимость.'], queenBee:['Королева улья из рваной бумаги','Сладкие чернила и воск превращают пробелы в соты.'], elderSpider:['Старый редактор, сшивающий финалы','Старый дневник и паутина привязывают историю к ложному финалу.'],
  },
  'zh-Hans': {
    player:['守护故事的少年','怀抱被雨淋湿的日记，用正确的句子守护故事。'], token:['焦急的故事向导','词元盘旋在提示词身旁，发现危险涂鸦时慌忙发出信号。'],
    termite:['纸中的白色牙齿','收起透明翅膀，从旧句子的纤维开始慢慢啃食。'], moth:['书架间的灰尘清洁工','用沾满灰尘的刷子一点点擦掉句子边缘。'], flea:['抢先飞来的纸张捕食者','在句子写完前飞来，先撕咬纸屑。'], roach:['句子之间的坚硬污点','凭厚壳支撑，钻入日记深处。'], pillbug:['抹去一次攻击的甲壳','蜷起身体，完全化解第一次攻击。'], mosquito:['刺入护盾缝隙的针','用长针直接啃噬防御后的生命。'], workerBee:['守护蜂后句子的护卫','守在蜂后两侧，使本体保持无敌，全部击倒后蜂后会露出破绽。'], mantis:['裁剪句子的巨镰','普通挥砍后举起巨镰预告强攻；成功格挡会让它长时间露出破绽。'], queenBee:['破纸蜂巢的女王','用甜蜜墨水与蜂蜡把空白堵成蜂巢。'], elderSpider:['缝合结局的古老编辑','用旧日记与蛛网把故事强行绑在错误结局上。'],
  },
  'zh-Hant': {
    player:['守護故事的少年','懷抱被雨淋濕的日記，用正確的句子守護故事。'], token:['焦急的故事嚮導','詞元盤旋在提示詞身旁，發現危險塗鴉時慌忙發出信號。'],
    termite:['紙中的白色牙齒','收起透明翅膀，從舊句子的纖維開始慢慢啃食。'], moth:['書架間的灰塵清潔工','用沾滿灰塵的刷子一點點擦掉句子邊緣。'], flea:['搶先飛來的紙張捕食者','在句子寫完前飛來，先撕咬紙屑。'], roach:['句子之間的堅硬污點','憑厚殼支撐，鑽入日記深處。'], pillbug:['抹去一次攻擊的甲殼','蜷起身體，完全化解第一次攻擊。'], mosquito:['刺入護盾縫隙的針','用長針直接啃噬防禦後的生命。'], workerBee:['守護蜂后句子的護衛','守在蜂后兩側，使本體保持無敵，全部擊倒後蜂后會露出破綻。'], mantis:['裁剪句子的巨鐮','普通揮砍後舉起巨鐮預告強攻；成功格擋會讓它長時間露出破綻。'], queenBee:['破紙蜂巢的女王','用甜蜜墨水與蜂蠟把空白堵成蜂巢。'], elderSpider:['縫合結局的古老編輯','用舊日記與蛛網把故事強行綁在錯誤結局上。'],
  },
}

const ENEMY_NOTES: Record<ForeignLocale, Record<string, string>> = {
  en:{ inkDevourer:'A leader that devours whole pages, protected by Guard and a Magic Shield and weak to Delight.', mantis:'After one or two normal attacks it raises its scythe for a turn. Meet the shown Guard requirement to cancel the heavy attack, expose it, and skip its next attack.', queenBee:'Four workers escort the queen. Defeat them to remove her immunity, expose her, and skip her next action; she summons a new group after recovering.', elderSpider:'Its four legs reveal Joy, Anger, Sorrow, and Delight weaknesses in order. Webs pierce Guard and seal cards; matching the current weakness loosens a seal.', termite:'Slowly gnaws paper fibers without a special ability.', moth:'Erases sentence edges with a dusty brush.', flea:'Acts first before the sentence begins.', roach:'Its hard shell starts with Guard that absorbs damage.', pillbug:'One Magic Shield completely blocks the first hit.', mosquito:'Its needle damages HP without consuming Guard.' },
  ja:{ inkDevourer:'ページを丸ごと食うボス。防御とマジックシールドを持ち、楽しさに弱い。', mantis:'通常攻撃の後、大鎌を一ターン掲げる。表示された防御を満たすと強攻撃を中止し、隙を作って次の攻撃を飛ばす。', queenBee:'四匹の働き蜂が女王を守る。全滅させると無敵が解け、次の行動を飛ばす。回復後に新しい群れを呼ぶ。', elderSpider:'四本の脚が喜び・怒り・悲しみ・楽しさの弱点を順に見せる。蜘蛛の糸は防御を貫通してカードを封印し、現在の弱点で緩む。', termite:'特殊能力なしで紙の繊維を少しずつかじる。', moth:'ほこりの刷毛で文の端を消す。', flea:'文が始まる前に先攻する。', roach:'固い殻の防御が先にダメージを受ける。', pillbug:'マジックシールド一枚が最初の一撃を完全に防ぐ。', mosquito:'防御を消費せず体力へ直接ダメージを与える。' },
  ru:{ inkDevourer:'Пожирает целые страницы, защищён Защитой и Магическим щитом и слаб к Веселью.', mantis:'После обычных атак на ход поднимает косу. Наберите показанную Защиту, чтобы отменить мощный удар, открыть уязвимость и пропустить следующую атаку.', queenBee:'Четыре рабочие пчелы защищают матку. Победите их, чтобы снять неуязвимость и пропустить её следующую атаку; затем она призовёт новую группу.', elderSpider:'Четыре ноги по очереди открывают слабости к Радости, Гневу, Печали и Веселью. Паутина пробивает Защиту и запечатывает карты; текущая слабость снимает печать.', termite:'Медленно грызёт бумагу без особых способностей.', moth:'Стирает края фраз пыльной щёткой.', flea:'Действует первой до начала фразы.', roach:'Твёрдый панцирь начинает бой с Защитой.', pillbug:'Один Магический щит полностью блокирует первый удар.', mosquito:'Бьёт по здоровью, не расходуя Защиту.' },
  'zh-Hans':{ inkDevourer:'吞噬整页的首领，同时拥有防御与魔法盾，弱点是快乐。', mantis:'普通攻击后会举镰预告一回合。达到显示的防御需求即可取消强攻、令其露出破绽并跳过下一次攻击。', queenBee:'四只工蜂护卫蜂后。全部消灭后解除无敌、使其露出破绽并跳过下一行动；恢复后会再次召唤。', elderSpider:'四条腿依次显示喜悦、愤怒、悲伤、快乐弱点。蛛网贯通防御并封印卡牌，命中当前弱点可解除封印。', termite:'没有特殊能力，只会慢慢啃食纸纤维。', moth:'用灰尘刷子擦掉句子边缘。', flea:'在句子开始前先攻。', roach:'坚硬甲壳提供会优先承伤的防御。', pillbug:'一层魔法盾会完全抵挡第一次攻击。', mosquito:'不消耗防御，直接伤害生命。' },
  'zh-Hant':{ inkDevourer:'吞噬整頁的首領，同時擁有防禦與魔法盾，弱點是快樂。', mantis:'普通攻擊後會舉鐮預告一回合。達到顯示的防禦需求即可取消強攻、令其露出破綻並跳過下一次攻擊。', queenBee:'四隻工蜂護衛蜂后。全部消滅後解除無敵、使其露出破綻並跳過下一行動；恢復後會再次召喚。', elderSpider:'四條腿依次顯示喜悅、憤怒、悲傷、快樂弱點。蛛網貫通防禦並封印卡牌，命中目前弱點可解除封印。', termite:'沒有特殊能力，只會慢慢啃食紙纖維。', moth:'用灰塵刷子擦掉句子邊緣。', flea:'在句子開始前先攻。', roach:'堅硬甲殼提供會優先承傷的防禦。', pillbug:'一層魔法盾會完全抵擋第一次攻擊。', mosquito:'不消耗防禦，直接傷害生命。' },
}

const PASSIVE_TEXT: Record<ForeignLocale, Record<PassiveId, TextPair>> = {
  en:{ echo:['Echo','On critical success, the sentence activates once more'], punct:['Punctuation','Adds a punctuation slot to the end of the sentence'], twinVerb:['Twin Verb','Adds a second verb slot, allowing attack and healing together'], retry:['Retry','Rerolls once when critical success misses'], twinSubj:['Twin Subject','Adds a second subject slot and another multiplier contribution'], heavyShoe:['Heavy Shoe','Adds a flat bonus to verb base value'], matchFire:['Burning Multiplier','Adds an extra bonus to every multiplier slot'], luckCloak:['Wrapped in Luck','Every verb gains base value equal to Luck'], bbq:['Barbecue','Gain multiplier for each enemy defeated this battle'], doubt:['But?','Adds a doubtful ending and rolls an extra multiplier'], beanstalk:['Growing','Ghost Growing cards appear in every slot; choosing one raises Max HP'] },
  ja:{ echo:['こだま','大成功すると同じ文がもう一度発動する'], punct:['句読点','文末に句読点スロットを追加する'], twinVerb:['二重動詞','動詞スロットを二つにして攻撃と回復を同時に使える'], retry:['再挑戦','大成功しなければ一度だけ振り直す'], twinSubj:['二重主語','主語スロットを二つにして倍率を二度加える'], heavyShoe:['重い靴','動詞の基礎値に固定値を加える'], matchFire:['燃える倍率','倍率スロットごとに追加ボーナスを得る'], luckCloak:['運をまとう','すべての動詞が運と同じ基礎値を得る'], bbq:['バーベキュー','この戦闘で倒した敵ごとに倍率を得る'], doubt:['でも？','文末に疑いを付けて追加倍率を振る'], beanstalk:['すくすく','全スロットに成長カードが混ざり、選ぶと最大体力が上がる'] },
  ru:{ echo:['Эхо','При критическом успехе фраза срабатывает ещё раз'], punct:['Знак препинания','Добавляет знак препинания в конец фразы'], twinVerb:['Двойной глагол','Добавляет второй глагол для атаки и лечения одновременно'], retry:['Повтор','При неудаче критического успеха бросок повторяется один раз'], twinSubj:['Двойное подлежащее','Добавляет второе подлежащее и ещё один бонус множителя'], heavyShoe:['Тяжёлая туфля','Добавляет фиксированное значение к базе глагола'], matchFire:['Горящий множитель','Добавляет бонус каждому слоту множителя'], luckCloak:['Окутанный удачей','Каждый глагол получает базу, равную Удаче'], bbq:['Барбекю','Множитель растёт за каждого врага, побеждённого в этом бою'], doubt:['Но?','Добавляет сомнение в конец фразы и дополнительный множитель'], beanstalk:['Всё выше','Карты роста появляются во всех слотах и повышают макс. здоровье'] },
  'zh-Hans':{ echo:['回声','大成功时该句子再次发动'], punct:['标点','在句末增加标点槽位'], twinVerb:['双动词','增加第二个动词槽，可同时使用攻击与恢复'], retry:['重试','大成功未触发时重新判定一次'], twinSubj:['双主语','增加第二个主语槽并再次贡献倍率'], heavyShoe:['沉重鞋子','为动词基础值增加固定数值'], matchFire:['燃烧倍率','每个倍率槽获得额外加成'], luckCloak:['幸运缠身','所有动词获得等同幸运的基础值'], bbq:['烧烤','本场战斗每消灭一个敌人就提高倍率'], doubt:['但是？','在句末加入疑问并掷出额外倍率'], beanstalk:['茁壮成长','所有槽位混入成长卡；选择后提高最大生命'] },
  'zh-Hant':{ echo:['回聲','大成功時該句子再次發動'], punct:['標點','在句末增加標點槽位'], twinVerb:['雙動詞','增加第二個動詞槽，可同時使用攻擊與恢復'], retry:['重試','大成功未觸發時重新判定一次'], twinSubj:['雙主語','增加第二個主語槽並再次貢獻倍率'], heavyShoe:['沉重鞋子','為動詞基礎值增加固定數值'], matchFire:['燃燒倍率','每個倍率槽獲得額外加成'], luckCloak:['幸運纏身','所有動詞獲得等同幸運的基礎值'], bbq:['燒烤','本場戰鬥每消滅一個敵人就提高倍率'], doubt:['但是？','在句末加入疑問並擲出額外倍率'], beanstalk:['茁壯成長','所有槽位混入成長卡；選擇後提高最大生命'] },
}

const STAT_TEXT: Record<ForeignLocale, Array<TextPair>> = {
  en:[['HP','Increases maximum HP'],['Attack','Increases attack sentence damage'],['Guard','Increases temporary Guard'],['Heal','Increases healing'],['Luck','Raises the starting and minimum reward grade and improves gambles']],
  ja:[['体力','最大体力が上がる'],['攻撃','攻撃文のダメージが上がる'],['防御','一時防御が上がる'],['回復','回復量が上がる'],['運','報酬等級の開始値・最低値とギャンブル補正が上がる']],
  ru:[['Здоровье','Повышает максимальное здоровье'],['Атака','Повышает урон атакующих фраз'],['Защита','Повышает временную Защиту'],['Лечение','Повышает лечение'],['Удача','Повышает начальный и минимальный уровень награды и азартные эффекты']],
  'zh-Hans':[['生命','提高最大生命'],['攻击','提高攻击句子的伤害'],['防御','提高临时防御'],['恢复','提高恢复量'],['幸运','提高奖励等级初始值与最低值，并强化赌博效果']],
  'zh-Hant':[['生命','提高最大生命'],['攻擊','提高攻擊句子的傷害'],['防禦','提高臨時防禦'],['恢復','提高恢復量'],['幸運','提高獎勵等級初始值與最低值，並強化賭博效果']],
}

const TACTICAL_TEXT: Record<ForeignLocale, Array<TextPair>> = {
  en:[['Piercing verbs','Use piercing verbs against thick Guard to hit HP directly.'],['Multi-hit verbs','Magic Shields block whole hits; multi-hit verbs remove them quickly.'],['Counter Guard','Block the Mantis heavy cut with Counter Guard to expose it.'],['Area or focused Anger','Clear workers with area attacks, or target them one by one with a focused Anger attack for greater backlash.'],['Multi-hit and Pierce','Remove the Elder Spider’s Magic Shield with multi-hit, then bypass Guard with Pierce while matching the leg weakness.']],
  ja:[['貫通動詞','固い防御には貫通動詞で体力を直接狙う。'],['連打動詞','マジックシールドは一撃ずつ防ぐため、連打ですぐ剥がせる。'],['カウンター防御','カマキリの強攻撃をカウンター防御で止めると隙を作れる。'],['範囲・怒り集中','範囲で働き蜂を一掃するか、怒りの単体攻撃で一匹ずつ狙って反動を増やす。'],['連打・貫通動詞','長老グモの盾を連打で剥がし、防御を貫通しながら脚の弱点も合わせる。']],
  ru:[['Пробивающие глаголы','Пробивайте толстую Защиту, чтобы сразу бить по здоровью.'],['Серии ударов','Магический щит блокирует целые удары; серии быстро снимают его.'],['Контрзащита','Заблокируйте мощный удар Богомола Контрзащитой, чтобы открыть уязвимость.'],['Область или фокус Гнева','Убирайте рабочих атакой по области или бейте по одному фокусированной атакой Гнева ради усиленной отдачи.'],['Серии и пробитие','Снимите щит Старого паука сериями, затем пробейте Защиту и совпадите со слабостью ноги.']],
  'zh-Hans':[['贯通动词','面对坚固防御时，用贯通动词直接攻击生命。'],['连击动词','魔法盾会抵挡整次攻击；用连击快速剥除。'],['反击防御','以反击防御挡住螳螂强攻即可令其露出破绽。'],['范围或愤怒集中','用范围攻击清理工蜂，或以愤怒单体攻击逐只击破并提高反动伤害。'],['连击与贯通','先用连击剥除长老蜘蛛的魔法盾，再以贯通绕过防御并匹配腿部弱点。']],
  'zh-Hant':[['貫通動詞','面對堅固防禦時，用貫通動詞直接攻擊生命。'],['連擊動詞','魔法盾會抵擋整次攻擊；用連擊快速剝除。'],['反擊防禦','以反擊防禦擋住螳螂強攻即可令其露出破綻。'],['範圍或憤怒集中','用範圍攻擊清理工蜂，或以憤怒單體攻擊逐隻擊破並提高反動傷害。'],['連擊與貫通','先用連擊剝除長老蜘蛛的魔法盾，再以貫通繞過防禦並匹配腿部弱點。']],
}

const GENERIC_ITEM_FLAVOR: Record<ForeignLocale, string> = {
  en:'A treasured prop that carries a fragment of the story.', ja:'物語のかけらを宿す大切な小道具。', ru:'Дорогой реквизит, хранящий частицу истории.', 'zh-Hans':'承载着一片故事的珍贵道具。', 'zh-Hant':'承載著一片故事的珍貴道具。',
}

export function applyDetailedContentLocalization(locale: ForeignLocale): void {
  for (const [id, visual] of Object.entries(CHARACTER_VISUALS)) {
    const text = CHARACTER_TEXT[locale][id]
    if (text) [visual.title, visual.description] = text
    const enemyName = ENEMIES[id]?.name
    if (enemyName) visual.name = enemyName
  }
  CHARACTER_VISUALS.player.name = PROPER_NAMES[locale].player
  CHARACTER_VISUALS.token.name = PROPER_NAMES[locale].token

  for (const [id, enemy] of Object.entries(ENEMIES)) {
    enemy.note = ENEMY_NOTES[locale][id] ?? enemy.note
  }
  const attackText: Record<ForeignLocale, Array<[string,string,string]>> = {
    en:[['Ordinary scythe cut','Heavy-attack stance','Great scythe slam']], ja:[['普通の鎌斬り','強攻撃の構え','大鎌振り下ろし']], ru:[['Обычный взмах косы','Стойка мощной атаки','Удар большой косой']], 'zh-Hans':[['普通镰刀斩','强攻姿态','巨镰下劈']], 'zh-Hant':[['普通鐮刀斬','強攻姿態','巨鐮下劈']],
  }
  ENEMIES.mantis.attackPattern?.forEach((step, index) => { step.name = attackText[locale][0][index] })
  if (ENEMIES.mantis.attackPattern?.[1]) ENEMIES.mantis.attackPattern[1].telegraphText = locale === 'en' ? 'Raises the great scythe to prepare the next attack!' : locale === 'ja' ? '大鎌を高く掲げて次の攻撃を準備する！' : locale === 'ru' ? 'Поднимает большую косу и готовит следующую атаку!' : locale === 'zh-Hans' ? '高举巨镰，准备下一次攻击！' : '高舉巨鐮，準備下一次攻擊！'
  if (ENEMIES.queenBee.summonPattern) ENEMIES.queenBee.summonPattern.name = CHARACTER_VISUALS.workerBee.name
  const partNames: Record<ForeignLocale, string[]> = { en:['First leg','Second leg','Third leg','Fourth leg','Body'], ja:['一番目の脚','二番目の脚','三番目の脚','四番目の脚','本体'], ru:['Первая нога','Вторая нога','Третья нога','Четвёртая нога','Тело'], 'zh-Hans':['第一条腿','第二条腿','第三条腿','第四条腿','本体'], 'zh-Hant':['第一條腿','第二條腿','第三條腿','第四條腿','本體'] }
  ENEMIES.elderSpider.parts?.forEach((part, index) => {
    part.name = partNames[locale][index]
    if (part.weakness?.value && part.weakness.value in ({ joy:1, anger:1, sorrow:1, pleasure:1 })) {
      part.weakness.label = locale === 'en' ? ({joy:'Joy',anger:'Anger',sorrow:'Sorrow',pleasure:'Delight'} as Record<string,string>)[part.weakness.value] : locale === 'ja' ? ({joy:'喜び',anger:'怒り',sorrow:'悲しみ',pleasure:'楽しさ'} as Record<string,string>)[part.weakness.value] : locale === 'ru' ? ({joy:'Радость',anger:'Гнев',sorrow:'Печаль',pleasure:'Веселье'} as Record<string,string>)[part.weakness.value] : locale === 'zh-Hans' ? ({joy:'喜悦',anger:'愤怒',sorrow:'悲伤',pleasure:'快乐'} as Record<string,string>)[part.weakness.value] : ({joy:'喜悅',anger:'憤怒',sorrow:'悲傷',pleasure:'快樂'} as Record<string,string>)[part.weakness.value]
    }
  })
  for (const [id, passive] of Object.entries(PASSIVES) as Array<[PassiveId, typeof PASSIVES[PassiveId]]>) {
    const text = PASSIVE_TEXT[locale][id]
    ;[passive.name, passive.desc] = text
  }
  STAT_META.forEach((meta, index) => { [meta.label, meta.desc] = STAT_TEXT[locale][index] })
  const statKeys = ['hp','atk','guard','heal','luck'] as const
  statKeys.forEach((key, index) => { STAT_LABEL[key] = STAT_TEXT[locale][index][0] })
  const exclaimSlotLabels: Record<ForeignLocale, string[]> = {
    en: ['Exclamation', 'Intensity', 'Evaluation'],
    ja: ['感嘆', '程度', '評価'],
    ru: ['Восклицание', 'Степень', 'Оценка'],
    'zh-Hans': ['感叹', '程度', '评价'],
    'zh-Hant': ['感嘆', '程度', '評價'],
  }
  EXCLAIM_SLOTS.forEach((slot, index) => { slot.label = exclaimSlotLabels[locale][index] })
  for (const slot of EXCLAIM_SLOTS) for (const word of slot.words) {
    const [key, value] = Object.entries(word.mods)[0]
    word.note = `${STAT_LABEL[key as keyof typeof STAT_LABEL]} +${value}`
  }
  TACTICAL_CARD_GUIDES.forEach((guide, index) => { [guide.title, guide.tooltip] = TACTICAL_TEXT[locale][index] })
  for (const item of Object.values(ALL_ITEMS)) item.flavor = GENERIC_ITEM_FLAVOR[locale]
}
