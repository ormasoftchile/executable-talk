/**
 * renderPreviewHtml — pure function that turns a parsed Deck into the HTML
 * shell for the live-preview webview.
 *
 * The view is a vertical scroll of every slide ("poster mode"). Action links
 * and render directives are rendered as inert visual cards — preview never
 * executes side-effects.
 */

import * as path from 'path';
import type * as vscode from 'vscode';
import type { Deck } from '@deckpilot/core/models/deck';
import type { Slide } from '@deckpilot/core/models/slide';
import { injectBlockElements } from '@deckpilot/core/renderer/blockElementRenderer';
import { parseRenderDirectives } from '@deckpilot/core/renderer/renderDirectiveParser';
import type { RenderDirective } from '@deckpilot/core/renderer/renderDirectiveParser';
import { peekCommandCache } from '../renderer/commandRenderer';
import { appearanceCss, type ResolvedAppearance } from '@deckpilot/core/models/appearance';
import { formatBudgetTime, type TimingSummary } from '../recording/durationBudget';

export interface RenderPreviewOptions {
  timing?: TimingSummary;
  initialBlocks?: Array<{ blockId: string; html: string }>;
  appearance?: ResolvedAppearance;
  fontsUri?: vscode.Uri;
  webview: vscode.Webview;
  cspSource: string;
  nonce: string;
  cssUri: vscode.Uri;
  deckPath: string;
  warnings?: string[];
}

