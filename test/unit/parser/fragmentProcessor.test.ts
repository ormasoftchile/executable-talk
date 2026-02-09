/**
 * Unit tests for fragment processor
 */

import { expect } from 'chai';
import { processFragments } from '../../../src/parser/fragmentProcessor';

describe('processFragments', () => {
  describe('list item fragments', () => {
    it('should detect fragment comments in list items', () => {
      // Simulating HTML output from markdown-it for a list with fragments
      const html = `<ul>
<li>First <!-- .fragment --></li>
<li>Second <!-- .fragment --></li>
<li>Third <!-- .fragment --></li>
</ul>`;
      
      const result = processFragments(html);
      
      expect(result.fragmentCount).to.equal(3);
    });

    it('should add fragment class to list items', () => {
      const html = `<ul>
<li>First <!-- .fragment --></li>
<li>Second <!-- .fragment --></li>
</ul>`;
      
      const result = processFragments(html);
      
      expect(result.html).to.contain('class="fragment"');
      expect(result.html).to.contain('data-fragment="1"');
      expect(result.html).to.contain('data-fragment="2"');
    });

    it('should preserve content and remove comment', () => {
      const html = `<ul>
<li>Hello World <!-- .fragment --></li>
</ul>`;
      
      const result = processFragments(html);
      
      expect(result.html).to.contain('Hello World');
      expect(result.html).to.not.contain('<!-- .fragment -->');
    });

    it('should support animation types', () => {
      const html = `<ul>
<li>Fade <!-- .fragment fade --></li>
<li>Slide up <!-- .fragment slide-up --></li>
<li>Zoom <!-- .fragment zoom --></li>
</ul>`;
      
      const result = processFragments(html);
      
      expect(result.html).to.contain('data-fragment-animation="fade"');
      expect(result.html).to.contain('data-fragment-animation="slide-up"');
      expect(result.html).to.contain('data-fragment-animation="zoom"');
    });

    it('should number fragments sequentially', () => {
      const html = `<ul>
<li>One <!-- .fragment --></li>
<li>Two <!-- .fragment --></li>
<li>Three <!-- .fragment --></li>
</ul>`;
      
      const result = processFragments(html);
      
      const frag1Pos = result.html.indexOf('data-fragment="1"');
      const frag2Pos = result.html.indexOf('data-fragment="2"');
      const frag3Pos = result.html.indexOf('data-fragment="3"');
      
      expect(frag1Pos).to.be.greaterThan(-1);
      expect(frag2Pos).to.be.greaterThan(-1);
      expect(frag3Pos).to.be.greaterThan(-1);
      expect(frag1Pos).to.be.lessThan(frag2Pos);
      expect(frag2Pos).to.be.lessThan(frag3Pos);
    });
  });

  describe('paragraph fragments', () => {
    it('should handle paragraphs with fragments', () => {
      const html = `<p>First paragraph <!-- .fragment --></p>
<p>Second paragraph <!-- .fragment --></p>`;
      
      const result = processFragments(html);
      
      expect(result.fragmentCount).to.equal(2);
      expect(result.html).to.contain('<p class="fragment"');
    });
  });

  describe('heading fragments', () => {
    it('should handle headings with fragments', () => {
      const html = `<h2>Heading <!-- .fragment --></h2>`;
      
      const result = processFragments(html);
      
      expect(result.fragmentCount).to.equal(1);
      expect(result.html).to.contain('<h2 class="fragment"');
    });
  });

  describe('no fragments', () => {
    it('should handle HTML without fragments', () => {
      const html = `<h1>No fragments here</h1>
<p>Just regular content.</p>`;
      
      const result = processFragments(html);
      
      expect(result.fragmentCount).to.equal(0);
      expect(result.html).to.not.contain('class="fragment"');
    });
  });

  describe('default animation', () => {
    it('should use fade as default animation', () => {
      const html = `<li>Item <!-- .fragment --></li>`;
      
      const result = processFragments(html);
      
      expect(result.html).to.contain('data-fragment-animation="fade"');
    });
  });

  describe('document order numbering', () => {
    it('should assign fragment indices in document order when block elements precede list items', () => {
      // Simulates markdown-it output for a slide where a <p> with a fragment
      // marker appears before a <ul> with fragment-marked <li> items.
      const html = `<h1>Title</h1>
<p>Introduction <!-- .fragment --></p>
<ul>
<li>First <!-- .fragment --></li>
<li>Second <!-- .fragment --></li>
</ul>`;
      
      const result = processFragments(html);
      
      // <p> appears first in the document → fragment 1
      expect(result.html).to.contain('<p class="fragment" data-fragment="1"');
      // <li> items follow → fragments 2, 3
      expect(result.html).to.contain('data-fragment="2"');
      expect(result.html).to.contain('data-fragment="3"');
      expect(result.fragmentCount).to.equal(3);
      // <h1> should NOT have a fragment class
      expect(result.html).to.match(/<h1>Title<\/h1>/);
    });

    it('should not match a fragment comment across tag boundaries', () => {
      // Even if <h1> and <p> are on the same line, the regex must not
      // "steal" the <p>'s fragment comment for the <h1>.
      const html = `<h1>Heading</h1><p>Content <!-- .fragment --></p>`;
      
      const result = processFragments(html);
      
      // Only the <p> should be a fragment, not the <h1>
      expect(result.fragmentCount).to.equal(1);
      expect(result.html).to.contain('<p class="fragment"');
      expect(result.html).to.not.contain('<h1 class="fragment"');
    });
  });
});
