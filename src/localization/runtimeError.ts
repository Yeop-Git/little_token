import type { LocaleCode } from '@/localization'

export interface RuntimeErrorCopy {
  eyebrow: string
  title: string
  body: string
  reload: string
}

const COPY: Record<LocaleCode, RuntimeErrorCopy> = {
  ko: { eyebrow: '잉크가 번졌어', title: '화면을 이어 그리지 못했어', body: '진행 기록은 보관되어 있어. 페이지를 새로 불러오면 마지막 저장 지점부터 다시 이어 쓸 수 있어.', reload: '다시 불러오기' },
  en: { eyebrow: 'The ink spilled', title: 'The page could not be completed', body: 'Your progress is still saved. Reload the page to continue from the latest save.', reload: 'Reload page' },
  ja: { eyebrow: 'インクがにじんだ', title: '画面を描き続けられなかった', body: '進行記録は保存されているよ。ページを再読み込みすれば、最後の保存地点から続きを書ける。', reload: '再読み込み' },
  ru: { eyebrow: 'Чернила растеклись', title: 'Не удалось дорисовать экран', body: 'Прогресс сохранён. Перезагрузите страницу, чтобы продолжить с последнего сохранения.', reload: 'Перезагрузить' },
  'zh-Hans': { eyebrow: '墨水晕开了', title: '没能继续画完这个画面', body: '进度记录仍然保存着。重新加载页面后，可以从最近的存档继续。', reload: '重新加载' },
  'zh-Hant': { eyebrow: '墨水暈開了', title: '沒能繼續畫完這個畫面', body: '進度記錄仍然保存著。重新載入頁面後，可以從最近的存檔繼續。', reload: '重新載入' },
}

export function runtimeErrorText(locale: LocaleCode): RuntimeErrorCopy {
  return COPY[locale]
}
