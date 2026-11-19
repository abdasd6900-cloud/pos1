import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useApp } from './app-context';
import { getPalette, type Palette } from './color-system';

interface ThemeValue {
  theme: 'light' | 'dark';
  colors: Palette;
  isDark: boolean;
  toggleTheme: () => void;
}

export const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { settings, updateSettings } = useApp();
  const theme = settings?.theme ?? 'light';
  const colors = useMemo(() => getPalette(theme), [theme]);
  const isDark = theme === 'dark';

  const toggleTheme = () => {
    updateSettings({ theme: isDark ? 'light' : 'dark' });
  };

  return (
    <ThemeContext.Provider value={{ theme, colors, isDark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
