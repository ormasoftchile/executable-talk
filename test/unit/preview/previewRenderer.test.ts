/**
 * Tests for renderPreviewHtml — pure HTML rendering of a parsed deck.
 * Verifies action links/buttons render inert and render directives become
 * "not executed in preview" cards.
 */

import { expect } from 'chai';
import * as vscode from 'vscode';
import { renderPreviewHtml, renderPreviewError } from '../../../packages/extension/src/preview/previewRenderer';
import type { Deck } from '../../../packages/core/src/models/deck';
import type { Slide } from '../../../packages/core/src/models/slide';
import { buildTimingSummary } from '../../../packages/extension/src/recording/durationBudget';
const { JSDOM } = require('jsdom');

function makeSlide(
  index: number,
  opts: {
    content: string;
    html: string;
    speakerNotes?: string;
    cues?: string[];
    voiceCues?: Array<{ fragmentIndex?: number; text: string }>;
  },
): Slide {
  return {
    index,
    content: opts.content,
    html: opts.html,
    speakerNotes: opts.speakerNotes,
    cues: opts.cues,
    voiceCues: opts.voiceCues,
    onEnterActions: [],
    interactiveElements: [],
    renderDirectives: opts.content.includes('render:')
      ? [{ id: `r-${index}`, type: 'file', rawDirective: '', position: { start: 0, end: 0 } }]
      : [],
    fragmentCount: 0,
  };
}

function makeDeck(slides: Slide[]): Deck {
  return {
    filePath: '/tmp/x.deck.md',
    title: 'Demo Deck',
    slides,
    currentSlideIndex: 0,
    metadata: { title: 'Demo Deck' },
    state: 'active',
    envDeclarations: [],
  };
}

const opts = {
  webview: {} as vscode.Webview,
  cspSource: 'vscode-resource:',
  nonce: 'abc123',
  cssUri: vscode.Uri.file('/x/preview.css'),
  deckPath: '/tmp/x.deck.md',
};

