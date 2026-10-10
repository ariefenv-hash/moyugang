import React from 'react';

interface FloatingJoystickProps {
  /** 摇杆底盘中心（屏幕坐标，相对画布容器） */
  baseX: number;
  baseY: number;
  /** 摇杆帽偏移 */
  knobX: number;
  knobY: number;
  /** 底盘直径 */
  size?: number;
}

/**
 * 浮动虚拟摇杆（仅负责视觉渲染）：
 * 指针在哪里按下，底盘便出现在哪里；松手即消失。
 * 输入向量的计算与 pointer 事件跟踪由 BattleView 统一驱动（支持多点触控）。
 */
export const FloatingJoystick: React.FC<FloatingJoystickProps> = ({
  baseX,
  baseY,
  knobX,
  knobY,
  size = 120,
}) => {
  return (
    <div
      className="absolute z-30 pointer-events-none"
      style={{
        left: baseX - size / 2,
        top: baseY - size / 2,
        width: size,
        height: size,
      }}
    >
      {/* 半透明底盘 */}
      <div className="absolute inset-0 rounded-full bg-stone-950/35 border-2 border-stone-100/25 backdrop-blur-[2px] shadow-2xl" />
      {/* 方位刻度 */}
      <div className="absolute inset-0 opacity-30 pointer-events-none">
        <div className="absolute left-1/2 top-1.5 -translate-x-1/2 w-0 h-0 border-x-[5px] border-x-transparent border-b-[8px] border-b-stone-200/80" />
        <div className="absolute left-1/2 bottom-1.5 -translate-x-1/2 w-0 h-0 border-x-[5px] border-x-transparent border-t-[8px] border-t-stone-200/80" />
        <div className="absolute top-1/2 left-1.5 -translate-y-1/2 w-0 h-0 border-y-[5px] border-y-transparent border-r-[8px] border-r-stone-200/80" />
        <div className="absolute top-1/2 right-1.5 -translate-y-1/2 w-0 h-0 border-y-[5px] border-y-transparent border-l-[8px] border-l-stone-200/80" />
      </div>
      {/* 摇杆帽 */}
      <div
        className="absolute rounded-full bg-gradient-to-br from-stone-700/95 to-stone-900/95 border border-stone-400/60 shadow-2xl flex items-center justify-center"
        style={{
          width: 52,
          height: 52,
          left: size / 2 - 26,
          top: size / 2 - 26,
          transform: `translate(${knobX}px, ${knobY}px)`,
        }}
      >
        <div className="w-[18px] h-[18px] rounded-full bg-cyan-300/90 shadow-[0_0_10px_rgba(34,211,238,0.9)]" />
      </div>
    </div>
  );
};