export function renderPreviewHtml(deck: Deck, opts: RenderPreviewOptions): string {
  const title = escapeHtml(deck.title ?? path.basename(opts.deckPath));
  const slideCount = deck.slides.length;
  const warningsHtml = renderWarnings(opts.warnings);
  const deckCwd = path.dirname(opts.deckPath);
  const env = deck.resolvedEnvironment;
  const slidesHtml = deck.slides.map((slide) => renderSlide(slide, deckCwd, env)).join('\n');
  const hasNotes = deck.slides.some(slideHasPresenterContent);
  const notesToggle = hasNotes
    ? `<button type="button" class="preview-notes-toggle" id="notes-toggle" aria-pressed="true">Notes &amp; cues</button>`
    : '';
  const deckTheme = ['light', 'dark', 'minimal', 'contrast'].includes(deck.metadata.theme ?? '')
    ? deck.metadata.theme : 'auto';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${opts.cspSource} 'unsafe-inline'; script-src 'nonce-${opts.nonce}' https://cdn.jsdelivr.net; font-src ${opts.cspSource} data:; img-src ${opts.cspSource} https: data:;">
  <link href="${opts.cssUri}" rel="stylesheet">
  ${opts.fontsUri ? `<link href="${opts.fontsUri}" rel="stylesheet">` : ''}
  <style id="appearance-tokens">${opts.appearance ? `.preview-body.adaptive-appearance .preview-slide-body{${appearanceCss(opts.appearance)}}` : ''}</style>
  <title>Preview: ${title}</title>
</head>
<body class="preview-body${opts.appearance ? ' adaptive-appearance' : ''}" data-deck-theme="${opts.appearance ? 'auto' : deckTheme}">
  <header class="preview-header">
    <span class="preview-title">${title}</span>
    <span class="preview-meta">
      ${opts.appearance ? '<button type="button" id="appearance-menu" class="preview-notes-toggle" title="Appearance">Appearance</button>' : ''}
      ${notesToggle}
      <span class="preview-count">${slideCount} slide${slideCount === 1 ? '' : 's'} &middot; live preview</span>
    </span>
  </header>
  ${opts.timing ? renderTimingSummary(opts.timing) : ''}
  ${warningsHtml}
  <main class="preview-slides">
    ${slidesHtml}
  </main>
  <script defer src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
  <script nonce="${opts.nonce}">
    (function () {
      var vscode = acquireVsCodeApi();
      var appearanceRevision = ${opts.appearance?.revision ?? 0};
      var appearanceMenu = document.getElementById('appearance-menu');
      if (appearanceMenu) appearanceMenu.addEventListener('click', function () {
        vscode.postMessage({ type: 'appearanceMenu' });
      });

      // Initialize mermaid for client-side rendering of diagrams
      if (typeof mermaid !== 'undefined') {
        mermaid.contentLoaded();
      }

      // Speaker-notes visibility toggle (persisted across live-preview refreshes).
      var notesToggle = document.getElementById('notes-toggle');
      function applyNotesState() {
        var st = vscode.getState() || {};
        var hidden = !!st.notesHidden;
        document.body.classList.toggle('notes-hidden', hidden);
        if (notesToggle) notesToggle.setAttribute('aria-pressed', String(!hidden));
      }
      applyNotesState();
      if (notesToggle) {
        notesToggle.addEventListener('click', function () {
          var st = vscode.getState() || {};
          st.notesHidden = !st.notesHidden;
          vscode.setState(st);
          applyNotesState();
        });
      }

      // Inert preview: swallow clicks on action links and render-directive cards,
      // but allow propagation for slide-level reverse sync (handled below).
      document.addEventListener('click', function (event) {
        var t = event.target;
        if (t && t.closest && (t.closest('a[href^="action:"]') || t.closest('.preview-directive') || t.closest('a[href^="render:"]'))) {
          event.preventDefault();
          event.stopPropagation();
        }
      }, true);

      // Reverse sync: click empty slide chrome (header / body padding) → reveal source.
      document.addEventListener('click', function (event) {
        var slide = event.target && event.target.closest && event.target.closest('.preview-slide');
        if (!slide) return;
        // Ignore clicks on interactive content (links/buttons inside the slide body).
        if (event.target.closest('a, button, input, .preview-directive')) return;
        var idx = parseInt(slide.getAttribute('data-slide-index'), 10);
        if (!isNaN(idx)) {
          vscode.postMessage({ type: 'revealSource', slideIndex: idx });
        }
      });

      // Cursor follow: extension pushes { type: 'scrollToSlide', slideIndex } messages.
      window.addEventListener('message', function (event) {
        var msg = event.data || {};
        if (msg.type === 'appearanceChanged' && msg.payload) {
          var payload = msg.payload;
          if (payload.appearance.revision < appearanceRevision) return;
          appearanceRevision = payload.appearance.revision;
          var scroll = document.documentElement.scrollTop;
          for (var update of payload.blocks) {
            var current = document.querySelector('[data-render-id="' + update.blockId + '"]');
            if (current) current.outerHTML = update.html;
          }
          document.getElementById('appearance-tokens').textContent = '.preview-body.adaptive-appearance .preview-slide-body{' + payload.css + '}';
          document.documentElement.scrollTop = scroll;
          if (appearanceMenu) appearanceMenu.textContent = 'Appearance: ' + payload.appearance.mode;
          renderFallbackMermaidDiagrams();
          return;
        }
        if (msg.type === 'scrollToSlide' && typeof msg.slideIndex === 'number') {
          var el = document.querySelector('.preview-slide[data-slide-index="' + msg.slideIndex + '"]');
          if (el && el.scrollIntoView) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            el.classList.add('preview-slide--active');
            // Drop the highlight from any siblings.
            var others = document.querySelectorAll('.preview-slide--active');
            for (var i = 0; i < others.length; i++) {
              if (others[i] !== el) others[i].classList.remove('preview-slide--active');
            }
          }
          return;
        }
        if (msg.type === 'renderBlockUpdate' && msg.payload && msg.payload.blockId && msg.payload.html) {
          var block = document.querySelector('[data-render-id="' + msg.payload.blockId + '"]');
          if (!block) return;
          var temp = document.createElement('div');
          temp.innerHTML = msg.payload.html;
          var next = temp.firstElementChild;
          if (next) {
            next.setAttribute('data-render-id', msg.payload.blockId);
            block.replaceWith(next);
            renderFallbackMermaidDiagrams();
          }
        }
      });

      var mermaidQueue = Promise.resolve();
      function renderFallbackMermaidDiagrams() {
        if (typeof mermaid === 'undefined') return;
        var fallbacks = document.querySelectorAll('.diagram-block__mermaid-fallback[data-mermaid-source]');
        fallbacks.forEach(function (el) {
          if (el.dataset.mermaidPending) return;
          el.dataset.mermaidPending = 'true';
          mermaidQueue = mermaidQueue.then(async function () {
            if (!el.isConnected) return;
            try {
              var encoded = el.getAttribute('data-mermaid-source');
              if (!encoded) return;
              var source = new TextDecoder().decode(Uint8Array.from(atob(encoded), char => char.charCodeAt(0)));
              var config = JSON.parse(el.getAttribute('data-mermaid-config') || '{}');
              mermaid.initialize({ ...config, startOnLoad: false, securityLevel: 'strict', suppressErrorRendering: true });
              var result = await mermaid.render('mermaid-' + Math.random().toString(36).slice(2), source);
              if (el.isConnected) el.innerHTML = result.svg || result;
            } catch (error) {
              el.textContent = 'Diagram render failed: ' + error.message;
            }
          });
        });
      }

      // Initial render of any fallback diagrams on load
      var initialBlocks = ${JSON.stringify(opts.initialBlocks ?? []).replace(/</g, '\\u003c')};
      for (var update of initialBlocks) {
        var block = document.querySelector('[data-render-id="' + update.blockId + '"]');
        if (block) block.outerHTML = update.html;
      }
      window.addEventListener('load', function () {
        if (typeof mermaid !== 'undefined') mermaid.contentLoaded();
        renderFallbackMermaidDiagrams();
      });
      setTimeout(function () { renderFallbackMermaidDiagrams(); }, 100);
    })();
  </script>
