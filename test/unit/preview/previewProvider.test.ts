import { expect } from 'chai';
import * as path from 'path';
import * as vscode from 'vscode';
import type { IDiagramRenderer } from '../../../packages/core/src/renderer/diagramRenderer';
import { PreviewProvider } from '../../../packages/extension/src/preview/previewProvider';
import { DiagramRendererRegistry } from '../../../packages/extension/src/renderer/diagram/registry';

describe('PreviewProvider', () => {
  const originalConfiguration = vscode.workspace.getConfiguration;
  beforeEach(() => {
    (vscode.workspace as any).getConfiguration = () => ({ get: () => undefined });
  });
  afterEach(() => {
    (vscode.workspace as any).getConfiguration = originalConfiguration;
  });

  it('resolves diagram placeholders and posts renderBlockUpdate messages', async () => {
    const registry = new DiagramRendererRegistry();
    const renderer: IDiagramRenderer = {
      id: 'preview-renderer',
      appearanceProtocol: 1,
      supportedFenceLanguages: ['mermaid'],
      render: async () => ({
        ok: true,
        format: 'svg',
        svg: '<svg><text>preview</text></svg>',
        rendererId: 'preview-renderer',
      }),
    };
    registry.register(renderer);

    const provider = new PreviewProvider(vscode.Uri.file('/workspace/ext'), registry);
    const posted: unknown[] = [];
    (provider as any).panel = {
      webview: {
        html: '',
        cspSource: 'vscode-resource:',
        asWebviewUri: (uri: unknown) => uri,
        postMessage: async (message: unknown) => {
          posted.push(message);
          return true;
        },
      },
    };
    (provider as any).deckUri = vscode.Uri.file(path.join('/workspace', 'demo.deck.md'));
    (vscode.workspace as any).workspaceFolders = [{ uri: vscode.Uri.file('/workspace') }];
    (provider as any).readLive = async () => [
      '# Demo',
      '',
      '```diagram:mermaid',
      'graph TD',
      '  A --> B',
      '```',
      '',
    ].join('\n');

    await (provider as any).refresh();
    await new Promise((resolve) => setImmediate(resolve));

    expect((provider as any).panel.webview.html).to.include('diagram-block--loading');
    expect(posted).to.deep.include({
      type: 'renderBlockUpdate',
      payload: {
        blockId: 'diagram-0-0',
        html: '<figure class="diagram-block diagram-block--mermaid" data-render-id="diagram-0-0" data-diagram-renderer="preview-renderer" data-diagram-language="mermaid"><div class="diagram-block__viewport"><svg><text>preview</text></svg></div></figure>',
        status: 'success',
      },
    });
  });
});
