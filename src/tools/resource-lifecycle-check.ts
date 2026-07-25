import { readFile, readdir } from 'node:fs/promises'
import { extname, relative, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '../..')
const SRC = resolve(ROOT, 'src')

interface Rule {
  label: string
  pattern: RegExp
  allowed: Record<string, number>
}

const rules: Rule[] = [
  {
    label: '이미지 로더는 ResourceLibrary 캐시를 사용해야 합니다',
    pattern: /\bnew\s+Image\s*\(/g,
    allowed: { 'src/ui/ResourceLibrary.ts': 1 },
  },
  {
    label: 'HTMLAudioElement 직접 생성 대신 GameAudio/Howler를 사용해야 합니다',
    pattern: /\bnew\s+Audio\s*\(/g,
    allowed: {},
  },
  {
    label: '비디오 요소는 ResourceLibrary 풀을 사용해야 합니다',
    pattern: /document\.createElement\(\s*['"]video['"]\s*\)/g,
    allowed: { 'src/ui/ResourceLibrary.ts': 1 },
  },
  {
    label: 'GLTFLoader는 모델 모듈의 공용 인스턴스만 사용해야 합니다',
    pattern: /\bnew\s+GLTFLoader\s*\(/g,
    allowed: { 'src/views/BattleCharacterModel.ts': 1 },
  },
  {
    label: 'WebGLRenderer 생성은 캐릭터 모델의 제한된 풀에서만 관리해야 합니다',
    pattern: /\bnew\s+THREE\.WebGLRenderer\s*\(/g,
    allowed: { 'src/views/BattleCharacterModel.ts': 1 },
  },
  {
    label: 'DOM 복제는 카드 사용 고스트 한 곳에서만 허용합니다',
    pattern: /\.cloneNode\s*\(/g,
    allowed: { 'src/ui/CardHand.ts': 1 },
  },
  {
    label: '인라인 비디오는 첫 부팅 시네마틱 한 곳에서만 허용합니다',
    pattern: /<video\b/g,
    allowed: { 'src/views/CinematicIntro.ts': 1 },
  },
  {
    label: 'FontFace 생성은 FontManager 단일 Promise 안에서만 허용합니다',
    pattern: /\bnew\s+FontFace\s*\(/g,
    allowed: { 'src/ui/FontManager.ts': 1 },
  },
  {
    label: '애니메이션 클립 복제는 정규화 캐시 내부에서만 허용합니다',
    pattern: /\bsource\.clone\s*\(/g,
    allowed: { 'src/views/BattleCharacterModel.ts': 1 },
  },
]

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const nested = await Promise.all(entries.map((entry) => {
    const path = resolve(dir, entry.name)
    return entry.isDirectory() ? walk(path) : Promise.resolve([path])
  }))
  return nested.flat()
}

const files = (await walk(SRC)).filter((file) =>
  extname(file) === '.ts' && file !== resolve(SRC, 'tools/resource-lifecycle-check.ts'),
)
const contents = new Map<string, string>()
await Promise.all(files.map(async (file) => {
  contents.set(relative(ROOT, file).split('\\').join('/'), await readFile(file, 'utf8'))
}))

const failures: string[] = []
for (const rule of rules) {
  const actual: Record<string, number> = {}
  for (const [file, source] of contents) {
    const count = [...source.matchAll(rule.pattern)].length
    if (count) actual[file] = count
  }
  const paths = new Set([...Object.keys(actual), ...Object.keys(rule.allowed)])
  for (const file of paths) {
    const count = actual[file] ?? 0
    const expected = rule.allowed[file] ?? 0
    if (count !== expected) failures.push(`${rule.label}: ${file} ${count}개 (허용 ${expected}개)`)
  }
}

if (failures.length) {
  failures.forEach((failure) => console.error(failure))
  process.exitCode = 1
} else {
  console.log('리소스 수명주기 검사 통과 — 직접 생성·복제 경로가 공용 라이브러리/허용 목록 안에 있습니다.')
}
