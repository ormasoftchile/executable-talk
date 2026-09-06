import type { ResolvedAppearance } from '../models/appearance';

export function mermaidAppearance(appearance: ResolvedAppearance) {
  const palette = appearance.palette;
  return {
    theme: 'base' as const,
    darkMode: appearance.mode === 'dark',
    themeVariables: {
      background: palette.background, mainBkg: palette.surface,
      primaryColor: palette.surface, primaryTextColor: palette.text, primaryBorderColor: palette.border,
      secondaryColor: palette.primary, secondaryTextColor: appearance.onPrimary,
      tertiaryColor: palette.secondary, tertiaryTextColor: appearance.onSecondary,
      lineColor: appearance.connector, textColor: palette.text,
      clusterBkg: palette.surface, clusterBorder: palette.border,
      actorBkg: palette.surface, actorBorder: palette.border, actorTextColor: palette.text,
      noteBkgColor: palette.surface, noteTextColor: palette.text,
      edgeLabelBackground: palette.background, fontFamily: appearance.typography.fontFamily,
    },
  };
}