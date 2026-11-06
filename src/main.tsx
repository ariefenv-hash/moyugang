import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { MotionConfig } from 'motion/react';
import { ErrorBoundary } from './components/ErrorBoundary';
// 书法三体（OFL 开源）：毛笔楷 / 行书 / 狂草，按 unicode-range 子集加载
import '@fontsource/ma-shan-zheng';
import '@fontsource/zhi-mang-xing';
import '@fontsource/liu-jian-mao-cao';
import './index.css';
// PWA 注册由 <PwaUpdatePrompt/>（useRegisterSW）统一管理：自动巡检新版本 + 更新浮签

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    {/* 无障碍降级第肆例（Task 57）：MotionConfig reducedMotion="user" 接通
        prefers-reduced-motion——位置键（x/y/scale/rotate 等 transform 面与
        layout 动画）瞬时到位，非位置键（opacity 淡入）保持动画（去位移、
        留淡入，motion-dom positionalKeys 源码口径）。live 切换语义：新挂载
        元素即时生效，在途/已完成动画不追溯（VisualElement 构造期定终身）。
        Context 全树生效，覆盖 App 下全部六组件 motion 使用面（主菜单入场/
        ChapterSelect/BlessingModal/PavilionArchive/StoryIntroModal/
        AchievementToast）；ErrorBoundary 无 motion 依赖，包裹于其内无覆盖
        缺口。验证见 verify_reduced_motion_motion.py。 */}
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </ErrorBoundary>
);
