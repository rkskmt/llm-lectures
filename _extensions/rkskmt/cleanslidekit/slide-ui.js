(function() {
  try {
    // UI strings follow the document language: Japanese when <html lang>
    // starts with "ja" (the format default), English otherwise.
    var JA = (((document.documentElement && document.documentElement.lang) || 'ja')
              .toLowerCase().indexOf('ja') === 0);
    var T = JA ? {
      home: 'Home（一覧に戻る）',
      copyTitle: 'コピー',
      copyLabel: 'コードをコピー',
      closeLabel: '閉じる',
      zoomTitle: '拡大',
      zoomLabel: 'コードを拡大表示'
    } : {
      home: 'Home (back to the index)',
      copyTitle: 'Copy',
      copyLabel: 'Copy code',
      closeLabel: 'Close',
      zoomTitle: 'Zoom',
      zoomLabel: 'Zoom code'
    };

    var counterInit = false;
    var codeExpandInit = false;
    var codeZoomFontSize = 2.2;
    var codeZoomPanMode = false;
    var codeZoomDragging = false;
    var codeZoomDragStartX = 0;
    var codeZoomDragStartY = 0;
    var codeZoomScrollStartLeft = 0;
    var codeZoomScrollStartTop = 0;
    var codeZoomPreviousKeyboard = null;
    var lastTouchNavAt = 0;  // when a tap (touchend) drove navigation — used to drop the ghost click
    var lastNavAt = 0;       // when ANY route last navigated — coalesces simultaneous double fires

    function createNav() {
      try {
        if (document.getElementById('slide-nav')) return;
        var footer = document.querySelector('.reveal > .footer');
        if (!footer) return;
        var nav = document.createElement('span');
        nav.id = 'slide-nav';
        nav.innerHTML = '<button id="nav-prev">&#9664;</button><span id="nav-counter">-/-</span><button id="nav-next">&#9654;</button>';
        footer.appendChild(nav);
      } catch (e) {}
    }

    function createHome() {
      try {
        if (document.getElementById('home-btn')) return;
        var home = document.createElement('a');
        home.id = 'home-btn';
        home.href = './index.html';
        home.title = T.home;
        home.setAttribute('aria-label', 'Home');
        // same visual language as the search button (icon in a translucent circle)
        home.innerHTML =
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" ' +
          'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
          '<path d="M4 11.5 12 4l8 7.5"></path>' +
          '<path d="M6 10.5V20h12v-9.5"></path></svg>';
        home.addEventListener('click', function(e) {
          e.preventDefault();
          goHome();
        });
        document.body.appendChild(home);
      } catch (e) {}
    }

    function updateCounter() {
      try {
        var el = document.getElementById('nav-counter');
        if (!el || !window.Reveal) return;
        var slides = Array.from(document.querySelectorAll('.reveal .slides section:not(.stack)'));
        var idx = slides.findIndex(function(s) { return s.classList.contains('present'); });
        el.textContent = (idx + 1) + ' / ' + slides.length;
        var prev = document.getElementById('nav-prev');
        var next = document.getElementById('nav-next');
        if (prev) prev.classList.toggle('nav-disabled', idx <= 0);
        if (next) next.classList.toggle('nav-disabled', idx >= slides.length - 1);
      } catch (e) {}
    }

    function initCounter() {
      try {
        if (counterInit || !window.Reveal) return;
        counterInit = true;
        updateCounter();
        Reveal.on('slidechanged', updateCounter);
      } catch (e) {}
    }

    function isFirstSlide() {
      return Reveal.getIndices().h === 0 && Reveal.getIndices().v === 0;
    }

    function goHome() {
      try { sessionStorage.setItem('lastSlide', window.location.href); } catch (e) {}
      window.location.href = './index.html';
    }

    function isIndexPage() {
      return window.location.pathname.endsWith('/index.html') || window.location.pathname.endsWith('/');
    }

    function goBack() {
      try {
        var last = sessionStorage.getItem('lastSlide');
        if (last) {
          sessionStorage.removeItem('lastSlide');
          window.location.href = last;
        }
      } catch (e) {}
    }

    function handleNav(btn) {
      // Coalesce near-simultaneous double fires for one physical interaction
      // (e.g. a button tap that reveal.js also reads as a swipe, or a stray
      // second event) into a single navigation step.
      var now = Date.now();
      if (now - lastNavAt < 250) return;
      lastNavAt = now;
      initCounter();
      if (btn.id === 'nav-prev') {
        if (isFirstSlide()) {
          goHome();
        } else {
          Reveal.prev();
        }
      }
      if (btn.id === 'nav-next') {
        if (isIndexPage()) {
          goBack();
        } else {
          Reveal.next();
        }
      }
    }

    function ensureCodeZoomModal() {
      try {
        var modal = document.getElementById('code-zoom-modal');
        if (modal) return modal;
        modal = document.createElement('div');
        modal.id = 'code-zoom-modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.innerHTML = '<div id="code-zoom-panel"><button id="code-zoom-copy" type="button" title="' + T.copyTitle + '" aria-label="' + T.copyLabel + '"></button><button id="code-zoom-close" type="button" aria-label="' + T.closeLabel + '">&times;</button><div id="code-zoom-content"></div></div>';
        document.body.appendChild(modal);
        modal.addEventListener('click', function(e) {
          if (e.target === modal) closeCodeZoom();
        });
        var close = document.getElementById('code-zoom-close');
        if (close) close.addEventListener('click', closeCodeZoom);
        var copy = document.getElementById('code-zoom-copy');
        if (copy) copy.addEventListener('click', copyCodeZoom);
        initCodeZoomPanHandlers();
        return modal;
      } catch (e) {}
    }

    function setRevealKeyboard(active) {
      try {
        if (!window.Reveal || !Reveal.configure) return;
        if (!active) {
          if (codeZoomPreviousKeyboard === null && Reveal.getConfig) {
            codeZoomPreviousKeyboard = Reveal.getConfig().keyboard;
          }
          Reveal.configure({ keyboard: false });
        } else {
          Reveal.configure({ keyboard: codeZoomPreviousKeyboard === null ? true : codeZoomPreviousKeyboard });
          codeZoomPreviousKeyboard = null;
        }
      } catch (e) {}
    }

    function clampCodeZoomFontSize(size) {
      if (!Number.isFinite(size)) return codeZoomFontSize;
      return Math.max(1.2, Math.min(3.6, Math.round(size * 10) / 10));
    }

    function setCodeZoomFontSize(size) {
      try {
        codeZoomFontSize = clampCodeZoomFontSize(size);
        var panel = document.getElementById('code-zoom-panel');
        if (panel) panel.style.setProperty('--code-zoom-font-size', codeZoomFontSize + 'rem');
      } catch (e) {}
    }

    function setCodeZoomPanMode(active) {
      try {
        codeZoomPanMode = active;
        var content = document.getElementById('code-zoom-content');
        if (!content) return;
        content.classList.toggle('code-zoom-pan-mode', active);
        if (!active) {
          codeZoomDragging = false;
          content.classList.remove('code-zoom-dragging');
        }
      } catch (e) {}
    }

    function initCodeZoomPanHandlers() {
      try {
        var content = document.getElementById('code-zoom-content');
        if (!content || content.dataset.panInit === 'true') return;
        content.dataset.panInit = 'true';
        content.addEventListener('pointerdown', function(e) {
          try {
            if (!codeZoomPanMode) return;
            e.preventDefault();
            e.stopPropagation();
            codeZoomDragging = true;
            codeZoomDragStartX = e.clientX;
            codeZoomDragStartY = e.clientY;
            codeZoomScrollStartLeft = content.scrollLeft;
            codeZoomScrollStartTop = content.scrollTop;
            content.classList.add('code-zoom-dragging');
            content.setPointerCapture(e.pointerId);
          } catch (e) {}
        });
        content.addEventListener('pointermove', function(e) {
          try {
            if (!codeZoomDragging) return;
            e.preventDefault();
            e.stopPropagation();
            content.scrollLeft = codeZoomScrollStartLeft - (e.clientX - codeZoomDragStartX);
            content.scrollTop = codeZoomScrollStartTop - (e.clientY - codeZoomDragStartY);
          } catch (e) {}
        });
        content.addEventListener('pointerup', function(e) {
          try {
            if (!codeZoomDragging) return;
            e.preventDefault();
            e.stopPropagation();
            codeZoomDragging = false;
            content.classList.remove('code-zoom-dragging');
            content.releasePointerCapture(e.pointerId);
          } catch (e) {}
        });
        content.addEventListener('pointercancel', function() {
          try {
            codeZoomDragging = false;
            content.classList.remove('code-zoom-dragging');
          } catch (e) {}
        });
        content.addEventListener('wheel', function(e) {
          try {
            var modal = document.getElementById('code-zoom-modal');
            if (!modal || !modal.classList.contains('code-zoom-open')) return;
            if (!e.ctrlKey) return;
            e.preventDefault();
            e.stopPropagation();
            var delta = e.deltaY < 0 ? 0.1 : -0.1;
            setCodeZoomFontSize(codeZoomFontSize + delta);
          } catch (e) {}
        }, { passive: false });
      } catch (e) {}
    }

    function fallbackCopyText(text, done) {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        done();
      } catch (e) {}
    }

    function copyCodeZoom() {
      try {
        var content = document.getElementById('code-zoom-content');
        var btn = document.getElementById('code-zoom-copy');
        if (!content) return;
        var code = content.querySelector('pre code') || content.querySelector('pre');
        if (!code) return;
        var text = code.innerText;
        var done = function() {
          try {
            if (!btn) return;
            btn.classList.add('copied');
            setTimeout(function() { btn.classList.remove('copied'); }, 1000);
          } catch (e) {}
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done).catch(function() { fallbackCopyText(text, done); });
        } else {
          fallbackCopyText(text, done);
        }
      } catch (e) {}
    }

    function closeCodeZoom() {
      try {
        var modal = document.getElementById('code-zoom-modal');
        var content = document.getElementById('code-zoom-content');
        if (content) content.innerHTML = '';
        setCodeZoomPanMode(false);
        setRevealKeyboard(true);
        if (modal) modal.classList.remove('code-zoom-open');
      } catch (e) {}
    }

    function openCodeZoom(container) {
      try {
        var modal = ensureCodeZoomModal();
        var content = document.getElementById('code-zoom-content');
        if (!modal || !content || !container) return;
        var source = container.querySelector('div.sourceCode') || container.querySelector('pre');
        if (!source) return;
        var clone = source.cloneNode(true);
        content.innerHTML = '';
        content.appendChild(clone);
        setCodeZoomFontSize(codeZoomFontSize);
        setRevealKeyboard(false);
        modal.classList.add('code-zoom-open');
        var close = document.getElementById('code-zoom-close');
        if (close) close.focus();
      } catch (e) {}
    }

    function wrapPlainCodeBlock(pre) {
      try {
        if (!pre || pre.closest('.code-copy-outer-scaffold') || pre.closest('.code-expand-scaffold')) return null;
        var wrapper = document.createElement('div');
        wrapper.className = 'code-expand-scaffold';
        pre.parentNode.insertBefore(wrapper, pre);
        wrapper.appendChild(pre);
        return wrapper;
      } catch (e) {}
    }

    function addCodeExpandButtons() {
      try {
        var containers = Array.from(document.querySelectorAll('.code-copy-outer-scaffold'));
        Array.from(document.querySelectorAll('.reveal pre')).forEach(function(pre) {
          var text = pre.textContent || '';
          if (text.indexOf('\n') === -1) return;
          var wrapper = wrapPlainCodeBlock(pre);
          if (wrapper) containers.push(wrapper);
        });
        containers.forEach(function(container) {
          if (!container || container.querySelector('.code-expand-button')) return;
          if (!container.querySelector('pre')) return;
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'code-expand-button';
          btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square" stroke-linejoin="miter"/></svg>';
          btn.title = T.zoomTitle;
          btn.setAttribute('aria-label', T.zoomLabel);
          btn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            openCodeZoom(container);
          });
          container.appendChild(btn);
        });
      } catch (e) {}
    }

    function initCodeExpand() {
      try {
        ensureCodeZoomModal();
        addCodeExpandButtons();
        if (codeExpandInit) return;
        codeExpandInit = true;
        document.addEventListener('keydown', function(e) {
          try {
            var modal = document.getElementById('code-zoom-modal');
            if (!modal || !modal.classList.contains('code-zoom-open')) return;
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopImmediatePropagation();
              closeCodeZoom();
            }
            if (e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar') {
              e.preventDefault();
              e.stopImmediatePropagation();
              if (!e.repeat) setCodeZoomPanMode(true);
            }
          } catch (e) {}
        }, true);
        document.addEventListener('keyup', function(e) {
          try {
            var modal = document.getElementById('code-zoom-modal');
            if (!modal || !modal.classList.contains('code-zoom-open')) return;
            if (e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar') {
              e.preventDefault();
              e.stopImmediatePropagation();
              setCodeZoomPanMode(false);
            }
          } catch (e) {}
        }, true);
      } catch (e) {}
    }

    document.addEventListener('click', function(e) {
      try {
        var btn = e.target.closest('#nav-prev, #nav-next');
        if (!btn || !window.Reveal) return;
        // Drop the synthetic click that follows a touch tap (ghost click):
        // touchend already navigated for this gesture. preventDefault() on a
        // delegated document touchend does not reliably suppress this click on
        // iPad/tablet Safari, so guard it explicitly by timestamp.
        if (Date.now() - lastTouchNavAt < 700) return;
        handleNav(btn);
      } catch (e) {}
    });

    document.addEventListener('touchend', function(e) {
      try {
        var btn = e.target.closest('#nav-prev, #nav-next');
        if (!btn || !window.Reveal) return;
        e.preventDefault();
        lastTouchNavAt = Date.now();
        handleNav(btn);
      } catch (e) {}
    }, { passive: false });

    document.addEventListener('keydown', function(e) {
      try {
        if (!window.Reveal) return;
        // Never hijack keys while the user is typing in a field.
        var t = e.target;
        if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
        // Every modal overlay (search, code zoom, peek — and a peeked iframe's
        // locked-down deck) disables Reveal's keyboard; this handler must stand
        // down with it, or arrows navigate the page out from under the modal.
        if (Reveal.getConfig && Reveal.getConfig().keyboard === false) return;
        if (isFirstSlide() && (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp')) {
          goHome();
        }
        if (isIndexPage() && (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown')) {
          goBack();
        }
      } catch (e) {}
    });

    // A code-fold 解答例 near the bottom of an overflowing slide opens BELOW
    // the fold — the details element grows off-screen and the click looks like
    // a no-op. Scroll the opened summary to the top of the slide's scroll box
    // so the revealed content is actually visible. ('toggle' doesn't bubble;
    // listen in the capture phase.)
    document.addEventListener('toggle', function(e) {
      try {
        var d = e.target;
        if (!d || d.tagName !== 'DETAILS' || !d.open) return;
        var sec = d.closest('.reveal .slides section');
        if (!sec || sec.scrollHeight <= sec.clientHeight) return;
        var sum = d.querySelector(':scope > summary');
        (sum || d).scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (e) {}
    }, true);

    // GLightbox's sourceType() sniffs file extensions only, so a data-URI
    // image href (e.g. the quarto-d2 filter's inline SVG) falls through to
    // "external" and opens in a small fixed-size iframe instead of a
    // fit-to-screen image. Force the type and re-init the instance quarto
    // already created (its inline init script runs before this defer script).
    function fixDataUriLightbox() {
      try {
        var links = document.querySelectorAll('a.lightbox[href^="data:image/"]');
        if (!links.length) return;
        var changed = false;
        links.forEach(function (a) {
          var cfg = a.getAttribute('data-glightbox') || '';
          if (!/(^|;)\s*type\s*:/.test(cfg)) {
            a.setAttribute('data-glightbox', cfg ? cfg + '; type: image' : 'type: image');
            changed = true;
          }
        });
        if (changed && window.lightboxQuarto &&
            typeof lightboxQuarto.reload === 'function') {
          lightboxQuarto.reload();
        }
      } catch (e) {}
    }

    // Tabset persistence: remember the selected tab per page and restore it
    // on the next visit — e.g. leaving an index's 後期 tab for a lecture and
    // coming back keeps 後期 active. Tabby dispatches a bubbling "tabby"
    // CustomEvent on the tab anchor for every toggle (click, focus, arrows),
    // and its init runs in an inline script before this defer script, so a
    // programmatic click here is picked up normally.
    function initTabsetMemory() {
      try {
        if (!window.localStorage) return;
        var base = 'cleanslidekit-tab:' + location.pathname + '#';
        document.addEventListener('tabby', function (e) {
          try {
            var a = e.target;
            var list = a && a.closest ? a.closest('.panel-tabset ul') : null;
            if (!list || !list.id) return;
            localStorage.setItem(base + list.id, a.getAttribute('href') || '');
          } catch (err) {}
        }, true);
        // Quarto constructs Tabby in a DOMContentLoaded listener that was
        // registered before this defer script runs, so restoring here would
        // be too early (the click would hit no listener, then Tabby's init
        // would select its default tab). Retry until Tabby has initialized —
        // detectable by aria-selected appearing on the tab links.
        var restoreTabs = function () {
          try {
            document.querySelectorAll('.panel-tabset ul[id]').forEach(function (list) {
              if (!list.querySelector('a[aria-selected]')) return;  // Tabby not ready
              var saved = localStorage.getItem(base + list.id);
              if (!saved) return;
              var link = list.querySelector('a[href="' + saved + '"]');
              if (link && link.getAttribute('aria-selected') !== 'true') link.click();
            });
          } catch (err) {}
        };
        restoreTabs();
        document.addEventListener('DOMContentLoaded', restoreTabs);
        window.addEventListener('load', restoreTabs);
      } catch (e) {}
    }

    function setup() {
      try {
        new MutationObserver(function() {
          createHome();
          addCodeExpandButtons();
          if (document.querySelector('.reveal > .footer')) {
            createNav();
            if (window.Reveal && Reveal.isReady()) initCounter();
          }
        }).observe(document.body, { childList: true, subtree: true });
        createHome();
        createNav();
        initCodeExpand();
        fixDataUriLightbox();
        initTabsetMemory();
      } catch (e) {}
    }

    if (document.body) {
      setup();
    } else {
      document.addEventListener('DOMContentLoaded', setup);
    }
  } catch (e) {}
})();
