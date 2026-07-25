/**
 * 한글 받침 판정 + 조사 부착. SPEC 5장.
 * 목적어에만 을/를을 붙인다(주어는 단어에 조사 포함).
 */

// 마지막 글자에 받침(종성)이 있으면 true.
export const hasJong = (w: string): boolean => {
  const c = w.charCodeAt(w.length - 1) - 0xac00
  if (c < 0 || c > 11171) return false // 한글 음절이 아니면 없음 취급
  return c % 28 !== 0
}

export const josa = (w: string, withJong: string, without: string): string =>
  w + (hasJong(w) ? withJong : without)

export const eul = (w: string): string => josa(w, '을', '를')

/** "나만은과 · 살짝과" — 카드 이름을 나열할 때 쓴다(여는 맥락 안내). */
export const gwa = (w: string): string => josa(w, '과', '와')
