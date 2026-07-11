// toc-ui.js — lightweight slide list ("目次") for fast in-deck navigation.
//
// A list button (stacked above the Home button, bottom-right) opens a right
// side drawer listing every slide title, built straight from the DOM — no
// rendering, no thumbnails, so a 40-slide deck opens instantly. Break slides
// (.break-title) show as section dividers, badge-* slides get a colored dot,
// and the current slide is highlighted and scrolled into view.
//
// Keyboard: "t" or Ctrl+L toggles the drawer, ArrowUp/Down moves, Enter jumps,
// Esc closes. While open, Reveal's own keyboard is suspended (same pattern as
// the search and code-zoom modals).
(function () {
  try {
    // UI strings follow the document language: Japanese when <html lang>
    // starts with "ja" (the format default), English otherwise.
    var JA = (((document.documentElement && document.documentElement.lang) || 'ja')
              .toLowerCase().indexOf('ja') === 0);
    var T = JA ? {
      heading: 'スライド一覧',
      count: function (n) { return n + '枚'; },
      close: '閉じる',
      hint: '<kbd>↑</kbd><kbd>↓</kbd> 移動　<kbd>Enter</kbd> 表示　<kbd>Esc</kbd> 閉じる',
      untitled: '（スライド）',
      btnTitle: 'スライド一覧（t または Ctrl+L で開く）',
      badge: { important: '重要', practice: '手を動かせ', fyi: '参考まで' }
    } : {
      heading: 'Slides',
      count: function (n) { return n + (n === 1 ? ' slide' : ' slides'); },
      close: 'Close',
      hint: '<kbd>↑</kbd><kbd>↓</kbd> move&emsp;<kbd>Enter</kbd> open&emsp;<kbd>Esc</kbd> close',
      untitled: '(slide)',
      btnTitle: 'Slide list (t or Ctrl+L)',
      badge: { important: 'Important', practice: 'Hands-on', fyi: 'FYI' }
    };

    var STYLE = [
      // same translucent-circle style as the home/search buttons, stacked
      // above the home button in the bottom-right corner
      '#toc-btn {',
      '  position: fixed; bottom: 98px; right: 14px; z-index: 100;',
      '  width: 34px; height: 34px; box-sizing: border-box; padding: 0;',
      '  display: flex; align-items: center; justify-content: center;',
      '  border: 2px solid rgba(0,0,0,0.25); border-radius: 50%;',
      '  background: rgba(255,255,255,0.92); color: #666; cursor: pointer;',
      '  opacity: 0.82; box-shadow: 0 2px 8px rgba(0,0,0,0.22);',
      '  transition: opacity 0.15s ease, background 0.15s ease, transform 0.15s ease;',
      '}',
      '#toc-btn:hover, #toc-btn:focus {',
      '  opacity: 1; background: white; transform: scale(1.06); color: #2980b9;',
      '}',
      '#toc-btn svg { width: 18px; height: 18px; display: block; pointer-events: none; }',
      // modal shell: hidden via visibility so the open/close transitions run
      '#toc-modal {',
      '  position: fixed; inset: 0; z-index: 10400;',
      '  visibility: hidden; transition: visibility 0s 0.2s;',
      '  font-family: system-ui, -apple-system, "Hiragino Sans", "Yu Gothic UI", "Segoe UI", "Meiryo", sans-serif;',
      '}',
      '#toc-modal.toc-open { visibility: visible; transition: visibility 0s; }',
      '#toc-backdrop {',
      '  position: absolute; inset: 0; background: rgba(0,0,0,0.35);',
      '  opacity: 0; transition: opacity 0.18s ease;',
      '}',
      '#toc-modal.toc-open #toc-backdrop { opacity: 1; }',
      '#toc-panel {',
      '  position: absolute; top: 0; right: 0; bottom: 0;',
      '  width: min(400px, 92vw); box-sizing: border-box;',
      '  background: #fff; border-radius: 12px 0 0 12px;',
      '  box-shadow: -8px 0 32px rgba(0,0,0,0.25);',
      '  display: flex; flex-direction: column;',
      '  transform: translateX(103%); transition: transform 0.2s ease;',
      '}',
      '#toc-modal.toc-open #toc-panel { transform: none; }',
      '#toc-header {',
      '  display: flex; align-items: baseline; gap: 10px;',
      '  padding: 14px 16px 10px; border-bottom: 1px solid #eee;',
      '}',
      '#toc-heading { font-size: 1.05rem; font-weight: bold; color: #333; }',
      '#toc-count { font-size: 0.82rem; color: #999; flex: 1; }',
      '#toc-close {',
      '  border: none; background: none; padding: 0 2px; cursor: pointer;',
      '  font-size: 1.5rem; line-height: 1; color: #999; align-self: center;',
      '}',
      '#toc-close:hover { color: #333; }',
      '#toc-list {',
      '  flex: 1; overflow-y: auto; overscroll-behavior: contain;',
      '  padding: 8px 10px; scrollbar-width: thin;',
      '}',
      '.toc-item {',
      '  display: flex; align-items: center;',
      '  padding: 5px 8px; border-radius: 6px;',
      '  font-size: 0.95rem; line-height: 1.5;',
      '  color: #333; text-decoration: none;',
      '}',
      '.toc-item:hover { background: #eaf4fb; }',
      '.toc-item:focus {',
      '  background: #eaf4fb; outline: none;',
      '  box-shadow: inset 0 0 0 2px #5dade2;',
      '}',
      '.toc-num {',
      '  flex: none; width: 2em; margin-right: 10px; text-align: right;',
      '  font-size: 0.78rem; color: #b5b5b5; font-variant-numeric: tabular-nums;',
      '}',
      '.toc-title {',
      '  flex: 1; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;',
      '}',
      '.toc-item-untitled .toc-title { color: #999; }',
      // break/divider slides read as section headers in the list
      '.toc-item-break { margin-top: 10px; border-top: 1px solid #eee; padding-top: 7px; }',
      '.toc-item-break .toc-title { font-weight: 600; color: #1a3c6e; }',
      '.toc-item-break:first-child { margin-top: 0; border-top: none; padding-top: 5px; }',
      // current slide: blue accent bar + tint
      '.toc-current { background: #eaf4fb; box-shadow: inset 3px 0 0 #3a8dde; }',
      '.toc-current .toc-title { font-weight: 600; }',
      '.toc-current .toc-num { color: #2980b9; font-weight: bold; }',
      '.toc-current:focus { box-shadow: inset 3px 0 0 #3a8dde, inset 0 0 0 2px #5dade2; }',
      '.toc-dot {',
      '  flex: none; width: 9px; height: 9px; border-radius: 50%;',
      '  margin-left: 7px; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.12);',
      '}',
      '#toc-hint {',
      '  padding: 8px 16px; border-top: 1px solid #eee;',
      '  font-size: 0.78rem; color: #999;',
      '}',
      '#toc-hint kbd {',
      '  font-family: inherit; font-size: 0.72rem; color: #555;',
      '  background: #f7f7f7; border: 1px solid #ccc; border-bottom-width: 2px;',
      '  border-radius: 4px; padding: 0 5px; margin: 0 1px;',
      '}',
      // neutralize any site-wide external-link ::after decoration on items
      '#toc-list a[href]::after { content: none !important; display: none !important; }'
    ].join('\n');

    // badge-* slide classes → dot color (palette from badge-ui.js)
    var BADGE = {
      important: { color: '#f76d5e' },
      practice:  { color: '#3a8dde' },
      fyi:       { color: '#f6b394' }
    };

    var keyboardPrev = null;
    var slidechangedWired = false;

    function esc(s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
                      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function flatSections() {
      return Array.prototype.slice.call(
        document.querySelectorAll('.reveal .slides section:not(.stack)'));
    }

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

    function slideLabel(sec) {
      // break/divider slides carry their text in .break-title, not the heading
      var bt = sec.querySelector('.break-title');
      if (bt && bt.textContent.trim()) {
        return { text: bt.textContent.trim(), kind: 'break' };
      }
      var h = sec.querySelector('h1, h2, h3');
      if (h && h.textContent.trim()) {
        var isDivider = sec.classList.contains('break-slide') || h.tagName === 'H1';
        return { text: h.textContent.trim(), kind: isDivider ? 'break' : 'slide' };
      }
      // untitled slide: first bit of body text so it is still recognizable
      var t = (sec.textContent || '').replace(/\s+/g, ' ').trim();
      return {
        text: t ? t.slice(0, 42) + (t.length > 42 ? '…' : '') : T.untitled,
        kind: 'untitled'
      };
    }

    function badgeDots(sec) {
      var html = '';
      Array.prototype.forEach.call(sec.classList, function (cl) {
        var m = /^badge-(important|practice|fyi)(-ja)?$/.exec(cl);
        if (m && BADGE[m[1]]) {
          html += '<span class="toc-dot" title="' + T.badge[m[1]] +
                  '" style="background:' + BADGE[m[1]].color + '"></span>';
        }
      });
      return html;
    }

    function ensureModal() {
      var modal = document.getElementById('toc-modal');
      if (modal) return modal;
      modal = document.createElement('div');
      modal.id = 'toc-modal';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('aria-label', T.heading);
      modal.innerHTML =
        '<div id="toc-backdrop"></div>' +
        '<div id="toc-panel">' +
        '<div id="toc-header">' +
        '<span id="toc-heading">' + T.heading + '</span>' +
        '<span id="toc-count"></span>' +
        '<button id="toc-close" type="button" aria-label="' + T.close + '">&times;</button>' +
        '</div>' +
        '<div id="toc-list"></div>' +
        '<div id="toc-hint">' + T.hint + '</div>' +
        '</div>';
      document.body.appendChild(modal);
      var backdrop = document.getElementById('toc-backdrop');
      if (backdrop) backdrop.addEventListener('click', closeToc);
      var close = document.getElementById('toc-close');
      if (close) close.addEventListener('click', closeToc);
      return modal;
    }

    function goTo(indices) {
      closeToc();
      try { Reveal.slide(indices.h, indices.v || 0); } catch (e) {}
    }

    function buildList() {
      var listEl = document.getElementById('toc-list');
      var countEl = document.getElementById('toc-count');
      if (!listEl || !window.Reveal || !Reveal.getIndices) return null;
      listEl.innerHTML = '';
      var current = null;
      try { current = Reveal.getCurrentSlide(); } catch (e) {}
      var secs = flatSections();
      if (countEl) countEl.textContent = T.count(secs.length);
      var currentItem = null;
      secs.forEach(function (sec, i) {
        var indices;
        try { indices = Reveal.getIndices(sec); } catch (e) { return; }
        var lab = slideLabel(sec);
        var a = document.createElement('a');
        a.className = 'toc-item toc-item-' + lab.kind;
        a.href = '#/' + indices.h + (indices.v ? '/' + indices.v : '');
        a.innerHTML =
          '<span class="toc-num">' + (i + 1) + '</span>' +
          '<span class="toc-title">' + esc(lab.text) + '</span>' +
          badgeDots(sec);
        if (sec === current) {
          a.classList.add('toc-current');
          currentItem = a;
        }
        a.addEventListener('click', function (e) {
          e.preventDefault();
          goTo(indices);
        });
        listEl.appendChild(a);
      });
      return currentItem;
    }

    function isOpen() {
      var modal = document.getElementById('toc-modal');
      return !!(modal && modal.classList.contains('toc-open'));
    }

    function openToc() {
      if (!window.Reveal || !Reveal.getIndices) return;
      var modal = ensureModal();
      var currentItem = buildList();
      setRevealKeyboard(false);
      modal.classList.add('toc-open');
      // navigating away by any other route (search hit, hash link) while the
      // drawer is open would leave a stale highlight — just close it
      if (!slidechangedWired && Reveal.on) {
        slidechangedWired = true;
        Reveal.on('slidechanged', function () { if (isOpen()) closeToc(); });
      }
      var target = currentItem ||
                   (document.getElementById('toc-list') || {}).firstElementChild;
      if (target) {
        try { target.focus({ preventScroll: true }); } catch (e) { target.focus(); }
        target.scrollIntoView({ block: 'center' });
      }
    }

    function closeToc() {
      var modal = document.getElementById('toc-modal');
      if (modal) modal.classList.remove('toc-open');
      setRevealKeyboard(true);
    }

    function moveFocus(delta) {
      var listEl = document.getElementById('toc-list');
      if (!listEl) return;
      var items = Array.prototype.slice.call(listEl.querySelectorAll('.toc-item'));
      if (!items.length) return;
      var idx = items.indexOf(document.activeElement);
      if (idx < 0) idx = items.findIndex(function (el) { return el.classList.contains('toc-current'); });
      var next = Math.max(0, Math.min(items.length - 1, idx + delta));
      try { items[next].focus({ preventScroll: true }); } catch (e) { items[next].focus(); }
      items[next].scrollIntoView({ block: 'nearest' });
    }

    document.addEventListener('keydown', function (e) {
      try {
        if (isOpen()) {
          if (e.key === 'Escape' || e.key === 't' || e.key === 'T' ||
              ((e.ctrlKey) && (e.key === 'l' || e.key === 'L'))) {
            e.preventDefault();
            e.stopImmediatePropagation();
            closeToc();
            return;
          }
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            e.stopImmediatePropagation();
            moveFocus(e.key === 'ArrowDown' ? 1 : -1);
            return;
          }
          if (e.key === 'Home' || e.key === 'End') {
            e.preventDefault();
            e.stopImmediatePropagation();
            moveFocus(e.key === 'Home' ? -10000 : 10000);
            return;
          }
          // Enter falls through: the focused <a> handles it natively
          return;
        }
        // --- closed: open shortcuts ---
        var t = e.target;
        if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
        // stand down while another modal (search, code zoom, peek) is open
        try {
          if (window.Reveal && Reveal.getConfig && Reveal.getConfig().keyboard === false) return;
        } catch (e2) {}
        var plainT = (e.key === 't' || e.key === 'T') &&
                     !e.ctrlKey && !e.metaKey && !e.altKey;
        var ctrlL = e.ctrlKey && !e.metaKey && !e.altKey &&
                    (e.key === 'l' || e.key === 'L');
        if (plainT || ctrlL) {
          e.preventDefault();
          e.stopImmediatePropagation();
          openToc();
        }
      } catch (e3) {}
    }, true);

    function createButton() {
      if (document.getElementById('toc-btn') || !document.body) return;
      // pointless on 1-slide pages (e.g. the index deck)
      if (flatSections().length < 2) return;
      var btn = document.createElement('button');
      btn.id = 'toc-btn';
      btn.type = 'button';
      btn.title = T.btnTitle;
      btn.setAttribute('aria-label', T.heading);
      btn.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" ' +
        'stroke-linecap="round" aria-hidden="true">' +
        '<line x1="4.2" y1="6" x2="4.4" y2="6"></line>' +
        '<line x1="4.2" y1="12" x2="4.4" y2="12"></line>' +
        '<line x1="4.2" y1="18" x2="4.4" y2="18"></line>' +
        '<line x1="9" y1="6" x2="20" y2="6"></line>' +
        '<line x1="9" y1="12" x2="20" y2="12"></line>' +
        '<line x1="9" y1="18" x2="20" y2="18"></line></svg>';
      btn.addEventListener('click', function () {
        if (isOpen()) closeToc(); else openToc();
      });
      document.body.appendChild(btn);
    }

    function injectStyle() {
      if (document.getElementById('toc-ui-style')) return;
      var st = document.createElement('style');
      st.id = 'toc-ui-style';
      st.textContent = STYLE;
      document.head.appendChild(st);
    }

    function setup() {
      try {
        injectStyle();
        createButton();
      } catch (e) {}
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', setup);
    } else {
      setup();
    }
  } catch (e) {}
})();
