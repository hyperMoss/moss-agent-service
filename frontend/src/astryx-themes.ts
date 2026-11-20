/**
 * Astryx 主题注册模块。
 * 可随时运行 `npx @astryxdesign/cli theme add <slug>` 自动更新或切换内置主题
 * （如 neutral / matcha / stone / butter / chocolate / gothic / y2k）。
 */
import '@astryxdesign/theme-neutral/theme.css';
import neutralTheme from '@astryxdesign/theme-neutral/built';

export const themes = {
  neutral: neutralTheme,
} as const;

export const defaultThemeSlug: keyof typeof themes = 'neutral';
