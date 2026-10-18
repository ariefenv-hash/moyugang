import React, { useEffect, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, WifiOff, X } from 'lucide-react';

/**
 * PWA 版本巡检与更新浮签（App 级常驻）：
 *  · 注册 Service Worker（prompt 策略：发现新版本由玩家定夺更新时机，避免战斗中被重启）
 *  · 自动巡检：每 30 分钟 registration.update()；页面回到前台时补查（5 分钟节流）
 *  · 发现新版本 → 朱印浮签「墨韵阁 · 新笺已至」，点击「立即更新」即换新重启
 *  · 首次缓存完毕 → 「墨已收齐 · 离线可战」轻提示，5 秒自散
 */
const CHECK_INTERVAL_MS = 30 * 60 * 1000;
const VISIBILITY_THROTTLE_MS = 5 * 60 * 1000;
const OFFLINE_TOAST_MS = 5000;

export const PwaUpdatePrompt: React.FC = () => {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [visible, setVisible] = useState(true);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const lastCheckRef = useRef(0);

  const { updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      registrationRef.current = registration ?? null;
    },
    onNeedRefresh() {
      setNeedRefresh(true);
      setVisible(true);
    },
    onOfflineReady() {
      setOfflineReady(true);
      setVisible(true);
    },
  });

  // 周期巡检 + 回前台补查（检查本身极轻量：仅重新拉取 sw.js 做字节比对）
  useEffect(() => {
    const check = async () => {
      const reg = registrationRef.current;
      if (!reg) return;
      const now = Date.now();
      if (now - lastCheckRef.current < VISIBILITY_THROTTLE_MS) return;
      lastCheckRef.current = now;
      try {
        await reg.update();
      } catch {
        /* 离线时检查失败属正常，静默 */
      }
    };
    const timer = window.setInterval(check, CHECK_INTERVAL_MS);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // 离线就绪提示自动散场
  useEffect(() => {
    if (!offlineReady || needRefresh) return;
    const t = window.setTimeout(() => setVisible(false), OFFLINE_TOAST_MS);
    return () => window.clearTimeout(t);
  }, [offlineReady, needRefresh]);

  if ((!needRefresh && !offlineReady) || !visible) return null;

  const dismiss = () => setVisible(false);

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[80] w-[min(92vw,26rem)] animate-fade-in">
      <div className="relative p-4 panel-paper shadow-2xl">
        <button
          onClick={dismiss}
          className="absolute top-2 right-2 p-1 text-ink-light hover:text-ink-strong cursor-pointer"
          aria-label="关闭"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-start gap-3">
          <span
            className={`seal w-9 h-9 flex items-center justify-center text-base font-bold shrink-0 ${
              needRefresh ? '' : 'seal-ghost'
            }`}
            aria-hidden="true"
          >
            {needRefresh ? '新' : '备'}
          </span>

          {needRefresh ? (
            <div className="flex-1 min-w-0">
              <p className="font-serif font-bold text-ink-strong text-sm flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5 text-cinnabar" />
                墨韵阁 · 新笺已至
              </p>
              <p className="text-xs text-ink-mid mt-1 leading-relaxed">
                检测到新版本墨卷，立即更新以续读最新篇章。更新将短暂重启游戏。
              </p>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => updateServiceWorker(true)}
                  className="btn-seal px-3 py-1.5 text-xs font-serif font-bold cursor-pointer"
                >
                  立即更新
                </button>
                <button
                  onClick={dismiss}
                  className="btn-ink px-3 py-1.5 text-xs font-serif cursor-pointer"
                >
                  稍后
                </button>
              </div>
            </div>
          ) : (
            <div className="flex-1 min-w-0">
              <p className="font-serif font-bold text-ink-strong text-sm flex items-center gap-1.5">
                <WifiOff className="w-3.5 h-3.5 text-daiqing" />
                墨已收齐 · 离线可战
              </p>
              <p className="text-xs text-ink-mid mt-1 leading-relaxed">
                全部篇章已收入行囊，断网亦可提笔征战。
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
