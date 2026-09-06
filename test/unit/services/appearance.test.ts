import { expect } from 'chai';
import { resolveAppearance, appearanceCss, resolveExportAppearance } from '../../../packages/core/src/models/appearance';
import { mergeSidecarDeckMetadata } from '../../../packages/core/src/parser/mergeEngine';

describe('appearance resolution', () => {
  it('inherits partial sidecar fields and ignores invalid preferences with diagnostics', () => {
    const merged = mergeSidecarDeckMetadata({ appearance: { mode: 'dark' } }, { deck: { appearance: { mode: 'light', contrast: 'high' } } });
    expect(merged.appearance).to.deep.equal({ mode: 'dark', contrast: 'high' });
    const result = resolveAppearance({ appearance: { mode: 'invalid' as any } }, { kind: 2 }, { mode: 'light' });
    expect(result.mode).to.equal('light');
    expect(result.warnings[0]).to.include('Invalid appearance.mode');
  });
  it('follows all four host appearance kinds', () => {
    for (const [kind, mode, contrast] of [
      [1, 'light', 'normal'], [2, 'dark', 'normal'], [3, 'dark', 'high'], [4, 'light', 'high'],
    ] as const) {
      const result = resolveAppearance({}, { kind });
      expect(result.mode).to.equal(mode);
      expect(result.contrast).to.equal(contrast);
      expect(result.style).to.equal('default');
      expect(result.font.family).to.equal('Source Sans 3');
    }
  });

  it('honors field precedence and explicit auto', () => {
    const metadata = { theme: 'light', appearance: { mode: 'auto' as const } };
    expect(resolveAppearance(metadata, { kind: 2 }, { mode: 'light' }).mode).to.equal('dark');
    expect(resolveAppearance(metadata, { kind: 2 }, {}, { mode: 'light' }).mode).to.equal('light');
    expect(resolveAppearance({ appearance: { mode: 'light' } }, { kind: 3 }).contrast).to.equal('high');
  });

  it('keeps explicit legacy choices and diagnoses conflicts', () => {
    const result = resolveAppearance({ theme: 'light', options: { theme: 'dark' } }, { kind: 2 });
    expect(result.mode).to.equal('light');
    expect(result.warnings).to.have.length(1);
    expect(resolveAppearance({ theme: 'minimal' }, { kind: 1 }).mode).to.equal('dark');
  });

  it('has stable fingerprints and different mode palettes', () => {
    const light = resolveAppearance({}, { kind: 1 });
    const dark = resolveAppearance({}, { kind: 2 });
    expect(resolveAppearance({}, { kind: 2 }).hash).to.equal(dark.hash);
    expect(light.hash).not.to.equal(dark.hash);
    expect(light.typography).to.deep.equal(dark.typography);
    expect(appearanceCss(dark)).to.include('--bg-color:#171B1D');
  });

  it('uses a snapshot for exports and a deterministic headless fallback', () => {
    const snapshot = resolveAppearance({}, { kind: 3 });
    expect(resolveExportAppearance(undefined, snapshot)).to.deep.equal(snapshot);
    expect(resolveExportAppearance().mode).to.equal('light');
    expect(resolveExportAppearance({ mode: 'light' }, snapshot).mode).to.equal('light');
  });
});