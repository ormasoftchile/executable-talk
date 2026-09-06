import * as vscode from 'vscode';

export type MermaidTheme = 'default' | 'dark' | 'neutral' | 'base';

export interface MermaidThemeConfig {
  theme: MermaidTheme;
  themeVariables: Record<string, string>;
  darkMode: boolean;
}

type MermaidThemeRequest = MermaidTheme | 'auto';
type VscodeThemeLike = vscode.ColorTheme | vscode.ColorThemeKind | string | undefined;

type ThemePalette = {
  background: string;
  foreground: string;
  border: string;
  accent: string;
  accentMuted: string;
  surface: string;
  surfaceAlt: string;
  line: string;
  link: string;
};

const LIGHT_PALETTE: ThemePalette = {
  background: '#ffffff',
  foreground: '#1f2328',
  border: '#d0d7de',
  accent: '#0969da',
  accentMuted: '#ddf4ff',
  surface: '#f6f8fa',
  surfaceAlt: '#eef2f6',
  line: '#57606a',
  link: '#0969da',
};

const DARK_PALETTE: ThemePalette = {
  background: '#1e1e1e',
  foreground: '#d4d4d4',
  border: '#3c3c3c',
  accent: '#4fc1ff',
  accentMuted: '#264f78',
  surface: '#252526',
  surfaceAlt: '#2d2d30',
  line: '#c5c5c5',
  link: '#4fc1ff',
};

const HIGH_CONTRAST_PALETTE: ThemePalette = {
  background: '#000000',
  foreground: '#ffffff',
  border: '#ffff00',
  accent: '#00ffff',
  accentMuted: '#000000',
  surface: '#000000',
  surfaceAlt: '#101010',
  line: '#ffffff',
  link: '#00ffff',
};

export function resolveMermaidTheme(
  requestedTheme?: string,
  vscodeTheme?: VscodeThemeLike,
): MermaidThemeConfig {
  const request = normalizeRequestedTheme(requestedTheme);
  const themeKind = resolveThemeKind(vscodeTheme);

  switch (request) {
    case 'dark':
      return buildThemeConfig('dark', DARK_PALETTE, true);
    case 'default':
      return buildThemeConfig('default', LIGHT_PALETTE, false);
    case 'neutral':
      return buildThemeConfig('neutral', HIGH_CONTRAST_PALETTE, isDarkKind(themeKind));
    case 'auto':
    default:
      return resolveAutoTheme(themeKind);
  }
}

function resolveAutoTheme(themeKind: vscode.ColorThemeKind): MermaidThemeConfig {
  switch (themeKind) {
    case vscode.ColorThemeKind.Light:
      return buildThemeConfig('default', LIGHT_PALETTE, false);
    case vscode.ColorThemeKind.HighContrast:
    case vscode.ColorThemeKind.HighContrastLight:
      return buildThemeConfig('neutral', HIGH_CONTRAST_PALETTE, themeKind === vscode.ColorThemeKind.HighContrast);
    case vscode.ColorThemeKind.Dark:
    default:
      return buildThemeConfig('dark', DARK_PALETTE, true);
  }
}

function buildThemeConfig(
  theme: MermaidTheme,
  palette: ThemePalette,
  darkMode: boolean,
): MermaidThemeConfig {
  return {
    theme,
    darkMode,
    themeVariables: {
      background: palette.background,
      mainBkg: palette.background,
      secondBkg: palette.surface,
      tertiaryBkg: palette.surfaceAlt,
      primaryColor: palette.background,
      primaryTextColor: palette.foreground,
      primaryBorderColor: palette.border,
      secondaryColor: palette.accentMuted,
      tertiaryColor: palette.link,
      lineColor: palette.line,
      textColor: palette.foreground,
      clusterBkg: palette.surface,
      clusterBorder: palette.border,
      actorBkg: palette.surface,
      actorBorder: palette.border,
      actorTextColor: palette.foreground,
      noteBkgColor: palette.surfaceAlt,
      noteTextColor: palette.foreground,
      edgeLabelBackground: palette.background,
      relationLabelColor: palette.foreground,
      signalColor: palette.foreground,
      sequenceNumberColor: palette.foreground,
      activationBorderColor: palette.border,
      activationBkgColor: palette.accent,
    },
  };
}

function normalizeRequestedTheme(theme?: string): MermaidThemeRequest {
  switch (theme) {
    case 'dark':
    case 'midnight':
      return 'dark';
    case 'contrast':
    case 'high-contrast':
    case 'highContrast':
      return 'neutral';
    case 'light':
    case 'default':
    case 'minimal':
    case 'blueprint':
    case 'editorial':
      return 'default';
    case 'neutral':
      return 'neutral';
    case 'auto':
    default:
      return 'auto';
  }
}

function resolveThemeKind(theme?: VscodeThemeLike): vscode.ColorThemeKind {
  if (typeof theme === 'object' && theme && 'kind' in theme) {
    return theme.kind;
  }

  if (typeof theme === 'number') {
    return theme;
  }

  switch (theme) {
    case 'light':
      return vscode.ColorThemeKind.Light;
    case 'contrast':
    case 'high-contrast':
    case 'highContrast':
      return vscode.ColorThemeKind.HighContrast;
    case 'dark':
    case 'midnight':
      return vscode.ColorThemeKind.Dark;
    default:
      return vscode.window.activeColorTheme?.kind ?? vscode.ColorThemeKind.Dark;
  }
}

function isDarkKind(themeKind: vscode.ColorThemeKind): boolean {
  return themeKind === vscode.ColorThemeKind.Dark || themeKind === vscode.ColorThemeKind.HighContrast;
}
