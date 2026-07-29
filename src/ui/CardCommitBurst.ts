const COMMIT_BURST_PIECES = 18
const commitBurstPool: HTMLElement[] = []

function acquireCommitBurst(): HTMLElement {
  const pooled = commitBurstPool.pop()
  if (pooled) {
    pooled.getAnimations({ subtree: true }).forEach((animation) => animation.cancel())
    return pooled
  }
  const burst = document.createElement('span')
  burst.className = 'card-commit-burst'
  burst.setAttribute('aria-hidden', 'true')
  for (let i = 0; i < COMMIT_BURST_PIECES; i += 1) {
    const piece = document.createElement('i')
    const angle = (360 / COMMIT_BURST_PIECES) * i + (i % 2) * 7
    const distance = 92 + (i % 5) * 18
    piece.style.setProperty('--burst-angle', `${angle}deg`)
    piece.style.setProperty('--burst-distance', `${distance}px`)
    piece.style.setProperty('--burst-delay', `${(i % 3) * 12}ms`)
    burst.append(piece)
  }
  return burst
}

function releaseCommitBurst(burst: HTMLElement) {
  burst.remove()
  if (commitBurstPool.length < 3) commitBurstPool.push(burst)
}

/** 전투 카드 확정과 아이템 제련이 공유하는 광환·충격파·방사 파편. */
export function spawnCardCommitBurst(host: HTMLElement, x: number, y: number, color: string) {
  const burst = acquireCommitBurst()
  burst.style.left = `${x.toFixed(1)}px`
  burst.style.top = `${y.toFixed(1)}px`
  burst.style.setProperty('--burst-color', color || '#ffe3a1')
  host.append(burst)
  window.setTimeout(() => releaseCommitBurst(burst), 720)
  return burst
}
