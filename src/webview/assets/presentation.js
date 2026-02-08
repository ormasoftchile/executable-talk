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
  let currentFragment = 0;  // Current fragment index (0 = no fragments shown)
  let totalFragments = 0;   // Total fragments in current slide

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
    setupToolbar();
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
      // If slide picker is open, handle its keyboard events instead
      if (isSlidePickerOpen()) {
        handleSlidePickerKeydown(event);
        return;
      }

      // If digit accumulator is active, handle digit input
      if (isDigitAccumulatorActive() && event.key >= '0' && event.key <= '9') {
        event.preventDefault();
        handleDigitInput(event.key);
        return;
      }

      // Start digit accumulator on first digit press (T017)
      if (event.key >= '0' && event.key <= '9' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        startDigitAccumulator(event.key);
        return;
      }

      // Alt+Left: go back (T018)
      if (event.key === 'ArrowLeft' && event.altKey) {
        event.preventDefault();
        sendMessage({ type: 'goBack', payload: {} });
        return;
      }

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
          if (event.shiftKey) {
            // Shift+Right: skip fragments, go to next slide
            navigateNextSlide();
          } else {
            navigateNext();
          }
          break;

        case 'ArrowLeft':
        case 'ArrowUp':
        case 'Backspace':
        case 'PageUp':
          if (event.shiftKey) {
            // Shift+Left: skip fragments, go to previous slide
            navigatePreviousSlide();
          } else {
            navigatePrevious();
          }
          break;

        case 'Home':
          navigateFirst();
          break;

        case 'End':
          navigateLast();
          break;

        case 'Escape':
          if (isDigitAccumulatorActive()) {
            clearDigitAccumulator();
          } else {
            closePresentation();
          }
          break;

        case 'Enter':
          if (isDigitAccumulatorActive()) {
            event.preventDefault();
            confirmDigitAccumulator();
          }
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
   * Set up button navigation (always navigates full slides, not fragments)
   */
  function setupButtonNavigation() {
    btnFirst.addEventListener('click', navigateFirst);
    btnPrev.addEventListener('click', navigatePreviousSlide);
    btnNext.addEventListener('click', navigateNextSlide);
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
   * Set up toolbar button click handlers
   */
  function setupToolbar() {
    const toolbar = document.getElementById('toolbar');
    if (!toolbar) return;

    toolbar.addEventListener('click', function (event) {
      const button = event.target.closest('.toolbar-btn');
      if (button) {
        const commandId = button.dataset.command;
        if (commandId) {
          sendMessage({
            type: 'vscodeCommand',
            payload: {
              commandId: commandId,
            },
          });
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
          
        case 'renderBlockUpdate':
          handleRenderBlockUpdate(message);
          break;

        case 'openSlidePicker':
          handleOpenSlidePicker(message);
          break;

        case 'openScenePicker':
          handleOpenScenePicker(message);
          break;

        case 'openSceneNameInput':
          handleOpenSceneNameInput(message);
          break;

        case 'sceneChanged':
          handleSceneChanged(message);
          break;

        case 'warning':
          handleWarning(message);
          break;

        case 'envStatusChanged':
          handleEnvStatusChanged(message);
          break;
      }
    });
  }

  /**
   * Navigation functions - with fragment support
   */
  function navigateNext() {
    console.log('[Nav] navigateNext - currentFragment:', currentFragment, 'totalFragments:', totalFragments);
    // If there are unrevealed fragments, reveal the next one
    if (currentFragment < totalFragments) {
      revealNextFragment();
    } else if (currentSlide < totalSlides - 1) {
      // All fragments shown, go to next slide
      sendMessage({ type: 'navigate', payload: { direction: 'next' } });
    }
  }

  function navigatePrevious() {
    // If there are revealed fragments, hide the last one
    if (currentFragment > 0) {
      hideLastFragment();
    } else if (currentSlide > 0) {
      // No fragments shown, go to previous slide
      sendMessage({ type: 'navigate', payload: { direction: 'prev', showAllFragments: true } });
    }
  }

  /**
   * Navigate directly to previous slide, skipping fragment-by-fragment hiding
   */
  function navigatePreviousSlide() {
    if (currentSlide > 0) {
      sendMessage({ type: 'navigate', payload: { direction: 'prev', showAllFragments: true } });
    }
  }

  /**
   * Navigate directly to next slide, skipping fragment-by-fragment reveal
   */
  function navigateNextSlide() {
    if (currentSlide < totalSlides - 1) {
      sendMessage({ type: 'navigate', payload: { direction: 'next' } });
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
   * Fragment navigation functions
   */
  function revealNextFragment() {
    if (currentFragment >= totalFragments) return;
    
    currentFragment++;
    const fragment = slideContent.querySelector(`[data-fragment="${currentFragment}"]`);
    if (fragment) {
      fragment.classList.add('visible');
    }
    updateNavigationButtons();
  }

  function hideLastFragment() {
    if (currentFragment <= 0) return;
    
    const fragment = slideContent.querySelector(`[data-fragment="${currentFragment}"]`);
    if (fragment) {
      fragment.classList.remove('visible');
    }
    currentFragment--;
    updateNavigationButtons();
  }

  function showAllFragments() {
    const fragments = slideContent.querySelectorAll('.fragment');
    fragments.forEach(function(fragment) {
      fragment.classList.add('visible');
    });
    currentFragment = totalFragments;
    updateNavigationButtons();
  }

  function hideAllFragments() {
    const fragments = slideContent.querySelectorAll('.fragment');
    fragments.forEach(function(fragment) {
      fragment.classList.remove('visible');
    });
    currentFragment = 0;
    updateNavigationButtons();
  }

  function updateFragmentState() {
    // Count fragments in current slide
    const fragments = slideContent.querySelectorAll('.fragment');
    totalFragments = fragments.length;
    currentFragment = 0;
    console.log('[Fragments] Found', totalFragments, 'fragments in slide', currentSlide);
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
    console.log('[showSlide] Set slide', index, 'content. HTML contains .fragment?', slideContent.innerHTML.includes('fragment'));

    // Reset fragment state
    updateFragmentState();

    // Start loading timers for any async content
    startLoadingTimers();

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
    btnFirst.disabled = currentSlide === 0 && currentFragment === 0;
    btnPrev.disabled = currentSlide === 0 && currentFragment === 0;
    // Next is available if there are fragments to show OR more slides
    btnNext.disabled = currentSlide >= totalSlides - 1 && currentFragment >= totalFragments;
    btnLast.disabled = currentSlide >= totalSlides - 1;
  }

  /**
   * Message handlers
   */
  function handleSlideChanged(message) {
    const payload = message.payload || message;
    currentSlide = payload.slideIndex;
    totalSlides = payload.totalSlides || totalSlides;
    
    console.log('[handleSlideChanged] Received slide', currentSlide);
    
    if (payload.slideHtml) {
      slideContent.innerHTML = payload.slideHtml;
      console.log('[handleSlideChanged] Set slideHtml. Contains fragment?', payload.slideHtml.includes('class="fragment"'));
    } else if (payload.slideContent) {
      slideContent.innerHTML = payload.slideContent;
    } else if (slides[currentSlide]) {
      slideContent.innerHTML = slides[currentSlide].content || '';
    }
    
    // Update fragment state
    updateFragmentState();
    
    // If navigating back, show all fragments
    if (payload.showAllFragments) {
      showAllFragments();
    }
    
    updateSlideIndicator();
    updateNavigationButtons();

    // Update breadcrumb trail (T040)
    updateBreadcrumbTrail(payload.navigationHistory, payload.canGoBack, payload.totalHistoryEntries);
  }

  function handleDeckLoaded(message) {
    const payload = message.payload || message;
    totalSlides = payload.totalSlides;
    slides = payload.slides || slides;
    showSlide(0);

    // Initialize env badge if envStatus is present in deckLoaded payload
    if (payload.envStatus) {
      updateEnvBadge(payload.envStatus);
    }
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

    // --- Toast notification for failures (per error-feedback contract, T031) ---
    if (status === 'failed' && payload.actionType) {
      showErrorToast(payload);
    }
  }

  // =========================================================================
  // Toast Notification System (per error-feedback contract, T031)
  // =========================================================================

  /** Max simultaneous visible toasts */
  var MAX_TOASTS = 5;
  /** Auto-dismiss timeout for simple failures (ms) */
  var AUTO_DISMISS_MS = 8000;

  /** Icon map by action type */
  var ACTION_ICONS = {
    'file.open': '📄',
    'editor.highlight': '🔍',
    'terminal.run': '▶',
    'debug.start': '🐛',
    'sequence': '🔗',
    'vscode.command': '⚙️',
  };

  /**
   * Ensure the toast container exists in the DOM.
   */
  function getToastContainer() {
    var container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    return container;
  }

  /**
   * Show an error toast notification.
   */
  function showErrorToast(payload) {
    var container = getToastContainer();
    var isSequence = !!payload.sequenceDetail;
    var isTimeout = (payload.error || '').indexOf('timed out') >= 0;
    var persist = isSequence || isTimeout;

    // Enforce max toast count
    enforceMaxToasts(container);

    var toast = document.createElement('div');
    toast.className = 'toast toast--error toast--entering';
    toast.innerHTML = buildToastHTML(payload, isSequence);

    // Dismiss button
    var dismissBtn = toast.querySelector('.toast__dismiss');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', function () {
        removeToast(toast);
      });
    }

    // Auto-dismiss timer for simple failures
    var timerId = null;
    if (!persist) {
      timerId = setTimeout(function () {
        removeToast(toast);
      }, AUTO_DISMISS_MS);
      toast.dataset.autoDismiss = 'true';
    }

    // Hover pauses auto-dismiss
    toast.addEventListener('mouseenter', function () {
      if (timerId) {
        clearTimeout(timerId);
        timerId = null;
      }
    });
    toast.addEventListener('mouseleave', function () {
      if (!persist && toast.isConnected) {
        timerId = setTimeout(function () {
          removeToast(toast);
        }, AUTO_DISMISS_MS);
      }
    });

    container.appendChild(toast);

    // Trigger entry animation (remove entering class after animation)
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        toast.classList.remove('toast--entering');
      });
    });
  }

  /**
   * Build the inner HTML for a toast notification.
   */
  function buildToastHTML(payload, isSequence) {
    var icon = ACTION_ICONS[payload.actionType] || '❌';
    var title = (payload.actionType || 'action') + ' failed';
    var parts = [];

    parts.push('<div class="toast__header">');
    parts.push('<span class="toast__icon">' + icon + '</span>');
    parts.push('<span class="toast__title">' + escapeHtml(title) + '</span>');
    parts.push('<button class="toast__dismiss" aria-label="Dismiss">✕</button>');
    parts.push('</div>');

    if (payload.actionTarget) {
      parts.push('<div class="toast__target">' + escapeHtml(payload.actionTarget) + '</div>');
    }

    if (isSequence && payload.sequenceDetail) {
      var detail = payload.sequenceDetail;
      parts.push('<div class="toast__message">Step ' + (detail.failedStepIndex + 1) + ' of ' + detail.totalSteps + ' failed</div>');
      parts.push('<div class="toast__steps">');
      for (var i = 0; i < detail.stepResults.length; i++) {
        var step = detail.stepResults[i];
        var stepIcon = step.status === 'success' ? '✅' : step.status === 'failed' ? '❌' : '⏭';
        var stepClass = 'toast__step--' + step.status;
        parts.push('<div class="' + stepClass + '">');
        parts.push(stepIcon + ' ' + (i + 1) + '. ' + escapeHtml(step.type));
        if (step.status === 'failed' && step.error) {
          parts.push('<div class="toast__step-error">&nbsp;&nbsp;&nbsp;└─ ' + escapeHtml(step.error) + '</div>');
        }
        parts.push('</div>');
      }
      parts.push('</div>');
    } else if (payload.error) {
      parts.push('<div class="toast__message">' + escapeHtml(payload.error) + '</div>');
    }

    return parts.join('');
  }

  /**
   * Remove a toast with exit animation.
   */
  function removeToast(toast) {
    if (!toast.isConnected) return;
    toast.classList.add('toast--exiting');
    setTimeout(function () {
      if (toast.isConnected) {
        toast.remove();
      }
    }, 200);
  }

  /**
   * Enforce the max toast count by evicting the oldest auto-dismissible toast.
   */
  function enforceMaxToasts(container) {
    var toasts = container.querySelectorAll('.toast');
    if (toasts.length < MAX_TOASTS) return;

    // Find oldest auto-dismissible toast
    for (var i = 0; i < toasts.length; i++) {
      if (toasts[i].dataset.autoDismiss === 'true') {
        removeToast(toasts[i]);
        return;
      }
    }
    // If no auto-dismissible, remove the oldest toast regardless
    if (toasts.length >= MAX_TOASTS) {
      removeToast(toasts[0]);
    }
  }

  /**
   * Escape HTML to prevent XSS in toast content.
   */
  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
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
   * Handle render block updates (for async content loading)
   */
  function handleRenderBlockUpdate(message) {
    const payload = message.payload || message;
    const blockId = payload.blockId;
    const status = payload.status;
    
    // Find the render block by ID
    const block = slideContent.querySelector(`[data-render-id="${blockId}"]`);
    if (!block) {
      console.warn('Render block not found:', blockId);
      return;
    }
    
    switch (status) {
      case 'loading':
        // Already in loading state, possibly update elapsed time
        updateLoadingElapsed(block);
        break;
        
      case 'streaming':
        // Append streaming chunk to output
        if (payload.streamChunk) {
          appendStreamingOutput(block, payload.streamChunk, payload.isError);
        }
        break;
        
      case 'success':
      case 'error':
        // Replace loading block with final content
        if (payload.html) {
          const temp = document.createElement('div');
          temp.innerHTML = payload.html;
          const newBlock = temp.firstElementChild;
          if (newBlock) {
            newBlock.setAttribute('data-render-id', blockId);
            block.replaceWith(newBlock);
          }
        }
        break;
    }
  }

  /**
   * Update elapsed time on loading block
   */
  function updateLoadingElapsed(block) {
    const startTime = block.dataset.startTime;
    if (!startTime) {
      block.dataset.startTime = Date.now();
      return;
    }
    
    const elapsed = Math.floor((Date.now() - parseInt(startTime)) / 1000);
    const elapsedEl = block.querySelector('.loading-elapsed');
    if (elapsedEl) {
      elapsedEl.textContent = `(${elapsed}s)`;
    }
    
    // Add slow warning class after 5 seconds
    const timeout = parseInt(block.dataset.timeout) || 30000;
    if (elapsed > 5 && elapsed * 1000 < timeout * 0.8) {
      block.classList.add('loading-slow');
    }
  }

  /**
   * Append streaming output to loading block
   */
  function appendStreamingOutput(block, chunk, isError) {
    const streamingOutput = block.querySelector('.streaming-output');
    if (streamingOutput) {
      streamingOutput.style.display = 'block';
      const span = document.createElement('span');
      span.textContent = chunk;
      if (isError) {
        span.classList.add('streaming-error');
      }
      streamingOutput.appendChild(span);
      // Auto-scroll to bottom
      streamingOutput.scrollTop = streamingOutput.scrollHeight;
    }
  }

  /**
   * Start loading timers for all loading blocks in current slide
   */
  function startLoadingTimers() {
    const loadingBlocks = slideContent.querySelectorAll('.render-block-loading');
    loadingBlocks.forEach(function(block) {
      block.dataset.startTime = Date.now();
      // Update elapsed every second
      const timerId = setInterval(function() {
        if (!block.isConnected) {
          clearInterval(timerId);
          return;
        }
        updateLoadingElapsed(block);
      }, 1000);
    });
  }

  // =========================================================================
  // Slide Picker Overlay (T015, T019, T020)
  // =========================================================================

  var slidePickerOverlay = null;
  var slidePickerSlides = [];
  var slidePickerSelectedIndex = 0;

  /**
   * Check if the slide picker is currently open
   */
  function isSlidePickerOpen() {
    return slidePickerOverlay !== null && slidePickerOverlay.style.display !== 'none';
  }

  /**
   * Handle openSlidePicker message from extension host (T020)
   */
  function handleOpenSlidePicker(message) {
    var payload = message.payload || message;
    slidePickerSlides = payload.slides || [];
    showSlidePicker(slidePickerSlides, payload.currentIndex || 0);
  }

  /**
   * Show the slide picker overlay (T015)
   */
  function showSlidePicker(slides, currentIndex) {
    // Create overlay if it doesn't exist
    if (!slidePickerOverlay) {
      slidePickerOverlay = document.createElement('div');
      slidePickerOverlay.className = 'slide-picker-overlay';
      slidePickerOverlay.setAttribute('role', 'dialog');
      slidePickerOverlay.setAttribute('aria-label', 'Go to slide');
      slidePickerOverlay.innerHTML =
        '<div class="slide-picker">' +
          '<div class="slide-picker__header">' +
            '<input type="text" class="slide-picker__search" placeholder="Search slides or type a number..." autocomplete="off" />' +
          '</div>' +
          '<div class="slide-picker__list"></div>' +
        '</div>';
      document.body.appendChild(slidePickerOverlay);

      // Click backdrop to close
      slidePickerOverlay.addEventListener('click', function(e) {
        if (e.target === slidePickerOverlay) {
          hideSlidePicker();
        }
      });

      // Search input filtering
      var searchInput = slidePickerOverlay.querySelector('.slide-picker__search');
      searchInput.addEventListener('input', function() {
        filterSlidePickerList(searchInput.value);
      });
    }

    // Populate and show
    populateSlidePickerList(slides, currentIndex);
    slidePickerOverlay.style.display = 'flex';
    slidePickerSelectedIndex = 0;
    highlightSlidePickerItem(0);

    // Focus the search input
    var searchInput = slidePickerOverlay.querySelector('.slide-picker__search');
    searchInput.value = '';
    setTimeout(function() { searchInput.focus(); }, 50);
  }

  /**
   * Populate the slide picker list
   */
  function populateSlidePickerList(slides, currentIndex) {
    var list = slidePickerOverlay.querySelector('.slide-picker__list');
    list.innerHTML = '';

    for (var i = 0; i < slides.length; i++) {
      var item = document.createElement('div');
      item.className = 'slide-picker__item' + (i === currentIndex ? ' slide-picker__item--current' : '');
      item.dataset.index = slides[i].index;
      item.innerHTML =
        '<span class="slide-picker__number">' + (slides[i].index + 1) + '</span>' +
        '<span class="slide-picker__title">' + escapeHtml(slides[i].title) + '</span>';

      // Click to select (T019)
      (function(slideIndex) {
        item.addEventListener('click', function() {
          selectSlideFromPicker(slideIndex);
        });
      })(slides[i].index);

      list.appendChild(item);
    }
  }

  /**
   * Filter the slide picker list based on search query
   */
  function filterSlidePickerList(query) {
    var list = slidePickerOverlay.querySelector('.slide-picker__list');
    var items = list.querySelectorAll('.slide-picker__item');
    var lowerQuery = query.toLowerCase().trim();
    var firstVisible = -1;

    for (var i = 0; i < items.length; i++) {
      var number = items[i].querySelector('.slide-picker__number').textContent;
      var title = items[i].querySelector('.slide-picker__title').textContent.toLowerCase();
      var visible = !lowerQuery || number === lowerQuery || title.indexOf(lowerQuery) >= 0;
      items[i].style.display = visible ? '' : 'none';
      if (visible && firstVisible === -1) {
        firstVisible = i;
      }
    }

    // Reset selection to first visible item
    slidePickerSelectedIndex = firstVisible >= 0 ? firstVisible : 0;
    highlightSlidePickerItem(slidePickerSelectedIndex);
  }

  /**
   * Highlight a slide picker item
   */
  function highlightSlidePickerItem(index) {
    var list = slidePickerOverlay.querySelector('.slide-picker__list');
    var items = list.querySelectorAll('.slide-picker__item');
    for (var i = 0; i < items.length; i++) {
      items[i].classList.toggle('slide-picker__item--selected', i === index);
    }
    // Scroll selected item into view
    if (items[index]) {
      items[index].scrollIntoView({ block: 'nearest' });
    }
  }

  /**
   * Handle keyboard events when slide picker is open
   */
  function handleSlidePickerKeydown(event) {
    var list = slidePickerOverlay.querySelector('.slide-picker__list');
    var items = Array.from(list.querySelectorAll('.slide-picker__item')).filter(function(item) {
      return item.style.display !== 'none';
    });

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        slidePickerSelectedIndex = Math.min(slidePickerSelectedIndex + 1, items.length - 1);
        highlightVisibleItem(items, slidePickerSelectedIndex);
        break;

      case 'ArrowUp':
        event.preventDefault();
        slidePickerSelectedIndex = Math.max(slidePickerSelectedIndex - 1, 0);
        highlightVisibleItem(items, slidePickerSelectedIndex);
        break;

      case 'Enter':
        event.preventDefault();
        if (items[slidePickerSelectedIndex]) {
          var slideIndex = parseInt(items[slidePickerSelectedIndex].dataset.index, 10);
          selectSlideFromPicker(slideIndex);
        }
        break;

      case 'Escape':
        event.preventDefault();
        hideSlidePicker();
        break;
    }
  }

  /**
   * Highlight visible item by filtered index
   */
  function highlightVisibleItem(visibleItems, index) {
    var list = slidePickerOverlay.querySelector('.slide-picker__list');
    var allItems = list.querySelectorAll('.slide-picker__item');
    for (var i = 0; i < allItems.length; i++) {
      allItems[i].classList.remove('slide-picker__item--selected');
    }
    if (visibleItems[index]) {
      visibleItems[index].classList.add('slide-picker__item--selected');
      visibleItems[index].scrollIntoView({ block: 'nearest' });
    }
  }

  /**
   * Select a slide from the picker and navigate (T019)
   */
  function selectSlideFromPicker(slideIndex) {
    hideSlidePicker();
    sendMessage({
      type: 'navigate',
      payload: { direction: 'goto', slideIndex: slideIndex },
    });
  }

  /**
   * Hide the slide picker overlay
   */
  function hideSlidePicker() {
    if (slidePickerOverlay) {
      slidePickerOverlay.style.display = 'none';
    }
  }

  // =========================================================================
  // Digit-Key Jump-by-Number Input (T017)
  // =========================================================================

  var digitAccumulator = '';
  var digitTimerId = null;
  var digitIndicator = null;
  var DIGIT_TIMEOUT_MS = 1500;

  /**
   * Check if the digit accumulator is active
   */
  function isDigitAccumulatorActive() {
    return digitAccumulator.length > 0;
  }

  /**
   * Start the digit accumulator with the first digit
   */
  function startDigitAccumulator(digit) {
    digitAccumulator = digit;
    showDigitIndicator();
    resetDigitTimer();
  }

  /**
   * Handle additional digit input
   */
  function handleDigitInput(digit) {
    digitAccumulator += digit;
    updateDigitIndicator();
    resetDigitTimer();
  }

  /**
   * Confirm the accumulated digit as a slide number
   */
  function confirmDigitAccumulator() {
    var slideNumber = parseInt(digitAccumulator, 10);
    clearDigitAccumulator();

    if (!isNaN(slideNumber) && slideNumber >= 1 && slideNumber <= totalSlides) {
      // Convert 1-based to 0-based
      sendMessage({
        type: 'navigate',
        payload: { direction: 'goto', slideIndex: slideNumber - 1 },
      });
    }
  }

  /**
   * Clear the digit accumulator
   */
  function clearDigitAccumulator() {
    digitAccumulator = '';
    if (digitTimerId) {
      clearTimeout(digitTimerId);
      digitTimerId = null;
    }
    hideDigitIndicator();
  }

  /**
   * Reset the auto-confirm timer
   */
  function resetDigitTimer() {
    if (digitTimerId) {
      clearTimeout(digitTimerId);
    }
    digitTimerId = setTimeout(function() {
      confirmDigitAccumulator();
    }, DIGIT_TIMEOUT_MS);
  }

  /**
   * Show the digit indicator overlay
   */
  function showDigitIndicator() {
    if (!digitIndicator) {
      digitIndicator = document.createElement('div');
      digitIndicator.className = 'digit-indicator';
      document.body.appendChild(digitIndicator);
    }
    digitIndicator.textContent = digitAccumulator;
    digitIndicator.style.display = 'block';
  }

  /**
   * Update the digit indicator text
   */
  function updateDigitIndicator() {
    if (digitIndicator) {
      digitIndicator.textContent = digitAccumulator;
    }
  }

  /**
   * Hide the digit indicator
   */
  function hideDigitIndicator() {
    if (digitIndicator) {
      digitIndicator.style.display = 'none';
    }
  }

  // =========================================================================
  // Scene Picker & Name Input Handlers (T028, T029, T031, T032)
  // =========================================================================

  var sceneNameOverlay = null;
  var scenePickerOverlay = null;
  var cachedScenes = [];

  /**
   * Handle openScenePicker message from extension host (T029)
   */
  function handleOpenScenePicker(message) {
    var payload = message.payload || message;
    var scenes = payload.scenes || cachedScenes;
    showScenePicker(scenes);
  }

  /**
   * Handle openSceneNameInput message from extension host (T028)
   */
  function handleOpenSceneNameInput(_message) {
    showSceneNameInput();
  }

  /**
   * Handle sceneChanged message — update cached scene list (T031)
   */
  function handleSceneChanged(message) {
    var payload = message.payload || message;
    cachedScenes = payload.scenes || [];
  }

  /**
   * Handle warning message — display non-blocking notification (T032)
   */
  function handleWarning(message) {
    var payload = message.payload || message;
    console.warn('[Webview] Warning:', payload.code, payload.message);
    showActionOverlay(payload.message, 'warning');
    setTimeout(hideActionOverlay, 2000);
  }

  // ---- Scene Name Input Overlay (T028) ----

  /**
   * Show the scene name input overlay
   */
  function showSceneNameInput() {
    if (!sceneNameOverlay) {
      sceneNameOverlay = document.createElement('div');
      sceneNameOverlay.className = 'scene-name-overlay';
      sceneNameOverlay.setAttribute('role', 'dialog');
      sceneNameOverlay.setAttribute('aria-label', 'Save scene');
      sceneNameOverlay.innerHTML =
        '<div class="scene-name-dialog">' +
          '<div class="scene-name-dialog__header">Save Scene</div>' +
          '<input type="text" class="scene-name-dialog__input" placeholder="Scene name..." autocomplete="off" />' +
          '<div class="scene-name-dialog__hint">Press Enter to save, Escape to cancel</div>' +
        '</div>';
      document.body.appendChild(sceneNameOverlay);

      // Click backdrop to close
      sceneNameOverlay.addEventListener('click', function(e) {
        if (e.target === sceneNameOverlay) {
          hideSceneNameInput();
        }
      });

      var input = sceneNameOverlay.querySelector('.scene-name-dialog__input');
      input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          var name = input.value.trim();
          if (name) {
            sendMessage({ type: 'saveScene', payload: { sceneName: name } });
            hideSceneNameInput();
          }
        } else if (e.key === 'Escape') {
          e.preventDefault();
          hideSceneNameInput();
        }
      });
    }

    sceneNameOverlay.style.display = 'flex';
    var input = sceneNameOverlay.querySelector('.scene-name-dialog__input');
    input.value = '';
    setTimeout(function() { input.focus(); }, 50);
  }

  /**
   * Hide the scene name input overlay
   */
  function hideSceneNameInput() {
    if (sceneNameOverlay) {
      sceneNameOverlay.style.display = 'none';
    }
  }

  // ---- Scene Picker Overlay (T029) ----

  /**
   * Show the scene picker overlay for restore
   */
  function showScenePicker(scenes) {
    if (!scenePickerOverlay) {
      scenePickerOverlay = document.createElement('div');
      scenePickerOverlay.className = 'slide-picker-overlay';
      scenePickerOverlay.setAttribute('role', 'dialog');
      scenePickerOverlay.setAttribute('aria-label', 'Restore scene');
      scenePickerOverlay.innerHTML =
        '<div class="slide-picker">' +
          '<div class="slide-picker__header">' +
            '<input type="text" class="slide-picker__search" placeholder="Search scenes..." autocomplete="off" />' +
          '</div>' +
          '<div class="slide-picker__list scene-picker__list"></div>' +
        '</div>';
      document.body.appendChild(scenePickerOverlay);

      scenePickerOverlay.addEventListener('click', function(e) {
        if (e.target === scenePickerOverlay) {
          hideScenePickerOverlay();
        }
      });

      var searchInput = scenePickerOverlay.querySelector('.slide-picker__search');
      searchInput.addEventListener('input', function() {
        filterScenePickerList(searchInput.value);
      });
      searchInput.addEventListener('keydown', function(e) {
        handleScenePickerKeydown(e);
      });
    }

    populateScenePickerList(scenes);
    scenePickerOverlay.style.display = 'flex';
    var searchInput = scenePickerOverlay.querySelector('.slide-picker__search');
    searchInput.value = '';
    setTimeout(function() { searchInput.focus(); }, 50);
  }

  var scenePickerSelectedIdx = 0;

  function populateScenePickerList(scenes) {
    var list = scenePickerOverlay.querySelector('.scene-picker__list');
    list.innerHTML = '';
    scenePickerSelectedIdx = 0;

    if (scenes.length === 0) {
      list.innerHTML = '<div class="scene-picker__empty">No scenes saved yet</div>';
      return;
    }

    for (var i = 0; i < scenes.length; i++) {
      var scene = scenes[i];
      var item = document.createElement('div');
      item.className = 'slide-picker__item scene-picker__item';
      item.dataset.sceneName = scene.name;
      item.dataset.sceneIndex = i;

      var badge = scene.isAuthored ? '<span class="scene-picker__badge">authored</span>' : '';
      var timestamp = scene.timestamp ? '<span class="scene-picker__time">' + new Date(scene.timestamp).toLocaleTimeString() + '</span>' : '';
      item.innerHTML =
        '<span class="scene-picker__name">' + escapeHtml(scene.name) + '</span>' +
        badge +
        '<span class="slide-picker__number">Slide ' + (scene.slideIndex + 1) + '</span>' +
        timestamp +
        (!scene.isAuthored ? '<button class="scene-picker__delete" title="Delete scene">✕</button>' : '');

      // Click to restore
      (function(sceneName) {
        item.addEventListener('click', function(e) {
          if (e.target.classList.contains('scene-picker__delete')) {
            e.stopPropagation();
            sendMessage({ type: 'deleteScene', payload: { sceneName: sceneName } });
            // Remove the item from display
            item.remove();
            return;
          }
          hideScenePickerOverlay();
          sendMessage({ type: 'restoreScene', payload: { sceneName: sceneName } });
        });
      })(scene.name);

      list.appendChild(item);
    }

    highlightScenePickerItem(0);
  }

  function filterScenePickerList(query) {
    var list = scenePickerOverlay.querySelector('.scene-picker__list');
    var items = list.querySelectorAll('.scene-picker__item');
    var lowerQuery = query.toLowerCase().trim();
    var firstVisible = -1;

    for (var i = 0; i < items.length; i++) {
      var name = items[i].dataset.sceneName.toLowerCase();
      var visible = !lowerQuery || name.indexOf(lowerQuery) >= 0;
      items[i].style.display = visible ? '' : 'none';
      if (visible && firstVisible === -1) {
        firstVisible = i;
      }
    }

    scenePickerSelectedIdx = firstVisible >= 0 ? firstVisible : 0;
    highlightScenePickerItem(scenePickerSelectedIdx);
  }

  function highlightScenePickerItem(index) {
    var list = scenePickerOverlay.querySelector('.scene-picker__list');
    var items = list.querySelectorAll('.scene-picker__item');
    for (var i = 0; i < items.length; i++) {
      items[i].classList.toggle('slide-picker__item--selected', i === index);
    }
    if (items[index]) {
      items[index].scrollIntoView({ block: 'nearest' });
    }
  }

  function handleScenePickerKeydown(event) {
    var list = scenePickerOverlay.querySelector('.scene-picker__list');
    var items = Array.from(list.querySelectorAll('.scene-picker__item')).filter(function(item) {
      return item.style.display !== 'none';
    });

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        scenePickerSelectedIdx = Math.min(scenePickerSelectedIdx + 1, items.length - 1);
        highlightVisibleSceneItem(items, scenePickerSelectedIdx);
        break;
      case 'ArrowUp':
        event.preventDefault();
        scenePickerSelectedIdx = Math.max(scenePickerSelectedIdx - 1, 0);
        highlightVisibleSceneItem(items, scenePickerSelectedIdx);
        break;
      case 'Enter':
        event.preventDefault();
        if (items[scenePickerSelectedIdx]) {
          var name = items[scenePickerSelectedIdx].dataset.sceneName;
          hideScenePickerOverlay();
          sendMessage({ type: 'restoreScene', payload: { sceneName: name } });
        }
        break;
      case 'Escape':
        event.preventDefault();
        hideScenePickerOverlay();
        break;
    }
  }

  function highlightVisibleSceneItem(visibleItems, index) {
    var list = scenePickerOverlay.querySelector('.scene-picker__list');
    var allItems = list.querySelectorAll('.scene-picker__item');
    for (var i = 0; i < allItems.length; i++) {
      allItems[i].classList.remove('slide-picker__item--selected');
    }
    if (visibleItems[index]) {
      visibleItems[index].classList.add('slide-picker__item--selected');
      visibleItems[index].scrollIntoView({ block: 'nearest' });
    }
  }

  function hideScenePickerOverlay() {
    if (scenePickerOverlay) {
      scenePickerOverlay.style.display = 'none';
    }
  }

  // =========================================================================
  // History Breadcrumb Trail (T040)
  // =========================================================================

  var breadcrumbTrail = null;

  /**
   * Update the breadcrumb trail with navigation history
   */
  function updateBreadcrumbTrail(navigationHistory, canGoBack, totalHistoryEntries) {
    if (!navigationHistory || navigationHistory.length === 0) {
      if (breadcrumbTrail) {
        breadcrumbTrail.style.display = 'none';
      }
      return;
    }

    if (!breadcrumbTrail) {
      breadcrumbTrail = document.createElement('div');
      breadcrumbTrail.className = 'breadcrumb-trail';
      breadcrumbTrail.setAttribute('role', 'navigation');
      breadcrumbTrail.setAttribute('aria-label', 'Slide history');
      document.body.appendChild(breadcrumbTrail);
    }

    breadcrumbTrail.style.display = '';

    // Show up to 10 breadcrumbs (most recent last for left-to-right reading)
    var crumbs = navigationHistory.slice().reverse(); // oldest → newest
    var totalEntries = totalHistoryEntries || crumbs.length;
    var hasMore = totalEntries > crumbs.length;
    var visibleCrumbs = crumbs; // Already limited to 10 by conductor

    var html = '';

    if (hasMore) {
      html += '<span class="breadcrumb-trail__more" title="' + totalEntries + ' total slides visited">…</span>';
      html += '<span class="breadcrumb-trail__separator">›</span>';
    }

    for (var i = 0; i < visibleCrumbs.length; i++) {
      var crumb = visibleCrumbs[i];
      var label = crumb.slideTitle || ('Slide ' + (crumb.slideIndex + 1));
      var methodIcon = getMethodIcon(crumb.method);

      if (i > 0) {
        html += '<span class="breadcrumb-trail__separator">›</span>';
      }

      html += '<button class="breadcrumb-trail__item" data-slide-index="' + crumb.slideIndex + '" title="' +
        escapeHtml(label) + ' (' + crumb.method + ')">' +
        methodIcon + ' ' + escapeHtml(label) + '</button>';
    }

    if (canGoBack) {
      html += '<button class="breadcrumb-trail__back" title="Go back (Alt+Left)">⏎</button>';
    }

    breadcrumbTrail.innerHTML = html;

    // Wire up click handlers
    var items = breadcrumbTrail.querySelectorAll('.breadcrumb-trail__item');
    for (var j = 0; j < items.length; j++) {
      (function(item) {
        item.addEventListener('click', function() {
          var slideIndex = parseInt(item.dataset.slideIndex, 10);
          sendMessage({ type: 'navigate', payload: { direction: 'goto', slideIndex: slideIndex } });
        });
      })(items[j]);
    }

    var backBtn = breadcrumbTrail.querySelector('.breadcrumb-trail__back');
    if (backBtn) {
      backBtn.addEventListener('click', function() {
        sendMessage({ type: 'goBack' });
      });
    }
  }

  function getMethodIcon(method) {
    switch (method) {
      case 'sequential': return '→';
      case 'jump': return '⤳';
      case 'go-back': return '←';
      case 'scene-restore': return '📌';
      default: return '·';
    }
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

  // ─────────────────────────────────────────────────
  // Env status badge (Feature 006 — T047)
  // ─────────────────────────────────────────────────

  /**
   * Handle envStatusChanged message — update env badge.
   */
  function handleEnvStatusChanged(message) {
    const envStatus = message.payload?.envStatus;
    if (!envStatus) return;
    updateEnvBadge(envStatus);
  }

  /**
   * Update the env badge in the toolbar area.
   * Green (✓) when all resolved, yellow (⚠) when issues exist.
   * Click sends envSetupRequest to host.
   */
  function updateEnvBadge(envStatus) {
    const badge = document.getElementById('env-badge');
    if (!badge) return;

    badge.classList.remove('hidden', 'env-badge--ok', 'env-badge--warn', 'env-badge--error');

    if (envStatus.isComplete) {
      badge.textContent = 'Env ✓';
      badge.classList.add('env-badge--ok');
      badge.title = 'All ' + envStatus.total + ' environment variables resolved';
    } else {
      const missing = envStatus.missing || 0;
      const invalid = envStatus.invalid || 0;
      const issues = missing + invalid;
      badge.textContent = 'Env ⚠ ' + issues;
      badge.classList.add('env-badge--warn');
      
      var parts = [];
      if (missing > 0) parts.push(missing + ' missing');
      if (invalid > 0) parts.push(invalid + ' invalid');
      badge.title = 'Environment issues: ' + parts.join(', ');
    }

    // Set up click handler (only once)
    if (!badge.dataset.initialized) {
      badge.addEventListener('click', function () {
        sendMessage({ type: 'envSetupRequest' });
      });
      badge.dataset.initialized = 'true';
    }
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
