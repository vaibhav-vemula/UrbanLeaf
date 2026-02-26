'use client';

import { useEffect, useRef } from 'react';

export default function CustomCursor() {
  const cursorGlowRef = useRef<HTMLDivElement>(null);
  const customCursorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const x = e.clientX;
      const y = e.clientY;

      // Check if cursor is over map
      const target = e.target as HTMLElement;
      const isOverMap = target.closest('.mapboxgl-canvas-container, .mapboxgl-canvas');

      // Update cursor elements directly without re-rendering
      if (cursorGlowRef.current) {
        cursorGlowRef.current.style.left = `${x}px`;
        cursorGlowRef.current.style.top = `${y}px`;
        cursorGlowRef.current.style.display = isOverMap ? 'none' : 'block';
      }
      if (customCursorRef.current) {
        customCursorRef.current.style.left = `${x}px`;
        customCursorRef.current.style.top = `${y}px`;
        customCursorRef.current.style.display = isOverMap ? 'none' : 'block';
      }
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <>
      {/* Cursor Glow Effect */}
      <div
        ref={cursorGlowRef}
        className="fixed pointer-events-none z-[100]"
        style={{
          left: 0,
          top: 0,
          transform: 'translate(-50%, -50%)',
          willChange: 'left, top',
        }}
      >
        <div className="absolute w-80 h-80 rounded-full bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-emerald-500/10 blur-[80px]"
             style={{ transform: 'translate(-50%, -50%)' }}></div>
        <div className="absolute w-56 h-56 rounded-full bg-gradient-to-r from-emerald-400/15 via-teal-400/15 to-emerald-400/15 blur-[50px]"
             style={{ transform: 'translate(-50%, -50%)' }}></div>
        <div className="absolute w-32 h-32 rounded-full bg-gradient-to-r from-emerald-300/20 via-teal-300/20 to-emerald-300/20 blur-[30px]"
             style={{ transform: 'translate(-50%, -50%)' }}></div>
      </div>

      {/* Custom Cursor */}
      <div
        ref={customCursorRef}
        className="fixed pointer-events-none z-[101]"
        style={{
          left: 0,
          top: 0,
          transform: 'translate(-50%, -50%)',
          willChange: 'left, top',
        }}
      >
        <div className="w-4 h-4 bg-emerald-400 rounded-full opacity-80"></div>
      </div>
    </>
  );
}
