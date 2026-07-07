/* badge-ui.js — rosette "preset" badges pinned to a slide's top-right.
 *
 * Authoring (class on the slide header):
 *   ## Title {.badge-important}        English / default (center = icon)
 *   ## Title {.badge-important-ja}      Japanese (center = JP word + icon)
 *   ## Title {.badge-practice .badge-important}   multiple badges side by side
 *
 * Presets: important / practice / fyi  (see PRESETS below).
 * The SVG is generated client-side at load and injected into the <section>;
 * because it is absolutely positioned inside the section it always sits at the
 * title's right shoulder (never drifts to the viewport corner on tall screens).
 * Mirrors the design prototyped in doc/badge-demo.html.
 */
(function () {
  "use strict";

  var UID = 0;
  function uid() { return ++UID; }

  // Flat pastel palette (matches the deck's coral/blue accents).
  var C = { coral: '#f76d5e', blue: '#3a8dde', cream: '#f8e3ad',
            peach: '#f6b394', red: '#f4736a', navy: '#1a3c6e' };

  // Center icons — each returns inner SVG markup drawn in a 24x24 box.
  var ICON = {
    star: function (c) { return '<polygon points="12 2 14.94 8.63 22 9.27 16.5 14.14 18.18 21 12 17.27 5.82 21 7.5 14.14 2 9.27 9.06 8.63" fill="' + c + '"/>'; },
    wrench: function (c) { return '<path d="M21 4.2a5.6 5.6 0 0 1-7.1 7.1l-7.7 7.7a2.1 2.1 0 0 1-3-3l7.7-7.7A5.6 5.6 0 0 1 18 1.2L14.6 4.6a1.4 1.4 0 0 0 0 2l1.8 1.8a1.4 1.4 0 0 0 2 0z" fill="' + c + '"/>'; },
    book: function (c) { return '<path d="M3 4.6c2.7-1.1 6.3-1.1 9 .6 2.7-1.7 6.3-1.7 9-.6v14.2c-2.7-1.1-6.3-1.1-9 .6-2.7-1.7-6.3-1.7-9-.6z" fill="none" stroke="' + c + '" stroke-width="1.9" stroke-linejoin="round"/><path d="M12 5.2v14.2" fill="none" stroke="' + c + '" stroke-width="1.9"/>'; }
  };

  function scallopPath(n, rv, rb) {
    var cx = 100, cy = 100, p = [], i;
    for (i = 0; i < n; i++) { var a = i / n * 2 * Math.PI; p.push([cx + rv * Math.cos(a), cy + rv * Math.sin(a)]); }
    var d = 'M' + p[0][0].toFixed(2) + ',' + p[0][1].toFixed(2);
    for (i = 0; i < n; i++) { var q = p[(i + 1) % n]; d += ' A' + rb + ',' + rb + ' 0 0 1 ' + q[0].toFixed(2) + ',' + q[1].toFixed(2); }
    return d + 'Z';
  }
  function zigzagPath(n, ro, ri) {
    var cx = 100, cy = 100, d = '', i;
    for (i = 0; i < n * 2; i++) {
      var r = (i % 2 === 0) ? ro : ri, a = i / (n * 2) * 2 * Math.PI - Math.PI / 2;
      d += (i === 0 ? 'M' : 'L') + (cx + r * Math.cos(a)).toFixed(2) + ',' + (cy + r * Math.sin(a)).toFixed(2);
    }
    return d + 'Z';
  }

  function badge(t) {
    var n = uid(), size = t.size || 150;
    var w = Math.round(size * 200 / 256), h = size, tp = 'tp' + n, bp = 'bp' + n;
    var rTop = t.textRTop || 60, rBot = t.textR || 68; // top: inner / bottom: nearer the outer edge
    var s = '<svg width="' + w + '" height="' + h + '" viewBox="0 0 200 256" xmlns="http://www.w3.org/2000/svg">';
    s += '<defs><path id="' + tp + '" d="M' + (100 - rTop) + ',100 A' + rTop + ',' + rTop + ' 0 0 1 ' + (100 + rTop) + ',100"/>'
       + '<path id="' + bp + '" d="M' + (100 - rBot) + ',100 A' + rBot + ',' + rBot + ' 0 0 0 ' + (100 + rBot) + ',100"/></defs>';
    // ribbon tails (behind) — wide roots apart, outward V splay
    var fld = t.field || 80;
    function tg(side) {
      var rw = 46, L = 92, nn = 15, px = 100 + side * 14, py = 140, deg = -side * 24;
      return { tf: 'translate(' + px + ' ' + py + ') rotate(' + deg + ')', d: 'M' + (-rw / 2) + ' 0 H' + (rw / 2) + ' V' + L + ' L0 ' + (L - nn) + ' L' + (-rw / 2) + ' ' + L + ' Z' };
    }
    var tL = tg(-1), tR = tg(1);
    s += '<path transform="' + tL.tf + '" d="' + tL.d + '" fill="' + t.ribbon + '"/><path transform="' + tR.tf + '" d="' + tR.d + '" fill="' + t.ribbon + '"/>';
    // badge shadow cast onto the upper part of the ribbon (clipped to the tails)
    s += '<defs><clipPath id="rc' + n + '"><path transform="' + tL.tf + '" d="' + tL.d + '"/><path transform="' + tR.tf + '" d="' + tR.d + '"/></clipPath>'
       + '<filter id="bl' + n + '" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="3.5"/></filter></defs>'
       + '<g clip-path="url(#rc' + n + ')"><circle cx="100" cy="104" r="' + (fld + 2) + '" fill="rgba(0,0,0,0.22)" filter="url(#bl' + n + ')"/></g>';
    // edge + field
    var edge = t.edge === 'scallop'
      ? scallopPath(t.teeth || 13, 80, (2 * Math.PI * 80 / (t.teeth || 13)) / 2)
      : zigzagPath(t.teeth || 22, 96, 84);
    s += '<path d="' + edge + '" fill="' + t.rosette + '"/><circle cx="100" cy="100" r="' + fld + '" fill="' + t.fieldColor + '"/>';
    if (t.ring) s += '<circle cx="100" cy="100" r="' + (fld - 4) + '" fill="none" stroke="' + t.ring + '" stroke-width="2"/>';
    // center: icon and/or horizontal JP text (CJK is never curved)
    var hasTxt = !!t.centerText, hasIcon = t.icon && t.icon !== 'none';
    var tlen = hasTxt ? Array.from(t.centerText).length : 0, multi = tlen >= 3;
    if (hasIcon) {
      var iy = hasTxt ? (multi ? 70 : 76) : 100, sc = hasTxt ? 1.65 : 2.8;
      s += '<g transform="translate(100 ' + iy + ') scale(' + sc + ') translate(-12 -12)">' + ICON[t.icon](t.iconColor) + '</g>';
    }
    if (hasTxt) {
      var ty = hasIcon ? (multi ? 116 : 124) : 109;
      var tl = multi ? ' textLength="118" lengthAdjust="spacingAndGlyphs"' : '';
      s += '<text x="100" y="' + ty + '" text-anchor="middle" font-weight="800" font-size="' + (t.centerSize || 26) + '" fill="' + (t.centerTextColor || t.textColor) + '"' + tl + '>' + t.centerText + '</text>';
    }
    // arch text — top stays inner/smaller, bottom is larger and nearer the edge
    s += '<text font-weight="800" letter-spacing="1.2" font-size="' + (t.fontSizeTop || 16) + '" fill="' + t.textColor + '"><textPath href="#' + tp + '" startOffset="50%" text-anchor="middle">' + (t.top || '') + '</textPath></text>';
    s += '<text font-weight="800" letter-spacing="1.2" font-size="' + (t.fontSize || 18) + '" fill="' + t.textColor + '"><textPath href="#' + bp + '" startOffset="50%" text-anchor="middle">' + (t.bottom || '') + '</textPath></text>';
    return s + '</svg>';
  }

  // ---- preset registry: semantic name -> full visual spec -------------------
  var PRESETS = {
    important: { edge: 'scallop', teeth: 13, rosette: C.coral, fieldColor: C.cream, ribbon: C.blue,
      icon: 'star', iconColor: C.coral, textColor: C.navy, top: 'KEY POINT', bottom: 'IMPORTANT', ja: '重要' },
    practice: { edge: 'scallop', teeth: 13, rosette: C.blue, fieldColor: C.cream, ribbon: C.coral,
      icon: 'wrench', iconColor: C.blue, textColor: C.navy, top: 'HANDS-ON', bottom: 'TRY IT', ja: '手を動かせ' },
    fyi: { edge: 'zigzag', teeth: 40, rosette: C.peach, fieldColor: C.cream, ring: C.coral, ribbon: C.blue,
      icon: 'book', iconColor: C.coral, textColor: C.navy, top: 'REFERENCE', bottom: 'FYI', ja: '参考まで' }
  };

  function jaSize(s) { return s.length <= 2 ? 30 : 26; }
  // English (normal): bigger arch text (no center word, so there is room).
  function renderEN(key, size) { return badge(Object.assign({}, PRESETS[key], { size: size, fontSizeTop: 20, fontSize: 22 })); }
  // Japanese: arch text at default size, big JP word in the center.
  function renderJA(key, size) { var P = PRESETS[key]; return badge(Object.assign({}, P, { size: size, centerText: P.ja, centerSize: jaSize(P.ja) })); }

  var SIZE = 125, BW = Math.round(SIZE * 200 / 256), GAP = 14, RIGHT = 22;

  function decorate() {
    try {
      var sections = document.querySelectorAll('.reveal .slides section');
      for (var i = 0; i < sections.length; i++) {
        var sec = sections[i];
        if (sec.getAttribute('data-badge-done')) continue;
        var found = [], cl = sec.classList, j;
        for (j = 0; j < cl.length; j++) {
          var m = /^badge-(.+)$/.exec(cl[j]);
          if (!m) continue;
          var name = m[1], ja = false;
          if (/-ja$/.test(name)) { ja = true; name = name.replace(/-ja$/, ''); }
          if (PRESETS[name]) found.push({ name: name, ja: ja });
        }
        if (!found.length) continue;
        var box = document.createElement('div');
        box.className = 'slide-badge-group';
        var html = '';
        for (var k = 0; k < found.length; k++) {
          html += found[k].ja ? renderJA(found[k].name, SIZE) : renderEN(found[k].name, SIZE);
        }
        box.innerHTML = html;
        sec.appendChild(box);
        var h2 = sec.querySelector(':scope > h2');
        if (h2) h2.style.paddingRight = (RIGHT + found.length * BW + (found.length - 1) * GAP + 30) + 'px';
        sec.setAttribute('data-badge-done', '1');
      }
    } catch (e) { /* never break MathJax / other deck scripts */ }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', decorate);
  else decorate();
})();