describe('renderPreviewHtml', () => {
  it('shows measured and estimated narration separately and flags an over-budget plan', () => {
    const deck = makeDeck([makeSlide(0, { content: '', html: '<p>Demo</p>', cues: ['Recorded.', 'Pending.'] })]);
    const timing = buildTimingSummary(deck.slides, {}, [{ cueIndex: 1, text: 'Recorded.', durationMs: 4000 }], 5000);
    const html = renderPreviewHtml(deck, { ...opts, timing });
    expect(html).to.include('Measured narration 0:04');
    expect(html).to.include('Estimated narration');
    expect(html).to.include('1/2 takes measured');
    expect(html).to.include('Shorten');
    expect(html).to.include('Final video not verified');
    expect(html).not.to.include('Ready to submit');
  });

  it('renders preloaded diagrams at startup without waiting for network scripts', () => {
    const deck = makeDeck([makeSlide(0, { content: '', html: '<figure data-render-id="diagram-0-0" class="diagram-block--loading"></figure>' })]);
    const html = renderPreviewHtml(deck, { ...opts, initialBlocks: [{
      blockId: 'diagram-0-0', html: '<figure><svg><text>Ready preview</text></svg></figure>',
    }] });
    const dom = new JSDOM(html, { runScripts: 'outside-only' });
    try {
      dom.window.acquireVsCodeApi = () => ({ getState: () => ({}), postMessage: () => {} });
      dom.window.eval(dom.window.document.querySelector('script[nonce]').textContent);
      expect(dom.window.document.querySelector('.diagram-block--loading')).to.equal(null);
      expect(dom.window.document.querySelector('svg text').textContent).to.equal('Ready preview');
      expect(dom.window.document.querySelector('script[src]').defer).to.equal(true);
    } finally {
      dom.window.close();
    }
  });

  it('exposes the declared deck theme without using arbitrary values as CSS', () => {
    for (const theme of ['light', 'dark', 'minimal', 'contrast'] as const) {
      const deck = makeDeck([]);
      deck.metadata.theme = theme;
      expect(renderPreviewHtml(deck, opts)).to.include(`data-deck-theme="${theme}"`);
    }
    expect(renderPreviewHtml(makeDeck([]), opts)).to.include('data-deck-theme="auto"');
  });

  it('allows bundled font data without permitting remote font hosts', () => {
    const html = renderPreviewHtml(makeDeck([]), opts);
    expect(html).to.include('font-src vscode-resource: data:;');
    expect(html).to.include("default-src 'none'");
    expect(html).to.include("script-src 'nonce-abc123' https://cdn.jsdelivr.net;");
  });

  it('renders deck title and slide count in the header', () => {
    const html = renderPreviewHtml(
      makeDeck([makeSlide(0, { content: '', html: '<p>Hi</p>' })]),
      opts,
    );
    expect(html).to.include('Demo Deck');
    expect(html).to.include('1 slide');
  });

  it('uses plural when more than one slide', () => {
    const html = renderPreviewHtml(
      makeDeck([
        makeSlide(0, { content: '', html: '<p>a</p>' }),
        makeSlide(1, { content: '', html: '<p>b</p>' }),
      ]),
      opts,
    );
    expect(html).to.include('2 slides');
  });

  it('emits a section per slide with data-slide-index', () => {
    const html = renderPreviewHtml(
      makeDeck([
        makeSlide(0, { content: '', html: '<p>a</p>' }),
        makeSlide(1, { content: '', html: '<p>b</p>' }),
      ]),
      opts,
    );
    expect(html).to.include('data-slide-index="0"');
    expect(html).to.include('data-slide-index="1"');
  });

  it('renders speaker notes under a slide when present', () => {
    const html = renderPreviewHtml(
      makeDeck([makeSlide(0, { content: '', html: '<p>a</p>', speakerNotes: 'Pause and breathe' })]),
      opts,
    );
    expect(html).to.include('preview-slide-notes');
    expect(html).to.include('Pause and breathe');
  });

  it('shows the notes toggle only when at least one slide has notes', () => {
    const withNotes = renderPreviewHtml(
      makeDeck([makeSlide(0, { content: '', html: '<p>a</p>', speakerNotes: 'note' })]),
      opts,
    );
    expect(withNotes).to.include('id="notes-toggle"');

    const withoutNotes = renderPreviewHtml(
      makeDeck([makeSlide(0, { content: '', html: '<p>a</p>' })]),
      opts,
    );
    expect(withoutNotes).to.not.include('id="notes-toggle"');
    expect(withoutNotes).to.not.include('preview-slide-notes');
  });

  it('renders sidecar cues as an ordered list', () => {
    const html = renderPreviewHtml(
      makeDeck([makeSlide(0, { content: '', html: '<p>a</p>', cues: ['Say hello', 'Then pause'] })]),
      opts,
    );
    expect(html).to.include('preview-slide-cues');
    expect(html).to.include('Say hello');
    expect(html).to.include('Then pause');
    expect(html).to.include('id="notes-toggle"'); // cues alone enable the toggle
  });

  it('renders inline voice cues with fragment tags', () => {
    const html = renderPreviewHtml(
      makeDeck([
        makeSlide(0, {
          content: '',
          html: '<p>a</p>',
          voiceCues: [{ text: 'Intro line' }, { fragmentIndex: 2, text: 'On reveal two' }],
        }),
      ]),
      opts,
    );
    expect(html).to.include('Voice cues');
    expect(html).to.include('Intro line');
    expect(html).to.include('On reveal two');
    expect(html).to.include('fragment 2');
  });

  it('escapes HTML in speaker notes', () => {
    const html = renderPreviewHtml(
      makeDeck([makeSlide(0, { content: '', html: '<p>a</p>', speakerNotes: '<script>x</script>' })]),
      opts,
    );
    expect(html).to.not.include('<script>x</script>');
    expect(html).to.include('&lt;script&gt;x&lt;/script&gt;');
  });

  it('replaces render:file links with inert preview cards', () => {
    const slide = makeSlide(0, {
      content: '[](render:file?path=src/foo.ts)',
      html: '<p><a href="render:file?path=src/foo.ts"></a></p>',
    });
    const html = renderPreviewHtml(makeDeck([slide]), opts);
    expect(html).to.include('preview-directive--file');
    expect(html).to.include('src/foo.ts');
    expect(html).to.include('Not executed in preview');
    expect(html).to.not.include('<a href="render:file?path=src/foo.ts"');
  });

  it('replaces render:command links with inert preview cards', () => {
    const slide = makeSlide(0, {
      content: '[](render:command?cmd=ls)',
      html: '<p><a href="render:command?cmd=ls"></a></p>',
    });
    const html = renderPreviewHtml(makeDeck([slide]), opts);
    expect(html).to.include('preview-directive--command');
    expect(html).to.include('Not executed in preview');
  });

  it('embeds an inline click-swallowing script', () => {
    const html = renderPreviewHtml(
      makeDeck([makeSlide(0, { content: '', html: '<p>x</p>' })]),
      opts,
    );
    expect(html).to.include('event.preventDefault()');
    expect(html).to.include('action:');
  });

  it('escapes warnings (no HTML injection)', () => {
    const html = renderPreviewHtml(
      makeDeck([makeSlide(0, { content: '', html: '<p>x</p>' })]),
      { ...opts, warnings: ['<script>alert(1)</script>'] },
    );
    expect(html).to.include('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).to.not.include('<script>alert(1)</script>');
  });

  it('includes the CSP nonce', () => {
    const html = renderPreviewHtml(
      makeDeck([makeSlide(0, { content: '', html: '<p>x</p>' })]),
      { ...opts, nonce: 'NONCE-XYZ' },
    );
    expect(html).to.include("'nonce-NONCE-XYZ'");
  });

  it('renderPreviewError escapes the message', () => {
    const html = renderPreviewError('<oops>', opts);
    expect(html).to.include('&lt;oops&gt;');
    expect(html).to.not.include('<oops>');
  });

  it('interpolates {{VAR}} from deck.resolvedEnvironment', () => {
    const slide = makeSlide(0, {
      content: '',
      html: '<p>hello {{NAME}}</p>',
    });
    const deck = makeDeck([slide]);
    deck.resolvedEnvironment = { NAME: 'world' };
    const html = renderPreviewHtml(deck, opts);
    expect(html).to.include('hello world');
    expect(html).to.not.include('{{NAME}}');
  });

  it('leaves unknown {{VAR}} placeholders untouched', () => {
    const slide = makeSlide(0, {
      content: '',
      html: '<p>{{MISSING}}</p>',
    });
    const deck = makeDeck([slide]);
    deck.resolvedEnvironment = { OTHER: 'x' };
    const html = renderPreviewHtml(deck, opts);
    expect(html).to.include('{{MISSING}}');
  });

  it('html-escapes interpolated env values', () => {
    const slide = makeSlide(0, {
      content: '',
      html: '<p>{{XSS}}</p>',
    });
    const deck = makeDeck([slide]);
    deck.resolvedEnvironment = { XSS: '<img onerror=1>' };
    const html = renderPreviewHtml(deck, opts);
    expect(html).to.include('&lt;img onerror=1&gt;');
    expect(html).to.not.include('<img onerror=1>');
  });

  it('emits postMessage hooks for cursor follow and reverse sync', () => {
    const html = renderPreviewHtml(
      makeDeck([makeSlide(0, { content: '', html: '<p>x</p>' })]),
      opts,
    );
    expect(html).to.include('acquireVsCodeApi');
    expect(html).to.include('scrollToSlide');
    expect(html).to.include('revealSource');
    expect(html).to.include('renderBlockUpdate');
    expect(html).to.include('data-render-id');
  });
});
