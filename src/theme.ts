import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Theme follows the OS by default; a manual toggle stamps data-theme to override. */
export function useTheme(): [Theme, () => void] {
  const [override, setOverride] = useState<Theme | null>(null);
  const [system, setSystem] = useState<Theme>(systemTheme);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => setSystem(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  const theme = override ?? system;

  useEffect(() => {
    const root = document.documentElement;
    if (override) root.setAttribute('data-theme', override);
    else root.removeAttribute('data-theme');
  }, [override]);

  const toggle = useCallback(() => setOverride(theme === 'dark' ? 'light' : 'dark'), [theme]);
  return [theme, toggle];
}
