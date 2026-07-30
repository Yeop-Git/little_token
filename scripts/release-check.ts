import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

interface PackageManifest {
  version?: string
}

interface LockManifest {
  version?: string
  packages?: Record<string, { version?: string }>
}

const root = resolve(import.meta.dirname, '..')
const allowDirty = process.argv.includes('--allow-dirty')
const npmExecPath = process.env.npm_execpath

const readJson = <T>(path: string): T => JSON.parse(readFileSync(resolve(root, path), 'utf8')) as T
const git = (args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
const run = (args: string[]) => {
  if (!npmExecPath) throw new Error('npm 실행 경로를 찾을 수 없습니다. npm run release:check로 실행하세요.')
  console.log(`\n> npm ${args.join(' ')}`)
  execFileSync(process.execPath, [npmExecPath, ...args], { cwd: root, stdio: 'inherit' })
}

const pkg = readJson<PackageManifest>('package.json')
const lock = readJson<LockManifest>('package-lock.json')
const versionText = readFileSync(resolve(root, 'VERSION.md'), 'utf8')
const documentedVersion = versionText.match(/현재 버전:\s*\*\*v_(\d+\.\d+\.\d+)\*\*/)?.[1]
const versions = {
  'package.json': pkg.version,
  'package-lock.json': lock.version,
  'package-lock root': lock.packages?.['']?.version,
  'VERSION.md': documentedVersion,
}
const distinctVersions = new Set(Object.values(versions))
if (distinctVersions.size !== 1 || !pkg.version || !/^\d+\.\d+\.\d+$/.test(pkg.version)) {
  throw new Error(`버전 불일치: ${Object.entries(versions).map(([name, value]) => `${name}=${value ?? '없음'}`).join(', ')}`)
}

const tag = `v_${pkg.version}`
let tagType = ''
try {
  tagType = git(['cat-file', '-t', `refs/tags/${tag}`])
} catch {
  throw new Error(`${tag} 태그가 없습니다.`)
}
if (tagType !== 'tag') throw new Error(`${tag}는 annotated Git tag가 아닙니다.`)

const head = git(['rev-parse', 'HEAD'])
const taggedCommit = git(['rev-list', '-n', '1', tag])
if (head !== taggedCommit) throw new Error(`${tag}가 현재 HEAD를 가리키지 않습니다.`)

const dirty = git(['status', '--porcelain', '--untracked-files=all'])
if (dirty && !allowDirty) {
  throw new Error('작업 트리가 깨끗하지 않습니다. 출시 커밋을 마친 뒤 다시 실행하세요.')
}
if (dirty) console.warn('주의: --allow-dirty로 작업 트리 청결 검사를 건너뜁니다.')

run(['test'])
git(['diff', '--exit-code', '--', 'src/data/generated'])
run(['run', 'build'])
run(['run', 'build:demo'])

console.log(`\n출시 검사 통과 — ${tag} · 생성물·현지화·전투·에셋·번들·치트 검사 완료`)
