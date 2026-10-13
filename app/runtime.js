/* CG Motion runtime - renders a project in the editor AND inside exported CasparCG templates.
   Written in conservative JavaScript so it also runs on the older Chromium in CasparCG 2.3. */
(function (root) {
  'use strict';

  var DEF = {
    x: 0, y: 0, ax: 0, ay: 0, sx: 100, sy: 100, rot: 0, op: 100, skx: 0, sky: 0,
    w: 100, h: 100, radius: 0, fill: '#ffffffff', fill2: '#000000ff', gradAngle: 90,
    stroke: '#000000ff', strokeW: 0,
    fontSize: 60, tracking: 0, lineHeight: 1.2, color: '#ffffffff',
    mx: 0, my: 0, mw: 100, mh: 100, mr: 0,
    blur: 0, bright: 100, contrast: 100, sat: 100, hue: 0,
    shX: 0, shY: 4, shBlur: 10, shColor: '#00000080', bg: '#00000000', prog: 100, texOp: 35,
    texX: 0, texY: 0, texSc: 100, texRot: 0, texBr: 100, texCt: 100, texBlur: 0, texHue: 0, texSat: 100
  };
  var COLOR_PROPS = { fill: 1, fill2: 1, stroke: 1, color: 1, shColor: 1, bg: 1 };
  var IDENT = [1, 0, 0, 1, 0, 0];

  /* ---------- colour ---------- */
  var colorCache = {};
  function parseColor(c) {
    if (colorCache[c]) return colorCache[c];
    var r = 255, g = 255, b = 255, a = 1, s = String(c || '').replace('#', '');
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    if (s.length >= 6) {
      r = parseInt(s.substr(0, 2), 16); g = parseInt(s.substr(2, 2), 16); b = parseInt(s.substr(4, 2), 16);
      if (s.length >= 8) a = parseInt(s.substr(6, 2), 16) / 255;
    }
    var out = [r || 0, g || 0, b || 0, isNaN(a) ? 1 : a];
    colorCache[c] = out;
    return out;
  }
  function h2(n) { n = Math.max(0, Math.min(255, Math.round(n))); return (n < 16 ? '0' : '') + n.toString(16); }
  function toHex(arr) { return '#' + h2(arr[0]) + h2(arr[1]) + h2(arr[2]) + h2(arr[3] * 255); }
  function css(c) { var p = parseColor(c); return 'rgba(' + p[0] + ',' + p[1] + ',' + p[2] + ',' + (Math.round(p[3] * 1000) / 1000) + ')'; }

  /* accepts #rgb, #rrggbb, #rrggbbaa (with or without #) and rgb()/rgba(); returns #rrggbbaa or null */
  function normColor(v) {
    if (v == null) return null;
    v = String(v).replace(/^\s+|\s+$/g, '');
    if (/^(none|transparent|clear)$/i.test(v)) return '#00000000';
    if (/^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v)) return toHex(parseColor(v.charAt(0) === '#' ? v : '#' + v));
    var m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,\/]+([\d.]+%?))?\s*\)$/i.exec(v);
    if (m) {
      var a = m[4] == null ? 1 : (/%$/.test(m[4]) ? parseFloat(m[4]) / 100 : parseFloat(m[4]));
      return toHex([+m[1], +m[2], +m[3], a]);
    }
    /* colour names such as "red" or "navy" */
    try {
      var cx = normColor.cx || (normColor.cx = document.createElement('canvas').getContext('2d'));
      cx.fillStyle = '#000001'; cx.fillStyle = v;
      var r = String(cx.fillStyle);
      if (r !== '#000001' && r !== v) return normColor(r);
    } catch (e) {}
    return null;
  }
  /* shared colours: a layer colour can be linked to a project swatch, and a swatch can be driven by CasparCG data */
  function swatchColor(project, id) {
    var list = project && project.swatches || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return (project.__live && project.__live[id]) || list[i].color;
    return null;
  }
  function setLive(project, data) {
    var list = project.swatches || [], live = {}, i, c;
    for (i = 0; i < list.length; i++) {
      if (list[i].key && data[list[i].key] != null) { c = normColor(data[list[i].key]); if (c) live[list[i].id] = c; }
    }
    try { Object.defineProperty(project, '__live', { value: live, enumerable: false, writable: true, configurable: true }); } catch (e) {}
  }
  /* turns what the operator sends for an image slot into something the browser can load */
  function resolveSrc(raw, L) {
    raw = String(raw);
    if (/^(data:|blob:|https?:|file:)/i.test(raw)) return raw;
    var s = /^([A-Za-z]:[\\\/]|\\\\|\/)/.test(raw) ? raw : (L.prefix || '') + raw + (L.suffix || '');
    if (/^[A-Za-z]:[\\\/]/.test(s)) return 'file:///' + s.replace(/\\/g, '/');
    if (/^\\\\/.test(s)) return 'file:' + s.replace(/\\/g, '/');
    return s.replace(/\\/g, '/');
  }

  /* ---------- easing ---------- */
  var bezCache = {};
  function bezier(x1, y1, x2, y2) {
    var key = x1 + ',' + y1 + ',' + x2 + ',' + y2;
    if (bezCache[key]) return bezCache[key];
    var ax = 1 - 3 * x2 + 3 * x1, bx = 3 * x2 - 6 * x1, cx = 3 * x1;
    var ay = 1 - 3 * y2 + 3 * y1, by = 3 * y2 - 6 * y1, cy = 3 * y1;
    function fx(t) { return ((ax * t + bx) * t + cx) * t; }
    function fy(t) { return ((ay * t + by) * t + cy) * t; }
    function f(x) {
      if (x <= 0) return 0; if (x >= 1) return 1;
      var t = x, i, d, v;
      for (i = 0; i < 8; i++) {
        v = fx(t) - x; if (Math.abs(v) < 1e-5) return fy(t);
        d = (3 * ax * t + 2 * bx) * t + cx; if (Math.abs(d) < 1e-6) break;
        t -= v / d;
      }
      var lo = 0, hi = 1; t = x;
      for (i = 0; i < 24; i++) { v = fx(t); if (Math.abs(v - x) < 1e-5) break; if (v < x) lo = t; else hi = t; t = (lo + hi) / 2; }
      return fy(t);
    }
    bezCache[key] = f;
    return f;
  }
  function easeCurve(e, project) {
    if (!e) return null;
    if (e.type === 'bezier' && e.b) return e.b;
    if (e.type === 'preset') {
      var list = project && project.easings || [];
      for (var i = 0; i < list.length; i++) if (list[i].id === e.id) return list[i].b;
    }
    return null;
  }

  /* evalProp = the designed value (baseProp) with any CasparCG-mapped value applied on top */
  function evalProp(layer, name, t, project) {
    var o = layer.__o && layer.__o[name];
    if (!o) return baseProp(layer, name, t, project);
    if (o.m === 'add' && !COLOR_PROPS[name]) return baseProp(layer, name, t, project) + o.v;
    if (o.m === 'mul' && !COLOR_PROPS[name]) return baseProp(layer, name, t, project) * o.v;
    return o.v;
  }
  function baseProp(layer, name, t, project) {
    if (layer.link && layer.link[name] && COLOR_PROPS[name]) {
      var lc = swatchColor(project, layer.link[name]);
      if (lc) return lc;
    }
    var ks = layer.a && layer.a[name];
    if (!ks || !ks.length) {
      var v = layer.p ? layer.p[name] : undefined;
      return v === undefined ? DEF[name] : v;
    }
    var n = ks.length;
    if (t <= ks[0].t) return ks[0].v;
    if (t >= ks[n - 1].t) return ks[n - 1].v;
    var i = 0;
    while (i < n - 2 && ks[i + 1].t <= t) i++;
    var k0 = ks[i], k1 = ks[i + 1], e = k0.e;
    if (e && e.type === 'hold') return k0.v;
    var u = (t - k0.t) / (k1.t - k0.t);
    var b = easeCurve(e, project);
    if (b) u = bezier(b[0], b[1], b[2], b[3])(u);
    if (COLOR_PROPS[name]) {
      var c0 = parseColor(k0.v), c1 = parseColor(k1.v);
      return toHex([c0[0] + (c1[0] - c0[0]) * u, c0[1] + (c1[1] - c0[1]) * u, c0[2] + (c1[2] - c0[2]) * u, c0[3] + (c1[3] - c0[3]) * u]);
    }
    return k0.v + (k1.v - k0.v) * u;
  }

  /* ---------- matrices [a,b,c,d,e,f] ---------- */
  function mul(m, n) {
    return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
            m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
            m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
  }
  function translate(m, x, y) { return [m[0], m[1], m[2], m[3], m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }
  function invert(m) {
    var det = m[0] * m[3] - m[1] * m[2];
    if (Math.abs(det) < 1e-9) return null;
    return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det,
            (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
  }
  function apply(m, x, y) { return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }
  function r4(n) { return Math.round(n * 10000) / 10000; }
  function mcss(m) { return 'matrix(' + r4(m[0]) + ',' + r4(m[1]) + ',' + r4(m[2]) + ',' + r4(m[3]) + ',' + r4(m[4]) + ',' + r4(m[5]) + ')'; }

  /* ---------- fonts ---------- */
  function fontFaceCSS(project, onlyIn) {
    var out = '', assets = project.assets || {};
    for (var id in assets) {
      var a = assets[id];
      if (a.type !== 'font') continue;
      if (onlyIn && onlyIn.indexOf(a.family) < 0) continue;
      out += '@font-face{font-family:"' + a.family + '";src:url(' + a.src + ');}\n';
    }
    return out;
  }
  function installFonts(project, doc) {
    doc = doc || document;
    var st = doc.getElementById('cg-fonts');
    if (!st) { st = doc.createElement('style'); st.id = 'cg-fonts'; doc.head.appendChild(st); }
    var cssText = fontFaceCSS(project);
    if (st.textContent !== cssText) st.textContent = cssText;
    if (doc.fonts && doc.fonts.load) {
      var assets = project.assets || {};
      for (var id in assets) if (assets[id].type === 'font') { try { var fp = doc.fonts.load('16px "' + assets[id].family + '"'); if (fp && fp.catch) fp.catch(function () {}); } catch (e) {} }
    }
  }

  /* ---------- data ---------- */
  function parseData(d) {
    var out = {}, k;
    if (d == null) return out;
    if (typeof d === 'string') {
      var s = d.replace(/^\s+/, '');
      if (s.charAt(0) === '<') {
        try {
          var xml = new DOMParser().parseFromString(s, 'text/xml');
          var cds = xml.getElementsByTagName('componentData');
          for (var i = 0; i < cds.length; i++) {
            var dn = cds[i].getElementsByTagName('data')[0];
            if (dn) out[cds[i].getAttribute('id')] = dn.getAttribute('value');
          }
        } catch (e) {}
        return out;
      }
      try { d = JSON.parse(s); } catch (e2) { return out; }
    }
    if (typeof d === 'object') {
      for (k in d) {
        var v = d[k];
        if (v && typeof v === 'object') v = v.text != null ? v.text : (v.value != null ? v.value : '');
        out[k] = v;
      }
    }
    return out;
  }

  var imgCache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  var uidN = 0;

  /* ================= Player ================= */
  function Player(project, container, opts) {
    var self = this;
    this.project = project;
    this.container = container;
    this.opts = opts || {};
    this.live = !!this.opts.live;
    this.data = {};
    this.fontVer = 0;
    this.fid = 0;
    this.main = { time: 0, target: 0, playing: false, dir: 1 };
    this.clocks = {};
    this.wall = 0;
    this.shown = !this.live;
    this.looping = false;
    this.dirty = false;
    this.anims = [];
    this.sfx = ''; this.repN = null;
    if (document.fonts && document.fonts.addEventListener) {
      document.fonts.addEventListener('loadingdone', function () { self.fontVer++; self.async(); });
    }
    this.build();
  }
  var P = Player.prototype;

  P.getComp = function (id) {
    var cs = this.project.comps;
    for (var i = 0; i < cs.length; i++) if (cs[i].id === id) return cs[i];
    return cs[0];
  };
  P.async = function () {
    this.dirty = true;
    if (this.opts.onAsync) this.opts.onAsync();
  };

  P.build = function () {
    var i;
    for (i = 0; i < this.anims.length; i++) { try { this.anims[i].destroy(); } catch (e) {} }
    this.anims = [];
    this.all = {};
    this.hasFree = false;
    var comp = this.getComp(this.opts.comp || this.project.rootComp);
    this.rootComp = comp;
    this.container.innerHTML = '';
    var el = document.createElement('div');
    el.style.cssText = 'position:relative;overflow:hidden;width:' + comp.w + 'px;height:' + comp.h + 'px;';
    this.rootEl = el;
    this.tree = this.buildComp(comp, el, 0, null);
    this.container.appendChild(el);
    this.show(this.shown);
    if (this.live) { try { this.render(); } catch (e2) {} }
  };

  P.buildComp = function (comp, parentEl, depth, owner) {
    var node = { comp: comp, items: [], byId: {} }, i, self = this;
    for (i = comp.layers.length - 1; i >= 0; i--) {
      var L = comp.layers[i];
      var it = { layer: L, c: {}, wc: {}, rev: 0, own: owner, w: 0, h: 0, fit: 1, alignOff: 0, pm: IDENT, base: IDENT, wm: IDENT, fid: -1, tok: 0 };
      var el = document.createElement(L.type === 'sequence' ? 'canvas' : 'div');
      el.style.cssText = 'position:absolute;left:0;top:0;transform-origin:0 0;display:none;';
      it.el = el;
      if (L.type === 'text') {
        el.style.whiteSpace = 'pre';
        if (L.box) {
          /* text box: a fixed frame with the text laid out inside it */
          var tx = document.createElement('div');
          tx.style.cssText = 'transform-origin:0 50%;flex:none;';
          el.appendChild(tx);
          it.tx = tx;
        }
      } else if (L.type === 'image') {
        var img = document.createElement('img');
        img.style.cssText = 'width:100%;height:100%;display:block;';
        img.draggable = false;
        el.appendChild(img);
        it.img = img;
      } else if (L.type === 'sequence') {
        it.ctx = el.getContext('2d');
      } else if (L.type === 'lottie') {
        el.style.overflow = 'hidden';
        var asset = (this.project.assets || {})[L.asset];
        if (asset && root.lottie) {
          try {
            it.anim = root.lottie.loadAnimation({ container: el, renderer: 'svg', loop: false, autoplay: false, animationData: JSON.parse(JSON.stringify(asset.data)) });
            this.anims.push(it.anim);
            it.applied = {};
          } catch (e) {}
        }
      } else if (L.type === 'table' || L.type === 'chart' || L.type === 'crawl') {
        el.style.overflow = L.type === 'chart' ? 'visible' : 'hidden';
      } else if (L.type === 'comp') {
        el.style.overflow = 'hidden';
        var sub = null, cs = this.project.comps;
        for (var j = 0; j < cs.length; j++) if (cs[j].id === L.comp) sub = cs[j];
        if (sub && sub !== comp && depth < 6) {
          if (L.rep && L.rep.on) {
            /* repeater: the same composition several times, each copy with its own numbered fields */
            var rn = Math.max(1, Math.min(100, Math.round(+L.rep.n || 1))), rk;
            el.style.overflow = 'visible';
            it.subs = [];
            for (rk = 0; rk < rn; rk++) {
              var row = document.createElement('div');
              row.style.cssText = 'position:absolute;left:0;top:0;overflow:hidden;width:' + sub.w + 'px;height:' + sub.h + 'px;';
              el.appendChild(row);
              it.subs.push({ el: row, node: this.buildComp(sub, row, depth + 1, it) });
            }
            it.sub = it.subs[0].node;
          } else it.sub = this.buildComp(sub, el, depth + 1, it);
        }
      }
      if ((L.type === 'sequence' || L.type === 'lottie' || L.type === 'comp') && L.freeRun) this.hasFree = true;
      if (L.type === 'crawl') this.hasFree = true;
      node.items.push(it);
      node.byId[L.id] = it;
      if (!this.all[L.id]) this.all[L.id] = it;
    }
    for (i = 0; i < node.items.length; i++) {
      var item = node.items[i], specs = matteSpecs(item.layer), list = [], si;
      for (si = 0; si < specs.length; si++) {
        var mi = node.byId[specs[si].id];
        if (mi && mi !== item) { mi.isMatte = true; list.push({ it: mi, op: specs[si].op }); }
      }
      var tms = (item.layer.tex && item.layer.tex.masks) || [];
      item.texMasks = [];
      for (si = 0; si < tms.length; si++) {
        var tmi = tms[si] && node.byId[tms[si].id];
        if (tmi && tmi !== item) { tmi.isTexMask = true; item.texMasks.push({ it: tmi, op: tms[si].op || 'add' }); }
      }
      var ML = list.length ? list[0].it : null;
      if (ML) {
        item.matteItem = ML;
        item.matteList = list;
        item.multi = !!(item.layer.matteMore && item.layer.matteMore.length);
        var wrap = document.createElement('div');
        wrap.style.cssText = 'position:absolute;left:0;top:0;transform-origin:0 0;display:none;';
        wrap.appendChild(item.el);
        item.el.style.display = item.tx ? 'flex' : 'block';
        item.wrap = wrap;
        parentEl.appendChild(wrap);
      } else {
        parentEl.appendChild(item.el);
      }
    }
    return node;
  };

  function bump(it, k) {
    if (k !== 'transform' && k !== 'opacity' && k !== 'display' && k !== 'visibility') it.rev++;
    var o = it.own;
    while (o) { o.rev++; o = o.own; }
  }
  function S(it, k, v) {
    if (it.c[k] === v) return;
    it.c[k] = v;
    it.el.style[k] = v;
    bump(it, k);
  }
  /* ---------- rich text: parts of a text separated by an invisible delimiter, each with its own style ----------
     e.g. "John|Smith|C" with styles [thin italic] [bold] [small, raised, "(" ")"] */
  function styleSpec(L) {
    var s = L.styles;
    if (s && s.on && s.sep && s.segs && s.segs.length) return s;
    var sp = L.split;
    if (sp && sp.on && sp.sep) return { sep: sp.sep, join: sp.join, segs: [{}, { font: sp.font, weight: sp.weight, italic: sp.italic }] };
    return null;
  }
  function specSig(spec) { return spec ? '\u0001' + JSON.stringify(spec) : ''; }
  /* a typed "\n" (or the layer's own line-break code) starts a new line; CasparCG data cannot always carry real line breaks */
  function lineBreaks(txt, L) {
    var code = L.lineBreak == null ? '\\n' : L.lineBreak;
    return code ? String(txt).split(code).join('\n') : String(txt);
  }
  function applySeg(span, st) {
    if (st.font) span.style.fontFamily = '"' + st.font + '", Arial, sans-serif';
    if (st.weight) span.style.fontWeight = String(st.weight);
    if (st.italic === true || st.italic === 'on') span.style.fontStyle = 'italic';
    else if (st.italic === 'off') span.style.fontStyle = 'normal';
    if (+st.size > 0 && +st.size !== 100) span.style.fontSize = (+st.size / 100) + 'em';
    if (st.color) span.style.color = css(normColor(st.color) || st.color);
    if (st.caps === 'upper') span.style.textTransform = 'uppercase';
    else if (st.caps === 'lower') span.style.textTransform = 'lowercase';
    else if (st.caps === 'none') span.style.textTransform = 'none';
    if (+st.raise) { span.style.position = 'relative'; span.style.top = (-(+st.raise) / 100) + 'em'; }
    if (st.track != null && st.track !== '') span.style.letterSpacing = (+st.track || 0) + 'px';
  }
  function fillRich(doc, target, txt, spec) {
    while (target.firstChild) target.removeChild(target.firstChild);
    if (!spec) { target.appendChild(doc.createTextNode(txt)); return; }
    var parts = String(txt).split(spec.sep), segs = spec.segs || [], join = spec.join == null ? ' ' : spec.join, first = true;
    for (var i = 0; i < parts.length; i++) {
      if (parts[i] === '') continue;
      var st = segs[Math.min(i, segs.length - 1)] || {};
      if (!first && join) target.appendChild(doc.createTextNode(join));
      first = false;
      var span = doc.createElement('span');
      applySeg(span, st);
      span.textContent = (st.before || '') + parts[i] + (st.after || '');
      target.appendChild(span);
    }
  }
  function setText(it, target, txt, L) {
    var spec = styleSpec(L), sig = txt + specSig(spec);
    if (it.c.txt === sig) return;
    it.c.txt = sig;
    fillRich(target.ownerDocument || document, target, txt, spec);
    bump(it, 'txt');
  }
  /* a CSS variable on the layer element (tables use them so colours animate without touching every cell) */
  function SV(it, k, v) {
    if (it.c[k] === v) return;
    it.c[k] = v;
    it.el.style.setProperty(k, v);
    bump(it, k);
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* ---------- tables ---------- */
  /* rows of cells from: JSON ([["a","b"],...] or [{...},...]), pasted Excel (tabs), or text with row / cell delimiters */
  function parseTable(src, L) {
    src = String(src == null ? '' : src);
    var t = src.replace(/^\s+|\s+$/g, ''), i;
    if (/^[\[{]/.test(t)) {
      try {
        var j = JSON.parse(t);
        if (j && !Array.isArray(j) && Array.isArray(j.rows)) j = j.rows;
        if (Array.isArray(j)) {
          if (j.length && j[0] && !Array.isArray(j[0]) && typeof j[0] === 'object') {
            var keys = Object.keys(j[0]), out = [keys];
            for (i = 0; i < j.length; i++) out.push(keys.map(function (k) { return j[i][k] == null ? '' : String(j[i][k]); }));
            return out;
          }
          return j.map(function (r) { return Array.isArray(r) ? r.map(function (c) { return c == null ? '' : String(c); }) : [String(r)]; });
        }
      } catch (e) {}
    }
    src = src.replace(/\\n/g, '\n').replace(/\r\n?/g, '\n');
    var rs = L.rowSep || (src.indexOf('\n') >= 0 ? '\n' : ';');
    var cs = L.cellSep || (src.indexOf('\t') >= 0 ? '\t' : (src.indexOf('|') >= 0 ? '|' : ','));
    var rows = src.split(rs), res = [];
    for (i = 0; i < rows.length; i++) {
      if (!rows[i].replace(/\s/g, '')) continue;
      res.push(rows[i].split(cs).map(function (c) { return c.replace(/^\s+|\s+$/g, ''); }));
    }
    return res;
  }
  function listOf(s, n, dflt) {
    var a = String(s == null ? '' : s).split(/[,\s]+/).filter(function (x) { return x !== ''; }), out = [];
    for (var i = 0; i < n; i++) out.push(a.length ? a[Math.min(i, a.length - 1)] : dflt);
    return out;
  }

  /* ---------- charts ---------- */
  var PALETTE = ['#00ff83', '#3b9dff', '#ff9f1a', '#ff4d6d', '#b56ce6', '#f5c542', '#19c2c2', '#e4576e'];
  /* one series per line: "Proteas: 4, 6, 1w, 12"   (w = wicket in that over)   or for pies / bars: "Yes: 62" */
  function parseSeries(src) {
    src = String(src == null ? '' : src).replace(/\\n/g, '\n');
    var t = src.replace(/^\s+|\s+$/g, ''), out = [], k;
    if (/^[\[{]/.test(t)) {
      try {
        var j = JSON.parse(t);
        if (Array.isArray(j)) j.forEach(function (s, i) { if (s && typeof s === 'object') out.push({ name: s.name || s.label || ('Series ' + (i + 1)), vals: [].concat(s.values != null ? s.values : (s.value != null ? s.value : [])).map(Number), marks: [].concat(s.wickets || []).map(Number), color: s.color }); });
        else for (k in j) out.push({ name: k, vals: [].concat(j[k]).map(Number), marks: [] });
        return out;
      } catch (e) {}
    }
    src.split(/\n|;/).forEach(function (line) {
      line = line.replace(/^\s+|\s+$/g, '');
      if (!line) return;
      var m = /^([^:]*):(.*)$/.exec(line), name = m ? m[1].replace(/^\s+|\s+$/g, '') : '', rest = m ? m[2] : line, vals = [], marks = [];
      rest.split(/[,\s]+/).forEach(function (tok) {
        if (!tok) return;
        var q = /^(-?[\d.]+)\s*([wW]*)$/.exec(tok);
        if (!q) return;
        vals.push(+q[1]); marks.push(q[2].length);
      });
      out.push({ name: name, vals: vals, marks: marks });
    });
    return out;
  }
  /* stat comparison: first line the two names ("Proteas | Australia"), then one stat per line ("Fours: 22 | 18") */
  function parseDual(src) {
    src = String(src == null ? '' : src).replace(/\\n/g, '\n');
    var out = { names: ['', ''], rows: [] };
    src.split(/\n|;/).forEach(function (line) {
      line = line.replace(/^\s+|\s+$/g, '');
      if (!line) return;
      var m = /^([^:|]*):(.*)$/.exec(line);
      if (!m) { var nm = line.split('|'); if (nm.length >= 2 && !out.rows.length) out.names = [nm[0].replace(/^\s+|\s+$/g, ''), nm[1].replace(/^\s+|\s+$/g, '')]; return; }
      var parts = m[2].indexOf('|') >= 0 ? m[2].split('|') : m[2].split(',');
      if (parts.length < 2) return;
      var a = parts[0].replace(/^\s+|\s+$/g, ''), b = parts[1].replace(/^\s+|\s+$/g, '');
      out.rows.push({ label: m[1].replace(/^\s+|\s+$/g, ''), a: a, b: b, va: parseFloat(a.replace(',', '.')) || 0, vb: parseFloat(b.replace(',', '.')) || 0 });
    });
    return out;
  }
  /* ---------- single cells as their own CasparCG fields ----------
     table:  standings_h2 (header cell 2), standings_r3c2 (row 3, cell 2), standings_r3 (a whole row, "4|India|6|4|17")
     chart:  worm_n1 (name of series/item 1), worm_v1 (its value, or all its values "4, 8, 3"), worm_v1p5 (point 5), worm_c1 (its colour)
     double: stats_n1 / stats_n2 (team names), stats_s2 (stat 2 label), stats_a2 / stats_b2 (its two values), stats_c1 / stats_c2
     crawl:  ticker_i3 (item 3)                                                      Row, item and point numbers start at 1. */
  function cellMap(data, key) {
    var out = null, pre = key + '_', k, v;
    for (k in data) {
      if (k.length <= pre.length || k.indexOf(pre) !== 0) continue;
      v = data[k];
      if (v == null || v === '') continue;
      if (!/^(h\d+|r\d+(c\d+)?|n\d+|v\d+(p\d+)?|c\d+|s\d+|a\d+|b\d+|i\d+)$/.test(k.slice(pre.length))) continue;
      (out || (out = {}))[k.slice(pre.length)] = String(v);
    }
    return out;
  }
  function cellNums(cm, re) {
    var out = [], k, m;
    for (k in cm) { m = re.exec(k); if (m) out.push({ k: k, a: +m[1], b: m[2] ? +m[2] : null, v: cm[k] }); }
    return out.filter(function (o) { return o.a >= 1 && (o.b == null || o.b >= 1) && o.a <= 500 && (o.b == null || o.b <= 500); });
  }
  function tableCells(rows, L, cm) {
    if (!cm) return rows;
    var hd = L.header ? 1 : 0, out = rows.map(function (r) { return r.slice(); });
    function cell(r, c, v) { while (out.length <= r) out.push([]); while (out[r].length <= c) out[r].push(''); out[r][c] = v; }
    if (hd) cellNums(cm, /^h(\d+)()$/).forEach(function (o) { cell(0, o.a - 1, o.v); });
    cellNums(cm, /^r(\d+)()$/).forEach(function (o) { var r = parseTable(o.v.replace(/\n/g, ' '), L)[0] || []; while (out.length <= hd + o.a - 1) out.push([]); out[hd + o.a - 1] = r.slice(); });
    cellNums(cm, /^r(\d+)c(\d+)$/).forEach(function (o) { cell(hd + o.a - 1, o.b - 1, o.v); });
    return out;
  }
  function crawlCells(items, cm) {
    if (!cm) return items;
    var out = items.slice();
    cellNums(cm, /^i(\d+)()$/).forEach(function (o) { while (out.length < o.a) out.push(''); out[o.a - 1] = o.v; });
    return out.filter(function (x) { return x !== ''; });
  }
  function serTok(v, m) { var s = fmtNum(v); for (var i = 0; i < (m || 0); i++) s += 'w'; return s; }
  /* returns { raw, colors } with the cell fields applied; raw stays the same text format the chart reads */
  function chartCells(raw, L, cm) {
    var res = { raw: raw, colors: null };
    if (!cm) return res;
    var cl = cellNums(cm, /^c(\d+)()$/);
    function setColors(base) {
      if (!cl.length) return;
      var a = String(base == null ? '' : base).split(/[,\s]+/).filter(Boolean);
      cl.forEach(function (o) { while (a.length < o.a) a.push(PALETTE[a.length % PALETTE.length]); a[o.a - 1] = o.v; });
      res.colors = a.join(', ');
    }
    var touch = false, k;
    for (k in cm) if (!/^c\d+$/.test(k)) { touch = true; break; }
    if (L.chart === 'dual') {
      setColors(L.colors);
      if (!touch) return res;
      var d = parseDual(raw);
      cellNums(cm, /^n([12])()$/).forEach(function (o) { d.names[o.a - 1] = o.v; });
      var row = function (i) { while (d.rows.length <= i) d.rows.push({ label: '', a: '0', b: '0' }); return d.rows[i]; };
      cellNums(cm, /^s(\d+)()$/).forEach(function (o) { row(o.a - 1).label = o.v; });
      cellNums(cm, /^a(\d+)()$/).forEach(function (o) { row(o.a - 1).a = o.v; });
      cellNums(cm, /^b(\d+)()$/).forEach(function (o) { row(o.a - 1).b = o.v; });
      res.raw = [d.names[0] + ' | ' + d.names[1]].concat(d.rows.map(function (r) { return String(r.label).replace(/[:|\n;]/g, ' ') + ': ' + String(r.a).replace(/[|\n;]/g, ' ') + ' | ' + String(r.b).replace(/[|\n;]/g, ' '); })).join('\n');
      return res;
    }
    var ser = parseSeries(raw), base = String(L.colors || '').split(/[,\s]+/).filter(Boolean);
    ser.forEach(function (s, i) { if (s.color) { while (base.length <= i) base.push(PALETTE[base.length % PALETTE.length]); base[i] = s.color; } });
    if (touch) {
      var get = function (i) { while (ser.length <= i) ser.push({ name: 'Series ' + (ser.length + 1), vals: [], marks: [] }); return ser[i]; };
      cellNums(cm, /^n(\d+)()$/).forEach(function (o) { get(o.a - 1).name = o.v; });
      cellNums(cm, /^v(\d+)()$/).forEach(function (o) { var q = parseSeries('x: ' + o.v.replace(/[\n;]/g, ' '))[0] || { vals: [], marks: [] }, s = get(o.a - 1); s.vals = q.vals; s.marks = q.marks; });
      cellNums(cm, /^v(\d+)p(\d+)$/).forEach(function (o) {
        var q = parseSeries('x: ' + o.v.replace(/[\n;,]/g, ' '))[0], s = get(o.a - 1);
        if (!q || !q.vals.length) return;
        while (s.vals.length < o.b) { s.vals.push(0); s.marks.push(0); }
        s.vals[o.b - 1] = q.vals[0]; s.marks[o.b - 1] = q.marks[0];
      });
      res.raw = ser.map(function (s) { return String(s.name).replace(/[:\n;]/g, ' ') + ': ' + s.vals.map(function (v, j) { return serTok(v, s.marks[j]); }).join(', '); }).join('\n');
    }
    if (cl.length || (touch && base.join(', ') !== String(L.colors || ''))) setColors(base.join(', '));
    return res;
  }
  /* the cell fields a layer offers, for the editor's field list: [{ s: 'r2c3', hint: 'row 2, cell 3', def: '...' }] */
  function cellFields(L) {
    var out = [], i, j;
    if (L.type === 'table') {
      var rows = parseTable(L.rows || '', L), hd = L.header ? 1 : 0;
      for (i = 0; i < rows.length; i++) for (j = 0; j < rows[i].length; j++)
        out.push(i < hd ? { s: 'h' + (j + 1), hint: 'header cell ' + (j + 1), def: rows[i][j] } : { s: 'r' + (i - hd + 1) + 'c' + (j + 1), hint: 'row ' + (i - hd + 1) + ', cell ' + (j + 1), def: rows[i][j] });
    } else if (L.type === 'chart') {
      var cols = String(L.colors || '').split(/[,\s]+/).filter(Boolean);
      if (L.chart === 'dual') {
        var d = parseDual(L.data || '');
        for (i = 0; i < 2; i++) { out.push({ s: 'n' + (i + 1), hint: (i ? 'right' : 'left') + ' name', def: d.names[i] }); out.push({ s: 'c' + (i + 1), hint: (i ? 'right' : 'left') + ' colour', def: cols[i] || PALETTE[i], colour: true }); }
        d.rows.forEach(function (r, k) { out.push({ s: 's' + (k + 1), hint: 'stat ' + (k + 1) + ' label', def: r.label }, { s: 'a' + (k + 1), hint: 'stat ' + (k + 1) + ' left value', def: r.a }, { s: 'b' + (k + 1), hint: 'stat ' + (k + 1) + ' right value', def: r.b }); });
      } else {
        var many = L.chart === 'line' || L.chart === 'bar' || !L.chart, w = many ? 'series' : 'item';
        parseSeries(L.data || '').forEach(function (s, k) {
          out.push({ s: 'n' + (k + 1), hint: w + ' ' + (k + 1) + ' name', def: s.name },
            { s: 'v' + (k + 1), hint: w + ' ' + (k + 1) + (many ? ' values (v' + (k + 1) + 'p3 = point 3 only)' : ' value'), def: many ? s.vals.map(function (v, j) { return serTok(v, s.marks[j]); }).join(', ') : (s.vals.length ? fmtNum(s.vals[0]) : '') },
            { s: 'c' + (k + 1), hint: w + ' ' + (k + 1) + ' colour', def: s.color || cols[k] || PALETTE[k % PALETTE.length], colour: true });
        });
      }
    } else if (L.type === 'crawl') {
      var isep = L.itemSep == null || L.itemSep === '' ? '|' : L.itemSep;
      String(L.text || '').split(isep).map(function (x) { return x.replace(/^\s+|\s+$/g, ''); }).filter(function (x) { return x !== ''; })
        .forEach(function (x, k) { out.push({ s: 'i' + (k + 1), hint: 'item ' + (k + 1), def: x }); });
    }
    return out;
  }
  /* a value counting up with the animation, keeping its unit ("52%" counts 0% ... 52%) */
  function countText(txt, u) {
    if (u >= 1) return txt;
    var m = /^(-?)([\d]+(?:[.,]\d+)?)(.*)$/.exec(txt);
    if (!m) return txt;
    var dec = (m[2].split(/[.,]/)[1] || '').length, v = parseFloat(m[2].replace(',', '.')) * u;
    return m[1] + v.toFixed(dec) + m[3];
  }
  function niceMax(v) {
    if (!(v > 0)) return 1;
    var p = Math.pow(10, Math.floor(Math.log(v) / Math.LN10)), f = v / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  }
  function fmtNum(v) { return Math.abs(v - Math.round(v)) < 1e-9 ? String(Math.round(v)) : String(Math.round(v * 10) / 10); }
  function chartSVG(L, w, h, series, o) {
    var kind = L.chart || 'line', fs = o.fs, font = esc(o.font), txt = o.color, prog = Math.max(0, Math.min(1, o.prog));
    var cols = String(L.colors || '').split(/[,\s]+/).filter(Boolean).map(function (c) { return css(normColor(c) || c); });
    function colr(i, s) { return s && s.color ? css(normColor(s.color) || s.color) : (cols[i] || PALETTE[i % PALETTE.length]); }
    var grid = css(normColor(L.gridColor || '#ffffff33') || '#ffffff33');
    var out = '<svg xmlns="http://www.w3.org/2000/svg" width="' + r4(w) + '" height="' + r4(h) + '" viewBox="0 0 ' + r4(w) + ' ' + r4(h) + '" style="display:block;overflow:visible;font-family:&quot;' + font + '&quot;,Arial,sans-serif;font-size:' + r4(fs) + 'px;font-weight:' + (o.weight || 400) + '">';
    var top = 0, i, j, k;
    if (L.legend && kind !== 'pie' && kind !== 'donut' && kind !== 'hbar' && kind !== 'dual') {
      var lx = 0;
      series.forEach(function (s, si) {
        out += '<rect x="' + r4(lx) + '" y="' + r4(fs * 0.15) + '" width="' + r4(fs * 0.8) + '" height="' + r4(fs * 0.8) + '" rx="' + r4(fs * 0.15) + '" fill="' + colr(si, s) + '"/>';
        out += '<text x="' + r4(lx + fs * 1.1) + '" y="' + r4(fs * 0.85) + '" fill="' + txt + '">' + esc(s.name || ('Series ' + (si + 1))) + '</text>';
        lx += fs * 1.6 + (s.name || 'Series 1').length * fs * 0.6;
      });
      top = fs * 1.8;
    }
    if (kind === 'pie' || kind === 'donut') {
      var items = series.map(function (s) { return { name: s.name, v: Math.max(0, s.vals[0] || 0), color: s.color }; }), tot = 0;
      items.forEach(function (it) { tot += it.v; });
      var cx = w / 2, cy = h / 2, R = Math.max(1, Math.min(w, h) / 2 - (L.pieLabels === 'outside' ? fs * 2.2 : 2)), hole = kind === 'donut' ? Math.max(0, Math.min(0.9, (L.hole == null ? 55 : +L.hole) / 100)) : 0;
      var a0 = -Math.PI / 2, sweep = Math.PI * 2 * prog;
      items.forEach(function (it, ii) {
        if (!(tot > 0) || !(it.v > 0)) return;
        var a = it.v / tot * Math.PI * 2, s0 = a0, s1 = Math.min(a0 + a, -Math.PI / 2 + sweep);
        a0 += a;
        if (s1 <= s0) return;
        var large = s1 - s0 > Math.PI ? 1 : 0, ri = R * hole;
        var p = function (ang, rr) { return r4(cx + Math.cos(ang) * rr) + ' ' + r4(cy + Math.sin(ang) * rr); };
        var d = s1 - s0 >= Math.PI * 2 - 1e-6
          ? 'M' + p(s0, R) + 'A' + r4(R) + ' ' + r4(R) + ' 0 1 1 ' + p(s0 + Math.PI, R) + 'A' + r4(R) + ' ' + r4(R) + ' 0 1 1 ' + p(s0, R) + (ri ? 'M' + p(s0, ri) + 'A' + r4(ri) + ' ' + r4(ri) + ' 0 1 0 ' + p(s0 + Math.PI, ri) + 'A' + r4(ri) + ' ' + r4(ri) + ' 0 1 0 ' + p(s0, ri) : '') + 'Z'
          : 'M' + p(s0, R) + 'A' + r4(R) + ' ' + r4(R) + ' 0 ' + large + ' 1 ' + p(s1, R) + (ri ? 'L' + p(s1, ri) + 'A' + r4(ri) + ' ' + r4(ri) + ' 0 ' + large + ' 0 ' + p(s0, ri) : 'L' + r4(cx) + ' ' + r4(cy)) + 'Z';
        out += '<path d="' + d + '" fill="' + colr(ii, it) + '" fill-rule="evenodd"' + (+L.gap ? ' stroke="' + css(o.bg) + '" stroke-width="' + r4(+L.gap) + '"' : '') + '/>';
        var lab = L.pieLabels || 'percent';
        if (lab !== 'none' && s1 - s0 > 0.18 && prog > 0.98) {
          var mid = (s0 + s1) / 2, rr = L.pieLabels === 'outside' ? R + fs * 1.1 : (hole ? R * (1 + hole) / 2 : R * 0.62), val = Math.round(it.v / tot * 100) + '%';
          var label = lab === 'value' ? fmtNum(it.v) : (lab === 'label' || lab === 'outside' ? (it.name ? it.name + ' ' : '') + val : val);
          out += '<text x="' + p(mid, rr).split(' ')[0] + '" y="' + r4(cy + Math.sin(mid) * rr + fs * 0.35) + '" text-anchor="middle" fill="' + (lab === 'outside' ? txt : (L.labelColor ? css(normColor(L.labelColor)) : '#111')) + '" font-weight="700">' + esc(label) + '</text>';
        }
      });
      if (L.legend) {
        var ly = h - items.length * fs * 1.3;
        items.forEach(function (it, ii) {
          out += '<rect x="0" y="' + r4(ly + ii * fs * 1.3) + '" width="' + r4(fs * 0.8) + '" height="' + r4(fs * 0.8) + '" fill="' + colr(ii, it) + '"/><text x="' + r4(fs * 1.1) + '" y="' + r4(ly + ii * fs * 1.3 + fs * 0.75) + '" fill="' + txt + '">' + esc(it.name) + '</text>';
        });
      }
      return out + '</svg>';
    }
    if (kind === 'dual') {
      var dd = parseDual(o.raw), ca = colr(0, null), cb = colr(1, null), nr = dd.rows.length, split = !!L.split2;
      var headH = (dd.names[0] || dd.names[1]) ? fs * 1.9 : 0, rowH = (h - headH) / Math.max(1, nr), barH = Math.max(2, Math.min(rowH * 0.32, fs * 0.75));
      var valW = fs * 3.2, cx2 = w / 2, bw2 = Math.max(1, cx2 - valW - fs * 0.4), lead = L.leadBold !== false;
      if (headH) {
        out += '<text x="0" y="' + r4(fs * 1.1) + '" fill="' + ca + '" font-weight="700" font-size="' + r4(fs * 1.15) + '">' + esc(dd.names[0]) + '</text>';
        out += '<text x="' + r4(w) + '" y="' + r4(fs * 1.1) + '" text-anchor="end" fill="' + cb + '" font-weight="700" font-size="' + r4(fs * 1.15) + '">' + esc(dd.names[1]) + '</text>';
      }
      var track = css(normColor(L.gridColor || '#ffffff22') || '#ffffff22'), rad = +L.barRadius || 0;
      dd.rows.forEach(function (rw, ri) {
        var y0 = headH + ri * rowH, ly = y0 + rowH * 0.38, by = y0 + rowH * 0.5 + (rowH * 0.5 - barH) / 2;
        var wa = rw.va > rw.vb, wb = rw.vb > rw.va;
        out += '<text x="' + r4(cx2) + '" y="' + r4(ly) + '" text-anchor="middle" fill="' + txt + '" fill-opacity="0.85">' + esc(rw.label) + '</text>';
        out += '<text x="0" y="' + r4(by + barH / 2 + fs * 0.36) + '" fill="' + txt + '" font-weight="' + (lead && wa ? 700 : 400) + '">' + esc(countText(rw.a, prog)) + '</text>';
        out += '<text x="' + r4(w) + '" y="' + r4(by + barH / 2 + fs * 0.36) + '" text-anchor="end" fill="' + txt + '" font-weight="' + (lead && wb ? 700 : 400) + '">' + esc(countText(rw.b, prog)) + '</text>';
        if (split) {
          /* one bar shared by the two: each side's share of the total (possession, territory) */
          var tot = Math.max(1e-9, Math.max(0, rw.va) + Math.max(0, rw.vb)), x0 = valW, full = w - valW * 2, fa = Math.max(0, rw.va) / tot;
          out += '<rect x="' + r4(x0) + '" y="' + r4(by) + '" width="' + r4(full) + '" height="' + r4(barH) + '" rx="' + r4(rad) + '" fill="' + track + '"/>';
          var mid = x0 + full * (0.5 + (fa - 0.5) * prog);
          out += '<rect x="' + r4(x0) + '" y="' + r4(by) + '" width="' + r4(Math.max(0, mid - x0 - 1)) + '" height="' + r4(barH) + '" rx="' + r4(rad) + '" fill="' + ca + '"/>';
          out += '<rect x="' + r4(mid + 1) + '" y="' + r4(by) + '" width="' + r4(Math.max(0, x0 + full - mid - 1)) + '" height="' + r4(barH) + '" rx="' + r4(rad) + '" fill="' + cb + '"/>';
        } else {
          /* two bars growing out from the middle, each scaled to the bigger of the two */
          var mx2 = Math.max(Math.abs(rw.va), Math.abs(rw.vb), 1e-9), la = bw2 * Math.max(0, rw.va) / mx2 * prog, lb = bw2 * Math.max(0, rw.vb) / mx2 * prog, g2 = fs * 0.2;
          out += '<rect x="' + r4(cx2 - g2 - bw2) + '" y="' + r4(by) + '" width="' + r4(bw2) + '" height="' + r4(barH) + '" rx="' + r4(rad) + '" fill="' + track + '"/>';
          out += '<rect x="' + r4(cx2 + g2) + '" y="' + r4(by) + '" width="' + r4(bw2) + '" height="' + r4(barH) + '" rx="' + r4(rad) + '" fill="' + track + '"/>';
          out += '<rect x="' + r4(cx2 - g2 - la) + '" y="' + r4(by) + '" width="' + r4(la) + '" height="' + r4(barH) + '" rx="' + r4(rad) + '" fill="' + ca + '"' + (lead && wb ? ' fill-opacity="0.75"' : '') + '/>';
          out += '<rect x="' + r4(cx2 + g2) + '" y="' + r4(by) + '" width="' + r4(lb) + '" height="' + r4(barH) + '" rx="' + r4(rad) + '" fill="' + cb + '"' + (lead && wa ? ' fill-opacity="0.75"' : '') + '/>';
        }
      });
      return out + '</svg>';
    }
    if (kind === 'hbar') {
      var rows = series.map(function (s) { return { name: s.name, v: s.vals[0] || 0, color: s.color }; }), mx = 0;
      rows.forEach(function (rw) { mx = Math.max(mx, rw.v); });
      mx = L.ymax > 0 ? +L.ymax : (mx || 1);
      var lw = 0; rows.forEach(function (rw) { lw = Math.max(lw, String(rw.name).length); });
      lw = Math.min(w * 0.4, lw * fs * 0.6 + fs * 0.6);
      var vw = fs * 3, rh = (h - top) / Math.max(1, rows.length), bh = rh * (1 - (L.barGap == null ? 30 : +L.barGap) / 100);
      rows.forEach(function (rw, ri) {
        var y = top + ri * rh + (rh - bh) / 2, bw = Math.max(0, (w - lw - vw) * Math.max(0, rw.v) / mx * prog);
        out += '<text x="' + r4(lw - fs * 0.5) + '" y="' + r4(y + bh / 2 + fs * 0.35) + '" text-anchor="end" fill="' + txt + '">' + esc(rw.name) + '</text>';
        out += '<rect x="' + r4(lw) + '" y="' + r4(y) + '" width="' + r4(bw) + '" height="' + r4(bh) + '" rx="' + r4(+L.barRadius || 0) + '" fill="' + colr(ri, rw) + '"/>';
        out += '<text x="' + r4(lw + bw + fs * 0.4) + '" y="' + r4(y + bh / 2 + fs * 0.35) + '" fill="' + txt + '" font-weight="700">' + esc(fmtNum(rw.v * prog)) + (L.suffix ? esc(L.suffix) : '') + '</text>';
      });
      return out + '</svg>';
    }
    /* line (worm) and bar (manhattan) */
    var cum = kind === 'line' && !!L.cumul, data = series.map(function (s) {
      var v = s.vals.slice(), m = (s.marks || []).slice();
      if (cum) { var acc = 0; v = v.map(function (x) { acc += x; return acc; }); v.unshift(0); m.unshift(0); }
      return { name: s.name, v: v, m: m, color: s.color };
    });
    var n = 0, ymax = 0;
    data.forEach(function (s) { n = Math.max(n, s.v.length); s.v.forEach(function (x) { ymax = Math.max(ymax, x); }); });
    if (!n) return out + '</svg>';
    ymax = L.ymax > 0 ? +L.ymax : niceMax(ymax * 1.05);
    var axL = L.axes === false ? 0 : fs * (fmtNum(ymax).length * 0.62 + 0.8), axB = L.axes === false ? 0 : fs * 1.6;
    var X0 = axL, X1 = w, Y0 = top + fs * 0.6, Y1 = h - axB, PW = Math.max(1, X1 - X0), PH = Math.max(1, Y1 - Y0);
    var steps = L.ysteps > 0 ? Math.round(L.ysteps) : 4;
    if (L.axes !== false) {
      for (i = 0; i <= steps; i++) {
        var gy = Y1 - PH * i / steps;
        if (L.grid !== false) out += '<line x1="' + r4(X0) + '" x2="' + r4(X1) + '" y1="' + r4(gy) + '" y2="' + r4(gy) + '" stroke="' + grid + '" stroke-width="1"/>';
        out += '<text x="' + r4(X0 - fs * 0.4) + '" y="' + r4(gy + fs * 0.35) + '" text-anchor="end" fill="' + txt + '">' + fmtNum(ymax * i / steps) + '</text>';
      }
    }
    var slots = kind === 'bar' ? n : Math.max(1, n - 1), first = L.xStart == null ? (cum ? 0 : 1) : +L.xStart;
    function xAt(k) { return kind === 'bar' ? X0 + PW * (k + 0.5) / n : X0 + PW * k / slots; }
    function yAt(v) { return Y1 - PH * Math.max(0, v) / ymax; }
    if (L.axes !== false) {
      var every = Math.max(1, Math.ceil(fs * 2.4 / (PW / Math.max(1, slots))));
      if (L.xEvery > 0) every = Math.round(L.xEvery);
      for (k = 0; k < n; k++) {
        if ((k + first) % every !== 0 && k !== 0) continue;
        out += '<text x="' + r4(xAt(k)) + '" y="' + r4(Y1 + fs * 1.25) + '" text-anchor="middle" fill="' + txt + '">' + (k + first) + '</text>';
      }
    }
    var dot = Math.max(3, fs * 0.32);
    if (kind === 'bar') {
      var gw = PW / n, ns = data.length, bwid = gw * (1 - (L.barGap == null ? 25 : +L.barGap) / 100) / ns;
      data.forEach(function (s, si) {
        for (k = 0; k < s.v.length; k++) {
          var bx = X0 + gw * k + (gw - bwid * ns) / 2 + bwid * si, bh2 = PH * Math.max(0, s.v[k]) / ymax * prog;
          out += '<rect x="' + r4(bx) + '" y="' + r4(Y1 - bh2) + '" width="' + r4(Math.max(0.5, bwid - 1)) + '" height="' + r4(bh2) + '" rx="' + r4(+L.barRadius || 0) + '" fill="' + colr(si, s) + '"/>';
          for (j = 0; j < (s.m[k] || 0) && prog > 0.98; j++) out += '<circle cx="' + r4(bx + bwid / 2) + '" cy="' + r4(Y1 - bh2 - dot * 1.4 - j * dot * 2.4) + '" r="' + r4(dot) + '" fill="' + (L.markColor ? css(normColor(L.markColor)) : '#ff4d4d') + '" stroke="#fff" stroke-width="1.5"/>';
        }
      });
    } else {
      var lwid = Math.max(1, o.lineW || 4);
      data.forEach(function (s, si) {
        var last = (s.v.length - 1) * prog, pts = [], k2;
        for (k2 = 0; k2 <= Math.floor(last) && k2 < s.v.length; k2++) pts.push([xAt(k2), yAt(s.v[k2])]);
        var fl = Math.floor(last);
        if (last > fl && fl + 1 < s.v.length) { var u = last - fl; pts.push([xAt(fl) + (xAt(fl + 1) - xAt(fl)) * u, yAt(s.v[fl] + (s.v[fl + 1] - s.v[fl]) * u)]); }
        if (pts.length < 2) return;
        var c = colr(si, s), d = pts.map(function (q, qi) { return (qi ? 'L' : 'M') + r4(q[0]) + ' ' + r4(q[1]); }).join('');
        if (L.area) out += '<path d="' + d + 'L' + r4(pts[pts.length - 1][0]) + ' ' + r4(Y1) + 'L' + r4(pts[0][0]) + ' ' + r4(Y1) + 'Z" fill="' + c + '" fill-opacity="0.18"/>';
        out += '<path d="' + d + '" fill="none" stroke="' + c + '" stroke-width="' + r4(lwid) + '" stroke-linejoin="round" stroke-linecap="round"/>';
        for (k2 = 0; k2 < s.v.length && k2 <= last + 1e-6; k2++) {
          if (s.m[k2]) out += '<circle cx="' + r4(xAt(k2)) + '" cy="' + r4(yAt(s.v[k2])) + '" r="' + r4(dot * (s.m[k2] > 1 ? 1.35 : 1)) + '" fill="' + (L.markColor ? css(normColor(L.markColor)) : '#ff4d4d') + '" stroke="#fff" stroke-width="1.5"/>';
          else if (L.points) out += '<circle cx="' + r4(xAt(k2)) + '" cy="' + r4(yAt(s.v[k2])) + '" r="' + r4(lwid * 0.9) + '" fill="' + c + '"/>';
        }
      });
    }
    return out + '</svg>';
  }
  function SP(el, cache, k, v) {
    if (cache[k] === v) return;
    cache[k] = v;
    el.style.setProperty(k, v);
  }

  P.frames = function (asset) {
    var self = this, arr = imgCache && imgCache.get(asset);
    if (arr && arr.length === asset.frames.length && arr.f0 === asset.frames[0]) return arr;
    arr = [];
    for (var i = 0; i < asset.frames.length; i++) {
      var im = new Image();
      im.onload = function () { self.async(); };
      im.src = asset.frames[i];
      arr.push(im);
    }
    arr.f0 = asset.frames[0];
    if (imgCache) imgCache.set(asset, arr);
    /* on air, decode the frames in the background so playback never waits for a picture to unpack */
    var px = (asset.crop ? asset.crop[2] * asset.crop[3] : (asset.w || 1920) * (asset.h || 1080)) * 4 * arr.length;
    if (this.live && arr.length && arr[0].decode && (this.warmed || 0) + px < 700e6) {
      this.warmed = (this.warmed || 0) + px;
      (function next(i) { if (i < arr.length) arr[i].decode().then(function () { next(i + 1); }, function () { next(i + 1); }); })(0);
    }
    return arr;
  };

  function loopIndex(i, n, mode) {
    if (n <= 0) return 0;
    if (mode === 'loop') { i = i % n; if (i < 0) i += n; return i; }
    if (mode === 'pingpong') { var m = n > 1 ? (n - 1) * 2 : 1; i = i % m; if (i < 0) i += m; return i < n ? i : m - i; }
    return i < 0 ? 0 : (i > n - 1 ? n - 1 : i);
  }

  P.matrix = function (node, it, t) {
    if (it.mfid === this.fid) return;
    it.mfid = this.fid;
    var L = this.viewOf(it), pr = this.project;
    var x = evalProp(L, 'x', t, pr), y = evalProp(L, 'y', t, pr);
    var sx = evalProp(L, 'sx', t, pr) / 100, sy = evalProp(L, 'sy', t, pr) / 100;
    /* on a text box, scale makes the box bigger or smaller and the text keeps its size */
    it.kx = 1; it.ky = 1;
    if (L.type === 'text' && L.box && L.boxScale !== false) { it.kx = Math.abs(sx); it.ky = Math.abs(sy); sx = 1; sy = 1; }
    var r = evalProp(L, 'rot', t, pr) * Math.PI / 180, cos = Math.cos(r), sin = Math.sin(r);
    var kx = evalProp(L, 'skx', t, pr), ky = evalProp(L, 'sky', t, pr), m;
    if (kx || ky) {
      /* rotate x skew x scale */
      var tx = Math.tan(Math.max(-89, Math.min(89, kx)) * Math.PI / 180), ty = Math.tan(Math.max(-89, Math.min(89, ky)) * Math.PI / 180);
      var a0 = sx, b0 = ty * sx, c0 = tx * sy, d0 = sy;
      m = [cos * a0 - sin * b0, sin * a0 + cos * b0, cos * c0 - sin * d0, sin * c0 + cos * d0, x, y];
    } else m = [cos * sx, sin * sx, -sin * sy, cos * sy, x, y];
    /* children follow position, rotation and scale but not skew: they get the matrix without it */
    var mc = (kx || ky) ? [cos * sx, sin * sx, -sin * sy, cos * sy, x, y] : m;
    var par = L.parent && node.byId[L.parent];
    it.edge = null;
    if (par && par !== it) {
      var pe = L.pEdge;
      if (pe) {
        /* edge parenting: follow one edge (or the centre) of the parent's box, without taking its rotation or scale */
        this.renderItem(node, par, t, this.curWall || 0);
        var P = apply(par.wm || IDENT, (pe.h === 'r' ? 1 : (pe.h === 'c' ? 0.5 : 0)) * par.w, (pe.v === 'b' ? 1 : (pe.v === 'm' ? 0.5 : 0)) * par.h);
        it.edge = [pe.h ? P[0] : 0, pe.v ? P[1] : 0];
        m = [m[0], m[1], m[2], m[3], m[4] + it.edge[0], m[5] + it.edge[1]];
        mc = [mc[0], mc[1], mc[2], mc[3], mc[4] + it.edge[0], mc[5] + it.edge[1]];
      } else { this.matrix(node, par, t); m = mul(par.cpm || par.pm || IDENT, m); mc = mul(par.cpm || par.pm || IDENT, mc); }
    }
    it.base = m;
    it.ax = evalProp(L, 'ax', t, pr) * it.kx; it.ay = evalProp(L, 'ay', t, pr) * it.ky;
    it.pm = translate(m, -it.ax, -it.ay);
    it.cpm = translate(mc, -it.ax, -it.ay);
  };

  /* width and height of a sized layer; can be told to match its parent's box (a plate that hugs a text) */
  P.size = function (node, it, L, t, wall, ev) {
    var w = Math.max(0, ev('w')) * (it.kx == null ? 1 : it.kx), h = Math.max(0, ev('h')) * (it.ky == null ? 1 : it.ky);
    if (L.pFitW || L.pFitH) {
      var par = L.parent && node.byId[L.parent];
      if (par && par !== it) {
        this.renderItem(node, par, t, wall);
        var m = par.wm || IDENT, edge = !!L.pEdge;
        var kx = edge ? Math.sqrt(m[0] * m[0] + m[1] * m[1]) : (par.fit || 1), ky = edge ? Math.sqrt(m[2] * m[2] + m[3] * m[3]) : 1;
        if (L.pFitW) w = Math.max(0, par.w * kx + (+L.pDW || 0));
        if (L.pFitH) h = Math.max(0, par.h * ky + (+L.pDH || 0));
      }
    }
    it.w = w; it.h = h;
  };
  P.renderComp = function (node, t, wall) {
    this.curWall = wall;
    var items = node.items, i;
    for (i = 0; i < items.length; i++) this.renderItem(node, items[i], t, wall);
  };

  /* Mapped properties: any property of a layer can take its value from a CasparCG data field.
     Returns the layer itself, or a thin view of it with the mapped values applied. */
  var BOOLS = { visible: 1, italic: 1, upper: 1, gradient: 1, freeRun: 1, shadow: 1, header: 1, legend: 1, cumul: 1, startFull: 1, fitBox: 1, firstBold: 1, 'tex.on': 1, 'tex.invert': 1, 'tex.gray': 1, 'tex.maskInv': 1 };
  var NUMS = { maxW: 1, wrapW: 1, fps: 1, speed: 1, gap: 1, ymax: 1, anim: 1, stagger: 1, start: 1, end: 1, padL: 1, padR: 1, padT: 1, padB: 1, xStart: 1, ysteps: 1, 'tex.htFrom': 1, 'tex.htTo': 1, 'tex.gFrom': 1, 'tex.gTo': 1, 'tex.count': 1, 'tex.duty': 1, 'tex.reach': 1, 'tex.scale': 1, 'tex.aspect': 1, 'tex.angle': 1, 'tex.speed': 1, 'tex.dir': 1, 'tex.dist': 1, 'tex.period': 1, 'tex.rate': 1, 'tex.amount': 1, 'tex.spin': 1, 'tex.pulse': 1, 'tex.pulseT': 1, 'tex.fadeLen': 1, 'tex.feather': 1 };
  function copyObj(o) { var r = {}, k; for (k in (o || {})) r[k] = o[k]; return r; }
  P.viewOf = function (it) {
    var L = it.layer, b = L.bind;
    if (!b) return L;
    if (it.vfid === this.fid) return it.view;
    it.vfid = this.fid;
    var v = null, data = this.data, now = Date.now(), k;
    for (k in b) {
      var bd = b[k];
      if (!bd || !bd.key) continue;
      var raw = this.dv(bd.key), val;
      if (raw == null || raw === '') continue;
      if (DEF.hasOwnProperty(k)) {
        if (COLOR_PROPS[k]) { val = normColor(raw); if (!val) continue; }
        else { val = parseFloat(raw); if (isNaN(val)) continue; }
        val = this.glide(it, k, bd, val, now);
        if (!v) v = Object.create(L);
        if (!v.__o) v.__o = {};
        v.__o[k] = { v: val, m: bd.mode || 'set' };
      } else {
        if (k.indexOf('tex.') === 0) {
          var sub = k.slice(4);
          if (BOOLS[k]) val = /^(1|true|yes|on|show)$/i.test(String(raw).replace(/\s/g, ''));
          else if (NUMS[k]) { val = parseFloat(raw); if (isNaN(val)) continue; }
          else val = String(raw);
          if (sub === 'src' && val) { if (!v) v = Object.create(L); if (!v.__tx) { v.__tx = 1; v.tex = copyObj(L.tex); } v.tex.kind = 'image'; }
          if (!v) v = Object.create(L);
          if (!v.__tx) { v.__tx = 1; v.tex = copyObj(L.tex); }
          v.tex[sub] = val;
          continue;
        }
        if (BOOLS[k]) val = /^(1|true|yes|on|show)$/i.test(String(raw).replace(/\s/g, ''));
        else if (NUMS[k]) { val = parseFloat(raw); if (isNaN(val)) continue; }
        else val = String(raw);
        if (!v) v = Object.create(L);
        v[k] = val;
      }
    }
    it.view = v || L;
    return it.view;
  };
  /* on air, a mapped value can ease to its new value over a number of frames instead of jumping */
  P.glide = function (it, k, bd, val, now) {
    var n = +bd.glide || 0;
    if (!this.live || n <= 0) return val;
    var st = it.gl || (it.gl = {}), g = st[k];
    if (!g) { st[k] = { from: val, to: val, t0: now, cur: val }; return val; }
    if (g.to !== val) { g.from = g.cur; g.to = val; g.t0 = now; }
    var u = Math.min(1, (now - g.t0) / (n / this.rootComp.fps * 1000));
    if (u >= 1) { g.cur = val; return val; }
    this.gliding = true;
    u = u * u * (3 - 2 * u);
    if (COLOR_PROPS[k]) {
      var c0 = parseColor(g.from), c1 = parseColor(g.to);
      g.cur = toHex([c0[0] + (c1[0] - c0[0]) * u, c0[1] + (c1[1] - c0[1]) * u, c0[2] + (c1[2] - c0[2]) * u, c0[3] + (c1[3] - c0[3]) * u]);
    } else g.cur = g.from + (g.to - g.from) * u;
    return g.cur;
  };

  /* a data value; inside a repeater the copy's own numbered field wins (name3), else the plain field (name) */
  P.dv = function (key) {
    var d = this.data, s = this.sfx;
    if (s) { var v = d[key + s]; if (v != null) return v; }
    return d[key];
  };
  P.subTime = function (it, t) {
    var L = it.layer;
    if (this.live && L.triggered) {
      var c = this.clocks[L.id];
      return c ? c.time : 0;
    }
    var st = L.freeRun ? this.wall * (it.sub ? it.sub.comp.fps : 25) : t - L.start, d = it.sub ? it.sub.comp.duration : 0;
    if (d > 0 && L.loop === 'loop') { st = st % d; if (st < 0) st += d; }
    else if (d > 1 && L.loop === 'pingpong') { var m2 = (d - 1) * 2; st = st % m2; if (st < 0) st += m2; if (st > d - 1) st = m2 - st; }
    return st;
  };

  P.renderItem = function (node, it, t, wall) {
    if (it.fid === this.fid) return;
    it.fid = this.fid;
    var L = this.viewOf(it), el = it.el, pr = this.project, comp = node.comp, assets = pr.assets || {}, data = this.data;
    var self = this;
    function ev(n) { return evalProp(L, n, t, pr); }
    it.t = t;
    this.matrix(node, it, t);
    var active = L.visible !== false && t >= L.start && t < L.end && L.type !== 'null';
    if (active && it.matteItem) {
      if (it.multi) { for (var mq = 0; mq < it.matteList.length; mq++) this.renderItem(node, it.matteList[mq].it, t, wall); }
      else {
        this.renderItem(node, it.matteItem, t, wall);
        if (!it.matteItem.active) active = false;
      }
    }
    it.active = active;
    var outer = it.wrap || el;
    if (L.type === 'null') { it.w = 100; it.h = 100; }

    if (active) {
      if (it.wrap) { if (it.wc.display !== 'block') { it.wc.display = 'block'; it.wrap.style.display = 'block'; } }
      else S(it, 'display', it.tx ? 'flex' : 'block');
      S(it, 'visibility', ((it.isMatte || it.isTexMask) && !L.matteShow) ? 'hidden' : 'visible');

      if (L.type === 'text') {
        var dtx = L.key ? this.dv(L.key) : null, txt = dtx != null ? String(dtx) : (L.text || '');
        if (this.repN != null && txt.indexOf('{#}') >= 0) txt = txt.split('{#}').join(String(this.repN));
        txt = lineBreaks(txt, L);
        var fs = ev('fontSize'), tr = ev('tracking'), lh = ev('lineHeight');
        S(it, 'fontFamily', '"' + (L.font || 'Arial') + '", Arial, sans-serif');
        var fitOn = L.fitBox && L.box && L.boxWrap !== false;
        S(it, 'fontSize', r4(fitOn && it.fitFs ? it.fitFs : fs) + 'px');
        S(it, 'letterSpacing', r4(tr) + 'px');
        S(it, 'lineHeight', String(r4(lh)));
        S(it, 'color', css(ev('color')));
        S(it, 'fontWeight', String(L.weight || 400));
        S(it, 'fontStyle', L.italic ? 'italic' : 'normal');
        S(it, 'textTransform', L.upper ? 'uppercase' : (L.tcase === 'lower' ? 'lowercase' : (L.tcase === 'title' ? 'capitalize' : 'none')));
        S(it, 'textAlign', L.align || 'left');
        S(it, 'background', css(ev('bg')));
        S(it, 'borderRadius', r4(Math.max(0, ev('radius'))) + 'px');
        /* outline drawn outside the text frame, so it never eats into the text or changes the box size */
        var tsw = ev('strokeW');
        S(it, 'boxShadow', tsw > 0 ? '0 0 0 ' + r4(tsw) + 'px ' + css(ev('stroke')) : 'none');
        var pad = (+L.padT || 0) + 'px ' + (+L.padR || 0) + 'px ' + (+L.padB || 0) + 'px ' + (+L.padL || 0) + 'px';
        S(it, 'padding', pad);
        S(it, 'boxSizing', 'border-box');
        if (it.tx) {
          this.size(node, it, L, t, wall, ev);
          var wrapOn = L.boxWrap !== false;
          S(it, 'width', r4(it.w) + 'px'); S(it, 'height', r4(it.h) + 'px');
          S(it, 'flexDirection', 'column');
          S(it, 'justifyContent', L.valign === 'middle' ? 'center' : (L.valign === 'bottom' ? 'flex-end' : 'flex-start'));
          S(it, 'overflow', L.clip ? 'hidden' : 'visible');
          S(it, 'whiteSpace', wrapOn ? 'pre-wrap' : 'pre');
          S(it, 'overflowWrap', wrapOn ? 'break-word' : 'normal');
          setText(it, it.tx, txt, L);
          /* one-line boxes can squeeze long text so it never leaves the frame */
          var sq = 1;
          if (!wrapOn && L.squeeze) {
            var qkey = [it.c.txt, L.font, fs, tr, L.weight, L.italic, L.upper, L.tcase, pad, r4(it.w), this.fontVer].join('|');
            if (it.qkey !== qkey) {
              it.qkey = qkey;
              it.tx.style.transform = 'none';
              var inner = it.tx.clientWidth, need = it.tx.scrollWidth;
              it.sq = (need > inner && need > 0) ? inner / need : 1;
            }
            sq = it.sq || 1;
          }
          /* multiline boxes can shrink the type until every line fits inside the box */
          if (fitOn) {
            var fkey = [it.c.txt, L.font, fs, tr, lh, L.weight, L.italic, L.upper, L.tcase, pad, r4(it.w), r4(it.h), this.fontVer].join('|');
            if (it.fkey !== fkey) {
              it.fkey = fkey;
              var avH = it.h - (+L.padT || 0) - (+L.padB || 0) + 0.5, avW = it.w - (+L.padL || 0) - (+L.padR || 0) + 0.5, txe = it.tx;
              var fitsAt = function (f) { el.style.fontSize = r4(f) + 'px'; return txe.scrollHeight <= avH && txe.scrollWidth <= avW; };
              var best = fs;
              if (!fitsAt(fs)) { var lo = fs * 0.15, hi = fs; for (var fi = 0; fi < 10; fi++) { var md = (lo + hi) / 2; if (fitsAt(md)) lo = md; else hi = md; } best = lo; }
              it.fitFs = best;
              el.style.fontSize = r4(best) + 'px'; it.c.fontSize = r4(best) + 'px';
              bump(it, 'fit');
            }
          } else it.fitFs = 0;
          var stf = sq < 1 ? 'scaleX(' + r4(sq) + ')' : 'none';
          if (it.c.stf !== stf) { it.c.stf = stf; it.tx.style.transform = stf; bump(it, 'stf'); }
          it.fit = 1; it.alignOff = 0;
        } else {
        if (L.wrapW > 0) { S(it, 'width', L.wrapW + 'px'); S(it, 'whiteSpace', 'pre-wrap'); }
        else { S(it, 'width', 'auto'); S(it, 'whiteSpace', 'pre'); }
        setText(it, el, txt, L);
        var mkey = [it.c.txt, L.font, fs, tr, lh, L.weight, L.italic, L.upper, L.tcase, L.wrapW, pad, this.fontVer].join('|');
        if (it.mkey !== mkey) { it.mkey = mkey; it.w = el.offsetWidth; it.h = el.offsetHeight; }
        it.fit = (L.maxW > 0 && !(L.wrapW > 0) && it.w > L.maxW) ? L.maxW / it.w : 1;
        it.alignOff = L.align === 'center' ? it.w / 2 : (L.align === 'right' ? it.w : 0);
        }
      } else if (L.type === 'shape') {
        this.size(node, it, L, t, wall, ev);
        S(it, 'width', r4(it.w) + 'px'); S(it, 'height', r4(it.h) + 'px');
        S(it, 'background', L.gradient ? 'linear-gradient(' + r4(ev('gradAngle')) + 'deg,' + css(ev('fill')) + ',' + css(ev('fill2')) + ')' : css(ev('fill')));
        S(it, 'borderRadius', L.shape === 'ellipse' ? '50%' : (L.shape === 'poly' ? '0px' : r4(ev('radius')) + 'px'));
        var sw = ev('strokeW');
        S(it, 'boxShadow', sw > 0 ? 'inset 0 0 0 ' + r4(sw) + 'px ' + css(ev('stroke')) : 'none');
      } else if (L.type === 'image') {
        this.size(node, it, L, t, wall, ev);
        S(it, 'width', r4(it.w) + 'px'); S(it, 'height', r4(it.h) + 'px');
        var dim = L.key ? this.dv(L.key) : null, raw = (dim != null && dim !== '') ? String(dim) : null;
        var src = raw != null ? resolveSrc(raw, L) : (assets[L.asset] ? assets[L.asset].src : '');
        if (it.c.src !== src) {
          it.c.src = src;
          bump(it, 'src');
          var tok = ++it.tok;
          if (!src) { it.img.removeAttribute('src'); it.img.style.visibility = 'hidden'; }
          else if (raw == null) { it.img.src = src; it.img.style.visibility = 'visible'; }
          else {
            /* load first, then swap, so a logo never flashes empty or broken on air */
            (function (item, url, token) {
              var pre = new Image();
              pre.onload = function () { if (item.tok !== token) return; item.img.src = url; item.img.style.visibility = 'visible'; bump(item, 'src'); self.async(); };
              pre.onerror = function () { if (item.tok !== token) return; item.img.removeAttribute('src'); item.img.style.visibility = 'hidden'; bump(item, 'src'); self.async(); };
              pre.src = url;
            })(it, src, tok);
          }
        }
        if (this.opts.editor) {
          var ph = !src;
          if (it.c.ph !== ph) { it.c.ph = ph; el.style.outline = ph ? '4px dashed rgba(255,255,255,.55)' : ''; el.style.outlineOffset = ph ? '-4px' : ''; el.style.background = ph ? 'rgba(255,255,255,.10)' : ''; }
        }
        var of = L.fit || 'fill';
        if (it.c.of !== of) { it.c.of = of; it.img.style.objectFit = of; bump(it, 'of'); }
      } else if (L.type === 'sequence') {
        this.size(node, it, L, t, wall, ev);
        var sa = assets[L.asset];
        /* optimised sequences only keep the part of the frame that has pixels; the canvas covers just that part */
        it.crop = sa && sa.crop && sa.w > 0 && sa.h > 0 ? [sa.crop[0] * it.w / sa.w, sa.crop[1] * it.h / sa.h, sa.crop[2] * it.w / sa.w, sa.crop[3] * it.h / sa.h] : null;
        S(it, 'width', r4(it.crop ? it.crop[2] : it.w) + 'px'); S(it, 'height', r4(it.crop ? it.crop[3] : it.h) + 'px');
        if (sa && sa.frames && sa.frames.length) {
          var fr = this.frames(sa);
          var lt = L.freeRun ? wall * comp.fps : (t - L.start);
          var s0 = Math.max(0, Math.min(fr.length - 1, Math.round(+L.seqStart || 0))), sn = +L.seqLen > 0 ? Math.min(Math.round(+L.seqLen), fr.length - s0) : fr.length - s0;
          var idx = s0 + loopIndex(Math.floor(lt * ((L.fps || sa.fps || comp.fps) / comp.fps) + 1e-6), sn, L.loop);
          if (it.c.idx !== idx || !it.c.drawn) {
            var im = fr[idx];
            if (im.complete && im.naturalWidth) {
              if (el.width !== im.naturalWidth) el.width = im.naturalWidth;
              if (el.height !== im.naturalHeight) el.height = im.naturalHeight;
              it.ctx.clearRect(0, 0, el.width, el.height);
              it.ctx.drawImage(im, 0, 0);
              it.c.idx = idx; it.c.drawn = true; it.frameSrc = sa.frames[idx];
              bump(it, 'frame');
            } else { it.c.drawn = false; }
          }
        }
      } else if (L.type === 'lottie') {
        this.size(node, it, L, t, wall, ev);
        S(it, 'width', r4(it.w) + 'px'); S(it, 'height', r4(it.h) + 'px');
        var an = it.anim;
        if (an && an.totalFrames) {
          var lt2 = L.freeRun ? wall * comp.fps : (t - L.start);
          var lf = lt2 / comp.fps * (an.frameRate || comp.fps) * (L.speed || 1), tot = an.totalFrames;
          if (L.loop === 'loop') { lf = lf % tot; if (lf < 0) lf += tot; }
          else lf = lf < 0 ? 0 : (lf > tot - 1 ? tot - 1 : lf);
          lf = Math.round(lf * 100) / 100;
          var binds = L.bindings || [], force = false;
          for (var bi = 0; bi < binds.length; bi++) {
            var bd = binds[bi];
            if (!bd.key || this.dv(bd.key) == null) continue;
            var val = String(this.dv(bd.key));
            if (it.applied[bd.layer] !== val && lottieSetText(an, bd.layer, val)) { it.applied[bd.layer] = val; force = true; }
          }
          if (force) { try { an.renderer.renderedFrame = -1; } catch (e3) {} }
          if (it.c.lf !== lf || force) { it.c.lf = lf; an.goToAndStop(lf, true); bump(it, 'lf'); }
        }
      } else if (L.type === 'table') {
        this.size(node, it, L, t, wall, ev);
        S(it, 'width', r4(it.w) + 'px'); S(it, 'height', r4(it.h) + 'px');
        var tsrc = L.key ? this.dv(L.key) : null;
        var trows = tableCells(parseTable(tsrc != null && tsrc !== '' ? tsrc : (L.rows || ''), L), L, L.key && L.cells !== false ? cellMap(this.data, L.key) : null), ncol = 0, ri2, ci2;
        for (ri2 = 0; ri2 < trows.length; ri2++) ncol = Math.max(ncol, trows[ri2].length);
        S(it, 'fontFamily', '"' + (L.font || 'Arial') + '", Arial, sans-serif');
        S(it, 'fontSize', r4(ev('fontSize')) + 'px');
        S(it, 'fontWeight', String(L.weight || 400));
        S(it, 'fontStyle', L.italic ? 'italic' : 'normal');
        S(it, 'textTransform', L.upper ? 'uppercase' : 'none');
        S(it, 'color', css(ev('color')));
        SV(it, '--rb', css(ev('fill'))); SV(it, '--rb2', css(ev('fill2'))); SV(it, '--hb', css(ev('bg')));
        SV(it, '--ln', r4(Math.max(0, ev('strokeW'))) + 'px solid ' + css(ev('stroke')));
        var tspec = styleSpec(L), tsig = JSON.stringify([trows, ncol, L.cols, L.aligns, L.header, L.headColor, L.headWeight, L.padX, L.firstBold, specSig(tspec)]);
        if (it.c.tsig !== tsig) {
          it.c.tsig = tsig;
          while (el.firstChild) el.removeChild(el.firstChild);
          var wts = listOf(L.cols, ncol, '1').map(function (x) { return Math.max(0.01, +x || 1); }), als = listOf(L.aligns, ncol, 'l');
          var ALN = { l: 'flex-start', c: 'center', r: 'flex-end' }, TAL = { l: 'left', c: 'center', r: 'right' }, padX = L.padX == null ? 12 : +L.padX;
          it.trows = [];
          for (ri2 = 0; ri2 < trows.length; ri2++) {
            var head = !!L.header && ri2 === 0, row = document.createElement('div');
            row.style.cssText = 'display:flex;box-sizing:border-box;width:100%;border-bottom:var(--ln);background:' + (head ? 'var(--hb)' : ((ri2 - (L.header ? 1 : 0)) % 2 ? 'var(--rb2)' : 'var(--rb)')) + ';' +
              (head ? 'color:' + (L.headColor ? css(normColor(L.headColor) || L.headColor) : 'inherit') + ';font-weight:' + (L.headWeight || 700) + ';' : '');
            for (ci2 = 0; ci2 < ncol; ci2++) {
              var cell = document.createElement('div'), al = als[ci2].charAt(0).toLowerCase();
              cell.style.cssText = 'flex:' + wts[ci2] + ' 1 0;min-width:0;display:flex;align-items:center;justify-content:' + (ALN[al] || 'flex-start') + ';text-align:' + (TAL[al] || 'left') + ';padding:0 ' + padX + 'px;overflow:hidden;white-space:nowrap;' + (L.firstBold && ci2 === 0 && !head ? 'font-weight:700;' : '');
              var inner2 = document.createElement('span');
              inner2.style.cssText = 'overflow:hidden;text-overflow:clip;';
              fillRich(document, inner2, trows[ri2][ci2] == null ? '' : trows[ri2][ci2], tspec);
              cell.appendChild(inner2); row.appendChild(cell);
            }
            el.appendChild(row); it.trows.push({ el: row, c: {} });
          }
          bump(it, 'table');
        }
        /* rows share the height; optionally they reveal one after another */
        var nr = Math.max(1, it.trows.length), rh2 = it.h / nr, rv = L.reveal || 'none', stg = +L.stagger || 0, rdur = Math.max(1, +L.revealDur || 8);
        for (ri2 = 0; ri2 < it.trows.length; ri2++) {
          var tr2 = it.trows[ri2], hh = r4(rh2) + 'px';
          if (tr2.c.h !== hh) { tr2.c.h = hh; tr2.el.style.height = hh; bump(it, 'rowh'); }
          var u2 = 1;
          if (rv !== 'none') { u2 = Math.max(0, Math.min(1, (t - L.start - ri2 * stg) / rdur)); u2 = 1 - Math.pow(1 - u2, 3); }
          var rop = String(r4(u2)), rtf = rv === 'slide' ? 'translateX(' + r4((1 - u2) * -40) + 'px)' : (rv === 'drop' ? 'translateY(' + r4((1 - u2) * -rh2 * 0.6) + 'px)' : 'none');
          if (tr2.c.op !== rop) { tr2.c.op = rop; tr2.el.style.opacity = rop; bump(it, 'rowop'); }
          if (tr2.c.tf !== rtf) { tr2.c.tf = rtf; tr2.el.style.transform = rtf; bump(it, 'rowtf'); }
        }
      } else if (L.type === 'chart') {
        this.size(node, it, L, t, wall, ev);
        S(it, 'width', r4(it.w) + 'px'); S(it, 'height', r4(it.h) + 'px');
        S(it, 'background', css(ev('bg')));
        var cpad = Math.max(0, +L.pad || 0);
        S(it, 'padding', cpad + 'px'); S(it, 'boxSizing', 'border-box');
        var csrc = L.key ? this.dv(L.key) : null, craw = csrc != null && csrc !== '' ? String(csrc) : (L.data || '');
        var cap = chartCells(craw, L, L.key && L.cells !== false ? cellMap(this.data, L.key) : null), CL = L;
        craw = cap.raw;
        if (cap.colors != null) { CL = Object.create(L); CL.colors = cap.colors; }
        var series = parseSeries(craw);
        var prog = Math.max(0, Math.min(100, ev('prog'))) / 100;
        if (+L.anim > 0) { var ua = Math.max(0, Math.min(1, (t - L.start) / +L.anim)); prog *= 1 - Math.pow(1 - ua, 3); }
        var csig = JSON.stringify([series, r4(it.w), r4(it.h), Math.round(prog * 1000), ev('fontSize'), ev('color'), ev('bg'), ev('strokeW'), L.chart, L.cumul, CL.colors, L.legend, L.grid, L.axes, L.gridColor, L.ymax, L.ysteps, L.xStart, L.xEvery, L.barGap, L.barRadius, L.pieLabels, L.hole, L.gap, L.points, L.split2, L.leadBold, craw, cpad, L.area, L.markColor, L.labelColor, L.suffix, L.font, L.weight, this.fontVer]);
        if (it.c.csig !== csig) {
          it.c.csig = csig;
          el.innerHTML = chartSVG(CL, Math.max(1, it.w - cpad * 2), Math.max(1, it.h - cpad * 2), series, { raw: craw, fs: ev('fontSize'), font: L.font || 'Arial', weight: L.weight || 400, color: css(ev('color')), bg: ev('bg'), prog: prog, lineW: ev('strokeW') });
          bump(it, 'chart');
        }
      } else if (L.type === 'crawl') {
        this.size(node, it, L, t, wall, ev);
        S(it, 'width', r4(it.w) + 'px'); S(it, 'height', r4(it.h) + 'px');
        S(it, 'background', css(ev('bg')));
        S(it, 'fontFamily', '"' + (L.font || 'Arial') + '", Arial, sans-serif');
        S(it, 'fontSize', r4(ev('fontSize')) + 'px');
        S(it, 'fontWeight', String(L.weight || 400));
        S(it, 'fontStyle', L.italic ? 'italic' : 'normal');
        S(it, 'textTransform', L.upper ? 'uppercase' : 'none');
        S(it, 'letterSpacing', r4(ev('tracking')) + 'px');
        S(it, 'color', css(ev('color')));
        var fe = Math.max(0, +L.fade || 0), msk = fe > 0 ? 'linear-gradient(to right,transparent,#000 ' + fe + 'px,#000 calc(100% - ' + fe + 'px),transparent)' : 'none';
        if (it.c.msk !== msk) { it.c.msk = msk; el.style.webkitMaskImage = msk; el.style.maskImage = msk; bump(it, 'msk'); }
        var ksrc = L.key ? this.dv(L.key) : null, ktxt = lineBreaks(ksrc != null && ksrc !== '' ? String(ksrc) : (L.text || ''), L).replace(/\n/g, ' ');
        var isep = L.itemSep == null || L.itemSep === '' ? '|' : L.itemSep, kitems = ktxt.split(isep).map(function (x) { return x.replace(/^\s+|\s+$/g, ''); }).filter(function (x) { return x !== ''; });
        kitems = crawlCells(kitems, L.key && L.cells !== false ? cellMap(this.data, L.key) : null);
        var kspec = styleSpec(L), gap = L.gap == null ? 40 : +L.gap;
        var ksig = JSON.stringify([kitems, specSig(kspec), L.sepText, L.sepColor, L.sepImg, L.sepSize, gap, L.font, ev('fontSize'), L.weight, L.italic, L.upper, ev('tracking'), r4(it.w), r4(it.h), this.fontVer]);
        if (it.c.ksig !== ksig) {
          it.c.ksig = ksig;
          while (el.firstChild) el.removeChild(el.firstChild);
          var strip = document.createElement('div');
          strip.style.cssText = 'position:absolute;left:0;top:0;height:100%;display:flex;align-items:center;white-space:pre;will-change:transform;';
          var unit = document.createElement('div');
          unit.style.cssText = 'display:flex;align-items:center;flex:none;height:100%;';
          kitems.forEach(function (itx) {
            var sp2 = document.createElement('span'); sp2.style.cssText = 'flex:none;';
            fillRich(document, sp2, itx, kspec);
            unit.appendChild(sp2);
            var sep2 = document.createElement('span');
            sep2.style.cssText = 'flex:none;display:flex;align-items:center;margin:0 ' + r4(gap / 2) + 'px;';
            var simg = L.sepImg && assets[L.sepImg];
            if (simg) {
              var im3 = document.createElement('img'); im3.src = simg.src; im3.draggable = false;
              im3.style.cssText = 'display:block;height:' + r4(it.h * (+L.sepSize || 60) / 100) + 'px;width:auto;';
              sep2.appendChild(im3);
            } else {
              sep2.textContent = L.sepText == null ? '•' : L.sepText;
              if (L.sepColor) sep2.style.color = css(normColor(L.sepColor) || L.sepColor);
              if (+L.sepSize && +L.sepSize !== 100) sep2.style.fontSize = (+L.sepSize / 100) + 'em';
            }
            unit.appendChild(sep2);
          });
          strip.appendChild(unit);
          el.appendChild(strip);
          var uw = unit.offsetWidth || 1, copies = Math.max(1, Math.ceil(it.w / uw) + 1);
          for (var cp2 = 1; cp2 < copies; cp2++) strip.appendChild(unit.cloneNode(true));
          it.kstrip = strip; it.kw = uw; it.c.kx = null;
          bump(it, 'crawl');
        }
        /* on air the crawl keeps running even while the timeline holds on a stop marker */
        var secs;
        if (this.live) {
          if (it.kt0 == null) it.kt0 = this.wall - Math.max(0, (t - L.start) / comp.fps);
          secs = this.wall - it.kt0;
        } else secs = Math.max(0, (t - L.start) / comp.fps);
        var dist = secs * (L.speed == null ? 150 : +L.speed), kx;
        if (!kitems.length) kx = 0;
        else if (L.startFull) kx = -(dist % it.kw);
        else { var off = dist - it.w; kx = off < 0 ? -off : -(off % it.kw); }
        var ktf = 'translate3d(' + r4(kx) + 'px,0,0)';
        if (it.c.kx !== ktf && it.kstrip) { it.c.kx = ktf; it.kstrip.style.transform = ktf; bump(it, 'kx'); }
      } else if (L.type === 'comp') {
        if (it.subs) {
          var rp = L.rep || {}, rn2 = it.subs.length, gx = rp.dir === 'h' ? (+rp.gap || 0) : 0, gy = rp.dir === 'h' ? 0 : (+rp.gap || 0);
          var shown = rn2, first = rp.first == null ? 1 : Math.round(+rp.first || 0), stag = +rp.stagger || 0, sc = it.sub.comp, st0 = this.subTime(it, t), ri;
          if (rp.countKey) { var cv = parseFloat(this.dv(rp.countKey)); if (!isNaN(cv)) shown = Math.max(0, Math.min(rn2, Math.round(cv))); }
          it.w = sc.w + Math.abs(gx) * (rn2 - 1); it.h = sc.h + Math.abs(gy) * (rn2 - 1);
          S(it, 'width', it.w + 'px'); S(it, 'height', it.h + 'px');
          for (ri = 0; ri < rn2; ri++) {
            var rw = it.subs[ri], vis = ri < shown, rtf = 'translate(' + r4(gx * ri) + 'px,' + r4(gy * ri) + 'px)';
            if (rw.vis !== vis) { rw.vis = vis; rw.el.style.display = vis ? 'block' : 'none'; bump(it, 'row'); }
            if (rw.tf !== rtf) { rw.tf = rtf; rw.el.style.transform = rtf; bump(it, 'row'); }
            if (!vis) continue;
            var ps = this.sfx, pn = this.repN;
            this.sfx = ps + (ps ? '_' : '') + (first + ri); this.repN = first + ri;
            this.renderComp(rw.node, Math.min(st0 - ri * stag, sc.duration - 0.001), wall);
            this.sfx = ps; this.repN = pn;
          }
        } else if (it.sub) {
          it.w = it.sub.comp.w; it.h = it.sub.comp.h;
          S(it, 'width', it.w + 'px'); S(it, 'height', it.h + 'px');
          var st = this.subTime(it, t);
          st = Math.min(st, it.sub.comp.duration - 0.001);
          this.renderComp(it.sub, st, wall);
        }
      }
    }

    /* world matrix (always, the editor needs it for hidden layers too) */
    var wm = it.pm;
    if (L.type === 'text') {
      wm = [wm[0] * it.fit, wm[1] * it.fit, wm[2], wm[3], wm[4], wm[5]];
      wm = translate(wm, -it.alignOff, 0);
    }
    it.wm = wm;
    /* the matrix the element itself is drawn with (a cropped sequence sits at its crop offset) */
    it.ew = (L.type === 'sequence' && it.crop) ? translate(wm, it.crop[0], it.crop[1]) : wm;

    if (!active) {
      it.kt0 = null;
      if (it.wrap) { if (it.wc.display !== 'none') { it.wc.display = 'none'; it.wrap.style.display = 'none'; } }
      else S(it, 'display', 'none');
      return;
    }

    var op = Math.max(0, Math.min(100, ev('op'))) / 100;
    S(it, 'opacity', String(r4(op)));
    it.op = op;

    var mk = L.mask;
    if (L.type === 'shape' && L.shape === 'poly' && L.pts && L.pts.length > 2) {
      /* custom outline: corner points given as fractions of the box */
      var pp = [], pi;
      for (pi = 0; pi < L.pts.length; pi++) pp.push(r4(L.pts[pi][0] * it.w) + 'px ' + r4(L.pts[pi][1] * it.h) + 'px');
      var pcp = 'polygon(' + pp.join(',') + ')';
      if (it.c.cp !== pcp) { it.c.cp = pcp; el.style.webkitClipPath = pcp; el.style.clipPath = pcp; bump(it, 'cp'); }
    } else if (mk && mk.on) {
      var mx = ev('mx'), my = ev('my'), mw = ev('mw'), mh = ev('mh'), cp;
      if (mk.shape === 'ellipse') cp = 'ellipse(' + r4(mw / 2) + 'px ' + r4(mh / 2) + 'px at ' + r4(mx + mw / 2) + 'px ' + r4(my + mh / 2) + 'px)';
      else cp = 'inset(' + r4(my) + 'px ' + r4(it.w - mx - mw) + 'px ' + r4(it.h - my - mh) + 'px ' + r4(mx) + 'px round ' + r4(Math.max(0, ev('mr'))) + 'px)';
      if (it.c.cp !== cp) { it.c.cp = cp; el.style.webkitClipPath = cp; el.style.clipPath = cp; bump(it, 'cp'); }
    } else if (it.c.cp) { it.c.cp = ''; el.style.webkitClipPath = ''; el.style.clipPath = ''; bump(it, 'cp'); }

    var f = '', v;
    v = ev('blur'); if (v > 0) f += 'blur(' + r4(v) + 'px) ';
    v = ev('bright'); if (v !== 100) f += 'brightness(' + r4(v) + '%) ';
    v = ev('contrast'); if (v !== 100) f += 'contrast(' + r4(v) + '%) ';
    v = ev('sat'); if (v !== 100) f += 'saturate(' + r4(v) + '%) ';
    v = ev('hue'); if (v !== 0) f += 'hue-rotate(' + r4(v) + 'deg) ';
    if (L.mblur && !it.isMatte && !it.isTexMask) { var mbf = this.motionBlur(node, it, t); if (mbf) f = mbf + ' ' + f; }
    else if (it.mb) { it.mb.on = false; }
    if (L.type === 'comp' && !(L.rep && L.rep.on)) S(it, 'overflow', L.noClip ? 'visible' : 'hidden');
    var shf = L.shadow ? 'drop-shadow(' + r4(ev('shX')) + 'px ' + r4(ev('shY')) + 'px ' + r4(Math.max(0, ev('shBlur'))) + 'px ' + css(ev('shColor')) + ')' : '';
    /* a masked or cropped layer casts its shadow from a holder outside the mask, so the shadow is not cut off at the mask */
    var hold = !!shf && !!(it.wrap || it.c.cp);
    if (shf && !hold) f += shf;
    S(it, 'filter', f || 'none');
    if (hold || it.hold) this.shadowHold(it, hold ? shf : 'none');

    this.texture(node, it, L, t, wall, ev);
    var blend = L.blend || 'normal';
    if (it.hold) { if (it.hc.blend !== blend) { it.hc.blend = blend; it.hold.style.mixBlendMode = blend; } blend = 'normal'; }
    if (it.wrap) { if (it.wc.blend !== blend) { it.wc.blend = blend; it.wrap.style.mixBlendMode = blend; } }
    else S(it, 'mixBlendMode', blend);

    if (it.wrap) { if (it.multi) this.applyMulti(node, it); else this.applyMatte(node, it); }
    else S(it, 'transform', mcss(it.ew));
  };

  /* ---------- textures: a pattern laid over a layer's background (grain, scan lines, carbon, a picture of your own...) ---------- */
  var TEX = {};
  /* a small repeatable random number generator, so a texture looks the same every time */
  function rng(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  /* gradients, rays, rings and radial halftone: one picture for the whole box, centred at the middle plus the offset */
  function texGen(kind, tx, W, H, ox, oy, ang, sc, asp) {
    var GEN = { gradient: 1, radial: 1, rays: 1, rings: 1 };
    if (!GEN[kind] && !(kind === 'halftone' && tx.htMode === 'radial')) return null;
    var cx = W / 2 + ox, cy = H / 2 + oy, at = ' at ' + r4(cx) + 'px ' + r4(cy) + 'px';
    var c1 = css(normColor(tx.color) || '#ffffffff'), c2 = css(normColor(tx.color2) || (kind === 'gradient' || kind === 'radial' ? '#ffffff00' : '#ffffff00'));
    var f = tx.gFrom == null ? 0 : +tx.gFrom, e = tx.gTo == null ? 100 : +tx.gTo, duty = Math.max(1, Math.min(99, tx.duty == null ? 50 : +tx.duty)) / 100;
    if (kind === 'gradient') {
      var phi = (180 + ang) * Math.PI / 180, len = Math.abs(W * Math.sin(phi)) + Math.abs(H * Math.cos(phi)) || 1, d = (ox * Math.sin(phi) - oy * Math.cos(phi)) / len * 100;
      return 'linear-gradient(' + r4(180 + ang) + 'deg,' + c1 + ' ' + r4(f + d) + '%,' + c2 + ' ' + r4(e + d) + '%)';
    }
    if (kind === 'radial') {
      var rr = Math.max(1, Math.sqrt(W * W + H * H) / 2 * sc);
      return 'radial-gradient(' + r4(rr * asp) + 'px ' + r4(rr) + 'px' + at + ',' + c1 + ' ' + r4(f) + '%,' + c2 + ' ' + r4(e) + '%)';
    }
    if (kind === 'rays') {
      var n = Math.max(2, Math.min(180, Math.round(tx.count == null ? 24 : +tx.count))), w = 360 / n, sw = w * duty;
      return 'repeating-conic-gradient(from ' + r4(ang) + 'deg' + at + ',' + c1 + ' 0deg ' + r4(sw) + 'deg,transparent ' + r4(sw + Math.min(0.6, w * 0.05)) + 'deg ' + r4(w) + 'deg)';
    }
    if (kind === 'rings') {
      var sp = Math.max(2, 24 * sc), rw = sp * duty;
      return 'repeating-radial-gradient(circle' + at + ',' + c1 + ' 0px ' + r4(rw) + 'px,transparent ' + r4(rw + 0.8) + 'px ' + r4(sp) + 'px)';
    }
    var hr = htRadial(Math.max(3, Math.round(18 * sc)), W, H, cx, cy, tx, normColor(tx.color) || '#000000ff');
    return 'url("' + hr + '")';
  }
  var HR = {}, HRn = 0;
  function htRadial(cell, W, H, cx, cy, tx, ink) {
    var k = Math.min(1, 4096 / Math.max(W, H)), from = Math.max(0, Math.min(100, tx.htFrom == null ? 100 : +tx.htFrom)) / 100, to = Math.max(0, Math.min(100, tx.htTo == null ? 0 : +tx.htTo)) / 100;
    var shape = tx.htShape || 'dot', stag = !!tx.htStagger, curve = Math.max(0.2, Math.min(5, tx.htCurve == null ? 1 : +tx.htCurve));
    var reach = Math.max(1, Math.sqrt(W * W + H * H) / 2 * Math.max(5, tx.reach == null ? 100 : +tx.reach) / 100);
    var key = [cell, Math.round(W), Math.round(H), Math.round(cx / 2), Math.round(cy / 2), from, to, shape, stag, curve, Math.round(reach), ink].join('|');
    if (HR[key]) return HR[key];
    var cv = root.document.createElement('canvas'), cw = Math.max(1, Math.round(W * k)), ch = Math.max(1, Math.round(H * k));
    cv.width = cw; cv.height = ch;
    var g = cv.getContext('2d'), c = parseColor(ink);
    g.scale(k, k);
    g.fillStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + c[3] + ')';
    /* the grid is anchored on the centre so the middle dot sits on it */
    var x0 = cx - Math.ceil(cx / cell) * cell, y0 = cy - Math.ceil(cy / cell) * cell, r = 0, x, y;
    for (y = y0 - cell; y < H + cell; y += cell, r++) {
      for (x = x0 - cell + (stag && r % 2 ? cell / 2 : 0); x < W + cell; x += cell) {
        var dd = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)), u = Math.min(1, dd / reach), cov = from + (to - from) * Math.pow(u, curve);
        if (cov <= 0) continue;
        g.beginPath();
        if (shape === 'square') { var q = cell * Math.sqrt(cov); g.rect(x - q / 2, y - q / 2, q, q); }
        else if (shape === 'diamond') { var dm = cell * Math.sqrt(cov); g.moveTo(x, y - dm); g.lineTo(x + dm, y); g.lineTo(x, y + dm); g.lineTo(x - dm, y); g.closePath(); }
        else if (shape === 'line') { g.rect(x - cell / 2, y - cell * cov / 2, cell, cell * cov); }
        else g.arc(x, y, cell * 0.7072 * Math.sqrt(cov), 0, Math.PI * 2);
        g.fill();
      }
    }
    if (++HRn > 30) { HR = {}; HRn = 0; }
    return (HR[key] = cv.toDataURL('image/png'));
  }
  var TEX_PREVIEW = {
    gradient: 'linear-gradient(180deg,#fff,rgba(255,255,255,0))',
    radial: 'radial-gradient(circle at 50% 50%,#fff,rgba(255,255,255,0) 70%)',
    rays: 'repeating-conic-gradient(from 0deg at 50% 50%,#fff 0deg 7deg,transparent 7deg 15deg)',
    rings: 'repeating-radial-gradient(circle at 50% 50%,#fff 0 3px,transparent 3px 7px)'
  };
  /* a halftone strip: one or two cells wide, `h` tall; coverage goes from tx.htFrom to tx.htTo % between y0 and y0 + len */
  var HT = {};
  function htStrip(cell, h, y0, len, tx, ink) {
    var from = Math.max(0, Math.min(100, tx.htFrom == null ? 0 : +tx.htFrom)) / 100, to = Math.max(0, Math.min(100, tx.htTo == null ? 100 : +tx.htTo)) / 100;
    var shape = tx.htShape || 'dot', stag = !!tx.htStagger, curve = Math.max(0.2, Math.min(5, tx.htCurve == null ? 1 : +tx.htCurve));
    h = Math.max(cell, Math.min(8192, Math.round(h)));
    var key = [cell, h, Math.round(y0), Math.round(len), from, to, shape, stag, curve, ink].join('|');
    if (HT[key]) return HT[key];
    var cw = stag ? cell * 2 : cell, cv = root.document.createElement('canvas');
    cv.width = cw; cv.height = h;
    var g = cv.getContext('2d'), c = parseColor(ink), col = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + c[3] + ')';
    g.fillStyle = col;
    /* each mark grows until it fills its cell; past halfway neighbours overlap and the gaps become the dots */
    function mark(x, y, cov) {
      if (cov <= 0) return;
      if (shape === 'line') { g.fillRect(x - cell, y - cell * cov / 2, cell * 2, cell * cov); return; }
      if (shape === 'square') { var q = cell * Math.sqrt(cov); g.fillRect(x - q / 2, y - q / 2, q, q); return; }
      g.beginPath();
      if (shape === 'diamond') { var dd = cell * Math.sqrt(cov); g.moveTo(x, y - dd); g.lineTo(x + dd, y); g.lineTo(x, y + dd); g.lineTo(x - dd, y); g.closePath(); }
      else g.arc(x, y, cell * 0.7072 * Math.sqrt(cov), 0, Math.PI * 2);
      g.fill();
    }
    var rows = Math.ceil(h / cell) + 1, r, k;
    for (r = -1; r < rows; r++) {
      var cy = (r + 0.5) * cell, u = len > 0 ? Math.max(0, Math.min(1, (cy - y0) / len)) : 0, cov = from + (to - from) * Math.pow(u, curve);
      for (k = -1; k <= cw / cell; k++) mark((k + 0.5) * cell + (stag && ((r % 2) + 2) % 2 ? cell / 2 : 0), cy, cov);
    }
    g.globalCompositeOperation = 'source-over';
    var out = { url: cv.toDataURL('image/png'), w: cw, h: h };
    var n = 0; for (var kk in HT) n++;
    if (n > 40) HT = {};
    HT[key] = out;
    return out;
  }
  function texTile(kind, ink, seed) {
    if (kind === 'halftone') return htStrip(6, 84, 6, 72, {}, '#000000ff');
    seed = Math.max(0, Math.round(+seed || 0));
    var key = kind + '|' + ink + '|' + seed;
    if (TEX[key]) return TEX[key];
    var doc = root.document, cv = doc.createElement('canvas'), x, y, i, R = rng(7 + seed * 7919);
    var c = parseColor(ink || '#ffffffff'), col = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + c[3] + ')';
    function size(w, hh) { cv.width = w; cv.height = hh; return cv.getContext('2d'); }
    var g, d, im;
    if (kind === 'grain' || kind === 'paper' || kind === 'brushed') {
      var W = kind === 'brushed' ? 512 : 256, H = kind === 'brushed' ? 128 : 256;
      g = size(W, H); im = g.createImageData(W, H); d = im.data;
      var lo = [];
      if (kind === 'paper') {
        /* soft blotches: a few octaves of smoothed noise that wrap at the edges */
        var oct = [[8, 0.5], [16, 0.3], [64, 0.2]], grids = oct.map(function (o) { var n = o[0], a = []; for (i = 0; i < n * n; i++) a.push(R()); return { n: n, a: a, w: o[1] }; });
        for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
          var v = 0;
          grids.forEach(function (q) {
            var fx = x / W * q.n, fy = y / H * q.n, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, n = q.n;
            var a = q.a[(y0 % n) * n + (x0 % n)], b = q.a[(y0 % n) * n + ((x0 + 1) % n)], cc = q.a[((y0 + 1) % n) * n + (x0 % n)], dd = q.a[((y0 + 1) % n) * n + ((x0 + 1) % n)];
            tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
            v += q.w * ((a * (1 - tx) + b * tx) * (1 - ty) + (cc * (1 - tx) + dd * tx) * ty);
          });
          lo.push(v);
        }
      }
      var rowV = [];
      for (y = 0; y < H; y++) rowV.push(R());
      for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
        var p = (y * W + x) * 4, val;
        if (kind === 'grain') val = 128 + (R() + R() + R() - 1.5) * 120;
        else if (kind === 'paper') val = 128 + (lo[y * W + x] - 0.5) * 150 + (R() - 0.5) * 30;
        else val = 128 + (rowV[y] - 0.5) * 110 + (R() - 0.5) * 24 + Math.sin(x / W * Math.PI * 2 * 3 + rowV[y] * 6) * 10;
        val = Math.max(0, Math.min(255, val));
        d[p] = d[p + 1] = d[p + 2] = val; d[p + 3] = 255;
      }
      g.putImageData(im, 0, 0);
    } else if (kind === 'scan') {
      g = size(4, 4); g.fillStyle = col; g.fillRect(0, 0, 4, 2);
    } else if (kind === 'lines') {
      g = size(16, 16); g.strokeStyle = col; g.lineWidth = 3; g.lineCap = 'square';
      for (i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(i * 16, 16); g.lineTo(i * 16 + 16, 0); g.stroke(); }
    } else if (kind === 'grid') {
      g = size(32, 32); g.fillStyle = col; g.fillRect(0, 0, 32, 1); g.fillRect(0, 0, 1, 32);
    } else if (kind === 'dots') {
      g = size(12, 12); g.fillStyle = col; g.beginPath(); g.arc(6, 6, 2.6, 0, Math.PI * 2); g.fill();
    } else if (kind === 'carbon') {
      g = size(16, 16);
      var cells = [[0, 0, 0], [8, 8, 0], [8, 0, 1], [0, 8, 1]];
      cells.forEach(function (q) {
        var gr = q[2] ? g.createLinearGradient(q[0], 0, q[0] + 8, 0) : g.createLinearGradient(0, q[1], 0, q[1] + 8);
        gr.addColorStop(0, 'rgba(0,0,0,0.9)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0.9)');
        g.fillStyle = gr; g.fillRect(q[0], q[1], 8, 8);
      });
    } else if (kind === 'hex') {
      g = size(28, 48); g.strokeStyle = col; g.lineWidth = 1.5;
      var hx = function (cx, cy) { g.beginPath(); for (var k = 0; k < 6; k++) { var a = Math.PI / 3 * k + Math.PI / 6; g.lineTo(cx + Math.cos(a) * 16, cy + Math.sin(a) * 16); } g.closePath(); g.stroke(); };
      hx(0, 0); hx(28, 0); hx(14, 24); hx(0, 48); hx(28, 48);
    } else return null;
    var res = { url: cv.toDataURL('image/png'), w: cv.width, h: cv.height };
    TEX[key] = res;
    return res;
  }
  var TEX_CSS = {
    vignette: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(0,0,0,0.85) 100%)',
    gloss: 'linear-gradient(to bottom, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.12) 48%, rgba(255,255,255,0) 50.5%, rgba(0,0,0,0.15) 100%)',
    shine: 'linear-gradient(105deg, rgba(255,255,255,0) 35%, rgba(255,255,255,0.75) 50%, rgba(255,255,255,0) 65%)'
  };
  function texRand(n) { var x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); }
  /* where the pattern is after `secs` seconds of its motion: [x, y] in pixels */
  function texMotion(tx, secs) {
    var mode = tx.motion, x = 0, y = 0;
    if (!mode) { if (tx.moveX || tx.moveY) { x = secs * (+tx.moveX || 0); y = secs * (+tx.moveY || 0); } return [x, y]; }
    var dir = (+tx.dir || 0) * Math.PI / 180, cx = Math.cos(dir), cy = Math.sin(dir), per = Math.max(0.05, +tx.period || 4), u;
    if (mode === 'scroll') { u = secs * (+tx.speed || 0); x = cx * u; y = cy * u; }
    else if (mode === 'pingpong') {
      var ph = (secs / per) % 1;
      u = tx.ease === 'linear' ? (ph < 0.5 ? ph * 2 : 2 - ph * 2) : (1 - Math.cos(ph * Math.PI * 2)) / 2;
      u *= (+tx.dist || 0); x = cx * u; y = cy * u;
    } else if (mode === 'flicker') {
      var st = Math.floor(secs * Math.max(1, +tx.rate || 12)), am = +tx.amount || 0;
      x = (texRand(st) - 0.5) * 2 * am; y = (texRand(st + 7.31) - 0.5) * 2 * am;
    } else if (mode === 'orbit') {
      var ang = secs / per * Math.PI * 2, r = +tx.dist || 0;
      x = Math.cos(ang) * r; y = Math.sin(ang) * r;
    }
    return [x, y];
  }
  /* the fade that shapes where the texture shows: [mask, composite] */
  function texMask(tx) {
    var f = tx.fade || 'none', n = Math.max(1, Math.min(100, tx.fadeLen == null ? 100 : +tx.fadeLen));
    if (f === 'none') return '';
    if (f === 'edges') {
      var e = Math.max(0, +tx.feather || 40) + 'px';
      return 'linear-gradient(to right,transparent,#000 ' + e + ',#000 calc(100% - ' + e + '),transparent),linear-gradient(to bottom,transparent,#000 ' + e + ',#000 calc(100% - ' + e + '),transparent)';
    }
    if (f === 'centre') return 'radial-gradient(ellipse at center,#000 ' + (100 - n) * 0.7 + '%,transparent 71%)';
    if (f === 'outside') return 'radial-gradient(ellipse at center,transparent ' + (100 - n) * 0.7 + '%,#000 71%)';
    var to = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }[f];
    return to ? 'linear-gradient(to ' + to + ',#000 ' + (100 - n) + '%,transparent)' : '';
  }
  /* a texture picture sent from CasparCG (a path or URL); its size is read once it has loaded */
  P.texPic = function (src) {
    var c = this.texPics || (this.texPics = {}), self = this;
    if (c[src]) return c[src];
    var o = c[src] = { src: src, w: 256, h: 256 };
    if (typeof Image !== 'undefined') {
      var im = new Image();
      im.onload = function () { o.w = im.naturalWidth || 256; o.h = im.naturalHeight || 256; self.dirty = true; if (!self.looping && self.render) self.render(); };
      im.src = src;
    }
    return o;
  };
  /* other layers shape the texture, the same way as layer masks: each added, subtracted or intersected, optionally inverted */
  P.texMask = function (node, it, tx, t, wall) {
    var mb = it.texMb, lb = it.texLb, c = it.tmc, list = it.texMasks && it.texMasks.length && tx.masks && tx.masks.length ? it.texMasks : null;
    if (!list) {
      if (c.on) {
        c.on = false;
        mb.style.webkitMaskImage = 'none'; mb.style.maskImage = 'none'; mb.style.transform = 'none'; mb.style.width = '100%'; mb.style.height = '100%';
        lb.style.transform = 'none'; lb.style.width = '100%'; lb.style.height = '100%'; mb.style.visibility = 'visible';
        bump(it, 'tex');
      }
      return;
    }
    c.on = true;
    var em = it.ew || it.wm, inv = em && invert(em), cw = node.comp.w, ch = node.comp.h, layers = [], pending = false, i;
    if (!inv) return;
    for (i = 0; i < list.length; i++) {
      var M = list[i].it;
      this.renderItem(node, M, t, wall);
      if (!M.active) continue;
      var g = this.matteLayer(M);
      if (g) layers.push({ g: g, op: list[i].op }); else pending = true;
    }
    var ti = it.texInset || [0, 0], bw2 = Math.max(1, it.w - ti[0] - (+tx.inR || 0)), bh2 = Math.max(1, it.h - ti[1] - (+tx.inB || 0));
    var mt = mcss(mul([1, 0, 0, 1, -ti[0], -ti[1]], inv)), lt = mcss(translate(em, ti[0], ti[1])), sz = cw + 'x' + ch, lsz = r4(bw2) + 'x' + r4(bh2);
    if (c.mt !== mt) { c.mt = mt; mb.style.transform = mt; bump(it, 'texpos'); }
    if (c.sz !== sz) { c.sz = sz; mb.style.width = cw + 'px'; mb.style.height = ch + 'px'; }
    if (c.lt !== lt) { c.lt = lt; lb.style.transform = lt; }
    if (c.lsz !== lsz) { c.lsz = lsz; lb.style.width = r4(bw2) + 'px'; lb.style.height = r4(bh2) + 'px'; }
    /* a mask picture still loading: keep the last complete mask */
    if (pending && c.ok) return;
    var full = { image: 'linear-gradient(#000,#000)', x: 0, y: 0, w: cw, h: ch };
    if (!layers.length && !tx.maskInv) { if (c.vis !== 'hidden') { c.vis = 'hidden'; mb.style.visibility = 'hidden'; } c.ok = !pending; return; }
    if (c.vis !== 'visible') { c.vis = 'visible'; mb.style.visibility = 'visible'; }
    c.ok = !pending;
    if (layers.length && layers[0].op !== 'add') layers.unshift({ g: full, op: 'add' });
    var img = [], pos = [], size = [], comp = [], MAP = { add: 'source-over', sub: 'destination-out', int: 'destination-in' };
    for (i = layers.length - 1; i >= 0; i--) {
      var q = layers[i].g;
      img.push(q.image); pos.push(r4(q.x) + 'px ' + r4(q.y) + 'px'); size.push(r4(q.w) + 'px ' + r4(q.h) + 'px');
      comp.push(i === 0 ? 'source-over' : MAP[layers[i].op] || 'source-over');
    }
    if (tx.maskInv) {
      img.unshift(full.image); pos.unshift('0px 0px'); size.unshift(cw + 'px ' + ch + 'px'); comp.unshift(layers.length ? 'xor' : 'source-over');
    }
    var key = img.join(',') + '|' + pos.join(',') + '|' + size.join(',') + '|' + comp.join(',');
    if (c.key !== key) {
      c.key = key; var st = mb.style;
      st.webkitMaskImage = img.join(','); st.webkitMaskPosition = pos.join(','); st.webkitMaskSize = size.join(',');
      st.webkitMaskRepeat = 'no-repeat'; st.webkitMaskComposite = comp.join(',');
      bump(it, 'tex');
    }
  };
  /* the texture as CasparCG wants it: a texture field (base name in tex.cgKey) can switch it on/off, send JSON,
     pick a saved preset by name, or change single settings: <name>_kind, <name>_size, <name>_opacity ... */
  var TEXF = { kind: 'kind', blend: 'blend', color: 'color', color2: 'color2', motion: 'motion', pic: 'src', fit: 'fit', fade: 'fade', shape: 'htShape', layout: 'htMode',
    size: 'scale', width: 'wpct', height: 'hpct', angle: 'angle', speed: 'speed', dir: 'dir', dist: 'dist', period: 'period', rate: 'rate', amount: 'amount', spin: 'spin', pulse: 'pulse',
    start: 'htFrom', end: 'htTo', count: 'count', duty: 'duty', seed: 'seed', feather: 'feather' };
  var TEXN = { scale: 1, wpct: 1, hpct: 1, angle: 1, speed: 1, dir: 1, dist: 1, period: 1, rate: 1, amount: 1, spin: 1, pulse: 1, htFrom: 1, htTo: 1, count: 1, duty: 1, seed: 1, feather: 1 };
  var TEXP = { opacity: 'texOp', x: 'texX', y: 'texY', zoom: 'texSc', turn: 'texRot', bright: 'texBr', contrast: 'texCt', soften: 'texBlur', hue: 'texHue', sat: 'texSat' };
  P.texCG = function (L) {
    var tx = L.tex, k = tx && tx.cgKey, pr = this.project, out = null, ov = null, q, v;
    if (!k) return { tx: tx, ov: null };
    function put(o) { if (!out) { out = {}; for (var a in tx) out[a] = tx[a]; } for (var b in o) out[b] = o[b]; }
    function preset(name) {
      var ps = (pr.texPresets || {})[String(name)];
      if (!ps) return;
      var t2 = {}; for (var a in ps.tex) if (a !== 'cgKey' && a !== 'masks') t2[a] = ps.tex[a];
      t2.on = true; put(t2);
      if (ps.p) { ov = ov || {}; for (var b in ps.p) ov[b] = ps.p[b]; }
    }
    v = this.dv(k);
    if (v != null && v !== '') {
      var sv = String(v).replace(/^\s+|\s+$/g, '');
      if (/^\{/.test(sv)) { try { var j = JSON.parse(sv); if (j.preset) preset(j.preset); var t3 = {}; for (q in j) if (TEXF[q]) t3[TEXF[q]] = TEXN[TEXF[q]] ? +j[q] : j[q]; else if (TEXP[q]) { ov = ov || {}; ov[TEXP[q]] = +j[q]; } else if (q === 'on') t3.on = !/^(0|false|off|no|hide)$/i.test(String(j[q])); put(t3); } catch (e) {} }
      else if (/^(0|false|off|no|hide)$/i.test(sv)) put({ on: false });
      else if (/^(1|true|on|yes|show)$/i.test(sv)) put({ on: true });
      else preset(sv);
    }
    v = this.dv(k + '_preset'); if (v != null && v !== '') preset(v);
    for (q in TEXF) { v = this.dv(k + '_' + q); if (v == null || v === '') continue; var o = {}; o[TEXF[q]] = TEXN[TEXF[q]] ? parseFloat(v) : String(v); if (q === 'pic') o.kind = 'image'; if (!TEXN[TEXF[q]] || !isNaN(o[TEXF[q]])) put(o); }
    for (q in TEXP) { v = this.dv(k + '_' + q); if (v == null || v === '' || isNaN(parseFloat(v))) continue; ov = ov || {}; ov[TEXP[q]] = parseFloat(v); }
    return { tx: out || tx, ov: ov };
  };
  P.texture = function (node, it, L, t, wall, ev0) {
    var cgv = L.tex && L.tex.cgKey ? this.texCG(L) : null, tx = cgv ? cgv.tx : L.tex, el = it.el, tov = cgv && cgv.ov;
    var ev = tov ? function (n) { return tov[n] != null ? tov[n] : ev0(n); } : ev0;
    if (!tx || !tx.on || el.tagName === 'CANVAS') { if (it.texEl && it.c.texShow !== 'none') { it.c.texShow = 'none'; it.texEl.style.display = 'none'; bump(it, 'tex'); } return; }
    if (!it.texEl) {
      /* box (clips to the layer) > mask frame (the composition's space, carries the mask) > layer frame > the pattern */
      var box = document.createElement('div'), mb = document.createElement('div'), lb = document.createElement('div'), inner = document.createElement('div');
      box.style.cssText = 'position:absolute;left:0;top:0;right:0;bottom:0;overflow:hidden;pointer-events:none;border-radius:inherit;';
      mb.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;transform-origin:0 0;';
      lb.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;transform-origin:0 0;';
      inner.style.cssText = 'position:absolute;';
      lb.appendChild(inner); mb.appendChild(lb); box.appendChild(mb);
      it.texEl = box; it.texMb = mb; it.texLb = lb; it.texIn = inner; it.tmc = {};
    }
    /* under the content of texts, tables, charts and crawls (over their background); over pictures and compositions */
    var under = !/^(image|comp|lottie)$/.test(L.type);
    if (it.texEl.parentNode !== el) { if (under) el.insertBefore(it.texEl, el.firstChild); else el.appendChild(it.texEl); bump(it, 'tex'); }
    if (it.c.texShow !== 'block') { it.c.texShow = 'block'; it.texEl.style.display = 'block'; }
    var inL = Math.max(0, +tx.inL || 0), inT = Math.max(0, +tx.inT || 0), inR = Math.max(0, +tx.inR || 0), inB = Math.max(0, +tx.inB || 0), ins = inT + 'px ' + inR + 'px ' + inB + 'px ' + inL + 'px';
    if (it.c.texIns !== ins) { it.c.texIns = ins; var bst = it.texEl.style; bst.left = inL + 'px'; bst.top = inT + 'px'; bst.right = inR + 'px'; bst.bottom = inB + 'px'; it.c.texMt = null; bump(it, 'tex'); }
    it.texInset = [inL, inT];
    it.texEl.style.zIndex = under ? '-1' : '1';
    /* time of the motion: on air the wall clock (keeps running through holds), in the editor the playhead */
    var secs = this.live ? wall : Math.max(0, (t - L.start) / (this.rootComp.fps || 25));
    var moving = !!(tx.motion && tx.motion !== 'none') || !!(tx.moveX || tx.moveY) || !!(+tx.spin) || !!(+tx.pulse);
    if (moving && this.live) this.hasFree = true;
    var kz = Math.max(1, ev('texSc')) / 100, kind = tx.kind || 'grain', sc = Math.max(5, +tx.scale || 100) / 100 * kz, asp = Math.max(5, tx.aspect == null ? 100 : +tx.aspect) / 100;
    var ang = (+tx.angle || 0) + ev('texRot') + (+tx.spin || 0) * secs, img = '', tw = 0, th = 0, rep = 'repeat', szs = '100% 100%';
    var W = Math.max(1, (it.w || 1) - inL - inR), H = Math.max(1, (it.h || 1) - inT - inB);
    /* separate width and height sizes (Stretch from older projects still counts) */
    asp *= Math.max(5, tx.wpct == null ? 100 : +tx.wpct) / Math.max(5, tx.hpct == null ? 100 : +tx.hpct);
    sc *= Math.max(5, tx.hpct == null ? 100 : +tx.hpct) / 100;
    /* everything tiles, so the texture never runs out whatever the offset, motion, zoom or angle */
    if (TEX_CSS[kind]) { img = TEX_CSS[kind]; tw = W * kz * asp; th = H * kz; }
    else if (kind === 'image') {
      var a = (this.project.assets || {})[tx.asset];
      if (tx.src) a = this.texPic(String(tx.src));
      if (a && a.src) {
        img = 'url("' + String(a.src).replace(/"/g, '%22') + '")';
        var aw = a.w || 256, ah = a.h || 256;
        if (tx.fit === 'cover') { var cs = Math.max(W / aw, H / ah); tw = aw * cs * kz * asp; th = ah * cs * kz; }
        else if (tx.fit === 'stretch') { tw = W * kz * asp; th = H * kz; }
        else { tw = aw * sc * asp; th = ah * sc; }
      }
    } else if (kind !== 'halftone') {
      var tile = texTile(kind, normColor(tx.color) || '#ffffffff', tx.seed);
      if (tile) { img = 'url("' + tile.url + '")'; tw = tile.w * sc * asp; th = tile.h * sc; }
    }
    var mv = texMotion(tx, secs), ox = ev('texX') + mv[0], oy = ev('texY') + mv[1], inner2 = it.texIn, geo, pos = '0px 0px', tf = 'none';
    /* pinned to the composition: the pattern stays put while the layer moves, and lines up across layers */
    if (tx.anchor === 'comp' && it.ew) { ox -= it.ew[4] + inL; oy -= it.ew[5] + inT; }
    var gcx = tx.anchor === 'comp' && node.comp ? (node.comp.w - W) / 2 : 0, gcy = tx.anchor === 'comp' && node.comp ? (node.comp.h - H) / 2 : 0;
    var gen = texGen(kind, tx, W, H, ox + gcx, oy + gcy, ang, sc, asp);
    if (gen) {
      /* radial and gradient kinds are drawn for the box itself; the offset moves their centre, so they never run out either */
      img = gen; rep = 'no-repeat'; szs = '100% 100%'; pos = '0px 0px'; tf = 'none'; geo = 'left:0;top:0;width:100%;height:100%;';
    } else {
    /* turned: a square inner layer as big as the box's diagonal, so the corners are always covered */
    var big = Math.abs(ang % 360) > 0.01, D = Math.ceil(Math.sqrt(W * W + H * H)) + 4, IW = big ? D : W, IH = big ? D : H;
    geo = big ? 'left:' + r4((W - D) / 2) + 'px;top:' + r4((H - D) / 2) + 'px;width:' + D + 'px;height:' + D + 'px;' : 'left:0;top:0;width:100%;height:100%;';
    if (big) tf = 'rotate(' + r4(ang) + 'deg)';
    /* the offset is taken back into the turned frame so the pattern moves the way it says */
    var rr = -ang * Math.PI / 180, bx = ox * Math.cos(rr) - oy * Math.sin(rr), by = ox * Math.sin(rr) + oy * Math.cos(rr);
    if (kind === 'halftone') {
      /* dots that grow along the box (rows across it): drawn as one strip that repeats sideways */
      var cell = Math.max(3, Math.round(18 * sc)), sa = Math.abs(Math.sin(ang * Math.PI / 180)), ca = Math.abs(Math.cos(ang * Math.PI / 180));
      var E = big ? W * sa + H * ca : H, pad = Math.round(IH / 2), tH = IH + pad * 2;
      var strip = htStrip(cell, tH, pad + (IH - E) / 2, E, tx, normColor(tx.color) || '#000000ff');
      img = 'url("' + strip.url + '")'; rep = 'repeat-x';
      var hx = strip.w * asp;
      bx = (((bx + (big ? (D - W) / 2 : 0)) % hx) + hx) % hx;
      pos = r4(bx) + 'px ' + r4(-pad + Math.max(-pad, Math.min(pad, by))) + 'px';
      szs = r4(hx) + 'px ' + strip.h + 'px';
    } else {
      if (big) { bx += (D - W) / 2; by += (D - H) / 2; }
      if (tw > 0 && th > 0) { bx = ((bx % tw) + tw) % tw; by = ((by % th) + th) % th; }
      pos = r4(bx) + 'px ' + r4(by) + 'px';
      szs = r4(tw) + 'px ' + r4(th) + 'px';
    }
    }
    var sig = [img.length, img.slice(-40), szs, rep, geo].join('|');
    if (it.c.texSig !== sig) { it.c.texSig = sig; inner2.style.cssText = 'position:absolute;' + geo + 'background-image:' + (img || 'none') + ';background-size:' + szs + ';background-repeat:' + rep + ';'; it.c.texPos = null; it.c.texTf = null; it.c.texFl = null; bump(it, 'tex'); }
    if (it.c.texPos !== pos) { it.c.texPos = pos; inner2.style.backgroundPosition = pos; bump(it, 'texpos'); }
    if (it.c.texTf !== tf) { it.c.texTf = tf; inner2.style.transform = tf; bump(it, 'texpos'); }
    /* refine: brightness, contrast, softness, invert, black and white */
    var fl = [], br = ev('texBr'), ct = ev('texCt'), bb = ev('texBlur');
    if (br !== 100) fl.push('brightness(' + r4(Math.max(0, br) / 100) + ')');
    if (ct !== 100) fl.push('contrast(' + r4(Math.max(0, ct) / 100) + ')');
    if (bb > 0) fl.push('blur(' + r4(bb) + 'px)');
    var hu = ev('texHue'), sa2 = ev('texSat');
    if (hu) fl.push('hue-rotate(' + r4(hu) + 'deg)');
    if (sa2 !== 100) fl.push('saturate(' + r4(Math.max(0, sa2) / 100) + ')');
    if (tx.invert) fl.push('invert(1)');
    if (tx.gray) fl.push('grayscale(1)');
    var fls = fl.join(' ') || 'none';
    if (it.c.texFl !== fls) { it.c.texFl = fls; inner2.style.filter = fls; inner2.style.webkitFilter = fls; bump(it, 'tex'); }
    var mk = texMask(tx);
    if (it.c.texMk !== mk) {
      it.c.texMk = mk; var bs = it.texEl.style;
      bs.webkitMaskImage = mk || 'none'; bs.maskImage = mk || 'none';
      bs.webkitMaskComposite = tx.fade === 'edges' ? 'source-in' : ''; bs.maskComposite = tx.fade === 'edges' ? 'intersect' : '';
      bump(it, 'tex');
    }
    this.texMask(node, it, tx, t, wall);
    var bl = tx.blend || 'overlay', opv = Math.max(0, Math.min(100, ev('texOp'))) / 100;
    var pu = Math.max(0, Math.min(100, +tx.pulse || 0)) / 100;
    if (pu) opv *= 1 - pu * (1 - Math.cos(secs / Math.max(0.05, +tx.pulseT || 2) * Math.PI * 2)) / 2;
    var op = String(r4(opv));
    if (it.c.texBl !== bl) { it.c.texBl = bl; it.texEl.style.mixBlendMode = bl; bump(it, 'tex'); }
    if (it.c.texOp !== op) { it.c.texOp = op; it.texEl.style.opacity = op; bump(it, 'tex'); }
  };

  /* ---------- motion blur ---------- */
  /* where a layer sits at time t (its own transform and its parents'), without touching the page */
  P.linAt = function (node, L, t, d) {
    var pr = this.project, it = node.byId[L.id], V = it ? this.viewOf(it) : L;
    var x = evalProp(V, 'x', t, pr), y = evalProp(V, 'y', t, pr), sx = evalProp(V, 'sx', t, pr) / 100, sy = evalProp(V, 'sy', t, pr) / 100;
    var kx = 1, ky = 1;
    if (L.type === 'text' && L.box && L.boxScale !== false) { kx = Math.abs(sx); ky = Math.abs(sy); sx = 1; sy = 1; }
    var r = evalProp(V, 'rot', t, pr) * Math.PI / 180, cos = Math.cos(r), sin = Math.sin(r);
    var qx = Math.tan(Math.max(-89, Math.min(89, evalProp(V, 'skx', t, pr))) * Math.PI / 180), qy = Math.tan(Math.max(-89, Math.min(89, evalProp(V, 'sky', t, pr))) * Math.PI / 180);
    if (d) { qx = 0; qy = 0; }   /* as a parent its skew is not passed on */
    var a0 = sx, b0 = qy * sx, c0 = qx * sy, d0 = sy;
    var m = [cos * a0 - sin * b0, sin * a0 + cos * b0, cos * c0 - sin * d0, sin * c0 + cos * d0, x, y];
    var par = L.parent && node.byId[L.parent];
    if (par && par.layer !== L && !L.pEdge && (d || 0) < 12) m = mul(this.linAt(node, par.layer, t, (d || 0) + 1), m);
    return translate(m, -evalProp(V, 'ax', t, pr) * kx, -evalProp(V, 'ay', t, pr) * ky);
  };
  /* blur along the direction the layer travels while the virtual shutter is open */
  P.motionBlur = function (node, it, t) {
    var L = it.layer, sh = (node.comp.shutter == null ? 180 : +node.comp.shutter) / 360;
    var mb = it.mb || (it.mb = { on: false, sx: -1, sy: -1 });
    /* on air a timeline that has stopped (a hold) shows a sharp picture */
    if (this.live && mb.t === t) mb.still = true; else if (mb.t !== t) mb.still = false;
    mb.t = t;
    if (!(sh > 0) || mb.still) return '';
    var m1 = this.linAt(node, L, t), m0 = this.linAt(node, L, t - Math.min(2, sh));
    var w = Math.max(1, it.w), h = Math.max(1, it.h), p1 = apply(m1, w / 2, h / 2), p0 = apply(m0, w / 2, h / 2);
    var dx = p1[0] - p0[0], dy = p1[1] - p0[1];
    var wm = it.ew || it.wm, det = wm[0] * wm[3] - wm[1] * wm[2];
    if (dx * dx + dy * dy < 1 || !det) return '';
    var lx = (wm[3] * dx - wm[2] * dy) / det, ly = (-wm[1] * dx + wm[0] * dy) / det;
    var gx = Math.min(250, Math.round(Math.abs(lx) / 3 * 10) / 10), gy = Math.min(250, Math.round(Math.abs(ly) / 3 * 10) / 10);
    if (gx < 0.3 && gy < 0.3) return '';
    if (!mb.el) {
      var doc = this.rootEl.ownerDocument, NS = 'http://www.w3.org/2000/svg';
      if (!this.mbDefs || this.mbDefs.parentNode !== this.rootEl) {
        this.mbDefs = doc.createElementNS(NS, 'svg');
        this.mbDefs.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden;');
        this.mbDefs.setAttribute('aria-hidden', 'true');
        this.rootEl.appendChild(this.mbDefs);
      }
      mb.id = 'cgmb' + (++uidN) + '_' + Math.floor(Math.random() * 1e6);
      mb.el = doc.createElementNS(NS, 'filter');
      mb.el.setAttribute('id', mb.id);
      mb.el.setAttribute('color-interpolation-filters', 'sRGB');
      mb.blur = doc.createElementNS(NS, 'feGaussianBlur');
      mb.el.appendChild(mb.blur);
      this.mbDefs.appendChild(mb.el);
    }
    if (mb.sx !== gx || mb.sy !== gy) {
      mb.sx = gx; mb.sy = gy;
      /* room around the layer for the blur to spread into */
      var px = Math.min(4, 3 * gx / w + 0.02), py = Math.min(4, 3 * gy / h + 0.02);
      mb.el.setAttribute('x', String(-px)); mb.el.setAttribute('width', String(1 + 2 * px));
      mb.el.setAttribute('y', String(-py)); mb.el.setAttribute('height', String(1 + 2 * py));
      mb.blur.setAttribute('stdDeviation', gx + ' ' + gy);
      bump(it, 'mb');
    }
    mb.on = true;
    return 'url(#' + mb.id + ')';
  };

  P.shadowHold = function (it, f) {
    if (!it.hold) {
      var outer = it.wrap || it.el, hd = document.createElement('div');
      if (!outer.parentNode) return;
      hd.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;overflow:visible;';
      outer.parentNode.insertBefore(hd, outer);
      hd.appendChild(outer);
      it.hold = hd; it.hc = {};
    }
    if (it.hc.f !== f) { it.hc.f = f; it.hold.style.filter = f; it.hold.style.webkitFilter = f; bump(it, 'hold'); }
  };
  /* ---------- track mattes: any layer can mask another ---------- */
  P.applyMatte = function (node, it) {
    var M = it.matteItem, wrap = it.wrap, wc = it.wc, mode = it.layer.matteMode || 'alpha';
    var inv = mode === 'alphaInv' || mode === 'lumaInv', luma = mode === 'luma' || mode === 'lumaInv';
    var ML = M.view || M.layer, mw = Math.max(M.w, 0.01), mh = Math.max(M.h, 0.01);
    var minv = invert(M.wm);
    if (!minv) {
      /* matte is collapsed to nothing: normal matte hides everything, inverted shows everything */
      SP(wrap, wc, '-webkit-mask-image', 'none');
      wrap.style.overflow = 'visible';
      if (wc.tf !== 'I') { wc.tf = 'I'; wrap.style.transform = 'none'; }
      if (wc.w !== 'big') { wc.w = 'big'; wrap.style.width = node.comp.w + 'px'; wrap.style.height = node.comp.h + 'px'; }
      S(it, 'transform', mcss(it.ew));
      if (wc.vis !== (inv ? 'visible' : 'hidden')) { wc.vis = inv ? 'visible' : 'hidden'; wrap.style.visibility = wc.vis; }
      return;
    }
    /* decide how the matte picture is produced */
    var simple = !(ML.mask && ML.mask.on) && (M.c.filter === 'none' || !M.c.filter);
    var image, sync = false, radius = '0px';
    if (ML.type === 'shape' && ML.shape === 'poly' && ML.pts && simple && !luma && !inv) {
      image = polyMask(ML.pts, parseColor(evalProp(ML, 'fill', M.t, this.project))[3]); sync = true;
    } else if (ML.type === 'shape' && ML.shape === 'poly') {
      image = null;
    } else if (ML.type === 'shape' && simple && !luma) {
      var pr = this.project;
      if (ML.gradient) image = 'linear-gradient(' + r4(evalProp(ML, 'gradAngle', M.t, pr)) + 'deg,' + alphaOnly(evalProp(ML, 'fill', M.t, pr)) + ',' + alphaOnly(evalProp(ML, 'fill2', M.t, pr)) + ')';
      else image = 'linear-gradient(' + alphaOnly(evalProp(ML, 'fill', M.t, pr)) + ',' + alphaOnly(evalProp(ML, 'fill', M.t, pr)) + ')';
      sync = true;
      radius = M.c.borderRadius || '0px';
      if (inv && radius !== '0px' && radius !== '0%') { sync = false; image = null; }
    } else if (ML.type === 'image' && simple && !luma && (ML.fit || 'fill') === 'fill' && M.c.src) {
      image = 'url("' + M.c.src + '")'; sync = !!(M.img.complete && M.img.naturalWidth);
    } else if (ML.type === 'sequence' && simple && !luma && M.frameSrc) {
      image = 'url("' + M.frameSrc + '")'; sync = true;
    }
    if (!image) {
      var key = M.rev + '|' + luma + '|' + r4(mw) + 'x' + r4(mh);
      if (M.mkeyUrl !== key) { M.mkeyUrl = key; this.makeMatteImage(M, luma, mw, mh); }
      image = M.mUrl ? 'url("' + M.mUrl + '")' : null;
    }
    var show = !!image;
    if (wc.vis !== (show ? 'visible' : 'hidden')) { wc.vis = show ? 'visible' : 'hidden'; wrap.style.visibility = wc.vis; }
    if (!show) return;

    var wm, ww, wh;
    if (!inv) {
      wm = M.wm; ww = mw; wh = mh;
      var mc = (ML.type === 'sequence' && M.crop && image && /^url/.test(image) && M.frameSrc && image.indexOf(M.frameSrc) >= 0) ? M.crop : null;
      SP(wrap, wc, '-webkit-mask-image', image);
      SP(wrap, wc, '-webkit-mask-size', mc ? r4(mc[2]) + 'px ' + r4(mc[3]) + 'px' : '100% 100%');
      SP(wrap, wc, '-webkit-mask-position', mc ? r4(mc[0]) + 'px ' + r4(mc[1]) + 'px' : '0 0');
      SP(wrap, wc, '-webkit-mask-repeat', 'no-repeat');
      SP(wrap, wc, '-webkit-mask-composite', 'source-over');
      var rad = (sync && ML.type === 'shape') ? radius : '0px';
      if (wc.rad !== rad) { wc.rad = rad; wrap.style.borderRadius = rad; wrap.style.overflow = rad === '0px' ? 'visible' : 'hidden'; }
      var wop = String(r4(M.op == null ? 1 : M.op));
      if (wc.op !== wop) { wc.op = wop; wrap.style.opacity = wop; }
    } else {
      /* inverted: the wrapper must cover the whole comp, expressed in the matte's own space */
      var cw = node.comp.w, ch = node.comp.h, pts = [apply(minv, 0, 0), apply(minv, cw, 0), apply(minv, cw, ch), apply(minv, 0, ch)];
      var x0 = 0, y0 = 0, x1 = mw, y1 = mh, i;
      for (i = 0; i < 4; i++) { x0 = Math.min(x0, pts[i][0]); y0 = Math.min(y0, pts[i][1]); x1 = Math.max(x1, pts[i][0]); y1 = Math.max(y1, pts[i][1]); }
      x0 = Math.floor(x0) - 2; y0 = Math.floor(y0) - 2; x1 = Math.ceil(x1) + 2; y1 = Math.ceil(y1) + 2;
      wm = translate(M.wm, x0, y0); ww = x1 - x0; wh = y1 - y0;
      SP(wrap, wc, '-webkit-mask-image', image + ',linear-gradient(#000,#000)');
      var ic = (ML.type === 'sequence' && M.crop && M.frameSrc && image.indexOf(M.frameSrc) >= 0) ? M.crop : [0, 0, mw, mh];
      SP(wrap, wc, '-webkit-mask-size', r4(ic[2]) + 'px ' + r4(ic[3]) + 'px,100% 100%');
      SP(wrap, wc, '-webkit-mask-position', r4(ic[0] - x0) + 'px ' + r4(ic[1] - y0) + 'px,0 0');
      SP(wrap, wc, '-webkit-mask-repeat', 'no-repeat');
      SP(wrap, wc, '-webkit-mask-composite', 'xor');
      if (wc.rad !== '0px') { wc.rad = '0px'; wrap.style.borderRadius = '0px'; wrap.style.overflow = 'visible'; }
      if (wc.op !== '1') { wc.op = '1'; wrap.style.opacity = '1'; }
    }
    var tf = mcss(wm), sz = r4(ww) + 'x' + r4(wh);
    if (wc.tf !== tf) { wc.tf = tf; wrap.style.transform = tf; }
    if (wc.w !== sz) { wc.w = sz; wrap.style.width = r4(ww) + 'px'; wrap.style.height = r4(wh) + 'px'; }
    var winv = invert(wm);
    S(it, 'transform', mcss(winv ? mul(winv, it.ew) : it.ew));
  };

  /* the list of layers that mask a layer: the main matte plus any added in the node screen, each add / subtract / intersect */
  function matteSpecs(L) {
    var out = [], more = L.matteMore || [], i;
    if (L.matte) out.push({ id: L.matte, op: /Inv$/.test(L.matteMode || '') ? 'sub' : 'add' });
    for (i = 0; i < more.length; i++) if (more[i] && more[i].id) out.push({ id: more[i].id, op: more[i].op || 'add' });
    return out;
  }

  /* ---------- combined masks: several layers added, subtracted or intersected into one mask ---------- */
  P.applyMulti = function (node, it) {
    var wrap = it.wrap, wc = it.wc, list = it.matteList, cw = node.comp.w, ch = node.comp.h, layers = [], i;
    var pending = false;
    for (i = 0; i < list.length; i++) {
      var M = list[i].it;
      if (!M.active) continue;
      var g = this.matteLayer(M);
      if (g) layers.push({ g: g, op: list[i].op }); else pending = true;
    }
    S(it, 'transform', mcss(it.ew));
    /* a mask picture that is still loading: hold the last complete mask rather than show a wrong one for a frame */
    if (pending && it.multiOk) return;
    var show = layers.length > 0 && !pending;
    it.multiOk = show;
    if (wc.vis !== (show ? 'visible' : 'hidden')) { wc.vis = show ? 'visible' : 'hidden'; wrap.style.visibility = wc.vis; }
    if (!show) return;
    if (layers[0].op !== 'add') layers.unshift({ g: { image: 'linear-gradient(#000,#000)', x: 0, y: 0, w: cw, h: ch }, op: 'add' });
    var img = [], pos = [], size = [], comp = [], MAP = { add: 'source-over', sub: 'destination-out', int: 'destination-in' };
    for (i = layers.length - 1; i >= 0; i--) {
      var q = layers[i].g;
      img.push(q.image); pos.push(r4(q.x) + 'px ' + r4(q.y) + 'px'); size.push(r4(q.w) + 'px ' + r4(q.h) + 'px');
      comp.push(i === 0 ? 'source-over' : MAP[layers[i].op] || 'source-over');
    }
    SP(wrap, wc, '-webkit-mask-image', img.join(','));
    SP(wrap, wc, '-webkit-mask-size', size.join(','));
    SP(wrap, wc, '-webkit-mask-position', pos.join(','));
    SP(wrap, wc, '-webkit-mask-repeat', 'no-repeat');
    SP(wrap, wc, '-webkit-mask-composite', comp.join(','));
    if (wc.rad !== '0px') { wc.rad = '0px'; wrap.style.borderRadius = '0px'; wrap.style.overflow = 'visible'; }
    if (wc.op !== '1') { wc.op = '1'; wrap.style.opacity = '1'; }
    if (wc.tf !== 'I') { wc.tf = 'I'; wrap.style.transform = 'none'; }
    var sz = cw + 'x' + ch;
    if (wc.w !== sz) { wc.w = sz; wrap.style.width = cw + 'px'; wrap.style.height = ch + 'px'; }
  };
  /* one mask layer: a CSS image plus where it sits in the composition */
  P.matteLayer = function (M) {
    var ML = M.view || M.layer, m = M.wm, w = Math.max(M.w, 0.01), h = Math.max(M.h, 0.01), op = M.op == null ? 1 : M.op, pr = this.project, image = null;
    var straight = Math.abs(m[1]) < 1e-6 && Math.abs(m[2]) < 1e-6 && m[0] > 0 && m[3] > 0;
    var simple = !(ML.mask && ML.mask.on) && (!M.c.filter || M.c.filter === 'none');
    function al(c) { return 'rgba(0,0,0,' + (Math.round(parseColor(c)[3] * op * 1000) / 1000) + ')'; }
    var poly = ML.type === 'shape' && ML.shape === 'poly' && ML.pts ? ML.pts : null;
    if (straight && simple) {
      if (poly) image = null;
      else if (ML.type === 'shape') {
        var rad = M.c.borderRadius || '0px', f1 = al(evalProp(ML, 'fill', M.t, pr));
        if (rad === '0px') image = ML.gradient ? 'linear-gradient(' + r4(evalProp(ML, 'gradAngle', M.t, pr)) + 'deg,' + f1 + ',' + al(evalProp(ML, 'fill2', M.t, pr)) + ')' : 'linear-gradient(' + f1 + ',' + f1 + ')';
        else if (rad === '50%' && !ML.gradient) image = 'radial-gradient(closest-side,' + f1 + ' calc(100% - 0.6px),rgba(0,0,0,0) 100%)';
      } else if (ML.type === 'image' && op === 1 && (ML.fit || 'fill') === 'fill' && M.img && M.img.getAttribute('src') && M.img.complete && M.img.naturalWidth) {
        image = 'url("' + M.img.getAttribute('src') + '")';
      } else if (ML.type === 'sequence' && op === 1 && M.frameSrc) {
        image = 'url("' + M.frameSrc + '")';
        if (M.crop) return { image: image, x: m[4] + M.crop[0] * m[0], y: m[5] + M.crop[1] * m[3], w: M.crop[2] * m[0], h: M.crop[3] * m[3] };
      }
      if (image) return { image: image, x: m[4], y: m[5], w: w * m[0], h: h * m[3] };
    }
    var pts = [apply(m, 0, 0), apply(m, w, 0), apply(m, w, h), apply(m, 0, h)], bx = Infinity, by = Infinity, ex = -Infinity, ey = -Infinity, i;
    for (i = 0; i < 4; i++) { bx = Math.min(bx, pts[i][0]); by = Math.min(by, pts[i][1]); ex = Math.max(ex, pts[i][0]); ey = Math.max(ey, pts[i][1]); }
    var bw = Math.max(1, ex - bx), bh = Math.max(1, ey - by);
    if (ML.type === 'shape' && simple) {
      /* shapes at any angle, skew or corner radius: an exact vector picture, kept so repeated poses are instant */
      var radc = M.c.borderRadius || '0px', a1 = Math.round(parseColor(evalProp(ML, 'fill', M.t, pr))[3] * op * 1000) / 1000;
      var a2 = ML.gradient ? Math.round(parseColor(evalProp(ML, 'fill2', M.t, pr))[3] * op * 1000) / 1000 : a1, ga = ML.gradient ? r4(evalProp(ML, 'gradAngle', M.t, pr)) : 0;
      var skey = [r4(m[0]), r4(m[1]), r4(m[2]), r4(m[3]), r4(w), r4(h), radc, a1, a2, ga, poly ? 'p' : ''].join('|');
      var cache = M.sCache || (M.sCache = {}), ent = cache[skey];
      if (!ent) {
        if ((M.sCount = (M.sCount || 0) + 1) > 300) { cache = M.sCache = {}; M.sCount = 1; }
        ent = cache[skey] = this.makeShapeMask(m, w, h, bx - m[4], by - m[5], bw, bh, radc, a1, a2, ga, !!ML.gradient, poly);
      }
      if (ent.ready) M.sLast = ent;
      var use = ent.ready ? ent : M.sLast;
      if (!use) return null;
      return { image: use.image, x: m[4] + use.ox, y: m[5] + use.oy, w: use.w, h: use.h };
    }
    /* text, Lottie, pictures at an angle, a whole composition...: drawn into a picture of its bounding box */
    var key = [M.rev, r4(m[0]), r4(m[1]), r4(m[2]), r4(m[3]), r4(w), r4(h), op].join('|');
    if (M.xKey !== key) { M.xKey = key; this.makeMatteX(M, bw, bh, [m[0], m[1], m[2], m[3], m[4] - bx, m[5] - by], op); }
    if (!M.xUrl) return null;
    return { image: 'url("' + M.xUrl + '")', x: m[4] + M.xOx, y: m[5] + M.xOy, w: M.xW, h: M.xH };
  };
  P.makeShapeMask = function (m, w, h, ox, oy, bw, bh, rad, a1, a2, ga, grad, poly) {
    var self = this, shape, defs = '', fill = 'fill="#000" fill-opacity="' + a1 + '"';
    if (grad) {
      var th = ga * Math.PI / 180, dx = Math.sin(th), dy = -Math.cos(th), len = Math.abs(w * dx) + Math.abs(h * dy);
      defs = '<defs><linearGradient id="g" gradientUnits="userSpaceOnUse" x1="' + r4(w / 2 - dx * len / 2) + '" y1="' + r4(h / 2 - dy * len / 2) + '" x2="' + r4(w / 2 + dx * len / 2) + '" y2="' + r4(h / 2 + dy * len / 2) + '">' +
        '<stop offset="0" stop-color="#000" stop-opacity="' + a1 + '"/><stop offset="1" stop-color="#000" stop-opacity="' + a2 + '"/></linearGradient></defs>';
      fill = 'fill="url(#g)"';
    }
    if (poly) shape = '<polygon points="' + polyPoints(poly, w, h) + '" ' + fill + '/>';
    else if (rad === '50%') shape = '<ellipse cx="' + r4(w / 2) + '" cy="' + r4(h / 2) + '" rx="' + r4(w / 2) + '" ry="' + r4(h / 2) + '" ' + fill + '/>';
    else shape = '<rect width="' + r4(w) + '" height="' + r4(h) + '" rx="' + r4(Math.min(parseFloat(rad) || 0, w / 2, h / 2)) + '" ' + fill + '/>';
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + Math.ceil(bw) + '" height="' + Math.ceil(bh) + '" viewBox="0 0 ' + r4(bw) + ' ' + r4(bh) + '" preserveAspectRatio="none">' + defs +
      '<g transform="matrix(' + r4(m[0]) + ',' + r4(m[1]) + ',' + r4(m[2]) + ',' + r4(m[3]) + ',' + r4(-ox) + ',' + r4(-oy) + ')">' + shape + '</g></svg>';
    var url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    var ent = { ready: false, image: 'url("' + url + '")', ox: ox, oy: oy, w: bw, h: bh }, pre = new Image();
    pre.onload = function () { ent.ready = true; ent.pre = pre; self.async(); };
    pre.onerror = function () { ent.ready = true; self.async(); };
    pre.src = url;
    return ent;
  };
  P.makeMatteX = function (M, bw, bh, tf, op) {
    var self = this, clone = M.el.cloneNode(true), i;
    if (M.el.tagName === 'CANVAS') {
      var im0 = document.createElement('img');
      im0.setAttribute('style', 'position:absolute;left:0;top:0;transform-origin:0 0;width:' + (M.crop ? M.crop[2] : M.w) + 'px;height:' + (M.crop ? M.crop[3] : M.h) + 'px;');
      try { im0.src = M.el.toDataURL(); } catch (e) {}
      clone = im0;
      if (M.crop) tf = translate(tf, M.crop[0], M.crop[1]);
    } else {
      var src = M.el.getElementsByTagName('canvas'), dst = clone.getElementsByTagName('canvas'), pairs = [];
      for (i = 0; i < dst.length; i++) pairs.push([src[i], dst[i]]);
      for (i = 0; i < pairs.length; i++) {
        var im = document.createElement('img');
        im.setAttribute('style', pairs[i][1].getAttribute('style'));
        try { im.src = pairs[i][0].toDataURL(); } catch (e2) {}
        pairs[i][1].parentNode.replaceChild(im, pairs[i][1]);
      }
    }
    clone.style.transform = mcss(tf); clone.style.visibility = 'visible'; clone.style.opacity = String(op); clone.style.display = 'block';
    var xml = new XMLSerializer().serializeToString(clone);
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + Math.ceil(bw) + '" height="' + Math.ceil(bh) + '" viewBox="0 0 ' + r4(bw) + ' ' + r4(bh) + '" preserveAspectRatio="none"><defs><style>' +
      fontFaceCSS(this.project, xml) + '</style></defs><foreignObject x="0" y="0" width="' + r4(bw) + '" height="' + r4(bh) + '">' + xml + '</foreignObject></svg>';
    var url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    var pre = new Image(), token = (M.xToken = (M.xToken || 0) + 1);
    pre.onload = pre.onerror = function () {
      if (M.xToken !== token) { URL.revokeObjectURL(url); return; }
      var old = M.xUrl;
      M.xUrl = url; M.xW = bw; M.xH = bh; M.xOx = -tf[4]; M.xOy = -tf[5]; M.xPre = pre;
      if (old) setTimeout(function () { URL.revokeObjectURL(old); }, 2000);
      self.async();
    };
    pre.src = url;
  };

  var polyCache = {};
  function polyPoints(pts, w, h) { var o = [], i; for (i = 0; i < pts.length; i++) o.push(r4(pts[i][0] * w) + ',' + r4(pts[i][1] * h)); return o.join(' '); }
  function polyMask(pts, alpha) {
    var k = polyPoints(pts, 1000, 1000) + '|' + alpha;
    if (!polyCache[k]) polyCache[k] = 'url("data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 1000 1000" preserveAspectRatio="none"><polygon points="' + polyPoints(pts, 1000, 1000) + '" fill="#000" fill-opacity="' + alpha + '"/></svg>') + '")';
    return polyCache[k];
  }
  function alphaOnly(c) { var p = parseColor(c); return 'rgba(0,0,0,' + (Math.round(p[3] * 1000) / 1000) + ')'; }

  /* Serialises the matte layer (text, Lottie, composition, anything) into an SVG picture used as a CSS mask. */
  P.makeMatteImage = function (M, luma, w, h) {
    var self = this, clone = M.el.cloneNode(true);
    clone.style.transform = 'none'; clone.style.visibility = 'visible'; clone.style.opacity = '1'; clone.style.display = 'block';
    var src = M.el.getElementsByTagName('canvas'), dst = clone.getElementsByTagName('canvas'), i, list = [];
    for (i = 0; i < dst.length; i++) list.push([src[i], dst[i]]);
    if (M.el.tagName === 'CANVAS') {
      var im0 = document.createElement('img');
      im0.setAttribute('style', M.crop ? 'position:absolute;left:' + M.crop[0] + 'px;top:' + M.crop[1] + 'px;width:' + M.crop[2] + 'px;height:' + M.crop[3] + 'px;' : 'position:absolute;left:0;top:0;width:' + w + 'px;height:' + h + 'px;');
      try { im0.src = M.el.toDataURL(); } catch (e) {}
      clone = im0;
    }
    for (i = 0; i < list.length; i++) {
      var im = document.createElement('img');
      im.setAttribute('style', list[i][1].getAttribute('style'));
      try { im.src = list[i][0].toDataURL(); } catch (e2) {}
      list[i][1].parentNode.replaceChild(im, list[i][1]);
    }
    var xml = new XMLSerializer().serializeToString(clone);
    var W = Math.ceil(w), H = Math.ceil(h);
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + r4(w) + ' ' + r4(h) + '" preserveAspectRatio="none"><defs><style>' +
      fontFaceCSS(this.project, xml) + '</style>' +
      (luma ? '<filter id="l" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feColorMatrix type="luminanceToAlpha"/></filter>' : '') +
      '</defs><g' + (luma ? ' filter="url(#l)"' : '') + '><foreignObject x="0" y="0" width="' + r4(w) + '" height="' + r4(h) + '">' + xml + '</foreignObject></g></svg>';
    var url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    var pre = new Image(), token = (M.mToken = (M.mToken || 0) + 1);
    pre.onload = pre.onerror = function () {
      if (M.mToken !== token) { URL.revokeObjectURL(url); return; }
      var old = M.mUrl;
      M.mUrl = url; M.mPre = pre;
      if (old) setTimeout(function () { URL.revokeObjectURL(old); }, 2000);
      self.async();
    };
    pre.src = url;
  };

  function lottieSetText(anim, name, text) {
    var found = false;
    function walk(els) {
      if (!els) return;
      for (var i = 0; i < els.length; i++) {
        var e = els[i];
        if (!e) continue;
        if (e.data && e.data.nm === name && typeof e.updateDocumentData === 'function') {
          try { e.updateDocumentData({ t: text }, 0); found = true; } catch (err) {}
        }
        if (e.elements) walk(e.elements);
      }
    }
    try { walk(anim.renderer.elements); } catch (e) {}
    return found;
  }

  /* ---------- rendering entry points ---------- */
  P.render = function () {
    this.fid++;
    this.dirty = false;
    this.gliding = false;
    this.sfx = ''; this.repN = null;
    setLive(this.project, this.data);
    var d = this.rootComp.duration, t = this.main.time;
    if (this.live) t = Math.min(t, d - 0.001);
    this.renderComp(this.tree, t, this.wall);
  };
  P.renderAt = function (t) {
    this.main.time = t;
    this.wall = t / this.rootComp.fps;
    if (!this.shown) this.show(true);
    this.render();
  };
  P.show = function (v) {
    this.shown = !!v;
    if (this.rootEl) this.rootEl.style.visibility = v ? 'visible' : 'hidden';
  };
  P.item = function (id) { return this.tree.byId[id] || null; };

  /* ---------- live playback (CasparCG) ---------- */
  P.markers = function (comp) {
    /* a stop marker on the first frame (or past the end) would freeze the template before anything shows, so it is ignored */
    comp = comp || this.rootComp;
    var d = comp.duration;
    var ms = (comp.markers || []).map(function (m) { return m.t; }).filter(function (t) { return t > 0 && t < d; });
    ms.sort(function (a, b) { return a - b; });
    return ms;
  };
  P.nextStop = function (after, comp) {
    var ms = this.markers(comp);
    for (var i = 0; i < ms.length; i++) if (ms[i] > after + 0.0001) return ms[i];
    return null;
  };
  P.startLoop = function () {
    var self = this;
    if (this.looping) return;
    this.looping = true;
    this.lastTs = null;
    function tick(ts) {
      if (!self.shown || self.halted) { self.looping = false; return; }
      var dt = self.lastTs == null ? 0 : Math.min(0.25, (ts - self.lastTs) / 1000);
      self.lastTs = ts;
      self.wall += dt;
      var fps = self.rootComp.fps, moved = self.advance(self.main, dt * fps, self.rootComp.loops), id;
      for (id in self.clocks) {
        var it = self.all[id], cfps = it && it.sub ? it.sub.comp.fps : fps;
        if (self.advance(self.clocks[id], dt * cfps, it && it.sub ? it.sub.comp.loops : null)) moved = true;
      }
      if (self.main.done && self.ending) {
        self.ending = false;
        self.show(false);
        self.looping = false;
        if (self.opts.onHide) self.opts.onHide();
        return;
      }
      if (moved || self.hasFree || self.dirty || self.gliding) self.render();
      else if (self.settle) { self.settle = false; self.render(); }
      if (self.opts.onFrame) self.opts.onFrame(self.main.time);
      root.requestAnimationFrame(tick);
    }
    root.requestAnimationFrame(tick);
  };
  P.advance = function (c, d, loops) {
    c.done = false;
    if (!c.playing) return false;
    var prev = c.time, li;
    c.time += c.dir * d;
    /* repeat sections drawn on the timeline: playback circles inside one until next / stop / another invoke lets it out */
    if (loops && c.dir > 0 && c.free !== 'all') {
      for (li = 0; li < loops.length; li++) {
        var lr = loops[li], span0 = lr.to - lr.from;
        if (lr === c.free || !(span0 > 0)) continue;
        if (prev < lr.to && c.time >= lr.to && prev >= lr.from - d - 1e-6 && c.target >= lr.to) {
          c.time = lr.from + ((c.time - lr.to) % span0);
          return true;
        }
      }
    }
    if ((c.dir > 0 && c.time >= c.target) || (c.dir < 0 && c.time <= c.target)) {
      var span = Math.abs(c.target - c.from), over = Math.abs(c.time - c.target);
      if (c.loop === 'loop' && span > 0) {
        /* repeat: jump back to the start of the range, keeping any overshoot so the timing stays even */
        c.time = c.from + c.dir * (over % span);
      } else if (c.loop === 'pingpong' && span > 0) {
        var end = c.target;
        c.target = c.from; c.from = end; c.dir = -c.dir;
        c.time = end + c.dir * (over % span);
      } else { c.time = c.target; c.playing = false; c.done = true; this.settle = true; }
    }
    return true;
  };
  P.go = function (c, from, to) {
    if (from != null) { c.time = from; c.free = null; }
    c.from = c.time; c.loop = null;
    c.target = to;
    c.dir = to >= c.time ? 1 : -1;
    c.playing = c.time !== to;
    c.done = false;
  };
  P.livePlay = function () {
    this.halted = false;
    this.clocks = {};
    this.wall = 0;
    this.ending = false;
    var first = this.nextStop(-1);
    this.go(this.main, 0, first == null ? this.rootComp.duration : first);
    /* independent compositions that start by themselves run to their own first stop marker (or loop in their repeat section) */
    for (var aid in this.all) {
      var ai = this.all[aid], AL = ai.layer;
      if (AL.type === 'comp' && AL.triggered && AL.autoPlay && ai.sub) {
        var ac = this.clocks[aid] = { time: 0, target: 0, playing: false, dir: 1 }, am = this.nextStop(-1, ai.sub.comp);
        this.go(ac, 0, am == null ? ai.sub.comp.duration : am);
      }
    }
    this.show(true);
    this.render();
    this.startLoop();
  };
  /* lets a clock leave the repeat section it is in */
  P.release = function (c, loops) {
    c.free = null;
    for (var i = 0; loops && i < loops.length; i++) if (c.time >= loops[i].from - 1e-6 && c.time <= loops[i].to + 1e-6) c.free = loops[i];
  };
  P.liveNext = function () {
    if (!this.shown) return;
    var m = this.nextStop(this.main.time);
    this.release(this.main, this.rootComp.loops);
    this.ending = m == null && this.markers().length > 0;
    this.go(this.main, null, m == null ? this.rootComp.duration : m);
    this.startLoop();
  };
  P.liveStop = function () {
    if (!this.shown) return;
    var ms = this.markers();
    if (this.rootComp.outReverse) {
      /* out = the in animation played backwards */
      this.ending = true;
      this.go(this.main, null, 0);
      this.main.free = 'all';
      if (!this.main.playing) { this.main.playing = true; this.main.dir = -1; }
      this.startLoop();
      return;
    }
    if (!ms.length) { this.show(false); if (this.opts.onHide) this.opts.onHide(); return; }
    var last = ms[ms.length - 1];
    this.ending = true;
    this.go(this.main, this.main.time < last ? last : null, this.rootComp.duration);
    this.main.free = 'all';
    this.main.playing = true;
    this.startLoop();
  };
  P.halt = function () { this.halted = true; this.looping = false; this.main.playing = false; this.ending = false; };
  P.invoke = function (name) {
    var acts = this.project.actions || [], a, i, hit = false;
    /* one name can drive several timelines: the main one and any independent composition that has an invoke of that name */
    for (i = 0; i < acts.length; i++) {
      a = acts[i];
      if (a.name !== name) continue;
      if (!a.target || a.target === 'main') {
        if (a.comp && a.comp !== this.rootComp.id) continue;
        this.ending = false;
        this.go(this.main, a.from, a.to);
        this.main.loop = a.loop || null;
      } else {
        if (!this.all[a.target]) continue;
        var c = this.clocks[a.target] || (this.clocks[a.target] = { time: 0, target: 0, playing: false, dir: 1 });
        this.go(c, a.from, a.to);
        c.loop = a.loop || null;
      }
      hit = true;
    }
    if (!hit) return false;
    this.halted = false;
    if (!this.shown) this.show(true);
    this.dirty = true;
    this.startLoop();
    return true;
  };
  P.gotoFrame = function (f) {
    this.halted = false;
    this.main.time = +f || 0; this.main.playing = false;
    if (!this.shown) this.show(true);
    this.dirty = true;
    this.startLoop();
  };
  P.update = function (d) {
    var o = parseData(d), k;
    for (k in o) this.data[k] = o[k];
    this.dirty = true;
    if (!this.looping) this.render();
    if (this.live && this.shown) this.startLoop();
  };

  /* Wires a live player to the global functions CasparCG calls. */
  function bindCaspar(player, win) {
    win.play = function () { player.livePlay(); };
    win.stop = function () { player.liveStop(); };
    win.next = function () { player.liveNext(); };
    win.update = function (d) { player.update(d); };
    win.invoke = function (n) { return player.invoke(n); };
    win.gotoFrame = function (f) { player.gotoFrame(f); };
    win.setText = function (k, v) { var o = {}; o[k] = v; player.update(o); };
    var acts = player.project.actions || [];
    acts.forEach(function (a) {
      if (!a.name || /^(play|stop|next|update|invoke|gotoFrame|setText)$/.test(a.name)) return;
      win[a.name] = function () { return player.invoke(a.name); };
    });
  }

  root.CGRuntime = {
    Player: Player, evalProp: evalProp, DEF: DEF, COLOR_PROPS: COLOR_PROPS, parseColor: parseColor, toHex: toHex, css: css,
    bezier: bezier, easeCurve: easeCurve, matteSpecs: matteSpecs, baseProp: baseProp, BOOLS: BOOLS, NUMS: NUMS, normColor: normColor, swatchColor: swatchColor, resolveSrc: resolveSrc, mul: mul, invert: invert, apply: apply, translate: translate,
    texTile: texTile, TEX_CSS: TEX_CSS, installFonts: installFonts, parseData: parseData, bindCaspar: bindCaspar, parseTable: parseTable, parseSeries: parseSeries, parseDual: parseDual, cellFields: cellFields, cellMap: cellMap, TEX_PREVIEW: TEX_PREVIEW, TEXF: TEXF, TEXP: TEXP
  };
})(typeof window !== 'undefined' ? window : this);
