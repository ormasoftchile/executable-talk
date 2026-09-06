import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const dist = process.env.TRITON_CORE_DIST;
if (!dist) throw new Error('Set TRITON_CORE_DIST to an adaptive Triton core dist directory.');
const { defaultAppearanceManifest, sourceSans3FontCss } = await import(pathToFileURL(resolve(dist, 'index.js')));
if (!defaultAppearanceManifest || !sourceSans3FontCss) throw new Error('Adaptive Triton exports are missing.');
const serialized = JSON.stringify(defaultAppearanceManifest);
const manifest = {
  ...defaultAppearanceManifest,
  hash: createHash('sha256').update(serialized).digest('hex'),
};
const output = new URL('../packages/core/src/models/appearanceManifest.json', import.meta.url);
await writeFile(output, JSON.stringify(manifest, null, 2) + '\n');
const css = new URL('../packages/extension/src/webview/assets/appearance-fonts.css', import.meta.url);
await writeFile(css, sourceSans3FontCss + '\n');
console.log(`Generated appearance manifest ${manifest.hash}`);