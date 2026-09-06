import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';
const { JSDOM } = require('jsdom');

const source = fs.readFileSync(path.resolve(__dirname,
  '../../../packages/extension/src/webview/assets/presentation.js'), 'utf8');

function implementation(name: string): string {
  const start = source.search(new RegExp(`  (?:async )?function ${name}\\(`));
  const tail = source.slice(start + 1);
  const next = tail.search(/\n  (?:async )?function |\n  \/\*\*/);
  return source.slice(start, next < 0 ? undefined : start + 1 + next);
}

function harness() {
  const dom = new JSDOM('<div id="slide-content"><h1>Previous slide</h1></div>');
  const content = dom.window.document.getElementById('slide-content');
  const events: string[] = [];
  const posted: any[] = [];
  const frames: Array<() => void> = [];
  const context: any = {
    document: dom.window.document, window: {}, console: { log: () => {} },
    vscode: { postMessage: (message: any) => posted.push(message) },
    slideContent: content, currentSlide: 0, currentFragment: 0, totalFragments: 0,
    totalSlides: 2, slides: [], appearanceRevision: 0,
    updateFragmentState: () => events.push('fragments'), hideAllFragments: () => {},
    showAllFragments: () => events.push('showAll'),
    applyTransition: () => events.push('transition'), updateSlideIndicator: () => {},
    updateProgressBar: () => {}, updateNavigationButtons: () => {},
    updateBreadcrumbTrail: () => {}, setupVideoPlayback: () => {},
    startLoadingTimers: () => {}, renderMermaidFallbacks: () => {}, updateEnvBadge: () => {},
    requestAnimationFrame: (callback: () => void) => frames.push(callback),
  };
  vm.createContext(context);
  vm.runInContext(['preserveRenderBlockState', 'syncPreservedAttributes', 'stageSlideContent', 'prepareRecordingLayout', 'expandTritonRevealFragments', 'renumberFragments', 'handleSlideChanged', 'handleDeckLoaded']
    .map(implementation).join('\n'), context);
  return { context, content, events, posted, frames, dom };
}

describe('slide first paint', () => {
  it('preflights diagram reveals and sidecar buttons without changing the visible slide', () => {
    const { context, content, posted, frames } = harness();
    context.prepareRecordingLayout({ requestId: 7, slides: [{
      slideHtml: '<h1>Demo</h1><figure data-render-id="diagram"><svg><g id="first"></g><g id="second"></g>' +
        '<script id="triton-reveal" type="application/json">{"steps":[{"index":1,"enter":["first"]},{"index":2,"enter":["second"]}]}</script></svg></figure>' +
        '<p class="fragment"><a data-action-id="preview">Show preview</a></p>',
      diagramBlocks: [],
    }] });
    expect(posted).to.have.length(1);
    expect(posted[0]).to.deep.equal({ type: 'recordingLayoutPrepared', requestId: 7, layouts: [
      { fragmentCount: 3, actionFragments: { preview: 3 } },
    ] });
    expect(content.innerHTML).to.equal('<h1>Previous slide</h1>');
    expect(frames).to.have.length(0);
    expect(context.currentSlide).to.equal(0);
  });

  it('does not paint slide content from deckLoaded or startup before host navigation', () => {
    const { context, content } = harness();
    context.handleDeckLoaded({ payload: { totalSlides: 2 } });
    expect(content.textContent).to.equal('Previous slide');
    expect(implementation('init')).not.to.include('showSlide(0)');
    expect(implementation('init')).to.include('document.fonts.load');
  });

  it('commits the title and resolved diagram once, before starting transition', () => {
    const { context, content, events, frames, posted } = harness();
    let commits = 0;
    const replace = content.replaceChildren.bind(content);
    content.replaceChildren = (...children: any[]) => {
      commits++;
      replace(...children);
      expect(content.querySelector('h1')?.textContent).to.equal('Ready slide');
      expect(content.querySelector('svg')).not.to.equal(null);
      expect(content.querySelector('.diagram-block--loading')).to.equal(null);
      events.push('commit');
    };
    context.handleSlideChanged({ payload: {
      slideIndex: 1, totalSlides: 2, showAllFragments: true,
      slideHtml: '<h1>Ready slide</h1><figure class="diagram-block--loading fragment" data-render-id="diagram-1-0" data-fragment="1"></figure>',
      diagramBlocks: [{ blockId: 'diagram-1-0', html: '<figure class="diagram-block"><svg><text>Ready</text></svg></figure>' }],
    } });
    expect(commits).to.equal(1);
    expect(events).to.deep.equal(['commit', 'fragments', 'showAll', 'transition']);
    expect(content.querySelector('figure').getAttribute('data-fragment')).to.equal('1');
    expect(posted).to.have.length(0);
    frames[0]();
    expect(posted[0]).to.deep.equal({ type: 'slideRendered', payload: { slideIndex: 1 } });
  });

  it('does not acknowledge a superseded slide on the next animation frame', () => {
    const { context, frames, posted } = harness();
    context.handleSlideChanged({ payload: { slideIndex: 0, slideHtml: '<h1>First</h1>' } });
    context.handleSlideChanged({ payload: { slideIndex: 1, slideHtml: '<h1>Second</h1>' } });
    frames.forEach(callback => callback());
    expect(posted.map(message => message.payload.slideIndex)).to.deep.equal([1]);
  });
});