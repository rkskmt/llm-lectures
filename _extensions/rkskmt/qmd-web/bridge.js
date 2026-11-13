/* qmd web preview bridge (reveal.js plugin).

   qmd web shows a project's published decks in its preview. A page cannot
   see into a frame from another site, so the deck itself says where it is:
   which deck and which slide, when it loads and when the reader moves. The
   editor then selects the same slide, or opens the deck a link led to.

   - It does nothing unless the deck is shown inside a frame, so readers who
     open the site normally run nothing of it.
   - It sends the deck's path, slide index and source (the git blob SHA of
     the qmd it was rendered from, or two separated by a space, written by
     source.lua), and takes "go to slide n" and "go back" from any page that
     frames the deck.
   - A double click on text sends that slide's text runs, which the published
     deck shows anyway. The run becomes editable only when the editor answers,
     and what is typed into it goes back to the editor as plain text.
   - The live preview replaces slides with HTML the editor sends, so that is
     taken only from the editor's own address: http://127.0.0.1 and
     http://localhost (any port), plus the addresses a site lists in
     `qmdweb: editors:` (see _extension.yml).
   - qmd_editor's local server adds its own bridge to the decks it serves;
     this one then stands aside. So does a deck inside a peek window.

   Same messages as qmd_editor's static/js/preview-bridge.js (channel
   qmd-preview-v1): its navigation, text-edit and live-preview parts. Enable
   it in a project with `revealjs-plugins: [qmd-web]` and `filters: [qmd-web]`
   in _quarto.yml or _metadata.yml. */
