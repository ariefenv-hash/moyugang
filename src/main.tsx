import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
// 书法三体（OFL 开源）：毛笔楷 / 行书 / 狂草，按 unicode-range 子集加载
import '@fontsource/ma-shan-zheng';
import '@fontsource/zhi-mang-xing';
import '@fontsource/liu-jian-mao-cao';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