</body>
</html>`;
}

function renderTimingSummary(timing: TimingSummary): string {
  const remaining = timing.maxDurationMs === undefined ? '' : timing.overByMs > 0
    ? `Shorten ${formatBudgetTime(timing.overByMs)}`
    : `${formatBudgetTime(Math.floor((timing.maxDurationMs - timing.plannedMs) / 1000) * 1000)} planned headroom`;
  return `<section class="preview-timing${timing.overByMs > 0 ? ' preview-timing--over' : ''}" aria-label="Video duration" role="status">
    <div><strong>~${formatBudgetTime(timing.plannedMs)} planned</strong>${timing.maxDurationMs === undefined ? '' : ` <span>Limit ${formatBudgetTime(timing.maxDurationMs)}</span>`} <strong>${remaining}</strong></div>
    <div><span>Measured narration ${formatBudgetTime(timing.measuredNarrationMs)}</span><span>Estimated narration ${formatBudgetTime(timing.estimatedNarrationMs)}</span><span>${timing.measuredCues}/${timing.measuredCues + timing.estimatedCues} takes measured</span></div>
    <div><span>Pauses and overhead ~${formatBudgetTime(timing.overheadMs)}</span>${timing.unknownRuntime ? '<span>Action/video runtime not fully known</span>' : ''}<span>Final video not verified</span></div>
  </section>`;
}

export function renderPreviewError(message: string, opts: RenderPreviewOptions): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${opts.cspSource} 'unsafe-inline'; img-src ${opts.cspSource} https: data:;">
  <link href="${opts.cssUri}" rel="stylesheet">
  <title>Preview error</title>
</head>
<body class="preview-body">
  <header class="preview-header">
    <span class="preview-title">Preview unavailable</span>
  </header>
  <main class="preview-slides">
    <section class="preview-slide preview-slide--error">
      <p class="preview-error-message">${escapeHtml(message)}</p>
    </section>
  </main>
</body>
</html>`;
}

