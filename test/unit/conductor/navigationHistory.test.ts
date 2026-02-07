/**
 * Unit tests for NavigationHistory
 * Per T010 — Tests written FIRST per TDD (Principle IV).
 *
 * Covers: push, goBack, getRecent, clear, 50-entry FIFO cap,
 * canGoBack, length, breadcrumb ordering.
 */

import { expect } from 'chai';
import { NavigationHistory } from '../../../src/conductor/navigationHistory';

describe('NavigationHistory', () => {
  let history: NavigationHistory;

  beforeEach(() => {
    history = new NavigationHistory();
  });

  describe('push()', () => {
    it('should add an entry to the history', () => {
      history.push(3, 'jump', 'Slide 3');
      expect(history.length).to.equal(1);
    });

    it('should accept entries without a slide title', () => {
      history.push(5, 'sequential');
      expect(history.length).to.equal(1);
    });

    it('should accept all NavigationMethod types', () => {
      history.push(0, 'sequential');
      history.push(1, 'jump');
      history.push(2, 'go-back');
      history.push(3, 'scene-restore');
      expect(history.length).to.equal(4);
    });
  });

  describe('goBack()', () => {
    it('should return null when history is empty', () => {
      expect(history.goBack()).to.be.null;
    });

    it('should return the slide index of the last entry', () => {
      history.push(3, 'jump', 'Slide 3');
      history.push(7, 'jump', 'Slide 7');
      expect(history.goBack()).to.equal(7);
    });

    it('should remove the entry after goBack', () => {
      history.push(3, 'jump', 'Slide 3');
      history.push(7, 'jump', 'Slide 7');
      history.goBack();
      expect(history.length).to.equal(1);
      expect(history.goBack()).to.equal(3);
    });

    it('should return null after all entries are consumed', () => {
      history.push(5, 'jump');
      history.goBack();
      expect(history.goBack()).to.be.null;
    });
  });

  describe('getRecent()', () => {
    it('should return empty array when history is empty', () => {
      expect(history.getRecent(5)).to.deep.equal([]);
    });

    it('should return breadcrumbs in newest-first order', () => {
      history.push(1, 'sequential', 'Intro');
      history.push(5, 'jump', 'Demo');
      history.push(10, 'jump', 'Summary');

      const recent = history.getRecent(3);
      expect(recent).to.have.length(3);
      expect(recent[0].slideIndex).to.equal(10);
      expect(recent[1].slideIndex).to.equal(5);
      expect(recent[2].slideIndex).to.equal(1);
    });

    it('should limit results to requested count', () => {
      history.push(1, 'sequential');
      history.push(5, 'jump');
      history.push(10, 'jump');

      const recent = history.getRecent(2);
      expect(recent).to.have.length(2);
      expect(recent[0].slideIndex).to.equal(10);
      expect(recent[1].slideIndex).to.equal(5);
    });

    it('should return all entries if count exceeds history length', () => {
      history.push(1, 'sequential');
      history.push(5, 'jump');

      const recent = history.getRecent(100);
      expect(recent).to.have.length(2);
    });

    it('should include slideTitle and method in breadcrumbs', () => {
      history.push(3, 'jump', 'My Slide');

      const [crumb] = history.getRecent(1);
      expect(crumb.slideIndex).to.equal(3);
      expect(crumb.slideTitle).to.equal('My Slide');
      expect(crumb.method).to.equal('jump');
    });

    it('should return breadcrumbs with undefined slideTitle when not provided', () => {
      history.push(3, 'jump');

      const [crumb] = history.getRecent(1);
      expect(crumb.slideTitle).to.be.undefined;
    });
  });

  describe('canGoBack()', () => {
    it('should return false when history is empty', () => {
      expect(history.canGoBack()).to.be.false;
    });

    it('should return true when history has entries', () => {
      history.push(3, 'jump');
      expect(history.canGoBack()).to.be.true;
    });

    it('should return false after all entries consumed by goBack', () => {
      history.push(3, 'jump');
      history.goBack();
      expect(history.canGoBack()).to.be.false;
    });
  });

  describe('clear()', () => {
    it('should remove all entries', () => {
      history.push(1, 'sequential');
      history.push(5, 'jump');
      history.push(10, 'jump');
      history.clear();
      expect(history.length).to.equal(0);
      expect(history.canGoBack()).to.be.false;
    });
  });

  describe('FIFO cap (50 entries)', () => {
    it('should evict oldest entry when exceeding 50', () => {
      for (let i = 0; i < 51; i++) {
        history.push(i, 'jump', `Slide ${i}`);
      }
      expect(history.length).to.equal(50);

      // The oldest entry (slide 0) should have been evicted
      const recent = history.getRecent(50);
      expect(recent[recent.length - 1].slideIndex).to.equal(1);
    });

    it('should keep the most recent 50 entries', () => {
      for (let i = 0; i < 60; i++) {
        history.push(i, 'jump');
      }
      expect(history.length).to.equal(50);

      // goBack should return the last pushed (59)
      expect(history.goBack()).to.equal(59);
    });
  });

  // T039a [US4] — Breadcrumb rendering logic and history-click navigation
  describe('Breadcrumb rendering and history-click (T039a)', () => {
    it('should return correct slice from getRecent(10)', () => {
      // Push 15 entries
      for (let i = 0; i < 15; i++) {
        history.push(i, 'jump', `Slide ${i}`);
      }
      const recent = history.getRecent(10);
      expect(recent).to.have.lengthOf(10);
      // Most recent first
      expect(recent[0].slideIndex).to.equal(14);
      expect(recent[9].slideIndex).to.equal(5);
    });

    it('should include correct method for breadcrumb click navigation', () => {
      // Simulate: navigate to slide 5 via 'jump', then click breadcrumb to slide 2
      history.push(5, 'jump', 'Slide 5');
      history.push(2, 'jump', 'Slide 2'); // simulating breadcrumb click as 'jump'

      const recent = history.getRecent(2);
      expect(recent[0].method).to.equal('jump');
      expect(recent[0].slideIndex).to.equal(2);
      expect(recent[1].method).to.equal('jump');
      expect(recent[1].slideIndex).to.equal(5);
    });

    it('should push entries for sequential navigation', () => {
      history.push(0, 'sequential', 'Intro');
      history.push(1, 'sequential', 'Setup');
      history.push(2, 'sequential', 'Demo');

      const recent = history.getRecent(3);
      expect(recent).to.have.lengthOf(3);
      expect(recent[0].method).to.equal('sequential');
      expect(recent[0].slideTitle).to.equal('Demo');
      expect(recent[2].slideTitle).to.equal('Intro');
    });

    it('should track mixed navigation methods in order', () => {
      history.push(0, 'sequential', 'Slide 1');
      history.push(5, 'jump', 'Slide 6');
      history.push(4, 'go-back', 'Slide 5');
      history.push(2, 'scene-restore', 'Slide 3');

      const recent = history.getRecent(4);
      expect(recent[0].method).to.equal('scene-restore');
      expect(recent[1].method).to.equal('go-back');
      expect(recent[2].method).to.equal('jump');
      expect(recent[3].method).to.equal('sequential');
    });
  });
});
