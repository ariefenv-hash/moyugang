import React from 'react';
import { Play, RotateCcw, Home, Volume2, VolumeX } from 'lucide-react';

interface PauseOverlayProps {
  isMuted: boolean;
  onToggleMute: () => void;
  onResume: () => void;
  onRestart: () => void;
  onExit: () => void;
}

/** 战场暂停遮罩：装裱立轴式卷轴菜单 */
export const PauseOverlay: React.FC<PauseOverlayProps> = ({
  isMuted,
  onToggleMute,
  onResume,
  onRestart,
  onExit,
}) => {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-ink-strong/78 backdrop-blur-sm animate-fade-in">
      <div className="max-w-xs w-full mx-4 p-7 scroll-mount-thin text-center text-ink">
        {/* 天头：印与题名 */}
        <div className="seal w-12 h-12 mx-auto flex items-center justify-center mb-4 animate-seal-stamp" aria-hidden="true">
          <span className="text-xl font-bold font-serif">歇</span>
        </div>

        <h2 className="text-xl font-serif font-black tracking-widest text-ink-strong">
          战局暂歇
        </h2>
        <p className="text-[11px] text-ink-mid font-serif mt-1.5 mb-6 tracking-wider">
          墨韵凝驻 · 山河入定
        </p>

        <div className="space-y-2.5">
          <button
            onClick={onResume}
            className="btn-seal w-full py-3 px-4 font-serif font-bold text-sm tracking-widest flex items-center justify-center gap-2 cursor-pointer"
          >
            <Play className="w-4 h-4 fill-current" />
            继续征战
          </button>

          <button
            onClick={onRestart}
            className="btn-ink w-full py-2.5 px-4 text-xs font-serif tracking-widest flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            重开此局
          </button>

          <button
            onClick={onToggleMute}
            className="btn-ink w-full py-2.5 px-4 text-xs font-serif tracking-widest flex items-center justify-center gap-1.5 cursor-pointer"
          >
            {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            {isMuted ? '开启音效' : '静音音效'}
          </button>

          <button
            onClick={onExit}
            className="btn-ink-quiet w-full py-2.5 px-4 text-xs font-serif tracking-widest flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Home className="w-3.5 h-3.5" />
            撤离战场
          </button>
        </div>

        <p className="mt-5 pt-3 border-t rule-ink text-[10px] text-ink-light tracking-wider">
          按 ESC / P 亦可继续
        </p>
      </div>
    </div>
  );
};
