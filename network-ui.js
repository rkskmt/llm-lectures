/* network-ui.js: the lines and the hover signal of the network lecture index
   (`lecture-index: network`, card-grid.lua + custom.css).

   Each numbered category is a column of nodes, and every node connects to
   every node of the next column. Where a node sits depends on the fonts and
   the window, so the lines are measured and drawn in the browser. A line
   leaves a node as a short stub that runs past the end of its label to the
   column's edge, so it never crosses a longer label in the same column.

   Hovering or keyboard-focusing a node fires it: the node gets .net-hot, the
   nodes of the two neighbouring layers get .net-on, and the edges between
   them are redrawn in the .net-lit and .net-flow paths. Every edge runs left
   to right, so the dashes of .net-flow travel in the direction of a forward
   pass. Under the stacked phone layout custom.css hides the SVG, no geometry
   is kept, and nothing fires. */
(function () {
  'use strict';

  var roots = document.querySelectorAll('.lectures.network');
  if (!roots.length) return;

  var SVG_NS = 'http://www.w3.org/2000/svg';
  // Delay before a neighbouring node lights up, so the signal reads as moving
  // through the layers: the previous layer first, then the next one.
  var PREV_DELAY = 30;
  var NEXT_DELAY = 130;
  var STAGGER = 28;

  function numberedGroups(root) {
    return Array.prototype.filter.call(
      root.querySelectorAll(':scope > .lec-group'),
      function (group) { return !group.querySelector('.grid.app'); }
    );
  }

  function addPath(svg, className) {
    var path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('class', className);
    svg.appendChild(path);
    return path;
  }

  // Node geometry in the root's own (unscaled) coordinates. The number
  // circle is the link's ::before, so its size comes from computed style.
  // A node may stack its circle over the label (flex column): the output
  // node always, every node in the compact layout. There a line runs level
  // with the circle across its own column, so it stays above the labels:
  // `inEdge` is where an incoming line reaches the column. The output node
  // is alone in its column and takes its lines directly.
  function measure(link, box, k, group, groupRect) {
    var r = link.getBoundingClientRect();
    var left = (r.left - box.left) / k;
    var top = (r.top - box.top) / k;
    var width = r.width / k;
    var height = r.height / k;
    var edge = (groupRect.right - box.left) / k;
    var inX = left;
    var y = top + height / 2;
    var start = left + width + 4;
    var inEdge = null;
    if (getComputedStyle(link).flexDirection === 'column') {
      var dot = getComputedStyle(link, '::before');
      var dotWidth = parseFloat(dot.width);
      inX = left + (width - dotWidth) / 2;
      y = top + parseFloat(dot.height) / 2;
      start = inX + dotWidth + 4;
      if (!group.querySelector('.sec.output')) inEdge = (groupRect.left - box.left) / k;
    }
    return { link: link, inX: inX, inEdge: inEdge, y: y, start: start, fanX: Math.max(start, edge) };
  }

  function edgePath(a, b) {
    var end = (b.inX - 3).toFixed(1);
    var y = b.y.toFixed(1);
    var arrival = b.inEdge === null
      ? 'L' + end + ' ' + y
      : 'L' + b.inEdge.toFixed(1) + ' ' + y + 'H' + end;
    return 'M' + a.start.toFixed(1) + ' ' + a.y.toFixed(1) +
      'H' + a.fanX.toFixed(1) + arrival;
  }

  function setUp(root) {
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'net-lines');
    svg.setAttribute('aria-hidden', 'true');
    var base = addPath(svg, 'net-base');
    var lit = addPath(svg, 'net-lit');
    var flow = addPath(svg, 'net-flow');
    root.insertBefore(svg, root.firstChild);

    var layers = [];
    var where = new Map();
    var hot = null;

    function clear() {
      if (!hot) return;
      root.classList.remove('net-firing');
      hot.classList.remove('net-hot');
      root.querySelectorAll('.net-on').forEach(function (link) {
        link.classList.remove('net-on');
        link.style.removeProperty('--net-delay');
      });
      lit.removeAttribute('d');
      flow.removeAttribute('d');
      hot = null;
    }

    function drawSignal() {
      var at = where.get(hot);
      var d = [];
      (layers[at.layer - 1] || []).forEach(function (node) { d.push(edgePath(node, at.node)); });
      (layers[at.layer + 1] || []).forEach(function (node) { d.push(edgePath(at.node, node)); });
      var joined = d.join('');
      lit.setAttribute('d', joined);
      flow.setAttribute('d', joined);
    }

    function lightLayer(nodes, delay) {
      (nodes || []).forEach(function (node, i) {
        node.link.style.setProperty('--net-delay', (delay + i * STAGGER) + 'ms');
        node.link.classList.add('net-on');
      });
    }

    function fire(link) {
      if (link === hot) return;
      clear();
      var at = where.get(link);
      if (!at) return;
      hot = link;
      root.classList.add('net-firing');
      link.classList.add('net-hot');
      lightLayer(layers[at.layer - 1], PREV_DELAY);
      lightLayer(layers[at.layer + 1], NEXT_DELAY);
      drawSignal();
    }

    function draw() {
      base.removeAttribute('d');
      layers = [];
      where = new Map();
      var box = root.getBoundingClientRect();
      if (getComputedStyle(svg).display === 'none' || !box.width) {
        clear();
        return;
      }
      var k = box.width / root.offsetWidth;

      layers = numberedGroups(root).map(function (group, layer) {
        var groupRect = group.getBoundingClientRect();
        var links = group.querySelectorAll('.grid li > a');
        return Array.prototype.map.call(links, function (link) {
          var node = measure(link, box, k, group, groupRect);
          where.set(link, { layer: layer, node: node });
          return node;
        });
      });

      var d = [];
      layers.forEach(function (nodes, i) {
        var next = layers[i + 1];
        if (!next) return;
        nodes.forEach(function (a) {
          next.forEach(function (b) { d.push(edgePath(a, b)); });
        });
      });
      base.setAttribute('d', d.join(''));

      if (hot) {
        if (where.has(hot)) drawSignal();
        else clear();
      }
    }

    function linkOf(target) {
      return target && target.closest ? target.closest('.grid li > a') : null;
    }

    root.addEventListener('mouseover', function (e) {
      var link = linkOf(e.target);
      if (link && where.has(link)) fire(link);
    });
    root.addEventListener('mouseout', function (e) {
      if (hot && linkOf(e.relatedTarget) !== hot) clear();
    });
    root.addEventListener('focusin', function (e) {
      var link = linkOf(e.target);
      if (link && link.matches(':focus-visible') && where.has(link)) fire(link);
    });
    root.addEventListener('focusout', clear);
    // A page restored by the Back button must not come back mid-signal.
    window.addEventListener('pagehide', clear);

    // Fires on first layout, window resizes, and when a hidden term tab opens.
    var observer = new ResizeObserver(draw);
    observer.observe(root);
    numberedGroups(root).forEach(function (group) { observer.observe(group); });
    document.fonts.ready.then(draw);
  }

  roots.forEach(setUp);
})();
