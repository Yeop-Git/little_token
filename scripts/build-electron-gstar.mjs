import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const project = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const electronVersion = JSON.parse(readFileSync(join(root, 'node_modules/electron/package.json'), 'utf8')).version
const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
const output = join(root, 'artifacts', `gstar-electron-${timestamp}`)
const web = join(output, 'web')
const stage = mkdtempSync(join(tmpdir(), 'little-token-gstar-'))
const runNode = (args, extraEnv = {}) => execFileSync(process.execPath, args, {
  cwd: root, stdio: 'inherit', env: { ...process.env, ...extraEnv },
})

// Windows ICO stores several PNG sizes so Explorer and the taskbar choose a sharp icon.
async function makeWindowsIcon(source, destination) {
  const sizes = [16, 24, 32, 48, 64, 128, 256]
  const images = await Promise.all(sizes.map((size) => sharp(source).resize(size, size).png().toBuffer()))
  const header = Buffer.alloc(6 + sizes.length * 16)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(sizes.length, 4)
  let offset = header.length
  images.forEach((image, index) => {
    const entry = 6 + index * 16
    header.writeUInt8(sizes[index] === 256 ? 0 : sizes[index], entry)
    header.writeUInt8(sizes[index] === 256 ? 0 : sizes[index], entry + 1)
    header.writeUInt16LE(1, entry + 4)
    header.writeUInt16LE(32, entry + 6)
    header.writeUInt32LE(image.length, entry + 8)
    header.writeUInt32LE(offset, entry + 12)
    offset += image.length
  })
  writeFileSync(destination, Buffer.concat([header, ...images]))
}

try {
  if (process.platform !== 'win32') throw new Error('이 빌드 스크립트는 Windows x64에서 실행해야 합니다.')
  if (existsSync(output)) throw new Error(`출력 폴더가 이미 있습니다: ${output}`)
  mkdirSync(output, { recursive: true })
  // Vite empties its output directory, so use a new timestamped directory for every build.
  runNode([join(root, 'node_modules/vite/bin/vite.js'), 'build', '--mode', 'gstar', '--outDir', web], {
    VITE_APP_EDITION: 'full', VITE_NO_PROGRESS_SAVE: '1',
  })
  runNode([join(root, 'node_modules/tsx/dist/cli.mjs'), join(root, 'scripts/check-bundle-budget.ts'), `--dist=${web}`, '--edition=full'])
  cpSync(web, join(stage, 'web'), { recursive: true })
  cpSync(join(root, 'electron/main.cjs'), join(stage, 'main.cjs'))
  const icon = join(stage, 'icon.ico')
  await makeWindowsIcon(join(root, 'src/assets/branding/little-token-icon-closeup.webp'), icon)
  writeFileSync(join(stage, 'package.json'), JSON.stringify({
    name: 'little-token-gstar', version: project.version, productName: 'Little Token G-STAR',
    main: 'main.cjs', private: true,
  }, null, 2))
  const { packager } = await import('@electron/packager')
  const paths = await packager({
    dir: stage, out: output, name: 'Little Token G-STAR', executableName: 'Little Token G-STAR',
    platform: 'win32', arch: 'x64', electronVersion, icon, prune: false, asar: false,
  })
  console.log(`\nElectron G-STAR 실행 파일: ${join(paths[0], 'Little Token G-STAR.exe')}`)
} finally {
  // Only remove the uniquely created staging directory inside the system temp directory.
  const stageRelative = relative(resolve(tmpdir()), resolve(stage))
  if (!stageRelative || stageRelative.startsWith('..') || isAbsolute(stageRelative)) {
    throw new Error(`임시 폴더 밖의 경로는 정리하지 않습니다: ${stage}`)
  }
  rmSync(stage, { recursive: true, force: true })
}
