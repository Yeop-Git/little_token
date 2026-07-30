import { IS_DEMO } from '@/config/edition'
import { currentLocale, type LocaleCode } from '@/localization'

const STORAGE_KEY = IS_DEMO ? 'little-token.demo-combo-codex.v1' : 'little-token.combo-codex.v1'

type DiscoveryState = Partial<Record<LocaleCode, string[]>>

function readState(): DiscoveryState {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const state: DiscoveryState = {}
    for (const [locale, values] of Object.entries(parsed)) {
      if (!Array.isArray(values)) continue
      state[locale as LocaleCode] = [...new Set(values.filter((value): value is string => typeof value === 'string'))]
    }
    return state
  } catch {
    return {}
  }
}

function writeState(state: DiscoveryState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Discovery still works for the current battle when storage is unavailable.
  }
}

export function discoveredComboIds(locale: LocaleCode = currentLocale): Set<string> {
  return new Set(readState()[locale] ?? [])
}

/** Returns only IDs that became known in this call. */
export function discoverCombos(ids: readonly string[], locale: LocaleCode = currentLocale): string[] {
  const state = readState()
  const known = new Set(state[locale] ?? [])
  const discovered: string[] = []
  for (const id of ids) {
    if (known.has(id)) continue
    known.add(id)
    discovered.push(id)
  }
  if (discovered.length) {
    state[locale] = [...known]
    writeState(state)
  }
  return discovered
}

export function clearComboDiscoveries(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Restricted storage already behaves like an empty codex.
  }
}
