// Site-wide full-text search over Quarto's generated search.json.
// Provides: (1) a search button next to the Home button that opens a modal
// on every slide deck, (2) wiring for the inline search box on index.qmd
// (a #search-input / #search-results pair, if present on the page).
(function () {
  try {
    // UI strings follow the document language: Japanese when <html lang>
    // starts with "ja" (the format default), English otherwise.
    var JA = (((document.documentElement && document.documentElement.lang) || 'ja')
              .toLowerCase().indexOf('ja') === 0);
    var T = JA ? {
      minChars: '2文字以上で検索',
      noHits: 'ヒットなし',
      loadFail: '検索インデックスを読み込めませんでした',
      placeholder: '全文検索 — どの回に出てきたか探せる（Esc で閉じる）',
      btnTitle: '全文検索（Ctrl+F または / で開く）',
      btnLabel: '全文検索'
    } : {
      minChars: 'Type at least 2 characters',
      noHits: 'No results',
      loadFail: 'Could not load the search index',
      placeholder: 'Search all lectures (Esc to close)',
      btnTitle: 'Full-text search (Ctrl+F or /)',
      btnLabel: 'Full-text search'
    };

    var STYLE = [
      // same visual language as the code-expand button (white circle, gray icon)
      '#search-btn {',
      '  position: fixed; top: 54px; right: 14px; z-index: 100;',
      '  width: 34px; height: 34px; padding: 0;',
      '  display: flex; align-items: center; justify-content: center;',
      '  border: 2px solid rgba(0,0,0,0.25); border-radius: 50%;',
      '  background: rgba(255,255,255,0.92); color: #666; cursor: pointer;',
      '  opacity: 0.82; box-shadow: 0 2px 8px rgba(0,0,0,0.22);',
      '  transition: opacity 0.15s ease, background 0.15s ease, transform 0.15s ease;',
      '}',
      '#search-btn:hover, #search-btn:focus {',
      '  opacity: 1; background: white; transform: scale(1.06); color: #2980b9;',
      '}',
      '#search-btn svg { width: 18px; height: 18px; display: block; pointer-events: none; }',
      '#search-modal {',
      '  position: fixed; inset: 0; z-index: 10500; display: none;',
      '  align-items: flex-start; justify-content: center;',
      '  padding: 8vh 4vw; background: rgba(0,0,0,0.55); box-sizing: border-box;',
      '}',
      '#search-modal.search-open { display: flex; }',
      '#search-modal-panel {',
      '  width: min(860px, 92vw); max-height: 80vh; background: #fff;',
      '  border-radius: 8px; padding: 16px; box-sizing: border-box;',
      '  box-shadow: 0 16px 48px rgba(0,0,0,0.35);',
      '  display: flex; flex-direction: column;',
      '}',
      '#search-modal-input {',
      '  width: 100%; font-size: 1.4rem; padding: 8px 14px;',
      '  border: 2px solid #5dade2; border-radius: 6px;',
      '  box-sizing: border-box; background: #fff;',
      '}',
      '#search-results { margin-top: 6px; max-height: 45vh; overflow-y: auto; }',
      '#search-modal-results { margin-top: 8px; overflow-y: auto; }',
      '.search-ui-results a.search-hit {',
      '  display: block; padding: 6px 12px; margin: 5px 0;',
      '  font-size: 1.15rem; line-height: 1.5;',
      '  border: 1px solid #ddd; border-radius: 5px;',
      '  text-decoration: none; color: #333; background: #fafafa;',
      '}',
      '.search-ui-results a.search-hit:hover { background: #eaf4fb; border-color: #5dade2; }',
      '.search-ui-results .hit-loc { font-weight: bold; color: #2980b9; }',
      '.search-ui-results mark { background: #fff3a0; padding: 0 2px; }',
      '.search-ui-results .search-note { font-size: 1.1rem; color: #888; padding: 4px 10px; }',
      '.search-ui-results a[href]::after { content: none !important; display: none !important; }'
    ].join('\n');

    var indexData = null;

    function esc(s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
                      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // Filename (before the #hash), lowercased — used to float hits from the
    // deck the user is currently viewing to the top of the results.
    function deckFile(href) {
      return String(href || '').split('#')[0].split('/').pop().toLowerCase();
    }
    function currentDeckFile() {
      var p = location.pathname;
      try { p = decodeURIComponent(p); } catch (e) {}
      return p.split('/').pop().toLowerCase();
    }

    // How strongly a hit is "about" the query: a match in the slide heading
    // (section) means the term is that slide's topic, not just mentioned in
    // passing; a match in the deck title is the next-best signal. Body-only
    // hits score 0. Used to float topic slides above incidental mentions.
    function topicScore(e, q) {
      var s = 0;
      if ((e.section || '').toLowerCase().indexOf(q) >= 0) s += 2;
      if ((e.title || '').toLowerCase().indexOf(q) >= 0) s += 1;
      return s;
    }

    function loadIndex() {
      if (indexData !== null) return Promise.resolve(indexData);
      return fetch('search.json')
        .then(function (r) { return r.json(); })
        .then(function (d) {
          indexData = d.filter(function (e) { return e.href.indexOf('index.html') !== 0; });
          return indexData;
        });
    }

    function snippet(text, q) {
      var i = text.toLowerCase().indexOf(q);
      if (i < 0) return '';
      var start = Math.max(0, i - 35);
      var end = Math.min(text.length, i + q.length + 50);
      return ((start > 0 ? '…' : '') + esc(text.slice(start, i)) +
              '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' +
              esc(text.slice(i + q.length, end)) +
              (end < text.length ? '…' : '')).replace(/\n+/g, ' ');
    }

    function renderInto(resultsEl, qRaw) {
      var q = qRaw.trim().toLowerCase();
      if (q.length < 2) {
        resultsEl.innerHTML = q.length === 1
          ? '<div class="search-note">' + T.minChars + '</div>' : '';
        return;
      }
      loadIndex().then(function (idx) {
        var hits = [];
        for (var i = 0; i < idx.length; i++) {
          var e = idx[i];
          var hay = (e.title + '\n' + (e.section || '') + '\n' + (e.text || '')).toLowerCase();
          if (hay.indexOf(q) >= 0) hits.push(e);
        }
        if (hits.length === 0) {
          resultsEl.innerHTML = '<div class="search-note">' + T.noHits + '</div>';
          return;
        }
        // Rank the hits (stable sort keeps the original index order within a
        // tier). Done before the 30-hit cap so a strong-but-late hit still
        // wins its place. Priority:
        //   1. slide-heading / deck-title matches — the term is the topic, not
        //      just mentioned (this is what surfaces "where X is explained").
        //   2. hits from the deck being viewed, so in-deck search stays local.
        var cur = currentDeckFile();
        hits.sort(function (a, b) {
          var d = topicScore(b, q) - topicScore(a, q);
          if (d) return d;
          if (cur) return (deckFile(a.href) === cur ? 0 : 1) - (deckFile(b.href) === cur ? 0 : 1);
          return 0;
        });
        hits = hits.slice(0, 30);
        resultsEl.innerHTML = hits.map(function (e) {
          var href = e.href.replace('#', '#/');
          var loc = esc(e.title) + (e.section ? ' › ' + esc(e.section) : '');
          return '<a class="search-hit" href="' + href + '">' +
                 '<span class="hit-loc">' + loc + '</span><br>' +
                 snippet(e.text || '', q) + '</a>';
        }).join('');
      }).catch(function () {
        resultsEl.innerHTML =
          '<div class="search-note">' + T.loadFail + '</div>';
      });
    }

    function attach(input, resultsEl) {
      var timer = null;
      input.addEventListener('input', function () {
        clearTimeout(timer);
        timer = setTimeout(function () { renderInto(resultsEl, input.value); }, 120);
      });
    }

    // --- modal ---
    var keyboardPrev = null;

    function setRevealKeyboard(active) {
      try {
        if (!window.Reveal || !Reveal.configure) return;
        if (!active) {
          if (keyboardPrev === null && Reveal.getConfig) {
            keyboardPrev = Reveal.getConfig().keyboard;
          }
          Reveal.configure({ keyboard: false });
        } else {
          Reveal.configure({ keyboard: keyboardPrev === null ? true : keyboardPrev });
          keyboardPrev = null;
        }
      } catch (e) {}
    }

    function ensureModal() {
      var modal = document.getElementById('search-modal');
      if (modal) return modal;
      modal = document.createElement('div');
      modal.id = 'search-modal';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.innerHTML =
        '<div id="search-modal-panel">' +
        '<input id="search-modal-input" type="search" ' +
        'placeholder="' + T.placeholder + '" autocomplete="off">' +
        '<div id="search-modal-results" class="search-ui-results"></div>' +
        '</div>';
      document.body.appendChild(modal);
      modal.addEventListener('click', function (e) {
        if (e.target === modal) closeModal();
      });
      var input = document.getElementById('search-modal-input');
      var results = document.getElementById('search-modal-results');
      if (input && results) {
        attach(input, results);
        // close after choosing a result (same-page hash jumps don't reload)
        results.addEventListener('click', function (e) {
          if (e.target.closest && e.target.closest('a.search-hit')) closeModal();
        });
      }
      return modal;
    }

    function openModal() {
      var modal = ensureModal();
      setRevealKeyboard(false);
      modal.classList.add('search-open');
      var input = document.getElementById('search-modal-input');
      if (input) {
        input.focus();
        input.select();
      }
    }

    function closeModal() {
      var modal = document.getElementById('search-modal');
      if (modal) modal.classList.remove('search-open');
      setRevealKeyboard(true);
    }

    document.addEventListener('keydown', function (e) {
      try {
        var modal = document.getElementById('search-modal');
        var open = modal && modal.classList.contains('search-open');
        if (open && e.key === 'Escape') {
          e.preventDefault();
          e.stopImmediatePropagation();
          closeModal();
          return;
        }
        // Ctrl+F (Cmd+F on Mac) opens the search instead of the browser find
        if (!open && (e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
          e.preventDefault();
          e.stopImmediatePropagation();
          openModal();
          return;
        }
        // "/" opens the search from anywhere (unless typing in a field)
        if (!open && e.key === '/' &&
            !(e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) &&
            !(e.target && e.target.isContentEditable)) {
          e.preventDefault();
          e.stopImmediatePropagation();
          openModal();
        }
      } catch (e2) {}
    }, true);

    function createButton() {
      if (document.getElementById('search-btn') || !document.body) return;
      var btn = document.createElement('button');
      btn.id = 'search-btn';
      btn.type = 'button';
      btn.title = T.btnTitle;
      btn.setAttribute('aria-label', T.btnLabel);
      btn.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" ' +
        'stroke-linecap="round" aria-hidden="true">' +
        '<circle cx="10.5" cy="10.5" r="6.5"></circle>' +
        '<line x1="15.5" y1="15.5" x2="21" y2="21"></line></svg>';
      btn.addEventListener('click', openModal);
      document.body.appendChild(btn);
    }

    function injectStyle() {
      if (document.getElementById('search-ui-style')) return;
      var st = document.createElement('style');
      st.id = 'search-ui-style';
      st.textContent = STYLE;
      document.head.appendChild(st);
    }

    function setup() {
      try {
        injectStyle();
        createButton();
        var inlineInput = document.getElementById('search-input');
        var inlineResults = document.getElementById('search-results');
        if (inlineInput && inlineResults && inlineInput.dataset.searchWired !== 'true') {
          inlineInput.dataset.searchWired = 'true';
          attach(inlineInput, inlineResults);
        }
      } catch (e) {}
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', setup);
    } else {
      setup();
    }
  } catch (e) {}
})();
