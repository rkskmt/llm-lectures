// Slide peek: a link marked `.peek` opens ONE slide from another deck in a
// modal overlay — no navigation, no deck controls. The student sees the single
// slide that jogs their memory and closes it (Esc / backdrop / ×) to return to
// where they were. This avoids sending students off into another deck where
// they can get lost and never come back.
//
// Authoring: [text](other.qmd#slide-id){.peek}, and give the target slide an
// explicit id:  ## 見出し {#slide-id}
//
// How it works (iframe approach): load the target deck in an <iframe> pointed
// at `other.html#/slide-id`. The real deck boots inside the frame and the real
// JS runs — so MathJax, Quarto copy buttons, lightbox and even Plotly all work
// (the old cloneNode approach couldn't reuse the page's JS). To keep it a peek
// and not a walkthrough, once the inner Reveal is ready we hard-disable every
// way to move slides (keyboard, touch, controls, menu) and hide deck chrome,
// so the student structurally cannot wander to another slide. The frame is
// sized to the deck's aspect ratio and Reveal scales the slide to fit
// natively — no manual `zoom`, so scrollbars/figures behave normally.
(function () {
  try {
    var DECK_W = 1280, DECK_H = 720;  // fallback deck size; refined from Reveal config

    // UI strings follow the document language: Japanese when <html lang>
    // starts with "ja" (the format default), English otherwise.
    var JA = (((document.documentElement && document.documentElement.lang) || 'ja')
              .toLowerCase().indexOf('ja') === 0);
    var T = JA ? {
      loading: '読み込み中…',
      closeLabel: '閉じる',
      closeTitle: '閉じる（Esc）',
      hint: 'Esc・背景クリック・× で閉じる',
      from: '出典：',
      frameTitle: 'スライドプレビュー'
    } : {
      loading: 'Loading…',
      closeLabel: 'Close',
      closeTitle: 'Close (Esc)',
      hint: 'Esc / click outside / × to close',
      from: 'From: ',
      frameTitle: 'Slide preview'
    };

    var STYLE = [
      // the inline link marker: dotted underline + magnifier, "preview" cursor
      'a.peek {',
      '  text-decoration: none; border-bottom: 2px dotted currentColor;',
      '  cursor: zoom-in;',
      '}',
      'a.peek::after { content: " \\1F50D"; font-size: 0.72em; opacity: 0.7; }',
      // modal
      '#peek-modal {',
      '  position: fixed; inset: 0; z-index: 10600; display: none;',
      '  align-items: center; justify-content: center;',
      '  padding: 4vh 4vw; background: rgba(0,0,0,0.6); box-sizing: border-box;',
      '}',
      '#peek-modal.peek-open { display: flex; }',
      '#peek-panel {',
      '  position: relative; width: min(1100px, 94vw);',
      '  background: #fff; border-radius: 10px;',
      '  padding: 30px 18px 16px; box-sizing: border-box;',
      '  box-shadow: 0 18px 56px rgba(0,0,0,0.4);',
      '}',
      '#peek-source {',
      '  font-size: 0.95rem; color: #2980b9; font-weight: bold;',
      '  margin: 0 44px 10px 4px; min-height: 1.2em;',
      '}',
      // prominent, obviously-clickable close button
      '#peek-close {',
      '  position: absolute; top: 10px; right: 12px; width: 38px; height: 38px;',
      '  border: none; border-radius: 50%; background: rgba(0,0,0,0.07);',
      '  font-size: 26px; line-height: 38px; text-align: center;',
      '  color: #555; cursor: pointer; padding: 0; z-index: 2;',
      '  transition: background 0.15s ease, color 0.15s ease;',
      '}',
      '#peek-close:hover, #peek-close:focus { background: #e74c3c; color: #fff; }',
      '#peek-frame-wrap { position: relative; width: 100%; text-align: center; }',
      '#peek-frame {',
      '  width: 100%; height: 60vh; border: 0; display: inline-block;',
      '  background: #fff; border-radius: 6px;',
      '}',
      '#peek-loading {',
      '  position: absolute; inset: 0; display: flex;',
      '  align-items: center; justify-content: center;',
      '  color: #888; font-size: 1.1rem; background: #fff; border-radius: 6px;',
      '}',
      '#peek-hint { margin-top: 10px; font-size: 0.82rem; color: #aaa; text-align: right; }'
    ].join('\n');

    // CSS injected INTO the iframe document: strip every bit of deck chrome and
    // the buttons our own slide-ui.js / search-ui.js inject there, so a peek
    // shows nothing but the slide and offers no way to navigate off it.
    var FRAME_STYLE = [
      '.reveal .controls, .reveal .progress, .reveal .slide-number,',
      '.reveal .footer, .reveal .slide-menu-button, .slide-menu-button,',
      '.reveal-viewport > .backarrow,',
      '#search-btn, #slide-nav, #home-btn, #toc-btn { display: none !important; }',
      'html, body { overflow: hidden !important; }'
    ].join('\n');

    var revealKbPrev = null;

    function injectStyle() {
      if (document.getElementById('peek-ui-style')) return;
      var st = document.createElement('style');
      st.id = 'peek-ui-style';
      st.textContent = STYLE;
      document.head.appendChild(st);
    }

    // Disable the underlying (host) deck's keyboard nav while the peek is open,
    // so arrow keys don't move the deck behind the modal. Mirrors search-ui.js.
    function setRevealKeyboard(active) {
      try {
        if (!window.Reveal || !Reveal.configure) return;
        if (!active) {
          if (revealKbPrev === null && Reveal.getConfig) revealKbPrev = Reveal.getConfig().keyboard;
          Reveal.configure({ keyboard: false });
        } else {
          Reveal.configure({ keyboard: revealKbPrev === null ? true : revealKbPrev });
          revealKbPrev = null;
        }
      } catch (e) {}
    }

    function isOpen() {
      var modal = document.getElementById('peek-modal');
      return !!(modal && modal.classList.contains('peek-open'));
    }

    function closePeek() {
      var modal = document.getElementById('peek-modal');
      if (modal) modal.classList.remove('peek-open');
      // drop the iframe so its deck stops running (timers, plotly, audio…)
      var wrap = document.getElementById('peek-frame-wrap');
      if (wrap) wrap.innerHTML = '<div id="peek-loading">' + T.loading + '</div>';
      setRevealKeyboard(true);
    }

    function ensureModal() {
      var modal = document.getElementById('peek-modal');
      if (modal) return modal;
      modal = document.createElement('div');
      modal.id = 'peek-modal';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.innerHTML =
        '<div id="peek-panel">' +
        '<button id="peek-close" type="button" aria-label="' + T.closeLabel + '" title="' + T.closeTitle + '">×</button>' +
        '<div id="peek-source"></div>' +
        '<div id="peek-frame-wrap"><div id="peek-loading">' + T.loading + '</div></div>' +
        '<div id="peek-hint">' + T.hint + '</div>' +
        '</div>';
      document.body.appendChild(modal);
      // backdrop click closes
      modal.addEventListener('click', function (e) { if (e.target === modal) closePeek(); });
      var btn = document.getElementById('peek-close');
      if (btn) btn.addEventListener('click', closePeek);
      return modal;
    }

    // The deck's authored size; the frame is sized to this aspect so Reveal's
    // own scaling reproduces the on-screen proportions.
    function deckSize() {
      var w = DECK_W, h = DECK_H;
      try {
        if (window.Reveal && Reveal.getConfig) {
          var c = Reveal.getConfig();
          if (typeof c.width === 'number' && c.width > 0) w = c.width;
          if (typeof c.height === 'number' && c.height > 0) h = c.height;
        }
      } catch (e) {}
      return { w: w, h: h };
    }

    // Size the frame to the deck aspect, capped so it always fits the viewport.
    function sizeFrame(frame) {
      try {
        var wrap = document.getElementById('peek-frame-wrap');
        if (!wrap || !frame) return;
        var ds = deckSize();
        var availW = wrap.clientWidth;
        var availH = window.innerHeight * 0.78;  // leave room for source line + hint
        var W = availW, H = availW * ds.h / ds.w;
        if (H > availH) { H = availH; W = H * ds.w / ds.h; }
        frame.style.width = Math.round(W) + 'px';
        frame.style.height = Math.round(H) + 'px';
      } catch (e) {}
    }

    function sourceLabel(doc) {
      var t = '';
      try {
        // Prefer the deck's own title slide heading. Fall back to <title>,
        // where Quarto websites use "<site title> – <page title>" — take the
        // LAST segment (the page), not the first (the site).
        var h = doc && doc.querySelector ? doc.querySelector('.reveal h1.title') : null;
        if (h && h.textContent.trim()) t = h.textContent.trim();
        if (!t && doc && doc.title) {
          var parts = doc.title.split(/[–—|]/);
          t = parts[parts.length - 1].trim();
        }
      } catch (e) {}
      return t ? (T.from + t) : '';
    }

    // Once the inner Reveal is ready, lock it down to a single non-navigable
    // slide and reveal all fragments (a peek is a snapshot, not a walkthrough).
    function tuneFrameDeck(win, frag) {
      try {
        var R = win.Reveal;
        if (R && R.configure) {
          R.configure({
            controls: false, progress: false, slideNumber: false,
            keyboard: false, touch: false, overview: false,
            fragments: false, help: false, autoSlide: 0, loop: false,
            mouseWheel: false, transition: 'none'
          });
        }
        // ensure we're actually on the requested slide (src hash should already
        // have done this, but re-assert in case init raced the hash)
        if (frag) {
          try { win.location.hash = '#/' + frag; } catch (e) {}
        }
        if (R && R.layout) R.layout();
      } catch (e) {}
    }

    // Wait until the iframe's Reveal has booted, then run cb(win). Same-origin,
    // so we can poll the inner window directly. Gives up after ~12s but still
    // calls cb so the loader is removed.
    function whenFrameReady(frame, cb) {
      var tries = 0;
      (function poll() {
        tries++;
        var win = null;
        try { win = frame.contentWindow; } catch (e) {}
        var ready = false;
        try { ready = !!(win && win.Reveal && win.Reveal.isReady && win.Reveal.isReady()); } catch (e) {}
        if (ready) { cb(win); return; }
        if (tries > 240) { cb(win); return; }
        setTimeout(poll, 50);
      })();
    }

    function onFrameLoad(frame, frag) {
      var fdoc = null, fwin = null;
      try { fwin = frame.contentWindow; fdoc = frame.contentDocument; } catch (e) {}
      if (!fdoc) return;
      // hide deck chrome inside the frame
      try {
        var st = fdoc.createElement('style');
        st.textContent = FRAME_STYLE;
        (fdoc.head || fdoc.documentElement).appendChild(st);
      } catch (e) {}
      // a peek is read-only: block links that would navigate the frame away to
      // another page (lightbox anchors are left alone — GLightbox handles them).
      try {
        fdoc.addEventListener('click', function (e) {
          var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
          if (!a) return;
          if (a.classList.contains('lightbox') || (a.closest && a.closest('.lightbox'))) return;
          e.preventDefault();
        }, true);
        // Esc inside the frame must close the modal too (focus may be in here)
        fdoc.addEventListener('keydown', function (e) {
          if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); closePeek(); }
        }, true);
      } catch (e) {}

      // source label from the loaded doc
      var source = document.getElementById('peek-source');
      if (source) source.textContent = sourceLabel(fdoc);

      whenFrameReady(frame, function (win) {
        tuneFrameDeck(win || fwin, frag);
        var loading = document.getElementById('peek-loading');
        if (loading && loading.parentNode) loading.parentNode.removeChild(loading);
      });
    }

    function openPeek(page, frag) {
      var modal = ensureModal();
      var wrap = document.getElementById('peek-frame-wrap');
      var source = document.getElementById('peek-source');
      if (source) source.textContent = '';
      if (wrap) wrap.innerHTML = '<div id="peek-loading">' + T.loading + '</div>';
      setRevealKeyboard(false);
      modal.classList.add('peek-open');

      // build a fresh iframe each time (clean state, stops the old deck)
      var frame = document.createElement('iframe');
      frame.id = 'peek-frame';
      frame.setAttribute('title', T.frameTitle);
      // same-page peek (no page part) targets the current document
      var base = page || window.location.href.split('#')[0];
      frame.src = base + '#/' + frag;
      frame.addEventListener('load', function () { onFrameLoad(frame, frag); });
      if (wrap) {
        wrap.appendChild(frame);
        sizeFrame(frame);
      }
    }

    // keep the frame fitted to the viewport on resize
    window.addEventListener('resize', function () {
      if (!isOpen()) return;
      var frame = document.getElementById('peek-frame');
      if (frame) sizeFrame(frame);
    });

    // Intercept clicks on a.peek in the capture phase so neither the browser's
    // default navigation nor revealjs ever acts on the link.
    document.addEventListener('click', function (e) {
      try {
        var a = e.target && e.target.closest ? e.target.closest('a.peek') : null;
        if (!a) return;
        e.preventDefault();
        e.stopPropagation();
        var href = a.getAttribute('href') || '';
        var hashIdx = href.indexOf('#');
        if (hashIdx < 0) return;
        var page = href.slice(0, hashIdx);
        var frag = href.slice(hashIdx + 1).replace(/^\//, '');  // tolerate #/id form
        openPeek(page, frag);
      } catch (e2) {}
    }, true);

    // Esc closes the peek (capture + stop so revealjs/search don't also react).
    document.addEventListener('keydown', function (e) {
      try {
        if (isOpen() && e.key === 'Escape') {
          e.preventDefault();
          e.stopImmediatePropagation();
          closePeek();
        }
      } catch (e2) {}
    }, true);

    function setup() { try { injectStyle(); } catch (e) {} }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
    else setup();
  } catch (e) {}
})();
