import { currentLocale, type LocaleCode } from './index'

export type TokenTone = 'calm' | 'warn' | 'relief'
export interface TokenLine { text: string; tone: TokenTone }

const KOREAN = {
  idleConcern: '어떡하지...! 도와줘, 프롬!!',
  idleHuge: '프롬, 저 녀석 너무 커...!',
  idleStand: '으으... 그래도 물러나면 안 돼!',
  idleIncoming: '조심해! 뭔가 오고 있어!',
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
} as const

export type BossTokenLineKey = keyof typeof KOREAN
type ForeignLocale = Exclude<LocaleCode, 'ko'>

const FOREIGN: Record<ForeignLocale, Record<BossTokenLineKey, string>> = {
  en: {
    idleConcern: 'What do we do...?! Help, Prompt!!', idleHuge: 'Prompt, that thing is huge...!', idleStand: "Nngh... We still can't back down!", idleIncoming: "Careful! Something's coming!",
    mantisStart: 'It raises its great scythe after a normal attack! Block it then — Sorrow is its weakness!!', mantisTelegraph: 'The great scythe is raised! Your next sentence must Guard! Reach the displayed Guard value!!', mantisGroggy: 'The shield broke, but the heavy attack was canceled! The mantis is exposed and will skip its next attack!!', mantisPunished: "We couldn't block it...! Next time it raises that scythe, we have to Guard!!",
    queenBeeStart: "Our attacks can't hurt the queen yet! Let's defeat the workers blocking the way first!!", queenBeeDispersed: 'Great, Prompt! A worker is down!!',
    elderSpiderMiss: 'Anything but the weakness stops at that leg! Aim for the weakness now!!', elderSpiderWebReady: "The webs are fully tightened! We have to hit the weakness this time!!", elderSpiderWebCut: 'That worked, Prompt! The webs are loosening!!',
    spiderNextWeakness: 'That leg is down! This time, {weakness} is the weakness!!', spiderBody: "All the legs are severed! Now for the body — no weakness, so give it everything!!", spiderOpeningWeak: 'The Magic Shield blocks the first hit! Strip it with multiple hits, then target the first leg with {weakness} — the webs pierce Guard too!!', spiderOpeningGeneric: 'The webs pierce Guard! You need to hit the exposed weakness to break through!!', spiderShieldBroken: 'The Magic Shield is broken! Now target this leg with {weakness}!!',
    queenOpportunity: 'Now is our chance!!',
  },
  ja: {
    idleConcern: 'どうしよう…！助けて、プロンプト！！', idleHuge: 'プロンプト、あいつ大きすぎるよ…！', idleStand: 'うう…それでも退いちゃだめだ！', idleIncoming: '気をつけて！何か来るよ！',
    mantisStart: '通常攻撃のあとに大鎌を構えるよ！その時に防御で止めよう――弱点は悲しみだ！！', mantisTelegraph: '大鎌を構えた！次の文は防御だよ！表示された数値まで必ず防御して！！', mantisGroggy: 'シールドは壊れたけど強攻撃は中止！カマキリはグロッキーで次の攻撃を一回休むよ！！', mantisPunished: '防げなかった…！次に大鎌を構えたら、今度こそ防御だよ！！',
    queenBeeStart: '今は女王蜂の本体に攻撃が通らない！先に前をふさぐ働き蜂を倒そう！！', queenBeeDispersed: 'いいぞ、プロンプト！働き蜂を倒したよ！！',
    elderSpiderMiss: '弱点じゃないとその脚で止まるよ！今の弱点を狙って！！', elderSpiderWebReady: '蜘蛛の糸が締まりきった！今度こそ弱点を狙おう！！', elderSpiderWebCut: '当たったよ、プロンプト！蜘蛛の糸が緩んでる！！',
    spiderNextWeakness: '脚を落とした！今度は「{weakness}」の感情が弱点だ！！', spiderBody: '脚を全部切った！次は本体だ――弱点はない、全力で押し切ろう！！', spiderOpeningWeak: '最初の攻撃はマジックシールドが防ぐよ！連撃で剥がしてから「{weakness}」の感情で最初の脚を狙って――蜘蛛の糸は防御も貫通する！！', spiderOpeningGeneric: '蜘蛛の糸は防御を貫通する！今見えている弱点を狙わないと突破できないよ！！', spiderShieldBroken: 'マジックシールドが壊れた！今度は「{weakness}」の感情で今の脚を狙って！！',
    queenOpportunity: '今がチャンスだよ！！',
  },
  ru: {
    idleConcern: 'Что же делать…?! Помоги, Промпт!!', idleHuge: 'Промпт, эта штука огромная…!', idleStand: 'Ух… Но отступать нельзя!', idleIncoming: 'Осторожно! Что-то приближается!',
    mantisStart: 'После обычной атаки он поднимает большую косу! Тогда блокируй — его слабость Печаль!!', mantisTelegraph: 'Большая коса поднята! Следующая фраза — Защита! Набери указанное значение Защиты!!', mantisGroggy: 'Щит сломан, но мощная атака отменена! Богомол уязвим и пропустит следующую атаку!!', mantisPunished: 'Не удалось заблокировать…! Когда он снова поднимет косу, обязательно защищайся!!',
    queenBeeStart: 'Сейчас атаки не вредят самой королеве! Сначала победим рабочих, которые закрывают путь!!', queenBeeDispersed: 'Отлично, Промпт! Рабочая пчела повержена!!',
    elderSpiderMiss: 'Без попадания в слабость удар остановится на этой ноге! Целься в слабость!!', elderSpiderWebReady: 'Паутина затянулась до конца! Теперь обязательно попади в слабость!!', elderSpiderWebCut: 'Получилось, Промпт! Паутина ослабевает!!',
    spiderNextWeakness: 'Нога отсечена! Теперь слабость — {weakness}!!', spiderBody: 'Все ноги отсечены! Теперь тело — слабостей нет, бей изо всех сил!!', spiderOpeningWeak: 'Первый удар остановит Магический щит! Сбей его серией ударов, затем целься в первую ногу эмоцией «{weakness}» — паутина пробивает Защиту!!', spiderOpeningGeneric: 'Паутина пробивает Защиту! Чтобы прорваться, бей по открытой слабости!!', spiderShieldBroken: 'Магический щит сломан! Теперь целься в эту ногу эмоцией «{weakness}»!!',
    queenOpportunity: 'Сейчас наш шанс!!',
  },
  'zh-Hans': {
    idleConcern: '怎么办……！帮帮我，提示词！！', idleHuge: '提示词，那家伙也太大了……！', idleStand: '呜……但我们不能后退！', idleIncoming: '小心！有什么要来了！',
    mantisStart: '普通攻击后它会举起巨镰！那时用防御挡住——悲伤是它的弱点！！', mantisTelegraph: '巨镰举起来了！下一句必须防御！一定要达到标出的防御值！！', mantisGroggy: '护盾虽然破了，但强攻也取消了！螳螂陷入破绽，下次攻击会跳过一回合！！', mantisPunished: '没挡住……！下次它举起巨镰时一定要防御！！',
    queenBeeStart: '现在攻击伤不到蜂后本体！先打倒挡在前面的工蜂吧！！', queenBeeDispersed: '太好了，提示词！工蜂倒下了！！',
    elderSpiderMiss: '没击中弱点就会停在那条腿！快瞄准当前弱点！！', elderSpiderWebReady: '蛛网已经完全收紧了！这次一定要击中弱点！！', elderSpiderWebCut: '打中了，提示词！蛛网正在松开！！',
    spiderNextWeakness: '那条腿断了！这次「{weakness}」情感是弱点！！', spiderBody: '所有腿都斩断了！接下来是本体——没有弱点，全力进攻吧！！', spiderOpeningWeak: '第一次攻击会被魔法盾挡住！先用连击剥掉盾，再用「{weakness}」情感攻击第一条腿——蛛网还能贯穿防御！！', spiderOpeningGeneric: '蛛网会贯穿防御！必须击中当前暴露的弱点才能突破！！', spiderShieldBroken: '魔法盾破了！现在用「{weakness}」情感攻击当前这条腿！！',
    queenOpportunity: '现在就是机会！！',
  },
  'zh-Hant': {
    idleConcern: '怎麼辦……！幫幫我，提示詞！！', idleHuge: '提示詞，那傢伙也太大了……！', idleStand: '嗚……但我們不能後退！', idleIncoming: '小心！有什麼要來了！',
    mantisStart: '普通攻擊後牠會舉起巨鐮！那時用防禦擋住——悲傷是牠的弱點！！', mantisTelegraph: '巨鐮舉起來了！下一句必須防禦！一定要達到標出的防禦值！！', mantisGroggy: '護盾雖然破了，但強攻也取消了！螳螂露出破綻，下次攻擊會跳過一回合！！', mantisPunished: '沒擋住……！下次牠舉起巨鐮時一定要防禦！！',
    queenBeeStart: '現在攻擊傷不到蜂后本體！先打倒擋在前面的工蜂吧！！', queenBeeDispersed: '太好了，提示詞！工蜂倒下了！！',
    elderSpiderMiss: '沒擊中弱點就會停在那條腿！快瞄準目前弱點！！', elderSpiderWebReady: '蛛網已經完全收緊了！這次一定要擊中弱點！！', elderSpiderWebCut: '打中了，提示詞！蛛網正在鬆開！！',
    spiderNextWeakness: '那條腿斷了！這次「{weakness}」情感是弱點！！', spiderBody: '所有腿都斬斷了！接下來是本體——沒有弱點，全力進攻吧！！', spiderOpeningWeak: '第一次攻擊會被魔法盾擋住！先用連擊剝掉盾，再用「{weakness}」情感攻擊第一條腿——蛛網還能貫穿防禦！！', spiderOpeningGeneric: '蛛網會貫穿防禦！必須擊中目前暴露的弱點才能突破！！', spiderShieldBroken: '魔法盾破了！現在用「{weakness}」情感攻擊目前這條腿！！',
    queenOpportunity: '現在就是機會！！',
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
