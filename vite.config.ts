import { defineConfig, loadEnv } from 'vite'
import { resolve } from 'path'

// Vercel은 도메인 루트로 서빙하므로 base는 항상 '/'다.
export default defineConfig(({ mode }) => {
  const envRoot = resolve(__dirname, '.')
  const isDemo = loadEnv(mode, envRoot, '').VITE_APP_EDITION === 'demo'
  return {
  root: 'src',
  envDir: envRoot,
  base: '/',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'es2020',
    sourcemap: false,
    // Three.js 전장 렌더러는 첫 전투에서만 동적 로드되고 gzip 약 163KB다.
    // 원본 크기 경고 대신 scripts/check-bundle-budget.ts의 전송 크기 예산을 사용한다.
    chunkSizeWarningLimit: 700,
  },
  resolve: {
    alias: [
      {
        find: '@/assets/late',
        replacement: resolve(__dirname, isDemo ? './src/assets/late.demo.ts' : './src/assets/late.ts'),
      },
      { find: '@', replacement: resolve(__dirname, './src') },
      { find: '@core', replacement: resolve(__dirname, './src/core') },
      { find: '@data', replacement: resolve(__dirname, './src/data') },
      { find: '@views', replacement: resolve(__dirname, './src/views') },
    ],
  },
  server: { port: Number(process.env.PORT) || 3000, host: true },
  }
})
