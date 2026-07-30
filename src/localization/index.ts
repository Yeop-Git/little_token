export const SUPPORTED_LOCALES = ['ko', 'en', 'ja', 'ru', 'zh-Hans', 'zh-Hant'] as const
export type LocaleCode = typeof SUPPORTED_LOCALES[number]

export const LOCALE_STORAGE_KEY = 'little-token-locale'

export const LOCALE_NAMES: Record<LocaleCode, string> = {
  ko: '한국어',
  en: 'English',
  ja: '日本語',
  ru: 'Русский',
  'zh-Hans': '简体中文',
  'zh-Hant': '繁體中文',
}

/** 세계관 고유명사. 프롬은 Prompt에서, 토큰은 Token에서 온 이름이다. */
export const PROPER_NAMES: Record<LocaleCode, { player: string; token: string }> = {
  ko: { player: '프롬', token: '토큰' },
  en: { player: 'Prompt', token: 'Token' },
  ja: { player: 'プロンプト', token: 'トークン' },
  ru: { player: 'Промпт', token: 'Токен' },
  'zh-Hans': { player: '提示词', token: '词元' },
  'zh-Hant': { player: '提示詞', token: '詞元' },
}

const LOCALE_SET = new Set<string>(SUPPORTED_LOCALES)

function readLocale(): LocaleCode {
  // CLI 검사는 브라우저 저장 상태를 읽지 않는다. 같은 커밋은 어느 개발 머신에서도
  // 같은 언어로 컴파일되어야 전투 계약 테스트가 결정적이다.
  if (typeof document === 'undefined' || typeof localStorage === 'undefined') return 'ko'
  try {
    const saved = localStorage.getItem(LOCALE_STORAGE_KEY)
    return saved && LOCALE_SET.has(saved) ? saved as LocaleCode : 'ko'
  } catch {
    return 'ko'
  }
}

export const currentLocale: LocaleCode = readLocale()

export function setLocale(locale: LocaleCode): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  } catch {
    // 저장소가 막혀 있으면 재로딩 뒤 한국어 기본값으로 돌아간다.
  }
}

type UiDictionary = Record<string, string>

