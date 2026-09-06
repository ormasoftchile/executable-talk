import manifest from './appearanceManifest.json';

export type ColorMode = 'light' | 'dark';
export type ContrastMode = 'normal' | 'high';
export interface AppearancePreferences {
  style?: string;
  mode?: ColorMode | 'auto';
  contrast?: ContrastMode | 'auto';
}
export interface AppearanceMetadata {
  appearance?: AppearancePreferences;
  theme?: string;
  options?: { theme?: string };
}
export interface ResolvedAppearance {
  revision?: number;
  rendererVersions?: Record<string, string>;
  schemaVersion: 1;
  style: string;
  mode: ColorMode;
  contrast: ContrastMode;
  palette: typeof manifest.variants['light-normal']['palette'];
  connector: string;
  onPrimary: string;
  onSecondary: string;
  typography: typeof manifest.typography;
  font: typeof manifest.font;
  manifestHash: string;
  hash: string;
  warnings: string[];
}

export function resolveAppearance(
  metadata: AppearanceMetadata = {}, host: { kind: number } = { kind: 1 },
  workspace: AppearancePreferences = {}, session: AppearancePreferences = {},
): ResolvedAppearance {
  const warnings: string[] = [];
  const legacy = metadata.theme ?? metadata.options?.theme;
  if (metadata.theme && metadata.options?.theme && metadata.theme !== metadata.options.theme) {
    warnings.push('Conflicting legacy theme fields; top-level theme takes precedence.');
  }
  const legacyMode = legacy === 'light' ? 'light'
    : ['dark', 'minimal', 'contrast'].includes(legacy ?? '') ? 'dark' : undefined;
  const preferences: AppearancePreferences = {
    style: 'default', mode: 'auto', contrast: 'auto', ...validatedPreferences(workspace, warnings),
    ...(legacyMode ? { mode: legacyMode as ColorMode } : {}),
    ...(legacy === 'contrast' ? { contrast: 'high' as const } : {}),
    ...validatedPreferences(metadata.appearance, warnings), ...validatedPreferences(session, warnings),
  };
  const mode: ColorMode = preferences.mode === 'light' || preferences.mode === 'dark'
    ? preferences.mode : host.kind === 1 || host.kind === 4 ? 'light' : 'dark';
  const contrast: ContrastMode = preferences.contrast === 'normal' || preferences.contrast === 'high'
    ? preferences.contrast : host.kind === 3 || host.kind === 4 ? 'high' : 'normal';
  const selected = manifest.variants[`${mode}-${contrast}`];
  const style = 'default';
  if (preferences.style && preferences.style !== 'default') {
    warnings.push(`Slide style "${preferences.style}" is unavailable; using default.`);
  }
  const palette = { ...selected.palette };
  if (legacy === 'minimal' && !metadata.appearance?.style && !session.style && contrast !== 'high') {
    Object.assign(palette, { background: '#1a1a2e', surface: '#252536', text: '#e0e0e0',
      textMuted: '#b0b0b0', primary: '#7c7c7c', border: '#777777' });
  }
  return {
    schemaVersion: 1, style, mode, contrast, palette,
    connector: selected.connector, onPrimary: selected.onPrimary, onSecondary: selected.onSecondary,
    typography: { ...manifest.typography }, font: { ...manifest.font }, manifestHash: manifest.hash,
    hash: `${manifest.hash}:${style}:${mode}:${contrast}:${palette.background}`,
    warnings,
  };
}

export function appearanceCss(appearance: ResolvedAppearance): string {
  const palette = appearance.palette;
  return Object.entries({
    '--bg-color': palette.background, '--fg-color': palette.text,
    '--accent-color': palette.primary, '--accent-hover': palette.secondary,
    '--border-color': palette.border, '--success-color': palette.success,
    '--error-color': palette.error, '--running-color': palette.warning,
    '--appearance-muted': palette.textMuted, '--appearance-surface': palette.surface,
    '--appearance-on-accent': appearance.onPrimary,
    '--vscode-editor-background': palette.background, '--vscode-editor-foreground': palette.text,
    '--vscode-foreground': palette.text, '--vscode-panel-border': palette.border,
    '--vscode-descriptionForeground': palette.textMuted, '--vscode-textLink-foreground': palette.primary,
    '--vscode-textCodeBlock-background': palette.surface,
    '--appearance-font': appearance.typography.fontFamily,
  }).map(([key, value]) => `${key}:${value}`).join(';');
}

export function resolveExportAppearance(
  requested?: AppearancePreferences, snapshot?: ResolvedAppearance, current?: ResolvedAppearance,
): ResolvedAppearance {
  const base = snapshot ?? current;
  if (!requested) return base ?? resolveAppearance();
  return resolveAppearance({ appearance: {
    ...(base ? { style: base.style, mode: base.mode, contrast: base.contrast } : {}), ...requested,
  } }, { kind: base?.mode === 'dark' ? 2 : 1 });
}

function validatedPreferences(input: AppearancePreferences | undefined, warnings: string[]): AppearancePreferences {
  if (input === undefined) return {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    warnings.push('Appearance must be an object with style, mode, and contrast fields.');
    return {};
  }
  const result: AppearancePreferences = {};
  for (const key of ['style', 'mode', 'contrast'] as const) {
    const value = input[key];
    if (value === undefined) continue;
    const allowed = key === 'mode' ? ['auto', 'light', 'dark'] : ['auto', 'normal', 'high'];
    if (typeof value === 'string' && (key === 'style' ? value.length > 0 : allowed.includes(value))) {
      Object.assign(result, { [key]: value });
    } else warnings.push(`Invalid appearance.${key}; inheriting the next available preference.`);
  }
  return result;
}