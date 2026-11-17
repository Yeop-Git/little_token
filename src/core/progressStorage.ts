/** G-STAR keeps progress only for the lifetime of this page. */
const memory = new Map<string, string>()
const transientStorage: Storage = {
  get length() { return memory.size },
  clear: () => memory.clear(),
  getItem: (key) => memory.get(key) ?? null,
  key: (index) => [...memory.keys()][index] ?? null,
  removeItem: (key) => { memory.delete(key) },
  setItem: (key, value) => { memory.set(key, String(value)) },
}

export const NO_PROGRESS_SAVE = import.meta.env?.VITE_NO_PROGRESS_SAVE === '1'

export function progressStorage(): Storage | null {
  if (NO_PROGRESS_SAVE) return transientStorage
  try { return typeof localStorage === 'undefined' ? null : localStorage } catch { return null }
}
