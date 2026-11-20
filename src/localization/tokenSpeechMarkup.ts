/**
 * 토큰 말풍선 대사 표식의 순수 규칙 — 브라우저 없이 현지화 검사에서도 쓴다.
 * 표식 문법은 src/ui/TokenSpeech.ts 머리말 참고.
 */
export type SpeechTagKind = 'atk' | 'guard' | 'heal' | 'ink' | 'slot' | 'kw' | 'emo'

export const SPEECH_TAG_KINDS = new Set<SpeechTagKind>(['atk', 'guard', 'heal', 'ink', 'slot', 'kw', 'emo'])

/** 표식을 걷어 낸 읽기용 평문. 수명 계산과 검사에 쓴다. */
export function tokenSpeechPlain(text: string): string {
  return text
    .replace(/\*\*/g, '')
    .replace(/\[\[(?:([a-z]+):)?([^\]]+)\]\]/g, (_, _kind, term: string) => term)
    .replace(/\n/g, ' ')
}

/** 다 읽을 시간 — 기본 2.6초에 글자당 70ms, 3.4~7초 사이. */
export function speechLifeMs(text: string, tone: 'calm' | 'warn' | 'relief'): number {
  const length = [...tokenSpeechPlain(text).replace(/\s+/g, '')].length
  const base = Math.min(7000, Math.max(3400, 2600 + length * 70))
  return tone === 'relief' ? base + 400 : base
}

/** 표식 검사 — 짝이 안 맞는 `**`·`[[`, 모르는 태그 종류. 현지화 검사가 부른다. */
export function tokenSpeechMarkupErrors(text: string): string[] {
  const errors: string[] = []
  if ((text.match(/\*\*/g) ?? []).length % 2) errors.push('unbalanced **')
  if ((text.match(/\[\[/g) ?? []).length !== (text.match(/\]\]/g) ?? []).length) errors.push('unbalanced [[ ]]')
  for (const match of text.matchAll(/\[\[([a-z]+):/g)) {
    if (!SPEECH_TAG_KINDS.has(match[1] as SpeechTagKind)) errors.push(`unknown tag kind ${match[1]}`)
  }
  return errors
}