window.QmdWebBridge = function(){
  'use strict';
  const CHANNEL = 'qmd-preview-v1';
  const ARM_MS = 1000;

  const LOCAL_EDITOR = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/;

  function framed(){
    try{ return window.parent !== window; }catch(e){ return true; }
  }
  function start(deck){
    if(document.querySelector('script[data-qmd-preview-bridge]')) return;   // qmd_editor's
    if(new URLSearchParams(location.search).has('peek-embed')) return;       // a peek window
    const send = (type, detail = {}) => {
      window.parent.postMessage({channel: CHANNEL, type, ...detail}, '*');
    };
    const current = () => { try{ return deck.getIndices().h; }catch(e){ return undefined; } };
    const listed = (deck.getConfig().qmdweb || {}).editors;
    const editors = new Set(Array.isArray(listed) ? listed.map(String) : []);
    const trusted = origin => LOCAL_EDITOR.test(origin) || editors.has(origin);
    const slideSections = () => [...document.querySelectorAll('.reveal .slides section')]
      .filter(section => !section.parentElement.closest('section'));
    const source = document.querySelector('meta[name="qmd-web-source"]')?.content || null;

    /* Only the reader's own navigation may move the editor's selection: a
       goto from the editor, or reveal.js correcting itself on a broken deck,
       changes the slide too. Each input gesture arms one report; any other
       change is reported with user:false, which the editor ignores. */
    let armedUntil = 0;
    const arm = () => { armedUntil = Date.now() + ARM_MS; };
    ['keydown', 'pointerdown', 'click', 'touchstart', 'touchend', 'wheel'].forEach(type => {
      window.addEventListener(type, arm, {capture: true, passive: true});
    });
    let slideChangedAt = 0;
    function reportSlide(){
      slideChangedAt = Date.now();
      const user = Date.now() <= armedUntil;
      armedUntil = 0;
      send('slide', {index: current(), user});
    }
    function gotoSlide(index){
      if(deck.isScrollView && deck.isScrollView()){
        document.querySelectorAll('.slides .scroll-page')[index]?.scrollIntoView({block: 'start'});
      }else{
        deck.slide(index);
      }
    }

    window.addEventListener('message', event => {
      if(event.source !== window.parent || event.data?.channel !== CHANNEL) return;
      if(event.data.type === 'goto' && Number.isInteger(event.data.index)){
        if(deck.isReady()) gotoSlide(event.data.index);
        else deck.on('ready', () => gotoSlide(event.data.index));
      }else if(event.data.type === 'back'){
        history.back();
      }else if(event.data.type === 'live-sync' && Array.isArray(event.data.slides)){
        if(trusted(event.origin)) liveSync(event.data);
        else send('live-synced', {id: event.data.id, ok: false, error: 'this deck does not take slides from ' + event.origin});
      }else if(event.data.type === 'edit-accept'){
        if(asked?.id === event.data.id) beginEdit();
      }else if(event.data.type === 'edit-reject'){
        if(asked?.id === event.data.id) asked = null;
        if(offered?.id === event.data.id){
          if(offered.node.isConnected) offered.node.data = offered.data;
          offered = null;
        }
      }
    });

    /* ---------- editing rendered text in place ----------
       A double click on a text run asks the editor whether exactly that run
       can be traced back to the slide's source; the request carries the
       slide's text runs and nothing else. Only on the editor's go-ahead does
       the run become editable here, and what the user leaves in it is offered
       back as one line of plain text. */
    const NOT_PROSE = 'pre, script, style, svg, math, .math, mjx-container, .MathJax, .katex, '
      + 'textarea, button, select, iframe';
    const EDIT_STYLE = 'outline:2px solid #2f6feb;outline-offset:2px;border-radius:2px;'
      + 'background:rgba(47,111,235,.12);white-space:pre-wrap;cursor:text;'
      + '-webkit-user-select:text;user-select:text';
    const tidy = text => text.replace(/[ \t\n\r\f]+/g, ' ').replace(/^ | $/g, '');
    let editSeq = 0;
    let asked = null;     // {id, node, data, caret}: waiting for the editor's answer
    let editing = null;   // {id, node, span, leadNode, trailNode, lead, trail, before}
    let offered = null;   // {id, node, data}: sent to the editor; put back if it refuses

    function textRuns(section){
      const walker = document.createTreeWalker(section, NodeFilter.SHOW_TEXT);
      const nodes = [];
      for(let node = walker.nextNode(); node; node = walker.nextNode()){
        if(tidy(node.data) && !node.parentElement.closest(NOT_PROSE)) nodes.push(node);
      }
      return nodes;
    }
    function textAt(x, y){
      if(document.caretPositionFromPoint){
        const at = document.caretPositionFromPoint(x, y);
        return at && {node: at.offsetNode, offset: at.offset};
      }
      const range = document.caretRangeFromPoint?.(x, y);
      return range && {node: range.startContainer, offset: range.startOffset};
    }
    /* The caret lookup snaps to the nearest text even from empty space; only
       a click on the text itself counts. */
    function covers(node, x, y){
      const range = document.createRange();
      range.selectNodeContents(node);
      return [...range.getClientRects()].some(box =>
        x >= box.left - 2 && x <= box.right + 2 && y >= box.top - 2 && y <= box.bottom + 2);
    }
    window.addEventListener('dblclick', event => {
      // While a run is open, a double click inside it just selects a word (one
      // outside has already closed it: the first click moved the focus away).
      // Right after a slide change the click that caused it is still landing.
      if(editing || event.button !== 0 || Date.now() - slideChangedAt < 600) return;
      if(event.target.closest?.('a[href], summary, label')) return;   // these act on the click itself
      const hit = textAt(event.clientX, event.clientY);
      const node = hit?.node;
      if(node?.nodeType !== Node.TEXT_NODE || !covers(node, event.clientX, event.clientY)) return;
      const sections = slideSections();
      const slide = sections.findIndex(section => section.contains(node));
      if(slide < 0) return;
      const nodes = textRuns(sections[slide]);
      const index = nodes.indexOf(node);
      if(index < 0) return;
      asked = {id: ++editSeq, node, data: node.data, caret: hit.offset};
      send('edit-request', {id: asked.id, slide, index, runs: nodes.map(run => tidy(run.data))});
    }, true);

    function beginEdit(){
      const {id, node, data, caret} = asked;
      asked = null;
      if(!node.isConnected || node.data !== data){ send('edit-cancel', {id}); return; }
      const lead = data.match(/^[ \t\n\r\f]*/)[0];
      const trail = data.slice(lead.length).match(/[ \t\n\r\f]*$/)[0];
      const before = tidy(data);
      // Keep what the double click selected (a word), or at least its caret
      let from = caret, to = caret;
      const selection = getSelection();
      if(selection.rangeCount){
        const range = selection.getRangeAt(0);
        if(range.startContainer === node && range.endContainer === node){
          from = range.startOffset; to = range.endOffset;
        }
      }
      const within = offset => Math.max(0, Math.min(before.length, offset - lead.length));
      // The edge whitespace stays outside the editable span: it separates this
      // run from its neighbours and is not the run's to change.
      const span = document.createElement('span');
      span.setAttribute('contenteditable', 'plaintext-only');
      if(span.contentEditable !== 'plaintext-only') span.setAttribute('contenteditable', 'true');
      span.spellcheck = false;
      span.style.cssText = EDIT_STYLE;
      const leadNode = document.createTextNode(lead), trailNode = document.createTextNode(trail);
      node.before(leadNode, span, trailNode);
      node.data = before;
      span.appendChild(node);
      editing = {id, node, span, leadNode, trailNode, lead, trail, before};
      span.addEventListener('blur', () => finishEdit(true));
      span.focus({preventScroll: true});
      selection.setBaseAndExtent(node, within(from), node, within(to));
    }
    function finishEdit(keep){
      const edit = editing;
      if(!edit) return;
      editing = null;     // taking the span out blurs it; do not come back in here
      const typed = tidy(edit.span.textContent);
      // A run emptied out has nothing left to map to the source: it stays as it was
      const after = keep && typed ? typed : edit.before;
      edit.node.data = edit.lead + after + edit.trail;
      edit.span.replaceWith(edit.node);
      edit.leadNode.remove();
      edit.trailNode.remove();
      if(after !== edit.before){
        offered = {id: edit.id, node: edit.node, data: edit.lead + edit.before + edit.trail};
        send('edit-commit', {id: edit.id, text: after});
      }else{
        send('edit-cancel', {id: edit.id, emptied: keep && !typed});
      }
    }

    /* ---------- live preview ----------
       The editor rebuilds the slides the user saved (livepreview.js) and
       sends the deck's new slide list: rendered slides by their index in
       this page as loaded, rebuilt ones as HTML with stubs where the
       render's code-cell output and diagrams belong. Those are taken from
       this page as loaded, so the first sync records them. */
    const STALE_STYLE = '.qe-stale{outline:2px dashed #e08a1e;outline-offset:3px}'
      + '.qe-missing{padding:.4em .8em;border:2px dashed #e08a1e;color:#8a5a12;font-size:.6em}';
    const STALE_TITLE = 'Output from the last render: the code changed since. Render to update it.';
    let rendered = null;   // {sections, cells: Map(count -> [div.cell]), d2: [element]}

    function captureRendered(){
      const slides = document.querySelector('.reveal .slides');
      const cells = new Map();
      for(const cell of slides.querySelectorAll('div.cell[data-execution_count]')){
        if(cell.parentElement.closest('div.cell')) continue;
        const count = cell.getAttribute('data-execution_count');
        if(!cells.has(count)) cells.set(count, []);
        cells.get(count).push(cell);
      }
      const d2 = [...slides.querySelectorAll('img[data-src^="data:image/svg+xml"], img[src^="data:image/svg+xml"]')]
        .map(img => img.closest('p') || img);
      const style = document.createElement('style');
      style.textContent = STALE_STYLE;
      document.head.appendChild(style);
      return {sections: slideSections(), cells, d2};
    }
    const stale = el => { el.classList.add('qe-stale'); el.title = STALE_TITLE; return el; };
    /* A stub of a rebuilt slide, filled from the render. A changed cell keeps
       the render's output under its current code, outlined; a cell the
       render has no output for shows its code, outlined. */
    function fillStub(stub, holder){
      if(stub.kind === 'd2'){
        const old = stub.d2 != null ? rendered.d2[stub.d2] : null;
        if(old) return [stub.stale ? stale(old.cloneNode(true)) : old.cloneNode(true)];
        const missing = document.createElement('p');
        missing.className = 'qe-missing';
        missing.textContent = 'D2 diagram: render to draw it.';
        return [missing];
      }
      const old = stub.exec != null ? rendered.cells.get(String(stub.exec)) || [] : [];
      if(!stub.stale) return old.map(el => el.cloneNode(true));
      const code = [...holder.childNodes];
      const outputs = old.flatMap(el => [...el.children].filter(child => /\bcell-output/.test(child.className)));
      if(!code.length && !outputs.length) return [];
      const cell = document.createElement('div');
      cell.className = 'cell';
      if(old[0]) cell.setAttribute('data-execution_count', old[0].getAttribute('data-execution_count'));
      cell.append(...code, ...outputs.map(el => el.cloneNode(true)));
      return [stale(cell)];
    }
    function buildSlide(entry){
      const template = document.createElement('template');
      template.innerHTML = entry.html;
      const section = template.content.firstElementChild;
      for(const holder of [...section.querySelectorAll('div.qe-stub')]){
        const stub = entry.stubs[Number(holder.getAttribute('data-qe-n'))];
        holder.replaceWith(...(stub ? fillStub(stub, holder) : []));
      }
      // A theme that draws title-corner badges once at load (cleanslidekit's
      // badge-ui.js): carry them over while the slide keeps its badges.
      const base = entry.base != null ? rendered.sections[entry.base] : null;
      const badges = base && base.querySelector(':scope > .slide-badge-group');
      const badgeClasses = el => [...el.classList].filter(c => /^badge-/.test(c)).sort().join(' ');
      if(badges && badgeClasses(base) === badgeClasses(section)){
        section.appendChild(badges.cloneNode(true));
        section.setAttribute('data-badge-done', '1');
        const h2 = section.querySelector(':scope > h2'), baseH2 = base.querySelector(':scope > h2');
        if(h2 && baseH2) h2.style.paddingRight = baseH2.style.paddingRight;
      }
      return section;
    }
    /* What the deck's own scripts set up once at load, for the rebuilt slides */
    function initRebuilt(sections){
      const mathjax = window.MathJax;
      for(const section of sections){
        if(mathjax?.Hub?.Queue) mathjax.Hub.Queue(['Typeset', mathjax.Hub, section]);
        else if(mathjax?.typesetPromise) mathjax.typesetPromise([section]);
        if(window.Tabby){
          for(const bar of section.querySelectorAll('.panel-tabset-tabby[id]')) new window.Tabby('#' + bar.id);
        }
      }
      window.lightboxQuarto?.reload?.();
    }
    function liveSync({id, slides, index}){
      if(asked || editing){ send('live-synced', {id, ok: false, busy: true}); return; }
      try{
        if(!deck.isReady()) throw new Error('the deck is still loading');
        if(deck.isScrollView && deck.isScrollView()) throw new Error('not in scroll view');
        rendered = rendered || captureRendered();
        const used = new Set();
        const rebuilt = [];
        const list = slides.map(entry => {
          if(Number.isInteger(entry.keep)){
            const section = rendered.sections[entry.keep];
            if(!section) throw new Error('the deck has no slide #/' + entry.keep);
            if(used.has(section)) return section.cloneNode(true);
            used.add(section);
            return section;
          }
          const section = buildSlide(entry);
          rebuilt.push(section);
          return section;
        });
        const container = document.querySelector('.reveal .slides');
        for(const section of slideSections()) section.remove();
        container.prepend(...list);
        initRebuilt(rebuilt);
        deck.sync();
        deck.layout();
        if(Number.isInteger(index)) deck.slide(index);
        send('live-synced', {id, ok: true});
      }catch(e){
        send('live-synced', {id, ok: false, error: String(e && e.message || e)});
      }
    }
    // The editor's focus-mode keys work while the preview has the focus
    window.addEventListener('keydown', event => {
      if(editing){
        // Typing belongs to the run being edited: keep it away from the
        // deck's shortcuts. Enter keeps the edit and Escape drops it, unless
        // the key belongs to an IME conversion still in progress.
        event.stopPropagation();
        if(event.isComposing || event.keyCode === 229) return;
        if(event.key === 'Enter'){ event.preventDefault(); finishEdit(true); }
        else if(event.key === 'Escape'){ event.preventDefault(); finishEdit(false); }
        return;
      }
      if(event.key === 'Enter' && event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey){
        event.preventDefault();
        event.stopPropagation();
        send('shortcut', {action: 'toggle-chrome'});
      }else if(event.key === 'Escape'){
        send('shortcut', {action: 'show-chrome'});
      }
    }, true);
    ['keyup', 'keypress'].forEach(type => {
      window.addEventListener(type, event => { if(editing) event.stopPropagation(); }, true);
    });

    const announce = () => {
      send('document', {path: location.pathname, slide: current(), slides: slideSections().length, source});
      deck.on('slidechanged', reportSlide);
      send('slide', {index: current(), user: false});
    };
    if(deck.isReady()) announce();
    else deck.on('ready', announce);
  }

  return {
    id: 'qmd-web-bridge',
    init(deck){
      if(!framed()) return;
      // after parsing, when qmd_editor's injected bridge (end of body) is visible
      if(document.readyState === 'loading'){
        document.addEventListener('DOMContentLoaded', () => start(deck), {once: true});
      }else{
        start(deck);
      }
    },
  };
};