const UI: Record<Exclude<LocaleCode, 'ko'>, UiDictionary> = {
  en: {
    playerName: PROPER_NAMES.en.player, tokenName: PROPER_NAMES.en.token,
    hudInspirationTip: 'Inspiration {value}\nEarned during battle. Spend it to buy reward cards or refresh reward choices.',
    hudClearRewardTip: 'Clear reward +{value}\nSpeed grade {speed} + {draws} unused free draws. Speed grade is higher for a fast clear.',
    hudActionOrderTip: 'Action order\nShows who acts first, who acts after the sentence, and who is waiting on the rail.',
    hudInkTip: 'Ink {remaining}/{max}\nEach sentence starts with {max} Ink. Selected words consume Ink.',
    hudInkOverdrawTip: 'Ink {spent}/{max}\nYou can finish the sentence, but confirming it directly costs {overdraw} HP beyond Guard.',
    hudInkLabel: 'Ink', hudInkAria: 'Ink {remaining}/{max}', hudInkOverdrawAria: 'Ink {spent}/{max}, direct HP cost {overdraw}', hudInkOverdrawLabel: 'Overwriting · HP -{overdraw}',
    hudSettingsTip: 'Settings\nAdjust graphics, sound, language, and play records.',
    hudCodexTip: 'Picture-diary codex\nReview your words, cards, encountered bugs, and acquired items.',
    hudHomeTip: 'Home\nReset this battle to its starting state and return to the title screen.',
    hudHelpTip: 'Battle help\nReview the core rules for building sentences.',
    hudStageLabel: 'Stage', hudStoryCycle: 'First story', hudEndlessCycle: 'Endless cycle {cycle}', hudBoss: 'Boss', hudBossNow: '{boss} battle', hudNextBoss: '{count} stages to {boss}', hudStageAria: '{cycle}. Stage {floor} of {total}. {next}',
    rewardFactRarity: 'Rarity', rewardFactRole: 'Role', rewardFactAcquire: 'Gain', rewardFactCost: 'Cost',
    rewardRoleAttack: 'Attack', rewardRoleGuard: 'Guard', rewardRoleHeal: 'Heal', rewardRoleVariable: 'Variable', rewardRoleTactic: 'Tactic', rewardRoleRule: 'Sentence rule', rewardRoleStats: 'Stat growth',
    rewardAcquireReinforce: 'Reinforce +1', rewardAcquireItem: 'New item', rewardAcquireWord: 'New word', rewardCurrencyInspiration: 'Inspiration', rewardUnavailable: 'Unavailable', rewardInsufficient: 'Not enough Inspiration',
    rewardCardAria: '{name}, rarity {rarity}, role {role}, gain {acquire}, cost {currency} {price}',
    rewardDeck: 'My wordbook', rewardDeckTitle: 'Current wordbook', rewardDeckCombos: 'Available idioms', rewardDeckNone: 'No idiom can be completed yet.',
    rewardEarlyBuildReserve: 'The final Verb step offers three build predicates. Keep {cost} Inspiration to record one.',
    demoResultTitle: 'The first chapter is safe!', demoResultCleared: ' cleared', demoResultReplay: 'Replay demo', demoResultFirstBoss: 'First boss', demoResultMantis: 'The mantis is defeated', demoResultNote: 'You protected five pages and completed the first chapter.',
    demoResultDiscoveries: 'Demo discoveries', demoResultNewWords: 'New words', demoResultReinforced: 'Reinforcements', demoResultCombos: 'Available idioms', demoResultItems: 'Items', demoResultNone: 'None',
    demoResultFeedback: 'Leave feedback', demoResultFullTitle: 'The story continues in the full game', demoResultFullBody: 'The full game includes 15 stages, three bosses, late-game rewards, and Endless after completion.', demoResultSaveScope: 'Demo saves continue only in the demo and do not transfer to the full game.',
    settings: 'Settings', close: 'Close', settingsCategories: 'Settings categories',
    graphics: 'Graphics', sound: 'Sound', other: 'Other', language: 'Language',
    languageHint: 'The page reloads when the language changes.',
    qualityPreset: 'Quality preset', qualityPresetHint: 'Configure every detail at once',
    resolution: 'Resolution', resolutionHint: 'Character render scale', maxFps: 'Max FPS', fpsHint: 'Render refresh rate',
    effects: 'Effects', effectsHint: 'Fragments and sparks', postprocessing: 'Post-processing', postprocessingHint: 'Blur, color and vignette',
    antialiasing: 'Anti-aliasing', antialiasingHint: 'Character edges', low: 'Low', medium: 'Medium', high: 'High', ultra: 'Ultra', off: 'Off', unlimited: 'Unlimited',
    masterVolume: 'Master volume', volumeHint: 'Adjusts the overall volume of music and sound effects.',
    playRecords: 'Play records', startOver: 'Start over', resetAll: 'Delete all records and start a new game',
    resetNote: 'Deletes the current diary and tutorial record, then starts again from the tutorial.', resetConfirm: 'Delete everything?', resetConfirmNote: 'Press once more to delete everything and start a new game.',
    titleMenu: 'Title menu', continue: 'Continue', newGame: 'New game', start: 'Start', settingsAction: 'Settings', help: 'Help', exit: 'Exit',
    closeTab: 'Please close the browser tab.', confirmNew: 'Start over?', diaryWillErase: 'Your current diary will be erased.',
  },
  ja: {
    playerName: PROPER_NAMES.ja.player, tokenName: PROPER_NAMES.ja.token,
    hudInspirationTip: '所持ひらめき {value}\n戦闘で集め、報酬カードの購入や報酬候補の更新に使う。',
    hudClearRewardTip: 'クリア報酬 +{value}\n速度等級 {speed} + 未使用の無料ドロー {draws}。速度等級は早く勝つほど高くなる。',
    hudActionOrderTip: '行動順\n先に動く者、文の後に動く者、レールで待機中の敵を示す。',
    hudInkTip: 'インク {remaining}/{max}\n各文はインク{max}から始まり、選んだ単語がインクを消費する。',
    hudInkOverdrawTip: 'インク {spent}/{max}\n文は完成できるが、確定時に超過分の体力{overdraw}を防御を無視して直接支払う。',
    hudInkLabel: 'インク', hudInkAria: '残りインク {remaining}/{max}', hudInkOverdrawAria: 'インク {spent}/{max}、直接体力消費 {overdraw}', hudInkOverdrawLabel: '超過執筆 · 体力 -{overdraw}',
    hudSettingsTip: '設定\nグラフィック、サウンド、言語、プレイ記録を調整する。',
    hudCodexTip: '絵日記図鑑\n単語、カード、出会った虫、入手したアイテムを振り返る。',
    hudHomeTip: 'ホーム\nこの戦闘を開始前に戻してタイトル画面へ戻る。',
    hudHelpTip: '戦闘ヘルプ\n文を組み立てる基本ルールを見直す。',
    hudStageLabel: 'ステージ', hudStoryCycle: '最初の物語', hudEndlessCycle: 'エンドレス {cycle}周目', hudBoss: 'ボス', hudBossNow: '{boss}戦', hudNextBoss: '{boss}まであと{count}ステージ', hudStageAria: '{cycle}。ステージ{floor}/{total}。{next}',
    rewardFactRarity: 'レア度', rewardFactRole: '役割', rewardFactAcquire: '獲得', rewardFactCost: '費用',
    rewardRoleAttack: '攻撃', rewardRoleGuard: '防御', rewardRoleHeal: '回復', rewardRoleVariable: '変動', rewardRoleTactic: '戦術', rewardRoleRule: '文ルール', rewardRoleStats: '能力成長',
    rewardAcquireReinforce: '反復強化 +1', rewardAcquireItem: '新アイテム', rewardAcquireWord: '新しい言葉', rewardCurrencyInspiration: 'ひらめき', rewardUnavailable: '購入不可', rewardInsufficient: 'ひらめき不足',
    rewardCardAria: '{name}、レア度{rarity}、役割{role}、獲得{acquire}、費用{currency} {price}',
    rewardDeck: '単語帳', rewardDeckTitle: '現在の単語帳', rewardDeckCombos: '完成できる慣用句', rewardDeckNone: 'まだ完成できる慣用句がない。',
    rewardEarlyBuildReserve: '最後の動詞段階ではビルド用の述語が3枚並ぶ。ひらめきを{cost}残せば1枚記録できる。',
    demoResultTitle: '最初の章を守った！', demoResultCleared: ' 完走', demoResultReplay: 'デモをもう一度', demoResultFirstBoss: '最初のボス', demoResultMantis: 'カマキリを倒した', demoResultNote: '五枚の文章を守り、最初の物語を完成させた。',
    demoResultDiscoveries: 'デモの発見記録', demoResultNewWords: '新しい言葉', demoResultReinforced: '反復強化', demoResultCombos: '完成できる慣用句', demoResultItems: 'アイテム', demoResultNone: 'なし',
    demoResultFeedback: '感想を送る', demoResultFullTitle: '物語は製品版へ続く', demoResultFullBody: '製品版には15ステージ、三体のボス、後半報酬、クリア後のエンドレスが収録される。', demoResultSaveScope: 'デモのセーブはデモ内だけで続き、製品版には引き継がれない。',
    settings: '設定', close: '閉じる', settingsCategories: '設定項目', graphics: 'グラフィック', sound: 'サウンド', other: 'その他', language: '言語',
    languageHint: '言語を変更するとページを再読み込みします。', qualityPreset: '品質プリセット', qualityPresetHint: '詳細をまとめて設定',
    resolution: '解像度', resolutionHint: 'キャラクター描画倍率', maxFps: '最大FPS', fpsHint: '描画更新頻度', effects: 'エフェクト', effectsHint: '紙片・火花の密度',
    postprocessing: 'ポストプロセス', postprocessingHint: 'ぼかし・色・ビネット', antialiasing: 'アンチエイリアス', antialiasingHint: 'キャラクターの輪郭',
    low: '低', medium: '中', high: '高', ultra: 'ウルトラ', off: 'オフ', unlimited: '無制限', masterVolume: 'マスター音量', volumeHint: 'BGMと効果音の音量をまとめて調整します。',
    playRecords: 'プレイ記録', startOver: '最初から', resetAll: 'すべての記録を消して新しく始める', resetNote: '進行中の日記とチュートリアル記録を消し、チュートリアルから始めます。',
    resetConfirm: '本当にすべて消しますか？', resetConfirmNote: 'もう一度押すと削除して新しく始めます。', titleMenu: 'タイトルメニュー', continue: 'つづきから', newGame: 'はじめから', start: 'スタート', settingsAction: '設定', help: 'ヘルプ', exit: '終了', closeTab: 'ブラウザーのタブを閉じてください。', confirmNew: '最初から始めますか？', diaryWillErase: 'これまでの日記が消えます。',
  },
  ru: {
    playerName: PROPER_NAMES.ru.player, tokenName: PROPER_NAMES.ru.token,
    hudInspirationTip: 'Вдохновение: {value}\nКопится в бою. Тратится на карты наград и обновление вариантов награды.',
    hudClearRewardTip: 'Награда за победу: +{value}\nУровень скорости {speed} + неиспользованные бесплатные доборы: {draws}. Уровень выше за быструю победу.',
    hudActionOrderTip: 'Порядок действий\nПоказывает, кто ходит первым, кто действует после фразы и кто ждёт на линии.',
    hudInkTip: 'Чернила: {remaining}/{max}\nКаждая фраза начинается с {max} чернил. Выбранные слова расходуют их.',
    hudInkOverdrawTip: 'Чернила: {spent}/{max}\nФразу можно завершить, но при подтверждении лишние {overdraw} ед. здоровья тратятся напрямую, минуя Защиту.',
    hudInkLabel: 'Чернила', hudInkAria: 'Чернила: {remaining}/{max}', hudInkOverdrawAria: 'Чернила: {spent}/{max}, прямой расход здоровья: {overdraw}', hudInkOverdrawLabel: 'Сверх лимита · Здоровье -{overdraw}',
    hudSettingsTip: 'Настройки\nНастройте графику, звук, язык и игровые записи.',
    hudCodexTip: 'Альбом-дневник\nПросмотрите слова, карты, встреченных жуков и полученные предметы.',
    hudHomeTip: 'Домой\nСбросить этот бой к началу и вернуться на титульный экран.',
    hudHelpTip: 'Справка боя\nПовторить основные правила составления фраз.',
    hudStageLabel: 'Этап', hudStoryCycle: 'Первая история', hudEndlessCycle: 'Бесконечный цикл {cycle}', hudBoss: 'Босс', hudBossNow: 'Бой: {boss}', hudNextBoss: 'До {boss}: {count} этап.', hudStageAria: '{cycle}. Этап {floor} из {total}. {next}',
    rewardFactRarity: 'Редкость', rewardFactRole: 'Роль', rewardFactAcquire: 'Получение', rewardFactCost: 'Цена',
    rewardRoleAttack: 'Атака', rewardRoleGuard: 'Защита', rewardRoleHeal: 'Лечение', rewardRoleVariable: 'Случайность', rewardRoleTactic: 'Тактика', rewardRoleRule: 'Правило фразы', rewardRoleStats: 'Рост параметров',
    rewardAcquireReinforce: 'Усиление +1', rewardAcquireItem: 'Новый предмет', rewardAcquireWord: 'Новое слово', rewardCurrencyInspiration: 'Вдохновение', rewardUnavailable: 'Недоступно', rewardInsufficient: 'Не хватает вдохновения',
    rewardCardAria: '{name}, редкость {rarity}, роль {role}, получение {acquire}, цена: {currency} {price}',
    rewardDeck: 'Мой словарь', rewardDeckTitle: 'Текущий словарь', rewardDeckCombos: 'Доступные идиомы', rewardDeckNone: 'Пока нельзя составить ни одной идиомы.',
    rewardEarlyBuildReserve: 'На последнем этапе глаголов появятся три основы для сборки. Оставьте {cost} Вдохновения, чтобы записать одну.',
    demoResultTitle: 'Первая глава спасена!', demoResultCleared: ' пройдено', demoResultReplay: 'Пройти демо снова', demoResultFirstBoss: 'Первый босс', demoResultMantis: 'Богомол побеждён', demoResultNote: 'Вы защитили пять страниц и завершили первую главу.',
    demoResultDiscoveries: 'Открытия демо', demoResultNewWords: 'Новые слова', demoResultReinforced: 'Усиления', demoResultCombos: 'Доступные идиомы', demoResultItems: 'Предметы', demoResultNone: 'Нет',
    demoResultFeedback: 'Оставить отзыв', demoResultFullTitle: 'История продолжится в полной версии', demoResultFullBody: 'В полной версии будут 15 этапов, три босса, поздние награды и бесконечный режим после прохождения.', demoResultSaveScope: 'Сохранение демо действует только в демо и не переносится в полную версию.',
    settings: 'Настройки', close: 'Закрыть', settingsCategories: 'Разделы настроек', graphics: 'Графика', sound: 'Звук', other: 'Другое', language: 'Язык',
    languageHint: 'После смены языка страница перезагрузится.', qualityPreset: 'Профиль качества', qualityPresetHint: 'Настроить всё сразу', resolution: 'Разрешение', resolutionHint: 'Масштаб персонажей', maxFps: 'Макс. FPS', fpsHint: 'Частота обновления', effects: 'Эффекты', effectsHint: 'Плотность искр и обрывков', postprocessing: 'Постобработка', postprocessingHint: 'Размытие, цвет и виньетка', antialiasing: 'Сглаживание', antialiasingHint: 'Края персонажей', low: 'Низко', medium: 'Средне', high: 'Высоко', ultra: 'Ультра', off: 'Выкл.', unlimited: 'Без ограничений', masterVolume: 'Общая громкость', volumeHint: 'Общая громкость музыки и звуков.', playRecords: 'Игровые записи', startOver: 'Начать сначала', resetAll: 'Удалить все записи и начать заново', resetNote: 'Удаляет текущий дневник и обучение и запускает обучение заново.', resetConfirm: 'Удалить всё?', resetConfirmNote: 'Нажмите ещё раз, чтобы удалить всё и начать заново.', titleMenu: 'Главное меню', continue: 'Продолжить', newGame: 'Новая игра', start: 'Начать', settingsAction: 'Настройки', help: 'Помощь', exit: 'Выход', closeTab: 'Закройте вкладку браузера.', confirmNew: 'Начать сначала?', diaryWillErase: 'Текущий дневник будет стёрт.',
  },
  'zh-Hans': {
    playerName: PROPER_NAMES['zh-Hans'].player, tokenName: PROPER_NAMES['zh-Hans'].token,
    hudInspirationTip: '持有灵感 {value}\n在战斗中积累，用于购买奖励卡牌或刷新奖励选项。',
    hudClearRewardTip: '通关奖励 +{value}\n速度等级 {speed} + 未使用免费抽卡 {draws}。通关越快，速度等级越高。',
    hudActionOrderTip: '行动顺序\n显示谁先行动、谁在句子后行动，以及谁正在轨道上等待。',
    hudInkTip: '墨水 {remaining}/{max}\n每个句子以{max}点墨水开始，所选词语会消耗墨水。',
    hudInkOverdrawTip: '墨水 {spent}/{max}\n仍可完成句子，但确认时会无视防御，直接支付超出部分的{overdraw}点生命。',
    hudInkLabel: '墨水', hudInkAria: '剩余墨水 {remaining}/{max}', hudInkOverdrawAria: '墨水 {spent}/{max}，直接消耗生命 {overdraw}', hudInkOverdrawLabel: '超额书写 · 生命 -{overdraw}',
    hudSettingsTip: '设置\n调整画面、声音、语言和游戏记录。',
    hudCodexTip: '图画日记图鉴\n查看词语、卡牌、遇到的虫子和获得的道具。',
    hudHomeTip: '主页\n将本场战斗重置到开始前并返回标题画面。',
    hudHelpTip: '战斗帮助\n回顾组装句子的核心规则。',
    hudStageLabel: '关卡', hudStoryCycle: '第一篇故事', hudEndlessCycle: '无尽第{cycle}轮', hudBoss: '首领', hudBossNow: '{boss}首领战', hudNextBoss: '距离{boss}还有{count}关', hudStageAria: '{cycle}。第{floor}/{total}关。{next}',
    rewardFactRarity: '稀有度', rewardFactRole: '作用', rewardFactAcquire: '获得', rewardFactCost: '费用',
    rewardRoleAttack: '攻击', rewardRoleGuard: '防御', rewardRoleHeal: '恢复', rewardRoleVariable: '波动', rewardRoleTactic: '战术', rewardRoleRule: '句子规则', rewardRoleStats: '属性成长',
    rewardAcquireReinforce: '重复强化 +1', rewardAcquireItem: '新道具', rewardAcquireWord: '新单词', rewardCurrencyInspiration: '灵感', rewardUnavailable: '无法购买', rewardInsufficient: '灵感不足',
    rewardCardAria: '{name}，稀有度{rarity}，作用{role}，获得{acquire}，费用{currency} {price}',
    rewardDeck: '我的词册', rewardDeckTitle: '当前词册', rewardDeckCombos: '可完成的惯用语', rewardDeckNone: '暂时没有可完成的惯用语。',
    rewardEarlyBuildReserve: '最后的动词阶段会出现三种流派核心。保留{cost}点灵感即可记录其中一种。',
    demoResultTitle: '守住了第一章！', demoResultCleared: ' 已完成', demoResultReplay: '再次体验试玩版', demoResultFirstBoss: '首个首领', demoResultMantis: '击败了螳螂', demoResultNote: '守住五页句子，完成了第一段故事。',
    demoResultDiscoveries: '试玩发现记录', demoResultNewWords: '新单词', demoResultReinforced: '重复强化', demoResultCombos: '可完成惯用语', demoResultItems: '道具', demoResultNone: '无',
    demoResultFeedback: '留下反馈', demoResultFullTitle: '故事将在正式版继续', demoResultFullBody: '正式版包含15关、三名首领、后期奖励和通关后的无尽模式。', demoResultSaveScope: '试玩版存档仅能在试玩版继续，不能转移到正式版。',
    settings: '设置', close: '关闭', settingsCategories: '设置分类', graphics: '画面', sound: '声音', other: '其他', language: '语言', languageHint: '更改语言后页面将重新加载。', qualityPreset: '画质预设', qualityPresetHint: '一次设置全部选项', resolution: '分辨率', resolutionHint: '角色渲染倍率', maxFps: '最高 FPS', fpsHint: '画面刷新频率', effects: '特效', effectsHint: '碎片与火花密度', postprocessing: '后期处理', postprocessingHint: '模糊、色彩与暗角', antialiasing: '抗锯齿', antialiasingHint: '角色边缘', low: '低', medium: '中', high: '高', ultra: '极高', off: '关闭', unlimited: '无限制', masterVolume: '主音量', volumeHint: '调整背景音乐和音效的整体音量。', playRecords: '游戏记录', startOver: '重新开始', resetAll: '删除全部记录并开始新游戏', resetNote: '删除当前日记和教程记录，并从教程重新开始。', resetConfirm: '确定全部删除吗？', resetConfirmNote: '再次按下即可删除并开始新游戏。', titleMenu: '标题菜单', continue: '继续', newGame: '新游戏', start: '开始', settingsAction: '设置', help: '帮助', exit: '退出', closeTab: '请关闭浏览器标签页。', confirmNew: '要重新开始吗？', diaryWillErase: '当前日记将被删除。',
  },
  'zh-Hant': {
    playerName: PROPER_NAMES['zh-Hant'].player, tokenName: PROPER_NAMES['zh-Hant'].token,
    hudInspirationTip: '持有靈感 {value}\n在戰鬥中累積，用於購買獎勵卡牌或刷新獎勵選項。',
    hudClearRewardTip: '通關獎勵 +{value}\n速度等級 {speed} + 未使用免費抽卡 {draws}。通關越快，速度等級越高。',
    hudActionOrderTip: '行動順序\n顯示誰先行動、誰在句子後行動，以及誰正在軌道上等待。',
    hudInkTip: '墨水 {remaining}/{max}\n每個句子以{max}點墨水開始，所選詞語會消耗墨水。',
    hudInkOverdrawTip: '墨水 {spent}/{max}\n仍可完成句子，但確認時會無視防禦，直接支付超出部分的{overdraw}點生命。',
    hudInkLabel: '墨水', hudInkAria: '剩餘墨水 {remaining}/{max}', hudInkOverdrawAria: '墨水 {spent}/{max}，直接消耗生命 {overdraw}', hudInkOverdrawLabel: '超額書寫 · 生命 -{overdraw}',
    hudSettingsTip: '設定\n調整畫面、聲音、語言和遊戲紀錄。',
    hudCodexTip: '圖畫日記圖鑑\n查看詞語、卡牌、遇到的蟲子和獲得的道具。',
    hudHomeTip: '主頁\n將本場戰鬥重置到開始前並返回標題畫面。',
    hudHelpTip: '戰鬥說明\n回顧組裝句子的核心規則。',
    hudStageLabel: '關卡', hudStoryCycle: '第一篇故事', hudEndlessCycle: '無盡第{cycle}輪', hudBoss: '首領', hudBossNow: '{boss}首領戰', hudNextBoss: '距離{boss}還有{count}關', hudStageAria: '{cycle}。第{floor}/{total}關。{next}',
    rewardFactRarity: '稀有度', rewardFactRole: '作用', rewardFactAcquire: '獲得', rewardFactCost: '費用',
    rewardRoleAttack: '攻擊', rewardRoleGuard: '防禦', rewardRoleHeal: '恢復', rewardRoleVariable: '波動', rewardRoleTactic: '戰術', rewardRoleRule: '句子規則', rewardRoleStats: '屬性成長',
    rewardAcquireReinforce: '重複強化 +1', rewardAcquireItem: '新道具', rewardAcquireWord: '新單詞', rewardCurrencyInspiration: '靈感', rewardUnavailable: '無法購買', rewardInsufficient: '靈感不足',
    rewardCardAria: '{name}，稀有度{rarity}，作用{role}，獲得{acquire}，費用{currency} {price}',
    rewardDeck: '我的詞冊', rewardDeckTitle: '目前詞冊', rewardDeckCombos: '可完成的慣用語', rewardDeckNone: '暫時沒有可完成的慣用語。',
    rewardEarlyBuildReserve: '最後的動詞階段會出現三種流派核心。保留{cost}點靈感即可記錄其中一種。',
    demoResultTitle: '守住了第一章！', demoResultCleared: ' 已完成', demoResultReplay: '再次體驗試玩版', demoResultFirstBoss: '首個首領', demoResultMantis: '擊敗了螳螂', demoResultNote: '守住五頁句子，完成了第一段故事。',
    demoResultDiscoveries: '試玩發現記錄', demoResultNewWords: '新單詞', demoResultReinforced: '重複強化', demoResultCombos: '可完成慣用語', demoResultItems: '道具', demoResultNone: '無',
    demoResultFeedback: '留下意見', demoResultFullTitle: '故事將在正式版繼續', demoResultFullBody: '正式版包含15關、三名首領、後期獎勵和通關後的無盡模式。', demoResultSaveScope: '試玩版存檔只能在試玩版繼續，不能轉移到正式版。',
    settings: '設定', close: '關閉', settingsCategories: '設定分類', graphics: '畫面', sound: '聲音', other: '其他', language: '語言', languageHint: '變更語言後頁面將重新載入。', qualityPreset: '畫質預設', qualityPresetHint: '一次設定全部選項', resolution: '解析度', resolutionHint: '角色渲染倍率', maxFps: '最高 FPS', fpsHint: '畫面更新頻率', effects: '特效', effectsHint: '碎片與火花密度', postprocessing: '後製處理', postprocessingHint: '模糊、色彩與暗角', antialiasing: '反鋸齒', antialiasingHint: '角色邊緣', low: '低', medium: '中', high: '高', ultra: '極高', off: '關閉', unlimited: '無限制', masterVolume: '主音量', volumeHint: '調整背景音樂和音效的整體音量。', playRecords: '遊戲紀錄', startOver: '重新開始', resetAll: '刪除全部紀錄並開始新遊戲', resetNote: '刪除目前日記和教學紀錄，並從教學重新開始。', resetConfirm: '確定全部刪除嗎？', resetConfirmNote: '再次按下即可刪除並開始新遊戲。', titleMenu: '標題選單', continue: '繼續', newGame: '新遊戲', start: '開始', settingsAction: '設定', help: '說明', exit: '離開', closeTab: '請關閉瀏覽器分頁。', confirmNew: '要重新開始嗎？', diaryWillErase: '目前日記將被刪除。',
  },
}

export function t(key: string, korean: string): string {
  if (currentLocale === 'ko') return korean
  return UI[currentLocale][key] ?? korean
}

export function applyLocaleToDocument(): void {
  if (typeof document === 'undefined') return
  document.documentElement.lang = currentLocale
  document.documentElement.dataset.locale = currentLocale
  document.title = currentLocale === 'ko' ? 'Little Token - 단어 조립 전투' : 'Little Token — Sentence Battle'
}
