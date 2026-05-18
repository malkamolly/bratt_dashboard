/*
 * Training Library — tag filter
 *
 * Filters the topic cards in the Library by tag. Each card has a
 * `data-tags` attribute with a comma-separated list of slugged tags
 * (e.g. "tree-disease,diagnostics,"). Clicking a filter button shows
 * only the cards whose data-tags contains that slug.
 *
 * Supports deep links like /library/#tree-disease so a meeting page
 * tag click could one day jump straight to a filtered library view.
 */
(function () {
  var filterRow = document.querySelector('[data-library-filters]');
  var grid = document.querySelector('[data-library-grid]');
  var emptyMessage = document.querySelector('[data-library-empty]');
  if (!filterRow || !grid) return;

  var buttons = Array.prototype.slice.call(filterRow.querySelectorAll('[data-filter]'));
  var cards = Array.prototype.slice.call(grid.querySelectorAll('[data-tags]'));

  function applyFilter(filter) {
    var visibleCount = 0;
    cards.forEach(function (card) {
      var match;
      if (filter === 'all') {
        match = true;
      } else {
        var tags = card.dataset.tags || '';
        match = tags.indexOf(filter + ',') !== -1;
      }
      card.hidden = !match;
      if (match) visibleCount++;
    });

    buttons.forEach(function (btn) {
      btn.classList.toggle(
        'library-filter--active',
        btn.dataset.filter === filter
      );
    });

    if (emptyMessage) {
      emptyMessage.hidden = visibleCount > 0;
    }
  }

  buttons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var filter = btn.dataset.filter;
      applyFilter(filter);
      if (filter === 'all') {
        if (window.history && window.history.replaceState) {
          history.replaceState(null, '', window.location.pathname);
        }
      } else {
        if (window.history && window.history.replaceState) {
          history.replaceState(null, '', '#' + filter);
        }
      }
    });
  });

  if (window.location.hash) {
    var hash = window.location.hash.replace('#', '');
    var match = buttons.find(function (b) { return b.dataset.filter === hash; });
    if (match) applyFilter(hash);
  }
})();
