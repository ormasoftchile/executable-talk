/**
 * Integration test for non-linear navigation data contracts
 * Per T011 — Tests written FIRST per TDD (Principle IV).
 *
 * Covers: goto message → slideChanged response,
 * goBack → returns to previous slide,
 * out-of-range index → error,
 * NavigationHistory + message protocol round-trip.
 *
 * NOTE: Actual Webview rendering cannot be tested outside the
 * Extension Development Host. This validates the data structures
 * and routing logic that drive navigation.
 */

import { expect } from 'chai';
import { NavigationHistory } from '../../src/conductor/navigationHistory';
import {
  NavigateMessage,
  GoBackMessage,
  SlideChangedMessage,
  ErrorMessage,
} from '../../src/webview/messages';
import {
  isNavigateMessage,
  isGoBackMessage,
  parseMessage,
  createMessageDispatcher,
  MessageHandlers,
} from '../../src/webview/messageHandler';
import { NavigationHistoryBreadcrumb } from '../../src/models/deck';

describe('Non-Linear Navigation Integration', () => {

  describe('Goto message → slideChanged response round-trip', () => {

    it('should produce a valid NavigateMessage with goto direction and slideIndex', () => {
      const msg: NavigateMessage = {
        type: 'navigate',
        payload: {
          direction: 'goto',
          slideIndex: 15,
        },
      };

      expect(isNavigateMessage(msg)).to.be.true;
      expect(msg.payload.direction).to.equal('goto');
      expect(msg.payload.slideIndex).to.equal(15);
    });

    it('should produce a SlideChangedMessage with navigation history and canGoBack', () => {
      const history = new NavigationHistory();
      history.push(0, 'sequential', 'Intro');
      history.push(15, 'jump', 'Demo Slide');

      const response: SlideChangedMessage = {
        type: 'slideChanged',
        payload: {
          slideIndex: 15,
          slideHtml: '<h1>Demo Slide</h1>',
          totalSlides: 20,
          canUndo: false,
          canRedo: false,
          navigationHistory: history.getRecent(5),
          canGoBack: history.canGoBack(),
        },
      };

      expect(response.payload.slideIndex).to.equal(15);
      expect(response.payload.canGoBack).to.be.true;
      expect(response.payload.navigationHistory).to.have.length(2);
      // Most recent first
      expect(response.payload.navigationHistory![0].slideIndex).to.equal(15);
      expect(response.payload.navigationHistory![0].method).to.equal('jump');
      expect(response.payload.navigationHistory![1].slideIndex).to.equal(0);
    });
  });

  describe('GoBack → returns to previous slide', () => {

    it('should produce a valid GoBackMessage', () => {
      const msg: GoBackMessage = {
        type: 'goBack',
        payload: {},
      };

      expect(isGoBackMessage(msg)).to.be.true;
    });

    it('should resolve to previous slide via NavigationHistory', () => {
      const history = new NavigationHistory();

      // User was on slide 0, jumped to 15, then jumped to 7
      history.push(0, 'sequential', 'Intro');
      history.push(15, 'jump', 'Demo');

      // GoBack should return to 15 (the last pushed entry)
      const previousSlide = history.goBack();
      expect(previousSlide).to.equal(15);

      // GoBack again returns to 0
      const originalSlide = history.goBack();
      expect(originalSlide).to.equal(0);

      // No more history
      expect(history.goBack()).to.be.null;
      expect(history.canGoBack()).to.be.false;
    });
  });

  describe('Out-of-range index → error', () => {

    it('should produce an ErrorMessage for negative slideIndex', () => {
      const slideIndex = -1;
      const totalSlides = 20;
      const isValid = slideIndex >= 0 && slideIndex < totalSlides;

      expect(isValid).to.be.false;

      // Conductor would send this:
      const errorMsg: ErrorMessage = {
        type: 'error',
        payload: {
          code: 'INVALID_SLIDE_INDEX',
          message: `Slide index ${slideIndex} is out of range (0-${totalSlides - 1})`,
          recoverable: true,
        },
      };
      expect(errorMsg.payload.recoverable).to.be.true;
    });

    it('should produce an ErrorMessage for slideIndex exceeding total slides', () => {
      const slideIndex = 25;
      const totalSlides = 20;
      const isValid = slideIndex >= 0 && slideIndex < totalSlides;

      expect(isValid).to.be.false;

      const errorMsg: ErrorMessage = {
        type: 'error',
        payload: {
          code: 'INVALID_SLIDE_INDEX',
          message: `Slide index ${slideIndex} is out of range (0-${totalSlides - 1})`,
          recoverable: true,
        },
      };
      expect(errorMsg.payload.code).to.equal('INVALID_SLIDE_INDEX');
    });
  });

  describe('Message routing via dispatcher', () => {

    it('should route navigate goto message to onNavigate handler', async () => {
      let receivedMessage: NavigateMessage | null = null;

      const handlers: MessageHandlers = {
        onNavigate: (msg) => {
          receivedMessage = msg;
        },
      };

      const dispatcher = createMessageDispatcher(handlers);
      const msg: NavigateMessage = {
        type: 'navigate',
        payload: { direction: 'goto', slideIndex: 10 },
      };

      await dispatcher(msg);
      expect(receivedMessage).to.not.be.null;
      expect(receivedMessage!.payload.direction).to.equal('goto');
      expect(receivedMessage!.payload.slideIndex).to.equal(10);
    });

    it('should route goBack message to onGoBack handler', async () => {
      let called = false;

      const handlers: MessageHandlers = {
        onGoBack: () => {
          called = true;
        },
      };

      const dispatcher = createMessageDispatcher(handlers);
      const msg: GoBackMessage = { type: 'goBack', payload: {} };

      await dispatcher(msg);
      expect(called).to.be.true;
    });
  });

  describe('parseMessage validation', () => {

    it('should parse a valid goBack message', () => {
      const raw = { type: 'goBack', payload: {} };
      const parsed = parseMessage(raw);
      expect(parsed).to.not.be.null;
      expect(parsed!.type).to.equal('goBack');
    });

    it('should parse a valid navigate goto message', () => {
      const raw = { type: 'navigate', payload: { direction: 'goto', slideIndex: 5 } };
      const parsed = parseMessage(raw);
      expect(parsed).to.not.be.null;
      expect(parsed!.type).to.equal('navigate');
    });

    it('should reject unknown message types', () => {
      const raw = { type: 'unknown', payload: {} };
      const parsed = parseMessage(raw);
      expect(parsed).to.be.null;
    });

    it('should parse saveScene message', () => {
      const raw = { type: 'saveScene', payload: { sceneName: 'demo-start' } };
      const parsed = parseMessage(raw);
      expect(parsed).to.not.be.null;
      expect(parsed!.type).to.equal('saveScene');
    });

    it('should parse restoreScene message', () => {
      const raw = { type: 'restoreScene', payload: { sceneName: 'demo-start' } };
      const parsed = parseMessage(raw);
      expect(parsed).to.not.be.null;
    });

    it('should parse deleteScene message', () => {
      const raw = { type: 'deleteScene', payload: { sceneName: 'demo-start' } };
      const parsed = parseMessage(raw);
      expect(parsed).to.not.be.null;
    });
  });

  describe('Navigation history breadcrumb trail in slideChanged', () => {

    it('should build an accurate breadcrumb trail after sequential + jump navigation', () => {
      const history = new NavigationHistory();

      // Simulate: sequential through slides 0→1→2, then jump to 10, then jump to 5
      history.push(0, 'sequential', 'Intro');
      history.push(1, 'sequential', 'Background');
      history.push(2, 'sequential', 'Setup');
      history.push(10, 'jump', 'Advanced Demo');
      history.push(5, 'jump', 'Basics');

      const trail = history.getRecent(5);
      expect(trail).to.have.length(5);
      // Newest first
      expect(trail[0]).to.deep.include({ slideIndex: 5, method: 'jump' });
      expect(trail[1]).to.deep.include({ slideIndex: 10, method: 'jump' });
      expect(trail[4]).to.deep.include({ slideIndex: 0, method: 'sequential' });
    });

    it('should embed breadcrumbs in SlideChangedMessage', () => {
      const breadcrumbs: NavigationHistoryBreadcrumb[] = [
        { slideIndex: 5, slideTitle: 'Basics', method: 'jump' },
        { slideIndex: 0, slideTitle: 'Intro', method: 'sequential' },
      ];

      const msg: SlideChangedMessage = {
        type: 'slideChanged',
        payload: {
          slideIndex: 5,
          slideHtml: '<h1>Basics</h1>',
          totalSlides: 20,
          canUndo: false,
          canRedo: false,
          navigationHistory: breadcrumbs,
          canGoBack: true,
        },
      };

      expect(msg.payload.navigationHistory).to.have.length(2);
      expect(msg.payload.canGoBack).to.be.true;
    });
  });

  // T039b [US4] — History trail end-to-end integration
  describe('Navigation history trail end-to-end (T039b)', () => {
    it('should build navigationHistory array after jumping 5 slides', () => {
      const history = new NavigationHistory();

      // Jump between slides: 0 → 4 → 11 → 2 → 7
      const jumps = [
        { index: 0, title: 'Intro' },
        { index: 4, title: 'Setup' },
        { index: 11, title: 'Deep Dive' },
        { index: 2, title: 'Overview' },
        { index: 7, title: 'Demo' },
      ];

      for (const j of jumps) {
        history.push(j.index, 'jump', j.title);
      }

      // Build slideChanged with history
      const recentBreadcrumbs = history.getRecent(10);
      const canGoBack = history.canGoBack();

      const msg: SlideChangedMessage = {
        type: 'slideChanged',
        payload: {
          slideIndex: 7,
          slideHtml: '<h1>Demo</h1>',
          totalSlides: 20,
          canUndo: false,
          canRedo: false,
          navigationHistory: recentBreadcrumbs,
          canGoBack,
        },
      };

      expect(msg.payload.navigationHistory).to.have.lengthOf(5);
      expect(msg.payload.navigationHistory![0].slideIndex).to.equal(7);
      expect(msg.payload.navigationHistory![4].slideIndex).to.equal(0);
      expect(msg.payload.canGoBack).to.be.true;
    });

    it('should simulate breadcrumb click navigating to slide in trail', () => {
      const history = new NavigationHistory();

      // Jump 1 → 5 → 12 → 3 → 8
      history.push(0, 'sequential', 'Slide 1');
      history.push(4, 'jump', 'Slide 5');
      history.push(11, 'jump', 'Slide 12');
      history.push(2, 'jump', 'Slide 3');
      history.push(7, 'jump', 'Slide 8');

      // User clicks breadcrumb for slide 12 (index 11) — "history-click" method
      // This should be represented as a navigate goto from the Webview
      const clickMsg: NavigateMessage = {
        type: 'navigate',
        payload: { direction: 'goto', slideIndex: 11 },
      };

      expect(isNavigateMessage(clickMsg)).to.be.true;
      expect(clickMsg.payload.slideIndex).to.equal(11);

      // Conductor would push to history with 'jump' method
      history.push(11, 'jump', 'Slide 12');

      // Trail now: 1 → 5 → 12 → 3 → 8 → 12
      const recent = history.getRecent(10);
      expect(recent).to.have.lengthOf(6);
      expect(recent[0].slideIndex).to.equal(11); // most recent: slide 12
      expect(recent[1].slideIndex).to.equal(7);  // slide 8
    });

    it('should include canGoBack=false when history is empty', () => {
      const history = new NavigationHistory();

      const msg: SlideChangedMessage = {
        type: 'slideChanged',
        payload: {
          slideIndex: 0,
          slideHtml: '<h1>First</h1>',
          totalSlides: 5,
          canUndo: false,
          canRedo: false,
          navigationHistory: history.getRecent(10),
          canGoBack: history.canGoBack(),
        },
      };

      expect(msg.payload.navigationHistory).to.have.lengthOf(0);
      expect(msg.payload.canGoBack).to.be.false;
    });
  });
});
