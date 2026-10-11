import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      // PWA：可安装 + 离线可玩（precache 全部构建产物；架构仍为 Vite，未迁移 Next.js）
      // prompt 策略：发现新版本弹出「墨韵阁 · 新笺已至」浮签，由玩家确认后再换新重启
      VitePWA({
        registerType: 'prompt',
        includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
        manifest: {
          id: '/',
          name: '墨韵战纪：风雅篇',
          short_name: '墨韵战纪',
          description:
            '文艺优雅的水墨火柴人战争策略游戏。操控风雅剑仙，施展落墨剑气、星河笔阵与山河绝技，以字诀为印、以笔锋为兵，征战五大诗意关卡，更有无尽试炼等你坚守。',
          lang: 'zh-CN',
          dir: 'ltr',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'any',
          background_color: '#1f2629',
          theme_color: '#1f2629',
          categories: ['games', 'entertainment'],
          icons: [
            {src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml'},
            {src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png'},
            {src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png'},
            {
              src: '/icons/maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          // 字体/图片/音频全在本地构建产物内，全量预缓存即完全离线可玩
          globPatterns: ['**/*.{js,css,html,svg,png,jpg,woff2}'],
          navigateFallback: '/index.html',
          maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
          cleanupOutdatedCaches: true,
        },
        // dev server 也注入 manifest 与 SW，便于预览链路直接体验安装
        devOptions: {
          enabled: true,
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    // 仅扫描应用自身入口，避免沙盒附带的 skills/ 等目录干扰依赖预构建
    optimizeDeps: {
      entries: ['index.html', 'src/**/*.{ts,tsx}'],
    },
    server: {
      // 允许通过 IM 预览网关域名（fcapp.run 子域）访问 dev server，
      // 前导点写法允许该后缀下的所有子域名，避免预览 host 变化后再报 Blocked request
      allowedHosts: ['.fcapp.run', 'localhost', '127.0.0.1'],
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {
        ignored: ['**/skills/**', '**/upload/**', '**/download/**', '**/tool-results/**'],
      },
    },
  };
});
