import { useEffect, useState } from 'react';

const THEME_STORAGE_KEY = 'visaworldTheme';

const useTheme = (defaultTheme = 'dark') => {
  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') {
      return defaultTheme;
    }
    return localStorage.getItem(THEME_STORAGE_KEY) || defaultTheme;
  });

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  return [theme, setTheme];
};

export default useTheme;
