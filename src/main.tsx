import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
// 书法三体（OFL 开源）：毛笔楷 / 行书 / 狂草，按 unicode-range 子集加载
import '@fontsource/ma-shan-zheng';
import '@fontsource/zhi-mang-xing';
import '@fontsource/liu-jian-mao-cao';
import './index.css';
// PWA：注册 Service Worker（autoUpdate 策略，新版本在下次访问时静默生效）
import {registerSW} from 'virtual:pwa-register';

registerSW({immediate: true});

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
