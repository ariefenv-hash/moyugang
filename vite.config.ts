import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import {defineConfig} from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
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
