import { currentLocale, type LocaleCode } from './index'

export type TokenTone = 'calm' | 'warn' | 'relief'
export interface TokenLine { text: string; tone: TokenTone }

const KOREAN = {
  idleConcern: '어떡하지...! 도와줘, 프롬!!',
  idleHuge: '프롬, 저 녀석 너무 커...!',
  idleStand: '으으... 그래도 물러나면 안 돼!',
  idleIncoming: '조심해! 뭔가 오고 있어!',
  coachSubject: '먼저, 누가 행동할지 골라 봐!',
  coachModifier: '좋아! 이제 앞 단어를 꾸며 줄 말을 붙여 봐.',
  coachVerb: '마지막 동사가 때릴지, 막을지, 회복할지를 정해!',
  coachResonance: '같은 감정이 모여 공명하고 있어!',
  coachContext: '단어가 멋지게 맞물렸어! 좋은 맥락이야!',
  coachInkLow: '잉크가 얼마 안 남았어. 다음 카드의 파란 숫자를 봐!',
  coachInkOverdraw: '여백 밖까지 쓸 수는 있지만, 넘친 만큼 네가 지치게 돼!',
  coachEnemyFirst: '저 벌레가 먼저 움직이려 해! 방어 문장도 생각해 봐!',
  coachOverflow: '남은 힘이 앞의 벌레를 넘어 다음 녀석까지 이어졌어!',
  mantisStart: '기본공격 뒤에 큰낫을 들어! 그때 방어로 막자 — 슬픔이 약점이야!!',
  mantisTelegraph: '큰낫이 올라갔어! 다음 문장은 방어야! 표시된 수치만큼 반드시 방어해!!',
  mantisGroggy: '실드는 깨졌지만 강공격은 취소야! 사마귀가 그로기에 빠져서 다음 공격을 한 턴 걸러!!',
  mantisPunished: '못 막았어...! 다음에 큰낫을 들면 그땐 꼭 방어야!!',
  queenBeeStart: '여왕벌 본체는 지금 공격이 안 통해! 먼저 앞을 막은 일벌부터 쓰러뜨리자!!',
  queenBeeDispersed: '좋아, 프롬! 일벌이 쓰러졌어!!',
  elderSpiderMiss: '약점이 아니면 그 다리에서 막혀! 지금 약점을 노려 봐!!',
  elderSpiderWebReady: '거미줄이 다 조여들었어! 이번엔 꼭 약점을 노리자!!',
  elderSpiderWebCut: '맞았어, 프롬! 거미줄이 느슨해지고 있어!!',
  spiderNextWeakness: '다리가 떨어졌어! 이번엔 「{weakness}」 감정이 약점이야!!',
  spiderBody: '다리를 전부 끊었어! 이제 본체야 — 약점은 없어, 힘껏 밀어붙이자!!',
  spiderOpeningWeak: '첫 공격은 마력실드가 막아! 연타로 벗긴 뒤 「{weakness}」 감정으로 첫째 다리를 노려 — 거미줄은 방패도 넘어 와!!',
  spiderOpeningGeneric: '거미줄은 방패를 넘어 와! 지금 드러난 약점을 노려야 뚫려!!',
  spiderShieldBroken: '마력실드가 깨졌어! 이제 「{weakness}」 감정으로 현재 다리를 노려!!',
  queenOpportunity: '지금이 빈틈이에요!!',
  // 회상 — 지난 런의 사실만 말한다. 없는 일을 지어내지 않는다.
  recallDefeatBy: '지난번엔 {day}층에서 {cause}한테 멈췄어. 이번엔 더 멀리 가자!',
  recallDefeatPlain: '지난번엔 {day}층까지였지. 오늘은 그 너머를 보고 싶어.',
  recallClear: '지난번엔 {day}층까지 끝까지 썼잖아. 나 그거 계속 생각하고 있었어.',
  recallFirst: '우리 처음이지? 나는 프롬 곁에 있을게. 어디에 있을지는 내가 알아서 정할게.',
  // 성향 관찰 — 세어 둔 숫자에서 나오는 말이라 단정해도 된다.
  styleStriker: '너는 때리는 쪽이 편하구나. 알겠어, 앞은 내가 볼게.',
  styleKeeper: '너는 먼저 막고 보는구나. 그 신중함이 우리를 여기까지 데려왔어.',
  styleMender: '너는 자꾸 스스로를 돌보는구나. 좋아, 그게 제일 어려운 건데.',
  styleEmotion: '너는 「{emotion}」을 자주 고르네. 그 감정이 너한테 잘 맞나 봐.',
  styleBold: '여백 밖까지 밀어붙이는 거, 무섭지 않아? ...멋있긴 해.',
  styleCombo: '맥락을 이렇게 자주 맞추는 사람은 처음 봐.',
} as const

