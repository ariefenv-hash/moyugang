import React from 'react';
import { Play, RotateCcw, Home, Volume2, VolumeX, PauseCircle } from 'lucide-react';

interface PauseOverlayProps {
  isMuted: boolean;
  onToggleMute: () => void;
  onResume: () => void;
  onRestart: () => void;
  onExit: () => void;
}

/** 战场暂停遮罩：水墨卷轴风菜单 */
export const PauseOverlay: React.FC<PauseOverlayProps> = ({
  isMuted,
  onToggleMute,
  onResume,
  onRestart,
  onExit,
}) => {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-stone-950/75 backdrop-blur-md animate-fade-in">
      <div className="max-w-xs w-full mx-4 p-6 bg-stone-900 border border-stone-700 rounded-3xl shadow-2xl text-center">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-stone-800 border border-stone-700 flex items-center justify-center mb-4">
          <PauseCircle className="w-7 h-7 text-amber-300" />
        </div>

        <h2 className="text-xl font-serif font-black tracking-widest text-stone-100">
          战局暂歇
        </h2>
        <p className="text-[11px] text-stone-400 font-serif mt-1 mb-5">
          墨韵凝驻 · 山河入定
        </p>

        <div className="space-y-2.5">
          <button
            onClick={onResume}
            className="w-full py-3 px-4 bg-amber-200 hover:bg-amber-100 text-stone-950 font-serif font-bold text-sm rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95"
          >
            <Play className="w-4 h-4 fill-stone-950" />
            继续征战
          </button>

          <button
            onClick={onRestart}
            className="w-full py-2.5 px-4 text-xs font-serif font-medium text-stone-200 bg-stone-800 hover:bg-stone-700 rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            重开此局
          </button>

          <button
            onClick={onToggleMute}
            className="w-full py-2.5 px-4 text-xs font-serif font-medium text-stone-300 bg-stone-800/60 hover:bg-stone-700 rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
          >
            {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            {isMuted ? '开启音效' : '静音音效'}
          </button>

          <button
            onClick={onExit}
            className="w-full py-2.5 px-4 text-xs font-serif font-medium text-stone-400 hover:text-stone-200 bg-transparent border border-stone-700 hover:border-stone-600 rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Home className="w-3.5 h-3.5" />
            撤离战场
          </button>
        </div>

        <p className="mt-4 text-[10px] text-stone-500">按 ESC / P 亦可继续</p>
      </div>
    </div>
  );
};
