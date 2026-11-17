/**
 * 초기 손패에 조건을 만족하는 카드가 없으면 덱의 첫 대상 카드와 교환한다.
 * 이미 섞인 순서는 가능한 한 유지해 나머지 카드의 무작위성을 바꾸지 않는다.
 */
export function ensureCardInInitialDraw<T>(
  words: T[],
  initialCount: number,
  predicate: (word: T) => boolean,
): T[] {
  const ordered = [...words]
  if (initialCount <= 0 || ordered.slice(0, initialCount).some(predicate)) return ordered

  const guaranteedIndex = ordered.findIndex((word, index) => index >= initialCount && predicate(word))
  if (guaranteedIndex < 0) return ordered

  ;[ordered[initialCount - 1], ordered[guaranteedIndex]] = [ordered[guaranteedIndex], ordered[initialCount - 1]]
  return ordered
}

