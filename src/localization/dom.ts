import { currentLocale, type LocaleCode } from './index'

type ForeignLocale = Exclude<LocaleCode, 'ko'>
type Row = readonly [ko: string, en: string, ja: string, ru: string, zhHans: string, zhHant: string]

const ROWS: Row[] = [
  ['전투 상태','Battle status','戦闘状態','Состояние боя','战斗状态','戰鬥狀態'],
  ['보상','Reward','報酬','Награда','奖励','獎勵'], ['주인공 상태','Hero status','主人公の状態','Состояние героя','主角状态','主角狀態'],
  ['이번 문장','This sentence','今回の文','Эта фраза','本句','本句'], ['행동 순서','Action order','行動順','Порядок действий','行动顺序','行動順序'],
  ['문장 행동','Sentence action','文の行動','Действие фразы','句子行动','句子行動'], ['선공','First strike','先攻','Первый ход','先攻','先攻'], ['후공','Second strike','後攻','Второй ход','后攻','後攻'], ['레일 대기','Waiting','待機中','Ожидание','等待中','等待中'],
  ['시스템 메뉴','System menu','システムメニュー','Системное меню','系统菜单','系統選單'], ['설정','Settings','設定','Настройки','设置','設定'], ['그림일기 도감','Picture-diary codex','絵日記図鑑','Альбом-дневник','图画日记图鉴','圖畫日記圖鑑'], ['홈으로','Home','ホームへ','Домой','返回主页','返回主頁'],
  ['문장 조립 단계','Sentence steps','文の組み立て','Этапы фразы','句子组装步骤','句子組裝步驟'], ['주어','Subject','主語','Подлежащее','主语','主語'], ['수식','Modifier','修飾','Модификатор','修饰','修飾'], ['동사','Verb','動詞','Глагол','动词','動詞'],
  ['단어 카드 선택 영역','Word card area','単語カード選択','Выбор карт слов','词语卡选择区','詞語卡選擇區'], ['현재 손패','Current hand','現在の手札','Текущая рука','当前手牌','目前手牌'], ['카드 뽑기','Draw card','カードを引く','Взять карту','抽卡','抽卡'], ['남은 카드 없음','No cards left','残りカードなし','Карт не осталось','没有剩余卡牌','沒有剩餘卡牌'],
  ['그림일기','Picture diary','絵日記','Дневник','图画日记','圖畫日記'], ['감정','Emotion','感情','Эмоция','情绪','情緒'],
  ['토큰이 알려 줄게!','Token will show you!','トークンが教えるよ！','Токен всё объяснит!','让托肯告诉你！','讓托肯告訴你！'], ['멋진 문장을 쓰는 법','How to write a great sentence','すてきな文の書き方','Как написать отличную фразу','写出精彩句子的方法','寫出精彩句子的方法'],
  ['맥락','Context','文脈','Контекст','语境','語境'], ['공명','Resonance','共鳴','Резонанс','共鸣','共鳴'], ['문맥에 맞는 멋진 단어를 만들면 보너스!','Match words to the context for a bonus!','文脈に合う言葉でボーナス！','Подбирайте слова по контексту и получайте бонус!','搭配符合语境的词语即可获得奖励！','搭配符合語境的詞語即可獲得獎勵！'], ['같은 감정을 모아 증폭시키면 보너스!','Gather matching emotions to amplify them!','同じ感情を集めて増幅！','Собирайте одинаковые эмоции для усиления!','聚集相同情绪即可增强！','聚集相同情緒即可增強！'], ['다양한 동사로 다채로운 동작을!','Use different verbs for different actions!','動詞を変えて多彩な行動！','Разные глаголы — разные действия!','用不同动词施展丰富行动！','用不同動詞施展豐富行動！'], ['초과 데미지는 짜릿한 오버킬을 선사!','Excess damage becomes a thrilling overkill!','余剰ダメージで爽快オーバーキル！','Лишний урон превращается в эффектный оверкилл!','溢出伤害会带来爽快的过量击杀！','溢出傷害會帶來爽快的過量擊殺！'], ['전투 도움말 열기','Open battle help','戦闘ヘルプを開く','Открыть справку боя','打开战斗帮助','開啟戰鬥說明'],
  ['오늘의 보상등급','Today’s reward grade','今日の報酬等級','Уровень награды','今日奖励等级','今日獎勵等級'], ['보상 받지 않기','Skip reward','報酬を受け取らない','Пропустить награду','跳过奖励','跳過獎勵'], ['자세히보기','Details','詳細','Подробнее','详情','詳情'], ['고르기 →','Choose →','選ぶ →','Выбрать →','选择 →','選擇 →'], ['새 단어','New word','新しい言葉','Новое слово','新词语','新詞語'], ['아이템','Item','アイテム','Предмет','道具','道具'],
  ['제련할 아이템','Item to forge','鍛えるアイテム','Предмет для ковки','待锻造道具','待鍛造道具'], ['제련 스탯','Forge stats','鍛錬能力','Параметры ковки','锻造属性','鍛造屬性'], ['제련 완료','Forge complete','鍛錬完了','Ковка завершена','锻造完成','鍛造完成'], ['세 마디의 힘이 아이템에 새겨졌다','The power of three words was forged into the item','三つの言葉の力が刻まれた','Сила трёх слов вплавлена в предмет','三句话的力量已刻入道具','三句話的力量已刻入道具'], ['제련 문장','Forge sentence','鍛錬の文','Фраза ковки','锻造句子','鍛造句子'], ['세 마디를 골라 아이템에 힘을 새긴다','Choose three words to forge power into the item','三つの言葉で力を刻む','Выберите три слова и вложите силу в предмет','选择三句话，将力量刻入道具','選擇三句話，將力量刻入道具'], ['등급 보너스 +1점','Rarity bonus +1','等級ボーナス +1','Бонус редкости +1','稀有度奖励 +1','稀有度獎勵 +1'],
  ['새 일기 시작','Start a new diary','新しい日記を始める','Начать новый дневник','开始新日记','開始新日記'], ['타이틀로','To title','タイトルへ','В главное меню','返回标题','返回標題'], ['계속 쓰기','Keep writing','書き続ける','Продолжить писать','继续书写','繼續書寫'],
  ['닫기','Close','閉じる','Закрыть','关闭','關閉'], ['강화하면','After upgrade','強化すると','После усиления','强化后','強化後'], ['전체','All','全体','Все','全部','全部'],
]

