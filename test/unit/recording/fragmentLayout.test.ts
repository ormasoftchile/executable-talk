import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
const { JSDOM } = require('jsdom');

const css = fs.readFileSync(path.resolve(__dirname,
  '../../../packages/extension/src/webview/assets/presentation.css'), 'utf8');

describe('fragment layout stability', () => {
  it('reserves the slide scrollbar gutter without disabling overflow', () => {
    const dom = new JSDOM(`<style>${css}</style><div id="slide-content"><h1>Title</h1></div>`);
    try {
      const content = dom.window.document.getElementById('slide-content');
      const style = dom.window.getComputedStyle(content);
      expect(style.getPropertyValue('scrollbar-gutter')).to.equal('stable');
      expect(style.overflow).to.equal('auto');
    } finally {
      dom.window.close();
    }
  });

  it('animates slide-up inside the clipped diagram instead of moving its outer box', () => {
    const dom = new JSDOM(`<style>${css}</style><div id="slide-content">
      <figure class="diagram-block fragment" data-fragment-animation="slide-up">
        <div class="diagram-block__viewport"><svg></svg></div>
      </figure>
    </div>`);
    try {
      const figure = dom.window.document.querySelector('figure');
      const viewport = dom.window.document.querySelector('.diagram-block__viewport');
      expect(dom.window.getComputedStyle(figure).transform).to.equal('none');
      expect(dom.window.getComputedStyle(figure).overflow).to.equal('hidden');
      expect(dom.window.getComputedStyle(viewport).transform).to.equal('translateY(30px)');
      figure.classList.add('visible');
      expect(dom.window.getComputedStyle(figure).transform).to.equal('none');
      expect(dom.window.getComputedStyle(viewport).transform).to.equal('translateY(0)');
    } finally {
      dom.window.close();
    }
  });

  it('keeps diagram layout participation unchanged across fragment visibility', () => {
    const dom = new JSDOM(`<style>${css}</style><div id="slide-content">
      <h1>Title</h1><figure class="diagram-block fragment" data-fragment-animation="slide-up"></figure>
    </div>`);
    try {
      const figure = dom.window.document.querySelector('figure');
      const hidden = dom.window.getComputedStyle(figure);
      expect(hidden.visibility).to.equal('hidden');
      expect(hidden.display).to.equal('grid');
      figure.classList.add('visible');
      const visible = dom.window.getComputedStyle(figure);
      expect(visible.visibility).to.equal('visible');
      for (const property of ['display', 'width', 'min-height', 'margin', 'padding']) {
        expect(visible.getPropertyValue(property), property).to.equal(hidden.getPropertyValue(property));
      }
    } finally {
      dom.window.close();
    }
  });
});