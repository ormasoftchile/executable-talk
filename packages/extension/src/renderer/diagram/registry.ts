import type {
  IDiagramRenderer,
  DiagramRenderOptions,
  DiagramRenderResult,
  DiagramFenceInfo,
  DiagramBlockRef,
} from '@deckpilot/core/renderer/diagramRenderer';

/**
 * Registry of diagram renderer adapters.
 * Instantiated by Conductor; exposed via DeckpilotDiagramAPI for companion extensions.
 */
export class DiagramRendererRegistry {
  private readonly renderers: IDiagramRenderer[] = [];
  private readonly appearanceCache = new Map<string, DiagramRenderResult>();

  register(renderer: IDiagramRenderer): { dispose(): void } {
    this.unregister(renderer.id);
    this.renderers.push(renderer);
    return {
      dispose: () => { this.unregister(renderer.id); },
    };
  }

  unregister(id: string): void {
    this.appearanceCache.clear();
    const index = this.renderers.findIndex((renderer) => renderer.id === id);
    if (index >= 0) {
      this.renderers.splice(index, 1);
    }
  }

  get(id: string): IDiagramRenderer | undefined {
    return this.renderers.find((renderer) => renderer.id === id);
  }

  getVersions(): Record<string, string> {
    return Object.fromEntries(this.renderers.map(renderer => [renderer.id, renderer.version ?? 'unreported']));
  }

  findRenderer(source: string, fence: DiagramFenceInfo): IDiagramRenderer | undefined {
    return this.findCandidateRenderers(source, fence)[0];
  }

  async renderBlock(
    block: DiagramBlockRef,
    options?: DiagramRenderOptions,
  ): Promise<DiagramRenderResult> {
    const candidates = this.findCandidateRenderers(block.source, block.fence);
    if (candidates.length === 0) {
      return {
        ok: false,
        format: 'svg',
        errorMessage: `No diagram renderer registered for "${block.fence.language}". Install a diagram adapter extension (e.g. deckpilot-triton).`,
        rendererId: 'none',
      };
    }

    let fallbackFailure: DiagramRenderResult | undefined;

    for (const renderer of candidates) {
      const key = options?.appearance ? JSON.stringify({
        renderer: renderer.id, source: block.source, fence: block.fence,
        options: { ...options, appearance: { ...options.appearance, revision: undefined } },
      }) : undefined;
      const cached = key && this.appearanceCache.get(key);
      if (cached) return cached;
      const effectiveOptions = options?.appearance && renderer.appearanceProtocol !== 1
        ? { ...options, theme: options.theme ?? options.appearance.mode } : options;
      const result = await renderer.render(block.source, block.fence, effectiveOptions);
      if (result.ok && result.svg) {
        if (options?.appearance && renderer.appearanceProtocol !== 1) {
          result.warnings = [...(result.warnings ?? []), `Renderer "${renderer.id}" uses the legacy theme protocol; update it for adaptive appearance parity.`];
        }
        if (key) {
          if (this.appearanceCache.size >= 128) this.appearanceCache.delete(this.appearanceCache.keys().next().value!);
          this.appearanceCache.set(key, result);
        }
        return result;
      }
      if (options?.appearance && renderer.appearanceProtocol === 1 && renderer.id === 'triton') return result;
      fallbackFailure ??= result;
    }

    return fallbackFailure ?? {
      ok: false,
      format: 'svg',
      errorMessage: `No diagram renderer could render "${block.fence.language}".`,
      rendererId: 'none',
    };
  }

  private findCandidateRenderers(source: string, fence: DiagramFenceInfo): IDiagramRenderer[] {
    return this.renderers
      .map((renderer, index) => ({ renderer, index }))
      .filter(({ renderer }) => {
        if (!renderer.supportedFenceLanguages.includes(fence.language)) {
          return false;
        }

        return renderer.canRender ? renderer.canRender(source, fence) : true;
      })
      .sort((left, right) => {
        const priorityDelta = (right.renderer.priority ?? 0) - (left.renderer.priority ?? 0);
        return priorityDelta !== 0 ? priorityDelta : left.index - right.index;
      })
      .map(({ renderer }) => renderer);
  }
}
