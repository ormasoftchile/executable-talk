/**
 * vendor-triton.mjs — builds a self-contained Triton ESM island.
 *
 * Triton cannot be inlined into the CJS extension bundle (import.meta.url
 * usage). Instead we bundle only the Mermaid-facing Triton entry points into
 * dist/vendor/triton/index.js and load that file lazily via dynamic import().
 *
 * We deliberately shim @resvg/resvg-js during vendoring: Deckpilot only asks
 * Triton for SVG output, but Triton's Mermaid entry point statically references
 * its PNG path. The shim keeps the bundle self-contained without dragging in
 * native .node bindings that cannot be embedded by esbuild.
 *
 * Source: resolved from the published npm package when installed, or from the
 * sibling triton project directly for local development.
 *
 * Usage:
 *   npm run vendor-triton
 */

import { build } from 'esbuild';
import { mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Resolve source: prefer installed package locations, fall back to sibling project.
// Support both the published package name and the historical local alias so
// older environments keep working.
const installedPackageNames = [
  ['@cristianormazabal', 'triton-core'],
  ['@triton', 'core'],
];
const installedSources = installedPackageNames.flatMap(([scope, name]) => ([
  resolve(__dirname, '..', 'node_modules', scope, name, 'dist'),
  resolve(__dirname, '..', '..', '..', 'node_modules', scope, name, 'dist'),
]));
const siblingSource = resolve(__dirname, '..', '..', '..', '..', 'triton', 'packages', 'core', 'dist');

// Local-development override. When debugging Triton changes end-to-end we must
// vendor from the local Triton checkout, NOT the published npm package.
//   TRITON_CORE_DIST=/abs/path/to/triton/packages/core/dist  → explicit source
//   TRITON_LOCAL=1                                            → prefer sibling checkout
// Both move the local source to the FRONT of the candidate list so it wins over
// any installed @cristianormazabal/triton-core. Normal builds/CI are unaffected.
const explicitLocal = process.env.TRITON_CORE_DIST
  ? [resolve(process.env.TRITON_CORE_DIST)]
  : [];
const preferLocal = process.env.TRITON_LOCAL === '1' || process.env.TRITON_LOCAL === 'true';

const candidateSources = preferLocal || explicitLocal.length > 0
  ? [...explicitLocal, siblingSource, ...installedSources]
  : [...installedSources, siblingSource];
const source = candidateSources.find((candidate) => existsSync(candidate));

if (source && (preferLocal || explicitLocal.length > 0)) {
  console.log('[vendor-triton] LOCAL mode — vendoring Triton from', source);
}

if (!source) {
  console.error('[vendor-triton] Could not find Triton dist at:');
  for (const candidate of installedSources) {
    console.error('  ' + candidate);
  }
  console.error('  ' + siblingSource);
  console.error('Install dependencies or build the sibling Triton checkout first.');
  process.exit(1);
}

const dest = resolve(__dirname, '..', 'dist', 'vendor', 'triton');
const entryPoint = resolve(source, 'index.js');
const runtimeRevision = createHash('sha256').update(await readFile(entryPoint)).digest('hex');

const resvgShimPlugin = {
  name: 'resvg-shim',
  setup(pluginBuild) {
    pluginBuild.onResolve(
      { filter: /^@resvg\/resvg-js$/ },
      () => ({ path: '@resvg/resvg-js', namespace: 'resvg-shim' }),
    );
    pluginBuild.onLoad(
      { filter: /.*/, namespace: 'resvg-shim' },
      () => ({
        contents: `
          export class Resvg {
            constructor() {
              throw new Error('PNG rendering is unavailable in the Deckpilot Triton vendor bundle.');
            }
          }
        `,
        loader: 'js',
      }),
    );
  },
};

await rm(dest, { recursive: true, force: true });
await mkdir(dest, { recursive: true });
await build({
  stdin: {
    contents: `
      import * as runtime from ${JSON.stringify(entryPoint)};
      import { createHash } from 'node:crypto';
      const { compileSync, renderSync, compileAndRenderSync, embedRevealManifest } = runtime;
      const runtimeRevision = ${JSON.stringify(runtimeRevision)};
      const appearanceManifestHash = runtime.defaultAppearanceManifest
        ? createHash('sha256').update(JSON.stringify(runtime.defaultAppearanceManifest)).digest('hex') : undefined;

      const THEME_ALIASES = {
        dark: 'midnight',
        light: 'default',
        contrast: 'showcase',
        auto: 'midnight',
        midnight: 'showcase',
        blueprint: 'consulting',
        editorial: 'minimal',
      };

      function resolveThemeName(theme) {
        if (!theme) {
          return undefined;
        }
        return THEME_ALIASES[theme] ?? theme;
      }

      function injectTheme(text, theme) {
        const resolvedTheme = resolveThemeName(theme);
        if (!resolvedTheme) {
          return text;
        }
        return text.startsWith('---\\n')
          ? text.replace(/^---\\n([\\s\\S]*?)\\n---\\n?/, (_match, frontmatter) => {
              const lines = frontmatter.split(/\\r?\\n/);
              let replaced = false;
              const next = lines.map((line) => {
                if (/^\\s*theme\\s*:/.test(line)) {
                  replaced = true;
                  return 'theme: ' + resolvedTheme;
                }
                return line;
              });
              if (!replaced) {
                next.push('theme: ' + resolvedTheme);
              }
              return '---\\n' + next.join('\\n') + '\\n---\\n';
            })
          : '---\\ntheme: ' + resolvedTheme + '\\n---\\n' + text;
      }

      function detectDiagramType(text) {
        const result = compileSync(text);
        return result.ok ? 'known' : 'unknown';
      }

      function renderMermaid(text, options = {}) {
        if (options.appearance) {
          if (!runtime.resolveThemeFamily || !runtime.renderSVG) {
            const fallback = renderMermaid(text, { theme: options.appearance.mode === 'dark' ? 'showcase' : 'default' });
            return { ...fallback, warnings: [...(fallback.warnings ?? []), 'Installed Triton uses a legacy palette on an opaque canvas; update the companion for adaptive appearance.'] };
          }
          const appearance = options.appearance;
          const selected = runtime.resolveThemeFamily(resolveThemeName(options.style ?? 'default'), options.mode ?? appearance.mode, appearance.contrast);
          const result = compileSync(text, selected.theme, selected.style);
          if (!result.ok) return { warnings: [result.error.message] };
          const compatible = selected.theme.palette.background.toLowerCase() === appearance.palette.background.toLowerCase()
            && selected.mode === appearance.mode && selected.contrast === appearance.contrast;
          const backgroundPainted = options.surface === 'opaque' || !compatible;
          const warnings = [...selected.warnings];
          if (options.surface === 'transparent' && !compatible) warnings.push('Incompatible transparent diagram; preserving an opaque canvas for readability.');
          if (appearanceManifestHash !== appearance.manifestHash) warnings.push('Host and Triton appearance manifests differ; rebuild matching versions.');
          let svg = runtime.renderSVG(result.value.scene, {
            background: backgroundPainted ? 'opaque' : 'transparent',
            fonts: options.fontRevision === runtime.defaultAppearanceManifest.font.revision ? 'external' : 'embedded',
          });
          if (result.value.reveal) svg = embedRevealManifest(svg, result.value.reveal);
          return { svg, warnings, kind: 'known', reveal: result.value.reveal, appearance: {
            style: selected.style, mode: selected.mode, contrast: selected.contrast,
            canvas: selected.theme.palette.background, backgroundPainted, hash: appearance.hash,
          } };
        }
        const themedText = injectTheme(text, options.theme ?? 'midnight');
        // Interactive render path: also surfaces a progressive-reveal track when
        // the diagram opts into one (e.g. the deck/bullets family). The reveal
        // manifest is embedded into the SVG ONLY here — the plain renderSync path
        // (used for non-Deckpilot Triton) never emits it.
        const result = compileAndRenderSync(themedText, undefined, options.format ?? 'svg');
        if (!result.ok) {
          return { svg: undefined, warnings: [result.error.message], kind: 'unknown' };
        }
        let svg = result.value.svg;
        const reveal = result.value.reveal;
        if (reveal) {
          svg = embedRevealManifest(svg, reveal);
        }
        return { svg, warnings: [], kind: 'known', reveal };
      }

      export { compileSync, renderSync, compileAndRenderSync, detectDiagramType, renderMermaid, appearanceManifestHash, runtimeRevision };
    `,
    resolveDir: resolve(__dirname, '..'),
    sourcefile: 'vendor-triton-entry.mjs',
    loader: 'js',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  outfile: resolve(dest, 'index.js'),
  logLevel: 'info',
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
  plugins: [resvgShimPlugin],
});
await writeFile(
  resolve(dest, 'package.json'),
  JSON.stringify({ type: 'module' }, null, 2) + '\n',
  'utf8',
);

console.log('[vendor-triton] Bundled Triton Mermaid runtime →', resolve(dest, 'index.js'));
