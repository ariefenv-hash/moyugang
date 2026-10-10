import React, { useRef, useState, useEffect } from 'react';

interface JoystickProps {
  onMove: (dx: number, dy: number) => void;
  onEnd: () => void;
  size?: number;
}

export const Joystick: React.FC<JoystickProps> = ({ onMove, onEnd, size = 110 }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [knobPos, setKnobPos] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(false);
  const touchIdRef = useRef<number | null>(null);

  const radius = size / 2;
  const maxDistance = radius * 0.75;

  const handlePointerDown = (clientX: number, clientY: number, id?: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.left + radius;
    const centerY = rect.top + radius;

    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const distance = Math.hypot(dx, dy);

    setActive(true);
    if (id !== undefined) touchIdRef.current = id;

    if (distance === 0) {
      setKnobPos({ x: 0, y: 0 });
      onMove(0, 0);
    } else {
      const clampedDist = Math.min(distance, maxDistance);
      const nx = (dx / distance) * clampedDist;
      const ny = (dy / distance) * clampedDist;
      setKnobPos({ x: nx, y: ny });
      onMove(nx / maxDistance, ny / maxDistance);
    }
  };

  const handlePointerMove = (clientX: number, clientY: number) => {
    if (!active || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.left + radius;
    const centerY = rect.top + radius;

    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const distance = Math.hypot(dx, dy);

    if (distance === 0) {
      setKnobPos({ x: 0, y: 0 });
      onMove(0, 0);
    } else {
      const clampedDist = Math.min(distance, maxDistance);
      const nx = (dx / distance) * clampedDist;
      const ny = (dy / distance) * clampedDist;
      setKnobPos({ x: nx, y: ny });
      onMove(nx / maxDistance, ny / maxDistance);
    }
  };

  const handlePointerUp = () => {
    setActive(false);
    touchIdRef.current = null;
    setKnobPos({ x: 0, y: 0 });
    onEnd();
  };

  return (
    <div
      ref={containerRef}
      style={{ width: size, height: size }}
      className="relative rounded-full bg-stone-950/70 border-2 border-stone-800/80 backdrop-blur-md flex items-center justify-center touch-none select-none shadow-2xl"
      onTouchStart={(e) => {
        const touch = e.touches[0];
        handlePointerDown(touch.clientX, touch.clientY, touch.identifier);
      }}
      onTouchMove={(e) => {
        if (touchIdRef.current === null) return;
        for (let i = 0; i < e.touches.length; i++) {
          if (e.touches[i].identifier === touchIdRef.current) {
            handlePointerMove(e.touches[i].clientX, e.touches[i].clientY);
            break;
          }
        }
      }}
      onTouchEnd={(e) => {
        handlePointerUp();
      }}
      onTouchCancel={handlePointerUp}
      onMouseDown={(e) => handlePointerDown(e.clientX, e.clientY)}
      onMouseMove={(e) => active && handlePointerMove(e.clientX, e.clientY)}
      onMouseUp={handlePointerUp}
      onMouseLeave={handlePointerUp}
    >
      {/* Direction guidelines */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
        <div className="w-full h-[1px] bg-stone-400" />
        <div className="absolute h-full w-[1px] bg-stone-400" />
      </div>

      {/* Center knob */}
      <div
        style={{
          transform: `translate(${knobPos.x}px, ${knobPos.y}px)`,
          transition: active ? 'none' : 'transform 0.15s ease-out',
        }}
        className="w-12 h-12 rounded-full bg-gradient-to-br from-stone-800 to-stone-900 border border-stone-600 shadow-xl flex items-center justify-center cursor-grab active:cursor-grabbing"
      >
        <div className="w-4 h-4 rounded-full bg-cyan-400/80 shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
      </div>
    </div>
  );
};