function renderSlide(slide: Slide, deckCwd: string, env?: Record<string, string>): string {
  // injectBlockElements turns <!--ACTION:id--> placeholders into real button HTML.
  // The buttons render but clicks are swallowed by the body-level handler above.
  const withButtons = injectBlockElements(slide.html, slide);
  const withInertDirectives = replaceRenderDirectiveLinks(withButtons, slide, deckCwd);
  const withEnv = interpolateEnv(withInertDirectives, env);
  const title = slide.frontmatter?.title;
  const header = title
    ? `<div class="preview-slide-label">#${slide.index + 1} &middot; ${escapeHtml(String(title))}</div>`
    : `<div class="preview-slide-label">#${slide.index + 1}</div>`;
  const notes = renderPresenterBlock(slide);
  return `<section class="preview-slide" data-slide-index="${slide.index}">
    ${header}
    <div class="preview-slide-body">${withEnv}</div>
    ${notes}
  </section>`;
}

/** True when a slide carries any presenter content (notes, cues, or voice cues). */
function slideHasPresenterContent(slide: Slide): boolean {
  return (
    (!!slide.speakerNotes && slide.speakerNotes.trim().length > 0) ||
    (Array.isArray(slide.cues) && slide.cues.some((cue) =>
      typeof cue === 'string' ? cue.trim().length > 0 : cue.text.trim().length > 0)) ||
    (Array.isArray(slide.voiceCues) && slide.voiceCues.some((c) => c.text.trim().length > 0))
  );
}

/**
 * Render the presenter footer for a slide: speaker notes (a blob), sidecar
 * `cues` (an ordered list), and inline `<!-- voice -->` cues (with fragment
 * association). Returns '' when the slide has none. Hidden via `.notes-hidden`.
 */
function renderPresenterBlock(slide: Slide): string {
  const parts: string[] = [];

  if (slide.speakerNotes && slide.speakerNotes.trim().length > 0) {
    parts.push(`<div class="preview-notes-item">
      <span class="preview-slide-notes-label">Speaker notes</span>
      <div class="preview-slide-notes-body">${escapeHtml(slide.speakerNotes)}</div>
    </div>`);
  }

  const cues = (slide.cues ?? [])
    .map(cue => typeof cue === 'string' ? cue : cue.text)
    .filter(cue => cue.trim().length > 0);
  if (cues.length > 0) {
    const items = cues.map((c) => `<li>${escapeHtml(c.trim())}</li>`).join('');
    parts.push(`<div class="preview-notes-item">
      <span class="preview-slide-notes-label">Cues</span>
      <ol class="preview-slide-cues">${items}</ol>
    </div>`);
  }

  const voice = (slide.voiceCues ?? []).filter((c) => c.text.trim().length > 0);
  if (voice.length > 0) {
    const items = voice
      .map((c) => {
        const frag =
          c.fragmentIndex !== undefined
            ? `<span class="preview-cue-frag">fragment ${c.fragmentIndex}</span> `
            : '';
        return `<li>${frag}${escapeHtml(c.text.trim())}</li>`;
      })
      .join('');
    parts.push(`<div class="preview-notes-item">
      <span class="preview-slide-notes-label">Voice cues</span>
      <ul class="preview-slide-cues">${items}</ul>
    </div>`);
  }

  if (parts.length === 0) {
    return '';
  }
  return `<footer class="preview-slide-notes">${parts.join('')}</footer>`;
}

/**
 * Replace {{VAR}} placeholders with values from the deck's resolved
 * environment. Values are HTML-escaped. Unknown vars are left as-is so the
 * author can see what's missing. Operates on rendered HTML; we intentionally
 * keep the syntax narrow (alphanumerics + underscore) to avoid colliding with
 * legitimate `{{` content in code blocks.
 */
function interpolateEnv(html: string, env?: Record<string, string>): string {
  if (!env) {
    return html;
  }
  return html.replace(/\{\{\s*([A-Z_][A-Z0-9_]*)\s*\}\}/gi, (match, name: string) => {
    if (Object.prototype.hasOwnProperty.call(env, name)) {
      return escapeHtml(env[name]);
    }
    return match;
  });
}

