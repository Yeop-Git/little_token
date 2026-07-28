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

const LOCALE_SET = new Set<string>(SUPPORTED_LOCALES)

function readLocale(): LocaleCode {
  if (typeof localStorage === 'undefined') return 'ko'
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
    playerName: 'From', tokenName: 'Token',
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
    playerName: 'フロム', tokenName: 'トークン',
    settings: '設定', close: '閉じる', settingsCategories: '設定項目', graphics: 'グラフィック', sound: 'サウンド', other: 'その他', language: '言語',
    languageHint: '言語を変更するとページを再読み込みします。', qualityPreset: '品質プリセット', qualityPresetHint: '詳細をまとめて設定',
    resolution: '解像度', resolutionHint: 'キャラクター描画倍率', maxFps: '最大FPS', fpsHint: '描画更新頻度', effects: 'エフェクト', effectsHint: '紙片・火花の密度',
    postprocessing: 'ポストプロセス', postprocessingHint: 'ぼかし・色・ビネット', antialiasing: 'アンチエイリアス', antialiasingHint: 'キャラクターの輪郭',
    low: '低', medium: '中', high: '高', ultra: 'ウルトラ', off: 'オフ', unlimited: '無制限', masterVolume: 'マスター音量', volumeHint: 'BGMと効果音の音量をまとめて調整します。',
    playRecords: 'プレイ記録', startOver: '最初から', resetAll: 'すべての記録を消して新しく始める', resetNote: '進行中の日記とチュートリアル記録を消し、チュートリアルから始めます。',
    resetConfirm: '本当にすべて消しますか？', resetConfirmNote: 'もう一度押すと削除して新しく始めます。', titleMenu: 'タイトルメニュー', continue: 'つづきから', newGame: 'はじめから', start: 'スタート', settingsAction: '設定', help: 'ヘルプ', exit: '終了', closeTab: 'ブラウザーのタブを閉じてください。', confirmNew: '最初から始めますか？', diaryWillErase: 'これまでの日記が消えます。',
  },
  ru: {
    playerName: 'Фром', tokenName: 'Токен',
    settings: 'Настройки', close: 'Закрыть', settingsCategories: 'Разделы настроек', graphics: 'Графика', sound: 'Звук', other: 'Другое', language: 'Язык',
    languageHint: 'После смены языка страница перезагрузится.', qualityPreset: 'Профиль качества', qualityPresetHint: 'Настроить всё сразу', resolution: 'Разрешение', resolutionHint: 'Масштаб персонажей', maxFps: 'Макс. FPS', fpsHint: 'Частота обновления', effects: 'Эффекты', effectsHint: 'Плотность искр и обрывков', postprocessing: 'Постобработка', postprocessingHint: 'Размытие, цвет и виньетка', antialiasing: 'Сглаживание', antialiasingHint: 'Края персонажей', low: 'Низко', medium: 'Средне', high: 'Высоко', ultra: 'Ультра', off: 'Выкл.', unlimited: 'Без ограничений', masterVolume: 'Общая громкость', volumeHint: 'Общая громкость музыки и звуков.', playRecords: 'Игровые записи', startOver: 'Начать сначала', resetAll: 'Удалить все записи и начать заново', resetNote: 'Удаляет текущий дневник и обучение и запускает обучение заново.', resetConfirm: 'Удалить всё?', resetConfirmNote: 'Нажмите ещё раз, чтобы удалить всё и начать заново.', titleMenu: 'Главное меню', continue: 'Продолжить', newGame: 'Новая игра', start: 'Начать', settingsAction: 'Настройки', help: 'Помощь', exit: 'Выход', closeTab: 'Закройте вкладку браузера.', confirmNew: 'Начать сначала?', diaryWillErase: 'Текущий дневник будет стёрт.',
  },
  'zh-Hans': {
    playerName: '弗洛姆', tokenName: '托肯',
    settings: '设置', close: '关闭', settingsCategories: '设置分类', graphics: '画面', sound: '声音', other: '其他', language: '语言', languageHint: '更改语言后页面将重新加载。', qualityPreset: '画质预设', qualityPresetHint: '一次设置全部选项', resolution: '分辨率', resolutionHint: '角色渲染倍率', maxFps: '最高 FPS', fpsHint: '画面刷新频率', effects: '特效', effectsHint: '碎片与火花密度', postprocessing: '后期处理', postprocessingHint: '模糊、色彩与暗角', antialiasing: '抗锯齿', antialiasingHint: '角色边缘', low: '低', medium: '中', high: '高', ultra: '极高', off: '关闭', unlimited: '无限制', masterVolume: '主音量', volumeHint: '调整背景音乐和音效的整体音量。', playRecords: '游戏记录', startOver: '重新开始', resetAll: '删除全部记录并开始新游戏', resetNote: '删除当前日记和教程记录，并从教程重新开始。', resetConfirm: '确定全部删除吗？', resetConfirmNote: '再次按下即可删除并开始新游戏。', titleMenu: '标题菜单', continue: '继续', newGame: '新游戏', start: '开始', settingsAction: '设置', help: '帮助', exit: '退出', closeTab: '请关闭浏览器标签页。', confirmNew: '要重新开始吗？', diaryWillErase: '当前日记将被删除。',
  },
  'zh-Hant': {
    playerName: '弗洛姆', tokenName: '托肯',
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