export type BossTokenLineKey = keyof typeof KOREAN
type ForeignLocale = Exclude<LocaleCode, 'ko'>

const FOREIGN: Record<ForeignLocale, Record<BossTokenLineKey, string>> = {
  en: {
    idleConcern: 'What do we do...?! Help, Prompt!!', idleHuge: 'Prompt, that thing is huge...!', idleStand: "Nngh... We still can't back down!", idleIncoming: "Careful! Something's coming!",
    coachSubject: 'First, choose who will act!', coachModifier: 'Good! Now add a word that describes the one before it.', coachVerb: 'The final verb decides whether you attack, guard, or heal!', coachResonance: 'Matching emotions are resonating!', coachContext: 'Those words fit beautifully! That is strong Context!', coachInkLow: 'We are running low on Ink. Check the blue number on the next card!', coachInkOverdraw: 'You can write past the margin, but the excess will tire you out!', coachEnemyFirst: 'That bug is about to move first! Consider a Guard sentence!', coachOverflow: 'The remaining force carried past the first bug into the next one!',
    mantisStart: 'It raises its great scythe after a normal attack! Block it then — Sorrow is its weakness!!', mantisTelegraph: 'The great scythe is raised! Your next sentence must Guard! Reach the displayed Guard value!!', mantisGroggy: 'The shield broke, but the heavy attack was canceled! The mantis is exposed and will skip its next attack!!', mantisPunished: "We couldn't block it...! Next time it raises that scythe, we have to Guard!!",
    queenBeeStart: "Our attacks can't hurt the queen yet! Let's defeat the workers blocking the way first!!", queenBeeDispersed: 'Great, Prompt! A worker is down!!',
    elderSpiderMiss: 'Anything but the weakness stops at that leg! Aim for the weakness now!!', elderSpiderWebReady: "The webs are fully tightened! We have to hit the weakness this time!!", elderSpiderWebCut: 'That worked, Prompt! The webs are loosening!!',
    spiderNextWeakness: 'That leg is down! This time, {weakness} is the weakness!!', spiderBody: "All the legs are severed! Now for the body — no weakness, so give it everything!!", spiderOpeningWeak: 'The Magic Shield blocks the first hit! Strip it with multiple hits, then target the first leg with {weakness} — the webs pierce Guard too!!', spiderOpeningGeneric: 'The webs pierce Guard! You need to hit the exposed weakness to break through!!', spiderShieldBroken: 'The Magic Shield is broken! Now target this leg with {weakness}!!',
    queenOpportunity: 'Now is our chance!!',
    recallDefeatBy: 'Last time we stopped at floor {day}, against {cause}. Let us go further today!', recallDefeatPlain: 'Last time we only reached floor {day}. Today I want to see past it.', recallClear: 'Last time you wrote it all the way to floor {day}. I have been thinking about that ever since.', recallFirst: 'This is our first time, right? I will stay near you. Where exactly — leave that to me.',
    styleStriker: 'You are more comfortable striking. Understood — I will watch the front.', styleKeeper: 'You guard before anything else. That care is what carried us this far.', styleMender: 'You keep tending to yourself. Good — that is the hardest part.', styleEmotion: 'You often choose {emotion}. That feeling must suit you.', styleBold: 'Writing past the margin — does that not scare you? ...It does look brave.', styleCombo: 'I have never met anyone who lands the Context this often.',
  },
  ja: {
    idleConcern: 'どうしよう…！助けて、プロンプト！！', idleHuge: 'プロンプト、あいつ大きすぎるよ…！', idleStand: 'うう…それでも退いちゃだめだ！', idleIncoming: '気をつけて！何か来るよ！',
    coachSubject: 'まず、誰が動くのか選んで！', coachModifier: 'いいね！次は前の言葉を飾る言葉をつけよう。', coachVerb: '最後の動詞が、攻撃・防御・回復を決めるよ！', coachResonance: '同じ感情が集まって共鳴してる！', coachContext: '言葉がきれいにかみ合った！いい文脈だよ！', coachInkLow: 'インクが残り少ないよ。次のカードの青い数字を見て！', coachInkOverdraw: '余白を越えて書けるけど、超えた分だけ君が疲れるよ！', coachEnemyFirst: 'あの虫が先に動くよ！防御の文も考えて！', coachOverflow: '余った力が前の虫を越えて、次の虫まで届いたよ！',
    mantisStart: '通常攻撃のあとに大鎌を構えるよ！その時に防御で止めよう――弱点は悲しみだ！！', mantisTelegraph: '大鎌を構えた！次の文は防御だよ！表示された数値まで必ず防御して！！', mantisGroggy: 'シールドは壊れたけど強攻撃は中止！カマキリはグロッキーで次の攻撃を一回休むよ！！', mantisPunished: '防げなかった…！次に大鎌を構えたら、今度こそ防御だよ！！',
    queenBeeStart: '今は女王蜂の本体に攻撃が通らない！先に前をふさぐ働き蜂を倒そう！！', queenBeeDispersed: 'いいぞ、プロンプト！働き蜂を倒したよ！！',
    elderSpiderMiss: '弱点じゃないとその脚で止まるよ！今の弱点を狙って！！', elderSpiderWebReady: '蜘蛛の糸が締まりきった！今度こそ弱点を狙おう！！', elderSpiderWebCut: '当たったよ、プロンプト！蜘蛛の糸が緩んでる！！',
    spiderNextWeakness: '脚を落とした！今度は「{weakness}」の感情が弱点だ！！', spiderBody: '脚を全部切った！次は本体だ――弱点はない、全力で押し切ろう！！', spiderOpeningWeak: '最初の攻撃はマジックシールドが防ぐよ！連撃で剥がしてから「{weakness}」の感情で最初の脚を狙って――蜘蛛の糸は防御も貫通する！！', spiderOpeningGeneric: '蜘蛛の糸は防御を貫通する！今見えている弱点を狙わないと突破できないよ！！', spiderShieldBroken: 'マジックシールドが壊れた！今度は「{weakness}」の感情で今の脚を狙って！！',
    queenOpportunity: '今がチャンスだよ！！',
    recallDefeatBy: 'この前は{day}階で、{cause}に止められたね。今日はもっと先へ行こう！', recallDefeatPlain: 'この前は{day}階までだった。今日はその先が見たい。', recallClear: 'この前は{day}階まで最後まで書き切ったよね。ずっとそのことを考えてた。', recallFirst: '初めてだよね？ わたしはそばにいる。どこにいるかは自分で決めるけど。',
    styleStriker: '君は叩くほうが性に合ってるね。わかった、前はわたしが見る。', styleKeeper: '君はまず守るんだね。その慎重さがここまで連れてきた。', styleMender: '君はいつも自分を手当てする。いいよ、それが一番難しいのに。', styleEmotion: '君は「{emotion}」をよく選ぶね。その感情が合ってるのかも。', styleBold: '余白の外まで書くの、怖くない？ ……かっこいいけど。', styleCombo: 'こんなに何度も文脈を噛み合わせる人、初めて見た。',
  },
  ru: {
    idleConcern: 'Что же делать…?! Помоги, Промпт!!', idleHuge: 'Промпт, эта штука огромная…!', idleStand: 'Ух… Но отступать нельзя!', idleIncoming: 'Осторожно! Что-то приближается!',
    coachSubject: 'Сначала выбери, кто будет действовать!', coachModifier: 'Хорошо! Теперь добавь слово, которое уточнит предыдущее.', coachVerb: 'Последний глагол решает: атака, защита или лечение!', coachResonance: 'Одинаковые эмоции вошли в резонанс!', coachContext: 'Слова отлично соединились! Это сильный контекст!', coachInkLow: 'Чернил почти не осталось. Смотри на синее число следующей карты!', coachInkOverdraw: 'Можно писать за полями, но излишек утомит тебя!', coachEnemyFirst: 'Этот жук ходит первым! Подумай о защитной фразе!', coachOverflow: 'Оставшаяся сила прошла сквозь первого жука и достигла следующего!',
    mantisStart: 'После обычной атаки он поднимает большую косу! Тогда блокируй — его слабость Печаль!!', mantisTelegraph: 'Большая коса поднята! Следующая фраза — Защита! Набери указанное значение Защиты!!', mantisGroggy: 'Щит сломан, но мощная атака отменена! Богомол уязвим и пропустит следующую атаку!!', mantisPunished: 'Не удалось заблокировать…! Когда он снова поднимет косу, обязательно защищайся!!',
    queenBeeStart: 'Сейчас атаки не вредят самой королеве! Сначала победим рабочих, которые закрывают путь!!', queenBeeDispersed: 'Отлично, Промпт! Рабочая пчела повержена!!',
    elderSpiderMiss: 'Без попадания в слабость удар остановится на этой ноге! Целься в слабость!!', elderSpiderWebReady: 'Паутина затянулась до конца! Теперь обязательно попади в слабость!!', elderSpiderWebCut: 'Получилось, Промпт! Паутина ослабевает!!',
    spiderNextWeakness: 'Нога отсечена! Теперь слабость — {weakness}!!', spiderBody: 'Все ноги отсечены! Теперь тело — слабостей нет, бей изо всех сил!!', spiderOpeningWeak: 'Первый удар остановит Магический щит! Сбей его серией ударов, затем целься в первую ногу эмоцией «{weakness}» — паутина пробивает Защиту!!', spiderOpeningGeneric: 'Паутина пробивает Защиту! Чтобы прорваться, бей по открытой слабости!!', spiderShieldBroken: 'Магический щит сломан! Теперь целься в эту ногу эмоцией «{weakness}»!!',
    queenOpportunity: 'Сейчас наш шанс!!',
    recallDefeatBy: 'В прошлый раз мы остановились на этаже {day}, перед {cause}. Сегодня пойдём дальше!', recallDefeatPlain: 'В прошлый раз мы дошли только до этажа {day}. Сегодня хочу увидеть, что дальше.', recallClear: 'В прошлый раз ты дописал всё до этажа {day}. Я с тех пор об этом думаю.', recallFirst: 'Это наш первый раз, да? Я буду рядом. А где именно — решу сама.',
    styleStriker: 'Тебе привычнее бить. Понятно — я присмотрю за фронтом.', styleKeeper: 'Ты сначала защищаешься. Эта осторожность и довела нас сюда.', styleMender: 'Ты постоянно заботишься о себе. Хорошо — это и есть самое трудное.', styleEmotion: 'Ты часто выбираешь {emotion}. Похоже, это чувство тебе подходит.', styleBold: 'Писать за поля — тебе не страшно? ...Но выглядит смело.', styleCombo: 'Я ещё не встречала того, кто так часто попадает в Контекст.',
  },
  'zh-Hans': {
    idleConcern: '怎么办……！帮帮我，提示词！！', idleHuge: '提示词，那家伙也太大了……！', idleStand: '呜……但我们不能后退！', idleIncoming: '小心！有什么要来了！',
    coachSubject: '先选出是谁要行动吧！', coachModifier: '很好！接着加上修饰前一个词的词语。', coachVerb: '最后的动词决定攻击、防御还是治疗！', coachResonance: '相同的情感正在产生共鸣！', coachContext: '词语漂亮地衔接起来了！这是很棒的语境！', coachInkLow: '墨水不多了，看看下一张卡的蓝色数字！', coachInkOverdraw: '可以写到页边之外，但超出的部分会让你疲惫！', coachEnemyFirst: '那只虫子要先行动！也考虑一下防御句吧！', coachOverflow: '剩余的力量越过前面的虫子，打到了下一只！',
    mantisStart: '普通攻击后它会举起巨镰！那时用防御挡住——悲伤是它的弱点！！', mantisTelegraph: '巨镰举起来了！下一句必须防御！一定要达到标出的防御值！！', mantisGroggy: '护盾虽然破了，但强攻也取消了！螳螂陷入破绽，下次攻击会跳过一回合！！', mantisPunished: '没挡住……！下次它举起巨镰时一定要防御！！',
    queenBeeStart: '现在攻击伤不到蜂后本体！先打倒挡在前面的工蜂吧！！', queenBeeDispersed: '太好了，提示词！工蜂倒下了！！',
    elderSpiderMiss: '没击中弱点就会停在那条腿！快瞄准当前弱点！！', elderSpiderWebReady: '蛛网已经完全收紧了！这次一定要击中弱点！！', elderSpiderWebCut: '打中了，提示词！蛛网正在松开！！',
    spiderNextWeakness: '那条腿断了！这次「{weakness}」情感是弱点！！', spiderBody: '所有腿都斩断了！接下来是本体——没有弱点，全力进攻吧！！', spiderOpeningWeak: '第一次攻击会被魔法盾挡住！先用连击剥掉盾，再用「{weakness}」情感攻击第一条腿——蛛网还能贯穿防御！！', spiderOpeningGeneric: '蛛网会贯穿防御！必须击中当前暴露的弱点才能突破！！', spiderShieldBroken: '魔法盾破了！现在用「{weakness}」情感攻击当前这条腿！！',
    queenOpportunity: '现在就是机会！！',
    recallDefeatBy: '上次我们停在第{day}层，被{cause}挡住了。这次走得更远吧！', recallDefeatPlain: '上次只走到第{day}层。今天我想看看更远的地方。', recallClear: '上次你一路写到了第{day}层。我一直在想那件事。', recallFirst: '我们是第一次吧？我会待在你身边。至于待在哪儿，让我自己决定。',
    styleStriker: '你更习惯出手打。明白了，前面交给我看着。', styleKeeper: '你总是先防守。正是这份谨慎把我们带到这里。', styleMender: '你总在照顾自己。很好——那才是最难的。', styleEmotion: '你经常选「{emotion}」。这份感情大概很适合你。', styleBold: '写到页边之外，你不怕吗？……不过确实帅气。', styleCombo: '我还没见过这么频繁凑齐语境的人。',
  },
  'zh-Hant': {
    idleConcern: '怎麼辦……！幫幫我，提示詞！！', idleHuge: '提示詞，那傢伙也太大了……！', idleStand: '嗚……但我們不能後退！', idleIncoming: '小心！有什麼要來了！',
    coachSubject: '先選出是誰要行動吧！', coachModifier: '很好！接著加上修飾前一個詞的詞語。', coachVerb: '最後的動詞決定攻擊、防禦還是治療！', coachResonance: '相同的情感正在產生共鳴！', coachContext: '詞語漂亮地銜接起來了！這是很棒的語境！', coachInkLow: '墨水不多了，看看下一張卡的藍色數字！', coachInkOverdraw: '可以寫到頁邊之外，但超出的部分會讓你疲憊！', coachEnemyFirst: '那隻蟲子要先行動！也考慮一下防禦句吧！', coachOverflow: '剩餘的力量越過前面的蟲子，打到了下一隻！',
    mantisStart: '普通攻擊後牠會舉起巨鐮！那時用防禦擋住——悲傷是牠的弱點！！', mantisTelegraph: '巨鐮舉起來了！下一句必須防禦！一定要達到標出的防禦值！！', mantisGroggy: '護盾雖然破了，但強攻也取消了！螳螂露出破綻，下次攻擊會跳過一回合！！', mantisPunished: '沒擋住……！下次牠舉起巨鐮時一定要防禦！！',
    queenBeeStart: '現在攻擊傷不到蜂后本體！先打倒擋在前面的工蜂吧！！', queenBeeDispersed: '太好了，提示詞！工蜂倒下了！！',
    elderSpiderMiss: '沒擊中弱點就會停在那條腿！快瞄準目前弱點！！', elderSpiderWebReady: '蛛網已經完全收緊了！這次一定要擊中弱點！！', elderSpiderWebCut: '打中了，提示詞！蛛網正在鬆開！！',
    spiderNextWeakness: '那條腿斷了！這次「{weakness}」情感是弱點！！', spiderBody: '所有腿都斬斷了！接下來是本體——沒有弱點，全力進攻吧！！', spiderOpeningWeak: '第一次攻擊會被魔法盾擋住！先用連擊剝掉盾，再用「{weakness}」情感攻擊第一條腿——蛛網還能貫穿防禦！！', spiderOpeningGeneric: '蛛網會貫穿防禦！必須擊中目前暴露的弱點才能突破！！', spiderShieldBroken: '魔法盾破了！現在用「{weakness}」情感攻擊目前這條腿！！',
    queenOpportunity: '現在就是機會！！',
    recallDefeatBy: '上次我們停在第{day}層，被{cause}擋住了。這次走得更遠吧！', recallDefeatPlain: '上次只走到第{day}層。今天我想看看更遠的地方。', recallClear: '上次你一路寫到了第{day}層。我一直在想那件事。', recallFirst: '我們是第一次吧？我會待在你身邊。至於待在哪兒，讓我自己決定。',
    styleStriker: '你更習慣出手打。明白了，前面交給我看著。', styleKeeper: '你總是先防守。正是這份謹慎把我們帶到這裡。', styleMender: '你總在照顧自己。很好——那才是最難的。', styleEmotion: '你經常選「{emotion}」。這份感情大概很適合你。', styleBold: '寫到頁邊之外，你不怕嗎？……不過確實帥氣。', styleCombo: '我還沒見過這麼頻繁湊齊語境的人。',
  },
}

