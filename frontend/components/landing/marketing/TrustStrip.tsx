'use client';

import { useEffect, useRef, useState } from 'react';
import { landingStatsAnimated } from './marketing-config';

function useCountUp(target: number, active: boolean): number {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!active) return;
    const duration = 1200;
    const start = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased));
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, target]);

  return value;
}

function Counter({ target, label }: { target: number; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const value = useCountUp(target, active);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setActive(true);
          observer.disconnect();
        }
      },
      { threshold: 0.6 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="m-zahl" ref={ref}>
      <b>{value.toLocaleString('de-DE')}</b>
      <span>{label}</span>
    </div>
  );
}

export function TrustStrip() {
  const stats = landingStatsAnimated();

  return (
    <div className="m-trust">
      <div className="m-wrap m-trust-inner">
        <div className="m-trust-claim">
          Entwickelt mit einem Spediteur — <span>70 Fahrzeuge, 20 Jahre Erfahrung</span>
        </div>
        <div className="m-zahlen">
          <Counter target={stats.vehicles} label="Fahrzeuge im System" />
          <Counter target={stats.documents} label="Dokumente verarbeitet" />
          <Counter target={stats.alerts} label="Fristen-Warnungen gesendet" />
        </div>
      </div>
    </div>
  );
}
