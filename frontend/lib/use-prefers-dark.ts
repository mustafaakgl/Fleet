'use client';

import { useEffect, useState } from 'react';

export function usePrefersDark(): boolean {
  const [prefersDark, setPrefersDark] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setPrefersDark(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return prefersDark;
}