const INDEX: Record<ForeignLocale, number> = { en: 1, ja: 2, ru: 3, 'zh-Hans': 4, 'zh-Hant': 5 }
const dictionaries = Object.fromEntries(Object.keys(INDEX).map((locale) => [locale, new Map(ROWS.map((row) => [row[0], row[INDEX[locale as ForeignLocale]]]))])) as Record<ForeignLocale, Map<string, string>>

function translateText(value: string, locale: ForeignLocale): string {
  const dict = dictionaries[locale]
  const leading = value.match(/^\s*/)?.[0] ?? ''
  const trailing = value.match(/\s*$/)?.[0] ?? ''
  const core = value.trim()
  const direct = dict.get(core)
  if (direct) return `${leading}${direct}${trailing}`

  const emotion = core.match(/^감정:\s*(.+)$/)
  if (emotion) return `${leading}${dict.get('감정')}: ${emotion[1]}${trailing}`
  const day = core.match(/^(\d+)일째$/)
  if (day) return `${leading}${locale === 'ja' ? `${day[1]}日目` : locale === 'ru' ? `День ${day[1]}` : locale.startsWith('zh') ? `第${day[1]}天` : `Day ${day[1]}`}${trailing}`
  const stage = core.match(/^(\d+)스테이지 클리어$/)
  if (stage) return `${leading}${locale === 'ja' ? `ステージ${stage[1]}クリア` : locale === 'ru' ? `Этап ${stage[1]} пройден` : locale.startsWith('zh') ? `第${stage[1]}关完成` : `Stage ${stage[1]} clear`}${trailing}`
  return value
}

function translateElement(root: Node, locale: ForeignLocale): void {
  const nodes: Node[] = []
  if (root.nodeType === Node.TEXT_NODE) nodes.push(root)
  const parent = root instanceof Element || root instanceof Document || root instanceof DocumentFragment ? root : null
  parent?.querySelectorAll('*').forEach((element) => element.childNodes.forEach((node) => { if (node.nodeType === Node.TEXT_NODE) nodes.push(node) }))
  for (const node of nodes) if (node.nodeValue) {
    const translated = translateText(node.nodeValue, locale)
    if (translated !== node.nodeValue) node.nodeValue = translated
  }
  if (root instanceof Element) translateAttributes(root, locale)
  parent?.querySelectorAll<HTMLElement>('[aria-label],[title],[placeholder]').forEach((element) => translateAttributes(element, locale))
}

function translateAttributes(element: Element, locale: ForeignLocale): void {
  for (const attribute of ['aria-label','title','placeholder']) {
    const value = element.getAttribute(attribute)
    if (value) {
      const translated = translateText(value, locale)
      if (translated !== value) element.setAttribute(attribute, translated)
    }
  }
}

export function installDomLocalization(): void {
  if (currentLocale === 'ko' || typeof document === 'undefined') return
  const locale = currentLocale as ForeignLocale
  translateElement(document.body, locale)
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'characterData' && record.target.nodeValue) {
        const translated = translateText(record.target.nodeValue, locale)
        if (translated !== record.target.nodeValue) record.target.nodeValue = translated
      }
      record.addedNodes.forEach((node) => translateElement(node, locale))
    }
  })
  observer.observe(document.body, { childList: true, subtree: true, characterData: true })
}
