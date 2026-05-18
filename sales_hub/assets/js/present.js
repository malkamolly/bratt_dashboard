/*
 * Sales Arborist Hub — Meeting topic slideshows
 *
 * Each meeting page has up to three topic decks (Educational,
 * Housekeeping, Operations). Each deck is a <dialog> with a series of
 * .slide sections. Clicking a deck launcher opens that deck's dialog
 * and starts on slide 1.
 *
 * Keyboard while a deck is open:
 *   ArrowRight / Space / PageDown / Enter -> next slide
 *   ArrowLeft / PageUp                    -> previous slide
 *   Home / End                            -> first / last slide
 *   Escape                                -> close the deck
 */
(function () {
  var launchers = document.querySelectorAll('[data-open-deck]');
  var modals = document.querySelectorAll('.deck-modal');
  if (!launchers.length || !modals.length) return;

  var activeModal = null;
  var activeSlides = [];
  var activeIndex = 0;
  var activeCounter = null;

  function openDeck(name) {
    var modal = document.querySelector('.deck-modal[data-deck="' + name + '"]');
    if (!modal) return;
    activeModal = modal;
    activeSlides = Array.prototype.slice.call(modal.querySelectorAll('.slide'));
    activeCounter = modal.querySelector('[data-counter]');
    activeIndex = 0;
    showSlide(0);
    if (typeof modal.showModal === 'function') {
      modal.showModal();
    } else {
      modal.setAttribute('open', '');
    }
  }

  function closeDeck() {
    if (!activeModal) return;
    if (typeof activeModal.close === 'function') {
      activeModal.close();
    } else {
      activeModal.removeAttribute('open');
    }
  }

  function resetActive() {
    if (activeSlides.length) {
      activeSlides.forEach(function (s) { s.classList.remove('slide--active'); });
    }
    activeModal = null;
    activeSlides = [];
    activeCounter = null;
    activeIndex = 0;
  }

  function showSlide(i) {
    if (!activeSlides.length) return;
    activeIndex = Math.max(0, Math.min(activeSlides.length - 1, i));
    activeSlides.forEach(function (s, idx) {
      s.classList.toggle('slide--active', idx === activeIndex);
    });
    if (activeCounter) {
      activeCounter.textContent = (activeIndex + 1) + ' / ' + activeSlides.length;
    }
    var current = activeSlides[activeIndex];
    if (current) {
      current.scrollTop = 0;
      reflowSlide(current);
    }
  }

  // If a slide's content would overflow vertically, switch its body to
  // a two-column layout. Otherwise leave it as a single column.
  function reflowSlide(slide) {
    var body = slide.querySelector('.slide__body');
    if (!body) return;
    body.classList.remove('slide__body--columns');
    requestAnimationFrame(function () {
      if (slide.scrollHeight > slide.clientHeight + 2) {
        body.classList.add('slide__body--columns');
      }
    });
  }

  window.addEventListener('resize', function () {
    if (!activeSlides.length) return;
    var current = activeSlides[activeIndex];
    if (current) reflowSlide(current);
  });

  function next() { showSlide(activeIndex + 1); }
  function prev() { showSlide(activeIndex - 1); }

  launchers.forEach(function (btn) {
    btn.addEventListener('click', function () {
      openDeck(btn.dataset.openDeck);
    });
  });

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-action]');
    if (!t) return;
    var action = t.dataset.action;
    if (action === 'close-deck') closeDeck();
    else if (action === 'next-slide') next();
    else if (action === 'prev-slide') prev();
  });

  document.addEventListener('keydown', function (e) {
    if (!activeModal) return;
    switch (e.key) {
      case 'ArrowRight':
      case 'PageDown':
      case ' ':
      case 'Enter':
        e.preventDefault(); next(); break;
      case 'ArrowLeft':
      case 'PageUp':
        e.preventDefault(); prev(); break;
      case 'Home':
        e.preventDefault(); showSlide(0); break;
      case 'End':
        e.preventDefault(); showSlide(activeSlides.length - 1); break;
    }
  });

  modals.forEach(function (modal) {
    // Click on the dialog backdrop (i.e. directly on the dialog, not
    // its inner content) closes the deck.
    modal.addEventListener('click', function (e) {
      if (e.target === modal) closeDeck();
    });
    // Native 'close' event fires from Escape key or .close() call.
    modal.addEventListener('close', function () {
      if (activeModal === modal) resetActive();
    });
  });
})();
