'use client';

import { useState, useCallback, useEffect } from 'react';
import SceneCanvas from '@/components/SceneCanvas';
import LandingPage from '@/components/LandingPage';

type Phase = 'intro' | 'transition' | 'landing';

export default function Home() {
  const [phase, setPhase] = useState<Phase>('intro');

  const handleTransition = useCallback(() => {
    if (phase !== 'intro') return;
    setPhase('transition');
  }, [phase]);

  // Unmount 3D after landing content has slid in
  useEffect(() => {
    if (phase !== 'transition') return;
    const timer = setTimeout(() => setPhase('landing'), 1000);
    return () => clearTimeout(timer);
  }, [phase]);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100svh', overflow: 'hidden', background: '#E8E8E8' }}>
      {/* 3D Scene — stays behind, no fade, just keeps rendering the empty wall */}
      {phase !== 'landing' && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 1 }}>
          <SceneCanvas onTransition={handleTransition} />
        </div>
      )}

      {/* Landing page — slides up over the 3D scene */}
      {phase !== 'intro' && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 2,
          animation: phase === 'transition' ? 'slideUpIn 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards' : undefined,
        }}>
          <LandingPage />
        </div>
      )}
    </div>
  );
}
