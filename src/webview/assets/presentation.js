/**
 * Presentation JavaScript - keyboard handler and message posting
 */

(function () {
  'use strict';

  // VS Code API for messaging
  // @ts-ignore - vscode is injected by the webview
  const vscode = acquireVsCodeApi();

  // State
  let currentSlide = 0;
  let totalSlides = 0;
  let slides = [];

  // DOM elements
  const slideContent = document.getElementById('slide-content');
  const slideIndicator = document.getElementById('slide-indicator');
  const btnFirst = document.getElementById('btn-first');
  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');
  const btnLast = document.getElementById('btn-last');
  const actionOverlay = document.getElementById('action-overlay');
  const actionStatus = document.getElementById('action-status');

  /**
   * Initialize the presentation
   */
  function init() {
    // Load deck data injected by extension
    if (window.deckData) {
      slides = window.deckData.slides || [];
      totalSlides = window.deckData.slideCount || 0;
    }

    // Set up event listeners
    setupKeyboardNavigation();
    setupButtonNavigation();
    setupActionLinks();
    setupMessageListener();

    // Notify extension we're ready
    sendMessage({ type: 'ready' });

    // Show first slide
    showSlide(0);
  }

  /**
   * Set up keyboard navigation
   */
  function setupKeyboardNavigation() {
    document.addEventListener('keydown', function (event) {
      // Prevent default for navigation keys
      const navKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Escape', ' ', 'Backspace'];
      if (navKeys.includes(event.key)) {
        event.preventDefault();
      }

      switch (event.key) {
        case 'ArrowRight':
        case 'ArrowDown':
        case ' ':  // Space key
        case 'PageDown':
          navigateNext();
          break;

        case 'ArrowLeft':
        case 'ArrowUp':
        case 'Backspace':
        case 'PageUp':
          navigatePrevious();
          break;

        case 'Home':
          navigateFirst();
          break;

        case 'End':
          navigateLast();
          break;

        case 'Escape':
          closePresentation();
          break;

        case 'z':
          if (event.metaKey || event.ctrlKey) {
            if (event.shiftKey) {
              redo();
            } else {
              undo();
            }
          }
          break;

        case 'y':
          if (event.ctrlKey) {
            redo();
          }
          break;
      }
    });
  }

  /**
   * Set up button navigation
   */
  function setupButtonNavigation() {
    btnFirst.addEventListener('click', navigateFirst);
    btnPrev.addEventListener('click', navigatePrevious);
    btnNext.addEventListener('click', navigateNext);
    btnLast.addEventListener('click', navigateLast);
  }

  /**
   * Set up action link click handlers
   */
  function setupActionLinks() {
    document.addEventListener('click', function (event) {
      const link = event.target.closest('a[href^="action:"]');
      if (link) {
        event.preventDefault();
        const actionHref = link.getAttribute('href');
        const actionId = link.dataset.actionId || extractActionId(actionHref);
        
        if (actionId) {
          sendMessage({
            type: 'executeAction',
            payload: {
              actionId: actionId,
            },
            messageId: generateMessageId(),
          });
          
          // Add running state
          link.classList.add('running');
          link.classList.remove('success', 'failed');
        }
      }
    });
  }

  /**
   * Extract action ID from action: URL
   */
  function extractActionId(href) {
    // Format: action:type?params
    // We use the href as the ID if no explicit ID
    return href;
  }

  /**
   * Generate unique message ID
   */
  function generateMessageId() {
    return 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Set up message listener for host messages
   */
  function setupMessageListener() {
    window.addEventListener('message', function (event) {
      const message = event.data;
      
      switch (message.type) {
        case 'slideChanged':
          handleSlideChanged(message);
          break;
          
        case 'deckLoaded':
          handleDeckLoaded(message);
          break;
          
        case 'actionStatusChanged':
          handleActionStatusChanged(message);
          break;
          
        case 'error':
          handleError(message);
          break;
          
        case 'trustStatusChanged':
          handleTrustStatusChanged(message);
          break;
      }
    });
  }

  /**
   * Navigation functions
   */
  function navigateNext() {
    if (currentSlide < totalSlides - 1) {
      sendMessage({ type: 'navigate', payload: { direction: 'next' } });
    }
  }

  function navigatePrevious() {
    if (currentSlide > 0) {
      sendMessage({ type: 'navigate', payload: { direction: 'prev' } });
    }
  }

  function navigateFirst() {
    if (currentSlide !== 0) {
      sendMessage({ type: 'navigate', payload: { direction: 'first' } });
    }
  }

  function navigateLast() {
    if (currentSlide !== totalSlides - 1) {
      sendMessage({ type: 'navigate', payload: { direction: 'last' } });
    }
  }

  function closePresentation() {
    sendMessage({ type: 'close', payload: {} });
  }

  function undo() {
    sendMessage({ type: 'undo', payload: {} });
  }

  function redo() {
    sendMessage({ type: 'redo', payload: {} });
  }

  /**
   * Show a specific slide
   */
  function showSlide(index) {
    if (index < 0 || index >= slides.length) {
      return;
    }

    currentSlide = index;
    const slide = slides[index];

    // Animate transition
    slideContent.style.animation = 'none';
    slideContent.offsetHeight; // Trigger reflow
    slideContent.style.animation = 'slideIn 0.3s ease-out';

    // Update content
    slideContent.innerHTML = slide.content || '';

    // Update indicator
    updateSlideIndicator();

    // Update navigation buttons
    updateNavigationButtons();
  }

  /**
   * Update slide indicator
   */
  function updateSlideIndicator() {
    slideIndicator.textContent = `${currentSlide + 1} / ${totalSlides}`;
  }

  /**
   * Update navigation button states
   */
  function updateNavigationButtons() {
    btnFirst.disabled = currentSlide === 0;
    btnPrev.disabled = currentSlide === 0;
    btnNext.disabled = currentSlide >= totalSlides - 1;
    btnLast.disabled = currentSlide >= totalSlides - 1;
  }

  /**
   * Message handlers
   */
  function handleSlideChanged(message) {
    const payload = message.payload || message;
    currentSlide = payload.slideIndex;
    totalSlides = payload.totalSlides || totalSlides;
    
    if (payload.slideHtml) {
      slideContent.innerHTML = payload.slideHtml;
    } else if (payload.slideContent) {
      slideContent.innerHTML = payload.slideContent;
    } else if (slides[currentSlide]) {
      slideContent.innerHTML = slides[currentSlide].content || '';
    }
    
    updateSlideIndicator();
    updateNavigationButtons();
  }

  function handleDeckLoaded(message) {
    const payload = message.payload || message;
    totalSlides = payload.totalSlides;
    slides = payload.slides || slides;
    showSlide(0);
  }

  function handleActionStatusChanged(message) {
    const payload = message.payload || message;
    const actionId = payload.actionId;
    const status = payload.status;
    
    // Find action link(s) with this ID
    const links = document.querySelectorAll(`a[data-action-id="${actionId}"], a[href="${actionId}"]`);
    
    links.forEach(function (link) {
      link.classList.remove('running', 'success', 'failed');
      if (status === 'running') {
        link.classList.add('running');
      } else if (status === 'success') {
        link.classList.add('success');
        // Remove success class after delay
        setTimeout(function () {
          link.classList.remove('success');
        }, 2000);
      } else if (status === 'failed') {
        link.classList.add('failed');
      }
    });

    // Show/hide overlay for blocking actions
    if (status === 'running') {
      // Could show overlay for long-running actions
    } else {
      hideActionOverlay();
    }
  }

  function handleError(message) {
    const payload = message.payload || message;
    console.error('Presentation error:', payload.error, payload.message);
    showActionOverlay('Error: ' + payload.message, 'error');
    setTimeout(hideActionOverlay, 3000);
  }

  function handleTrustStatusChanged(message) {
    const payload = message.payload || message;
    // Could update UI to show trust status
    console.log('Trust status changed:', payload.isTrusted);
  }

  /**
   * Action overlay helpers
   */
  function showActionOverlay(message, type) {
    actionStatus.innerHTML = `<div class="message ${type || ''}">${message}</div>`;
    actionOverlay.classList.remove('hidden');
  }

  function hideActionOverlay() {
    actionOverlay.classList.add('hidden');
  }

  /**
   * Send message to extension host
   */
  function sendMessage(message) {
    vscode.postMessage(message);
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
