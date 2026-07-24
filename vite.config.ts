import { defineConfig } from 'vite'
import { resolve } from 'path'

// GitHub Pages는 저장소 이름 하위 경로로 서빙된다(github.io/TestGame001/).
// 액션 배포 시 이 base가 있어야 에셋 경로가 깨지지 않는다.
export default defineConfig({
  root: 'src',
  base: process.env.GITHUB_PAGES ? '/TestGame001/' : '/',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'es2020',
    sourcemap: false,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@core': resolve(__dirname, './src/core'),
      '@data': resolve(__dirname, './src/data'),
      '@views': resolve(__dirname, './src/views'),
    },
  },
  server: { port: 3000, host: true },
})
