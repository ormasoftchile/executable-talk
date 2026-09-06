import { expect } from 'chai';
import { resolveAppearance } from '../../../packages/core/src/models/appearance';
import { DiagramRendererRegistry } from '../../../packages/extension/src/renderer/diagram/registry';
import { mermaidAppearance } from '../../../packages/core/src/renderer/mermaidAppearance';
import type { DiagramBlockRef } from '../../../packages/core/src/models/diagram';

const block: DiagramBlockRef = {
  id: 'diagram-0-0', slideIndex: 0, source: 'flowchart LR\nA --> B',
  fence: { language: 'mermaid' }, position: { start: 0, end: 1 },
};

describe('appearance rendering coordination', () => {
  it('caches by effective appearance, not by update revision', async () => {
    const registry = new DiagramRendererRegistry();
    let calls = 0;
    registry.register({ id: 'test', appearanceProtocol: 1, supportedFenceLanguages: ['mermaid'],
      render: async (_source, _fence, options) => {
        calls++;
        return { ok: true, format: 'svg', rendererId: 'test', svg: `<svg>${options?.appearance?.mode}</svg>` };
      },
    });
    const dark = resolveAppearance({}, { kind: 2 });
    const light = resolveAppearance({}, { kind: 1 });
    await registry.renderBlock(block, { appearance: dark });
    await registry.renderBlock(block, { appearance: { ...dark, revision: 10 } });
    const result = await registry.renderBlock(block, { appearance: light });
    expect(calls).to.equal(2);
    expect(result.svg).to.equal('<svg>light</svg>');
  });

  it('does not hide an adaptive Triton failure behind plain Mermaid', async () => {
    const registry = new DiagramRendererRegistry();
    registry.register({ id: 'triton', appearanceProtocol: 1, priority: 20, supportedFenceLanguages: ['mermaid'],
      render: async () => ({ ok: false, format: 'svg', rendererId: 'triton', errorMessage: 'Upgrade required' }),
    });
    registry.register({ id: 'fallback', supportedFenceLanguages: ['mermaid'],
      render: async () => { throw new Error('Should not fall back'); },
    });
    expect((await registry.renderBlock(block, { appearance: resolveAppearance() })).errorMessage).to.equal('Upgrade required');
  });

  it('maps inherited Mermaid colors without reading VS Code', () => {
    const appearance = resolveAppearance({}, { kind: 4 });
    const result = mermaidAppearance(appearance);
    expect(result.darkMode).to.equal(false);
    expect(result.themeVariables.background).to.equal('#FFFFFF');
    expect(result.themeVariables.primaryTextColor).to.equal('#000000');
    expect(result.themeVariables.fontFamily).to.include('Source Sans 3');
  });
});