/**
 * Replace [label](render:type?params) links left in the rendered HTML with
 * inert preview cards. We re-parse from slide.content (the source of truth)
 * to know the directive set, then locate each link in the HTML by its
 * rendered anchor signature and swap it.
 */
function replaceRenderDirectiveLinks(html: string, slide: Slide, deckCwd: string): string {
  if (!slide.renderDirectives || slide.renderDirectives.length === 0) {
    return html;
  }
  const directives = parseRenderDirectives(slide.content, slide.index);
  if (directives.length === 0) {
    return html;
  }

  // Match every <a href="render:..."> ... </a> in the rendered HTML and
  // swap with an inert card. Markdown-it renders [label](render:...) into
  // exactly that anchor shape, so a single regex pass is enough.
  let i = 0;
  return html.replace(
    /<a\s+href="render:[^"]*"[^>]*>([\s\S]*?)<\/a>/g,
    (_match) => {
      const directive = directives[i++];
      if (!directive) {
        return _match;
      }
      return renderInertDirective(directive, deckCwd);
    },
  );
}

function renderInertDirective(directive: RenderDirective, deckCwd: string): string {
  // For render:command, surface a cached output card if a previous run
  // populated the renderer cache. Never executes from the preview surface.
  if (directive.type === 'command' && typeof directive.params.cmd === 'string') {
    const cached = peekCommandCache(directive.params.cmd, deckCwd);
    if (cached) {
      return renderCachedCommand(directive.params.cmd, cached);
    }
  }
  const { icon, source, kind } = describeDirective(directive);
  return `<div class="preview-directive preview-directive--${directive.type}">
    <div class="preview-directive-header">
      <span class="preview-directive-icon">${icon}</span>
      <span class="preview-directive-kind">${kind}</span>
      <span class="preview-directive-source">${escapeHtml(source)}</span>
    </div>
    <div class="preview-directive-note">Not executed in preview.</div>
  </div>`;
}

function renderCachedCommand(
  cmd: string,
  cached: { success: boolean; output?: string; exitCode?: number; error?: string; timedOut?: boolean },
): string {
  const statusClass = cached.success ? 'success' : cached.timedOut ? 'timeout' : 'error';
  const statusIcon = cached.success ? '\u2713' : cached.timedOut ? '\u23F1' : '\u2717';
  const body = escapeHtml(cached.output ?? cached.error ?? '');
  return `<div class="preview-directive preview-directive--command preview-directive--cached preview-directive--${statusClass}">
    <div class="preview-directive-header">
      <span class="preview-directive-icon">\u26A1</span>
      <span class="preview-directive-kind">render:command</span>
      <span class="preview-directive-source">${escapeHtml(cmd)}</span>
      <span class="preview-directive-status">${statusIcon} cached</span>
    </div>
    <pre class="preview-directive-output"><code>${body}</code></pre>
  </div>`;
}

function describeDirective(d: RenderDirective): { icon: string; source: string; kind: string } {
  switch (d.type) {
    case 'file':
      return { icon: '\u{1F4C4}', source: d.params.path, kind: 'render:file' };
    case 'command':
      return { icon: '\u26A1', source: d.params.cmd, kind: 'render:command' };
    case 'diff':
      return {
        icon: '\u{1F4CA}',
        source: d.params.path ?? `${d.params.left ?? d.params.before ?? '?'} \u2194 ${d.params.right ?? d.params.after ?? '?'}`,
        kind: 'render:diff',
      };
    default: {
      const unknown = d as RenderDirective;
      return { icon: '\u2753', source: unknown.rawDirective, kind: 'render:?' };
    }
  }
}

function renderWarnings(warnings?: string[]): string {
  if (!warnings || warnings.length === 0) {
    return '';
  }
  const items = warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('');
  return `<aside class="preview-warnings"><ul>${items}</ul></aside>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
