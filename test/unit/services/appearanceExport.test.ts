import { expect } from 'chai';
import * as vscode from 'vscode';
import { resolveAppearance } from '../../../packages/core/src/models/appearance';
import { DiagramService } from '../../../packages/extension/src/services/diagramService';
import { DiagramRendererRegistry } from '../../../packages/extension/src/renderer/diagram/registry';
import { WebviewProvider } from '../../../packages/extension/src/webview/webviewProvider';

describe('appearance capture and export', () => {
  it('uses snapshot tokens and embedded fonts for standalone export', async () => {
    const registry = new DiagramRendererRegistry();
    let received: any;
    registry.register({ id: 'test', appearanceProtocol: 1, supportedFenceLanguages: ['mermaid'],
      render: async (_source, _fence, options) => {
        received = options;
        return { ok: true, format: 'svg', svg: '<svg />', rendererId: 'test' };
      },
    });
    const snapshot = resolveAppearance({}, { kind: 3 });
    const html = '<figure class="diagram-block diagram-block--loading" data-render-id="diagram-0-0" data-diagram-language="mermaid"><pre><code>A --> B</code></pre></figure>';
    const result = await new DiagramService(registry).resolveExportBlocks(html, { snapshot });
    expect(result.appearance).to.deep.equal(snapshot);
    expect(received.appearance.palette.background).to.equal('#000000');
    expect(received.surface).to.equal('opaque');
    expect(received.fontRevision).to.equal(undefined);
  });

  it('waits for the matching webview paint acknowledgement', async () => {
    const provider = new WebviewProvider(vscode.Uri.file('/extension'));
    let message: any;
    (provider as any).panel = { webview: { postMessage: (value: unknown) => { message = value; } } };
    let painted = false;
    const pending = provider.sendAppearance(resolveAppearance(), [], 0, true).then(() => { painted = true; });
    await Promise.resolve();
    expect(painted).to.equal(false);
    (provider as any).handleMessage({ type: 'appearanceApplied', requestId: message.payload.requestId + 1 });
    expect(painted).to.equal(false);
    (provider as any).handleMessage({ type: 'appearanceApplied', requestId: message.payload.requestId });
    await pending;
    expect(painted).to.equal(true);
  });
});