'use client'
import React, { useCallback, useMemo, useState, useLayoutEffect } from 'react';

const themes = ['light', 'dark'];
const themeClassNamePrefix = 'dx-swatch-';
let currentTheme =  getNextTheme();

function getNextTheme(theme = '') {
  return themes[themes.indexOf(theme) + 1] || themes[0];
}

function getCurrentTheme() {
  return currentTheme;
}

function toggleTheme(prevTheme<%=#isTypeScript%>: string<%=/isTypeScript%>) {
  const isCurrentThemeDark = prevTheme === 'dark';
  const newTheme = getNextTheme(prevTheme);

  if (typeof window !== 'undefined') {
    document.body.classList.replace(
      themeClassNamePrefix + prevTheme,
      themeClassNamePrefix + newTheme
    );

    const additionalClassNamePrefix = themeClassNamePrefix + 'additional';
    const additionalClassNamePostfix = isCurrentThemeDark ? '-' + prevTheme : '';
    const additionalClassName = `${additionalClassNamePrefix}${additionalClassNamePostfix}`

    document.body
      .querySelector(`.${additionalClassName}`)?.classList
      .replace(additionalClassName, additionalClassNamePrefix + (isCurrentThemeDark ? '' : '-dark'));

    currentTheme = newTheme;
  }

  return newTheme;
}

export function useThemeContext() {
  const [theme, setTheme] = useState(getCurrentTheme());
  const switchTheme = useCallback(() => setTheme((currentTheme) => toggleTheme(currentTheme)), []);
  const isDark = useCallback(()<%=#isTypeScript%>: boolean<%=/isTypeScript%> => {
    return currentTheme === 'dark';
  }, []);

  useLayoutEffect(() => {
    if (typeof window !== 'undefined' && !document.body.className.includes(themeClassNamePrefix)) {
      document.body.classList.add(themeClassNamePrefix + theme);
    }
  }, [theme]);

  return useMemo(()=> ({ theme, switchTheme, isDark }), [theme, switchTheme, isDark]);
}

export const ThemeContext = React.createContext<%=#isTypeScript%><ReturnType<typeof useThemeContext> | null><%=/isTypeScript%>(null);

export const ThemeProvider = ({ children }<%=#isTypeScript%>: React.PropsWithChildren<%=/isTypeScript%>) => {
  const themeContext = useThemeContext();

  return (
    <ThemeContext.Provider value={themeContext}>
      { children }
    </ThemeContext.Provider>
  );
};