export function bossTokenText(
  key: BossTokenLineKey,
  variables: Record<string, string> = {},
  locale: LocaleCode = currentLocale,
): string {
  let text: string = locale === 'ko' ? KOREAN[key] : FOREIGN[locale][key]
  for (const [name, value] of Object.entries(variables)) text = text.split(`{${name}}`).join(value)
  return text
}

export function bossTokenLine(
  key: BossTokenLineKey,
  tone: TokenTone = 'calm',
  variables: Record<string, string> = {},
): TokenLine {
  return { text: bossTokenText(key, variables), tone }
}

export function bossTokenLocalizationErrors(): string[] {
  const errors: string[] = []
  const keys = Object.keys(KOREAN) as BossTokenLineKey[]
  for (const [locale, rows] of Object.entries(FOREIGN) as [ForeignLocale, Record<BossTokenLineKey, string>][]) {
    for (const key of keys) {
      const text = rows[key]
      if (!text?.trim()) errors.push(`${locale}: boss Token line ${key} missing`)
      if (/[가-힣]/.test(text)) errors.push(`${locale}: Korean remains in boss Token line ${key}`)
      const expectedVariables = KOREAN[key].match(/\{[^}]+\}/g) ?? []
      for (const variable of expectedVariables) if (!text.includes(variable)) errors.push(`${locale}: boss Token line ${key} lost ${variable}`)
    }
  }
  return errors
}
