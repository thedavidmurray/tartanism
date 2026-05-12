import { useRef, useEffect, useState } from 'react';
import { renderTartanToCanvas } from '../utils/renderTartan';
import { WEAVE_PATTERNS } from '../core/weaves';
import type { WeaveType } from '../core/types';

const WEAVE_TYPES: WeaveType[] = [
  'plain',
  'twill-2-2',
  'twill-3-1',
  'herringbone',
  'houndstooth',
  'basketweave',
];

interface WeaveSelectorProps {
  threadcount: string;
  activeWeave: WeaveType;
  onChange: (weave: WeaveType) => void;
}

function WeaveThumb({
  threadcount,
  weaveType,
  isActive,
  onClick,
}: {
  threadcount: string;
  weaveType: WeaveType;
  isActive: boolean;
  onClick: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    if (canvasRef.current) {
      renderTartanToCanvas(canvasRef.current, threadcount, 120, weaveType);
      setRendered(true);
    }
  }, [threadcount, weaveType]);

  return (
    <button
      onClick={onClick}
      className="flex-shrink-0 group text-center min-w-[80px] sm:min-w-[96px]"
      style={{
        opacity: isActive ? 1 : 0.7,
        transitionProperty: 'opacity',
        transitionDuration: '200ms',
        transitionTimingFunction: 'ease-out',
      }}
      onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.opacity = '1'; }}
      onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.opacity = '0.7'; }}
    >
      {/* Outer: 20px radius with 4px effective padding from shadow = inner ~16px -> rounded-xl */}
      <div
        className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden"
        style={{
          boxShadow: isActive
            ? '0 0 0 2px var(--accent), 0 1px 3px rgba(0,0,0,0.08)'
            : 'var(--shadow-card)',
          transitionProperty: 'box-shadow',
          transitionDuration: '200ms',
          transitionTimingFunction: 'ease-out',
        }}
      >
        {!rendered && <div className="w-full h-full animate-shimmer" />}
        <canvas
          ref={canvasRef}
          className={`w-full h-full ${rendered ? '' : 'opacity-0 absolute'}`}
          style={{ imageRendering: 'pixelated' }}
        />
      </div>
      <span
        className="block mt-1.5 text-xs font-mono leading-tight"
        style={{
          color: isActive ? 'var(--text)' : 'var(--text-tertiary)',
          transitionProperty: 'color',
          transitionDuration: '200ms',
        }}
      >
        {WEAVE_PATTERNS[weaveType].name}
      </span>
    </button>
  );
}

export default function WeaveSelector({ threadcount, activeWeave, onChange }: WeaveSelectorProps) {
  return (
    <div>
      <h2 className="text-xs font-mono uppercase tracking-widest text-[var(--text-tertiary)] mb-3">
        Weave Structure
      </h2>
      <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
        {WEAVE_TYPES.map((wt) => (
          <WeaveThumb
            key={wt}
            threadcount={threadcount}
            weaveType={wt}
            isActive={activeWeave === wt}
            onClick={() => onChange(wt)}
          />
        ))}
      </div>
    </div>
  );
}
