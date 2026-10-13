/* CG Motion - inspector: properties of the selected layer(s) or the composition */
var Inspector = { fields: [] };

Inspector.init = function () {
  Inspector.el = $('#insp');
  App.on('sel', Inspector.build);
  App.on('project', Inspector.build);
  App.on('change', function () { if (Inspector.el.contains(UI.active())) Inspector.sync(); else Inspector.build(); });
  App.on('time', Inspector.sync);
};

/* Changes a layer's parent (and how it follows it) while keeping the layer where it is on screen.
   edge: undefined = keep the current mode, null = whole object, {h,v} = follow edges only */
Inspector.setParent = function (L, pid, edge) {
  var it = Stage.item(L.id), pit = pid && Stage.item(pid);
  L.parent = pid || '';
  if (edge !== undefined) L.pEdge = edge;
  if (!pid) { L.pEdge = null; L.pFitW = false; L.pFitH = false; }
  if (!it) return;
  var pe = L.pEdge, m;
  if (pit && pe) {
    var P = RT.apply(pit.wm, (pe.h === 'r' ? 1 : (pe.h === 'c' ? 0.5 : 0)) * pit.w, (pe.v === 'b' ? 1 : (pe.v === 'm' ? 0.5 : 0)) * pit.h);
    m = it.base.slice();
    if (pe.h) m[4] -= P[0];
    if (pe.v) m[5] -= P[1];
  } else {
    var inv = pit ? RT.invert(pit.cpm || pit.pm) : [1, 0, 0, 1, 0, 0];
    if (!inv) return;
    m = RT.mul(inv, it.base);
  }
  var sx = Math.hypot(m[0], m[1]), det = m[0] * m[3] - m[1] * m[2];
  var vals = { x: round2(m[4]), y: round2(m[5]), rot: round2(Math.atan2(m[1], m[0]) * 180 / Math.PI), sx: round2(sx * 100), sy: round2((sx ? det / sx : 0) * 100) };
  if (App.val(L, 'skx') || App.val(L, 'sky')) vals = { x: vals.x, y: vals.y };   /* a skewed layer keeps its own rotation and scale */
  for (var k in vals) if (!L.a[k]) L.p[k] = vals[k];
};

/* Pin widget: how a layer follows its parent. Centre = whole object; edge lines = follow only those edges.
   Opposite edges together (left + right) make a shape or picture stretch with the parent. */
Inspector.pinState = function (L) {
  var pe = L.pEdge;
  if (!pe) return { full: true, l: true, r: true, t: true, b: true };
  return { full: false, l: pe.h === 'l', r: pe.h === 'r' || (pe.h === 'l' && !!L.pFitW), t: pe.v === 't', b: pe.v === 'b' || (pe.v === 't' && !!L.pFitH) };
};
Inspector.pinApply = function (layers, s) {
  layers.forEach(function (x) {
    var it = Stage.item(x.id), pit = x.parent && Stage.item(x.parent);
    if (!x.parent || !it || !pit) return;
    var sized = App.isSized(x);
    var pw = Math.hypot(pit.wm[0], pit.wm[1]) * pit.w, ph = Math.hypot(pit.wm[2], pit.wm[3]) * pit.h;
    /* leaving a stretch: keep the size it has right now */
    if (x.pFitW && !x.a.w) x.p.w = Math.round(it.w);
    if (x.pFitH && !x.a.h) x.p.h = Math.round(it.h);
    if (s.full) { x.pFitW = false; x.pFitH = false; Inspector.setParent(x, x.parent, null); return; }
    var fw = sized && s.l && s.r, fh = sized && s.t && s.b;
    Inspector.setParent(x, x.parent, { h: s.l ? 'l' : (s.r ? 'r' : ''), v: s.t ? 't' : (s.b ? 'b' : '') });
    x.pFitW = fw; x.pFitH = fh;
    if (fw) x.pDW = Math.round(it.w - pw);
    if (fh) x.pDH = Math.round(it.h - ph);
  });
};
Inspector.pinRow = function (layers) {
  var L = layers[0], s = Inspector.pinState(L), sized = App.isSized(L);
  var NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'pin'); svg.setAttribute('viewBox', '0 0 68 68');
  function on(e) { return s.full || s[e] ? ' on' : ''; }
  function edge(e, x1, y1, x2, y2, hx, hy, hw, hh, tip) {
    return '<g class="pin-e' + on(e) + '" data-e="' + e + '"><title>' + tip + '</title><rect class="pin-hit" x="' + hx + '" y="' + hy + '" width="' + hw + '" height="' + hh + '"/>' +
      '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '"/></g>';
  }
  svg.innerHTML = '<rect class="pin-box" x="3" y="3" width="62" height="62" rx="3"/>' +
    edge('l', 6, 34, 24, 34, 3, 22, 22, 24, 'Follow the parent\'s left edge') +
    edge('r', 44, 34, 62, 34, 43, 22, 22, 24, 'Follow the parent\'s right edge') +
    edge('t', 34, 6, 34, 24, 22, 3, 24, 22, 'Follow the parent\'s top edge') +
    edge('b', 34, 44, 34, 62, 22, 43, 24, 22, 'Follow the parent\'s bottom edge') +
    '<g class="pin-c' + (s.full ? ' on' : '') + '" data-e="c"><title>Follow the whole parent (move, rotate, scale)</title><rect x="25" y="25" width="18" height="18" rx="2"/></g>';
  svg.addEventListener('click', function (ev) {
    var g = ev.target.closest('[data-e]');
    if (!g) return;
    var e = g.getAttribute('data-e'), n;
    if (e === 'c') n = { full: !s.full ? true : false, l: false, r: false, t: false, b: false };
    else {
      n = s.full ? { l: false, r: false, t: false, b: false } : { l: s.l, r: s.r, t: s.t, b: s.b };
      n.full = false;
      n[e] = s.full ? true : !s[e];
      if (!sized && n[e]) { if (e === 'l') n.r = false; if (e === 'r') n.l = false; if (e === 't') n.b = false; if (e === 'b') n.t = false; }
    }
    Inspector.pinApply(layers, n);
    App.commit();
    Inspector.build();
  });
  var parts = [];
  if (!s.full) { if (s.l) parts.push('left'); if (s.r) parts.push('right'); if (s.t) parts.push('top'); if (s.b) parts.push('bottom'); }
  var txt = s.full ? 'Follows the whole parent: moves, rotates and scales with it.' :
    parts.length ? 'Pinned to the parent\'s ' + parts.join(', ') + ' edge' + (parts.length > 1 ? 's' : '') + '. ' + ((s.l && s.r) || (s.t && s.b) ? 'Opposite edges make it stretch with the parent.' : 'It is pushed along when that edge moves.') :
    'Not pinned: the parent does not move this layer. Click an edge line, or the centre for the whole object.';
  return h('div', { class: 'full arow pinrow' }, [h('span', { class: 'lbl', text: 'Pin to parent' }), svg, h('span', { class: 'hint', text: txt })]);
};
/* Turns plain text into a text box without moving or resizing what is on screen. */
Inspector.toBox = function (x) {
  var it = Stage.item(x.id);
  x.box = true;
  x.valign = x.valign || 'top';
  if (x.boxWrap == null) x.boxWrap = x.wrapW > 0;
  if (x.squeeze == null) x.squeeze = x.maxW > 0;
  if (!it || it.tx) return;
  var sx = App.val(x, 'sx') / 100, sy = App.val(x, 'sy') / 100;
  var uniform = Math.abs(sx - sy) < 0.0001 && sx > 0 && !x.a.sx && !x.a.sy && !x.a.fontSize;
  var w0 = (x.wrapW > 0 ? x.wrapW : it.w * it.fit), h0 = it.h, ax = App.val(x, 'ax') + it.alignOff * it.fit, ay = App.val(x, 'ay');
  if (uniform && sx !== 1) {
    /* fold the scale into the font size so the box can own the scale from here on */
    x.p.fontSize = round2(App.val(x, 'fontSize') * sx);
    if (!x.a.tracking) x.p.tracking = round2(App.val(x, 'tracking') * sx);
    ['padL', 'padR', 'padT', 'padB'].forEach(function (k) { if (x[k]) x[k] = round2(x[k] * sx); });
    x.p.sx = 100; x.p.sy = 100;
    w0 *= sx; h0 *= sx; ax *= sx; ay *= sx;
  } else if (!uniform) x.boxScale = false;
  if (!x.a.w) x.p.w = Math.max(10, Math.ceil(w0) + 1);
  if (!x.a.h) x.p.h = Math.max(10, Math.ceil(h0));
  if (!x.a.ax) x.p.ax = round2(ax);
  if (!x.a.ay) x.p.ay = round2(ay);
};
/* fonts to choose from: the project's own fonts first, then common system fonts */
Inspector.fontList = function (L) {
  var fonts = [];
  for (var id in App.project.assets) if (App.project.assets[id].type === 'font') fonts.push(App.project.assets[id].family);
  fonts.sort(natCmp);
  ['Arial', 'Segoe UI', 'Verdana', 'Tahoma', 'Georgia', 'Times New Roman', 'Courier New', 'Impact'].forEach(function (f) { if (fonts.indexOf(f) < 0) fonts.push(f); });
  if (L && L.font && fonts.indexOf(L.font) < 0) fonts.unshift(L.font);
  return fonts;
};
/* Text styles: the text is split at an invisible separator and every part gets its own look,
   e.g. "John|Smith|C" -> thin italic John, bold SMITH, a small raised (C) */
Inspector.STYLE_PRESETS = {
  captain: { label: 'Name SURNAME (C)', sep: '|', join: ' ', segs: [{ weight: 300, italic: 'on' }, { weight: 700, caps: 'upper', italic: 'off' }, { weight: 700, size: 55, raise: 35, before: '(', after: ')', italic: 'off' }],
    hint: 'Send "John|Smith|C" for the captain, "John|Smith" for anyone else.' },
  label: { label: 'LABEL  value', sep: '^', join: '  ', segs: [{ weight: 700, caps: 'upper', color: '#00ff83' }, { weight: 400 }], hint: 'Send "SPORT^Proteas win by 5 wickets".' },
  score: { label: 'Big number + small unit', sep: '|', join: '', segs: [{ weight: 700 }, { size: 50, weight: 400 }], hint: 'Send "238|/4".' }
};
Inspector.stylesEditor = function (L, each, attr, fonts, extraHint) {
  function row(kids) { return h('div', { class: 'grid' }, kids); }
  function bt(text, fn, title, cls) { return h('button', { text: text, title: title || '', class: cls || '', onclick: function () { fn(); App.commit(); Inspector.build(); } }); }
  var st = L.styles, on = !!(st && st.on), wrap = h('div', { class: 'styles-ed' });
  wrap.appendChild(h('div', { class: 'sub', text: 'Text styles' }));
  wrap.appendChild(h('div', { class: 'full' }, [attr('Style the parts of the text separately', 'check', function () { return on; }, function (v) {
    each(function (x) { x.styles = x.styles || { sep: '|', join: ' ', segs: [{}, { weight: 700 }] }; x.styles.on = v; delete x.split; });
  })]));
  if (!on) return wrap;
  function sa(label, key, type, o) { return attr(label, type, function () { var v = L.styles[key]; return v == null ? '' : v; }, function (v) { each(function (x) { if (x.styles) x.styles[key] = v; }); }, o); }
  wrap.appendChild(row([sa('Separator', 'sep', 'text'), sa('Joined with', 'join', 'text', { placeholder: 'nothing' })]));
  wrap.appendChild(h('div', { class: 'pbar' }, [h('span', { class: 'hint', text: 'Presets:' })].concat(Object.keys(Inspector.STYLE_PRESETS).map(function (k) {
    var pr = Inspector.STYLE_PRESETS[k];
    return bt(pr.label, function () { each(function (x) { x.styles = { on: true, sep: pr.sep, join: pr.join, segs: JSON.parse(JSON.stringify(pr.segs)) }; delete x.split; }); }, pr.hint);
  }))));
  var segs = st.segs || (st.segs = [{}]);
  segs.forEach(function (sg, si) {
    function ga(label, key, type, o) {
      return attr(label, type, function () { var v = sg[key]; return v == null ? '' : v; }, function (v) {
        each(function (x) { if (!x.styles) return; var q = x.styles.segs[si] || (x.styles.segs[si] = {}); if (v === '' || v == null) delete q[key]; else q[key] = (type === 'number') ? +v : v; });
      }, o);
    }
    var card = h('div', { class: 'card seg-card' }, [
      h('div', { class: 'seg-h' }, [h('b', { text: 'Part ' + (si + 1) + (si === segs.length - 1 && segs.length > 1 ? ' (and any after it)' : '') }), h('span', { class: 'grow' }),
        segs.length > 1 ? bt('×', function () { each(function (x) { if (x.styles && x.styles.segs.length > 1) x.styles.segs.splice(si, 1); }); }, 'Remove this part') : null]),
      h('div', { class: 'full' }, [ga('Font', 'font', 'select', { options: [['', 'Same as the layer']].concat(fonts.map(function (f) { return [f, f]; })) })]),
      row([ga('Weight', 'weight', 'select', { options: [['', 'Same'], [100, 'Thin'], [300, 'Light'], [400, 'Regular'], [500, 'Medium'], [600, 'Semi-bold'], [700, 'Bold'], [900, 'Black']] }),
        ga('Italic', 'italic', 'select', { options: [['', 'Same'], ['on', 'Italic'], ['off', 'Upright']] }),
        ga('Case', 'caps', 'select', { options: [['', 'Same'], ['upper', 'CAPS'], ['lower', 'lower'], ['none', 'As typed']] })]),
      row([ga('Size %', 'size', 'number', { placeholder: '100' }), ga('Raise %', 'raise', 'number', { placeholder: '0' }), ga('Spacing', 'track', 'number', { placeholder: 'same' })]),
      row([ga('Colour', 'color', 'text', { placeholder: 'same' }), ga('Before', 'before', 'text'), ga('After', 'after', 'text')])
    ]);
    wrap.appendChild(card);
  });
  wrap.appendChild(h('div', { class: 'pbar' }, [bt('+ Add part', function () { each(function (x) { if (x.styles) x.styles.segs.push({}); }); })]));
  var ex = segs.map(function (sg, i) { return ['John', 'Smith', 'C', 'more'][i] || ('part' + (i + 1)); }).join(st.sep || '|');
  wrap.appendChild(h('p', { class: 'hint', text: 'Send "' + ex + '": the separator is not shown, each part gets its style, and parts that are left empty are skipped (with the space before them). Raise lifts a part (superscript), Before / After add text around it, e.g. ( and ) around C. ' + (extraHint || '') }));
  return wrap;
};
/* the texture presets saved on this PC (shared by every project) */
Inspector.texLibrary = function (set) {
  try {
    if (set) { localStorage.setItem('cgm.texPresets', JSON.stringify(set)); return set; }
    return JSON.parse(localStorage.getItem('cgm.texPresets') || '{}') || {};
  } catch (e) { return set || {}; }
};
Inspector.texSnapshot = function (L) {
  var t = {}, k, p = {};
  for (k in (L.tex || {})) if (k !== 'masks' && k !== 'cgKey' && k !== 'on') t[k] = L.tex[k];
  ['texOp', 'texX', 'texY', 'texSc', 'texRot', 'texBr', 'texCt', 'texBlur', 'texHue', 'texSat'].forEach(function (n) { if (L.p[n] != null) p[n] = L.p[n]; });
  return JSON.parse(JSON.stringify({ tex: t, p: p }));
};
Inspector.applyTexPreset = function (each, name, ps) {
  ps = JSON.parse(JSON.stringify(ps));
  each(function (x) {
    var keep = x.tex || {}, t = { on: true, masks: keep.masks, cgKey: keep.cgKey }, k;
    for (k in ps.tex) t[k] = ps.tex[k];
    if (!t.masks) delete t.masks; if (!t.cgKey) delete t.cgKey;
    x.tex = t;
    for (k in (ps.p || {})) { if (!x.a[k]) x.p[k] = ps.p[k]; }
  });
  (App.project.texPresets = App.project.texPresets || {})[name] = ps;
};
Inspector.nextKey = function () {
  var used = {}, i = 0;
  App.allLayers(function (L) { if (L.key) used[L.key] = 1; (L.bindings || []).forEach(function (b) { if (b.key) used[b.key] = 1; }); for (var q in (L.bind || {})) if (L.bind[q].key) used[L.bind[q].key] = 1; });
  (App.project.swatches || []).forEach(function (s) { if (s.key) used[s.key] = 1; });
  while (used['f' + i]) i++;
  return 'f' + i;
};

Inspector.build = function () {
  if (!App.project) return;
  var root = Inspector.el, layers = App.selLayers(), L = layers[0], c = App.comp();
  Inspector.fields = [];
  root.innerHTML = '';
  function each(fn) { layers.forEach(fn); }
  /* sections fold away when their title is clicked, and stay folded */
  function section(title, kids, extra) {
    var key = String(title).replace(/^\d+ layers$/, 'layers').replace(/^(Text|Shape|Image|Sequence|Lottie|Comp|Null) layer$/, 'layer');
    var shut = !!(App.ui.collapsed || {})[key];
    var th = h('div', { class: 'sec-t', title: 'Click to fold or unfold' }, [title].concat(extra || []));
    th.addEventListener('click', function () {
      App.ui.collapsed = App.ui.collapsed || {};
      App.ui.collapsed[key] = !shut;
      try { localStorage.setItem('cgm.ui', JSON.stringify({ collapsed: App.ui.collapsed })); } catch (e) {}
      Inspector.build();
    });
    root.appendChild(h('div', { class: 'sec' + (shut ? ' shut' : '') }, [th].concat(shut ? [] : kids)));
  }
  function grid(kids) { return h('div', { class: 'grid' }, kids); }
  function full(kids) { return h('div', { class: 'full' }, kids); }

  function num(prop, label, o) {
    o = o || {};
    var inp = h('input', { type: 'number', step: o.step || 1 }), sw = h('span', { class: 'sw', title: 'Animate this property (adds keyframes)' });
    var lab = h('label', { class: 'scrub', text: label, title: LABELS[prop] + ' - drag to scrub' });
    function set(v, live) {
      if (isNaN(v)) return;
      if (o.min != null) v = Math.max(o.min, v);
      if (o.max != null) v = Math.min(o.max, v);
      each(function (x) { App.setProp(x, prop, v); });
      if (live) App.touch(); else App.commit();
    }
    inp.addEventListener('input', function () { set(parseFloat(inp.value), true); });
    inp.addEventListener('change', function () { set(parseFloat(inp.value)); });
    sw.addEventListener('click', function () { each(function (x) { App.toggleAnim(x, prop); }); App.commit(); Inspector.sync(); });
    lab.addEventListener('mousedown', function (e) {
      e.preventDefault();
      var x0 = e.clientX, v0 = App.val(L, prop), st = o.step || 1, moved = false;
      dragLoop(function (ev) { moved = true; var v = round2(v0 + (ev.clientX - x0) * st); inp.value = v; set(v, true); }, function () { if (moved) App.commit(); });
    });
    Inspector.fields.push({ el: inp, sw: sw, prop: prop, get: function () { return round2(App.val(L, prop)); } });
    return h('div', { class: 'f' }, [sw, lab, inp]);
  }
  function color(prop, label) {
    var cp = UI.colorParts(function (live) { set(live); });
    var sw = h('span', { class: 'sw', title: 'Animate this property' });
    var sws = App.project.swatches || [];
    var lk = h('select', { class: 'swl', title: 'Link this colour to a shared colour from the Colours tab. Change the shared colour and every linked layer follows.' });
    lk.appendChild(h('option', { value: '', text: 'Own colour' }));
    sws.forEach(function (s) { lk.appendChild(h('option', { value: s.id, text: s.name })); });
    lk.addEventListener('change', function () {
      var v = lk.value;
      each(function (x) {
        x.link = x.link || {};
        if (v) x.link[prop] = v;
        else { var cur = App.val(x, prop); delete x.link[prop]; if (!x.a[prop]) x.p[prop] = cur; }
      });
      lk.blur(); App.commit();
    });
    Inspector.fields.push({ el: lk, get: function () { return (L.link && L.link[prop]) || ''; } });
    function set(live) {
      var v = cp.get();
      var linked = L.link && L.link[prop], sw = linked && sws.filter(function (s) { return s.id === linked; })[0];
      if (sw) sw.color = v;
      else each(function (x) { App.setProp(x, prop, v); });
      if (live) App.touch(); else App.commit();
    }
    sw.addEventListener('click', function () { each(function (x) { App.toggleAnim(x, prop); }); App.commit(); Inspector.sync(); });
    Inspector.fields.push({ el: cp.chip, sw: sw, prop: prop, get: function () { return String(App.val(L, prop)); }, apply: cp.show });
    return h('div', { class: 'f col' }, [sw, h('label', { text: label }), cp.chip, cp.hex, cp.al, sws.length ? lk : null]);
  }
  /* plain (non-animated) attribute stored directly on the layer or another object */
  function attr(label, type, get, set, o) {
    o = o || {};
    var inp;
    if (type === 'select') {
      inp = h('select');
      o.options.forEach(function (op) { inp.appendChild(h('option', { value: op[0], text: op[1] })); });
    } else if (type === 'check') inp = h('input', { type: 'checkbox' });
    else if (type === 'textarea') inp = h('textarea', { rows: 3, spellcheck: 'false' });
    else inp = h('input', { type: type, step: o.step || 1, placeholder: o.placeholder || '' });
    function read() { return type === 'check' ? inp.checked : (type === 'number' ? parseFloat(inp.value) : inp.value); }
    if (type === 'textarea' || o.live) inp.addEventListener('input', function () { set(read()); App.touch(); });
    inp.addEventListener('change', function () {
      var v = read();
      if (type === 'number' && isNaN(v)) return;
      set(v);
      if (type === 'select' || type === 'check') inp.blur();
      App.commit();
    });
    Inspector.fields.push({ el: inp, check: type === 'check', get: get });
    if (type === 'check') return h('div', { class: 'f chk' }, [h('label', {}, [inp, ' ' + label])]);
    return h('div', { class: 'f' + (type === 'textarea' ? ' ta' : '') }, [h('label', { text: label }), inp]);
  }
  function la(name, label, type, o) {
    return attr(label, type, function () { var v = L[name]; return v == null ? (type === 'check' ? false : '') : v; }, function (v) { each(function (x) { x[name] = v; }); }, o);
  }
  /* a row of icon buttons that sets one attribute, like the alignment buttons in a word processor */
  function icons(name, opts, attrName) {
    var g = h('span', { class: 'igrp' });
    opts.forEach(function (o) {
      var b = h('button', { title: o[2], html: o[1] });
      b.setAttribute('data-' + attrName, o[0]);
      b.addEventListener('click', function () { each(function (x) { x[name] = o[0]; }); b.blur(); App.commit(); Inspector.build(); });
      if (String(L[name] == null ? opts[0][0] : L[name]) === String(o[0])) b.classList.add('on');
      g.appendChild(b);
    });
    return g;
  }
  function toggle(name, html, title, cls, onVal, offVal) {
    var isOn = onVal === undefined ? !!L[name] : String(L[name]) === String(onVal);
    var b = h('button', { title: title, html: html, class: cls + (isOn ? ' on' : '') });
    b.setAttribute('data-tg', name);
    b.addEventListener('click', function () { each(function (x) { x[name] = onVal === undefined ? !isOn : (isOn ? offVal : onVal); }); b.blur(); App.commit(); Inspector.build(); });
    return b;
  }
  function lines(ws, mode) {
    return '<svg viewBox="0 0 16 16">' + ws.map(function (w, i) { var x = mode === 'c' ? (16 - w) / 2 : (mode === 'r' ? 15 - w : 1); return '<line x1="' + x + '" y1="' + (2.5 + i * 3.7) + '" x2="' + (x + w) + '" y2="' + (2.5 + i * 3.7) + '"/>'; }).join('') + '</svg>';
  }
  function vicon(y) { return '<svg viewBox="0 0 16 16"><line x1="1" y1="' + (y === 0 ? 1.5 : (y === 1 ? 8 : 14.5)) + '" x2="15" y2="' + (y === 0 ? 1.5 : (y === 1 ? 8 : 14.5)) + '" stroke-width="2.2"/>' +
    [0, 1].map(function (i) { var yy = y === 0 ? 5.5 + i * 3.6 : (y === 1 ? (i ? 12 : 4) : 6.9 + i * 3.6); return '<line x1="4" y1="' + yy + '" x2="12" y2="' + yy + '"/>'; }).join('') + '</svg>'; }
  function btn(text, fn, title) { return h('button', { text: text, title: title || '', onclick: fn }); }

  /* ----- nothing selected: composition settings ----- */
  if (!L) {
    function ca(name, label, type, o) {
      return attr(label, type, function () { return c[name]; }, function (v) {
        if (type === 'number') v = Math.max(1, Math.round(v));
        c[name] = v;
      }, o);
    }
    if (c.note) section('About this composition', [h('p', { class: 'comp-note', text: c.note })]);
    section('Composition', [
      full([ca('name', 'Name', 'text')]),
      grid([ca('w', 'Width', 'number'), ca('h', 'Height', 'number'), ca('fps', 'FPS', 'number'), ca('duration', 'Frames', 'number')]),
      full([h('div', { class: 'f' }, [h('label', { text: 'Preview backdrop' }), (function () {
        var ci = h('input', { type: 'color', value: (c.bg || '#1e1e1e').slice(0, 7) });
        ci.addEventListener('input', function () { c.bg = ci.value; App.touch(); });
        ci.addEventListener('change', function () { App.commit(); });
        return ci;
      })(), btn('Clear', function () { c.bg = ''; App.commit(); }, 'Transparent backdrop')])]),
      h('p', { class: 'hint', text: 'The backdrop is only for previewing here. Exported templates are always transparent.' }),
      full([ca('outReverse', 'Stop plays the animation backwards', 'check')]),
      grid([attr('Motion blur shutter (°)', 'number', function () { return c.shutter == null ? 180 : c.shutter; }, function (v) { c.shutter = Math.max(0, Math.min(720, Math.round(v))); })]),
      h('p', { class: 'hint', text: '180° is the film look; 360° doubles the smear, 90° halves it. Only layers with Motion blur ticked are blurred.' })
    ]);
    section('Project', [
      full([attr('Project name', 'text', function () { return App.project.name; }, function (v) { App.project.name = v || 'Untitled'; })]),
      full([attr('Export folder', 'text', function () { return App.project.exportFolder || ''; }, function (v) { App.project.exportFolder = v.trim(); })]),
      full([btn('Browse for export folder...', function () { Api.pickFolder().then(function (f) { if (f) { App.project.exportFolder = f; App.commit(); Inspector.build(); } }); })]),
      h('p', { class: 'hint', text: 'Export template writes the composition you have open into this folder as "' + IO.safeName() + '.html". Each composition is its own template, named after the composition.' }),
      full([attr('New keyframes use', 'select', function () { var e = App.project.defaultEase || {}; return e.type === 'preset' ? e.id : (e.type || 'linear'); }, function (v) {
        App.project.defaultEase = (v === 'linear' || v === 'hold') ? { type: v } : { type: 'preset', id: v };
      }, { options: [['linear', 'Linear'], ['hold', 'Hold']].concat(App.project.easings.map(function (e) { return [e.id, e.name]; })) })]),
      h('p', { class: 'hint', text: 'Select a layer to edit it. Use the tools above the viewer to add text and shapes, or add images, sequences and Lottie files from the Assets tab.' })
    ]);
    Inspector.sync();
    return;
  }

  /* ----- layer ----- */
  var others = c.layers.filter(function (o) { return layers.indexOf(o) < 0; }).map(function (o) { return [o.id, o.name]; });
  section(layers.length > 1 ? layers.length + ' layers' : TYPE_NAMES[L.type] + ' layer', [
    full([la('name', 'Name', 'text')]),
    grid([la('start', 'In', 'number'), la('end', 'Out', 'number')]),
    full([attr('Parent', 'select', function () { return L.parent || ''; }, function (v) { each(function (x) { if (x.id !== v) Inspector.setParent(x, v); }); }, { options: [['', 'None']].concat(others) })]),
    L.parent ? Inspector.pinRow(layers) : null,
    full([la('blend', 'Blend', 'select', { options: ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion'].map(function (b) { return [b, b]; }) })])
  ]);

  var usedBy = c.layers.filter(function (o) { return RT.matteSpecs(o).some(function (q) { return q.id === L.id; }) || (o.tex && o.tex.on && (o.tex.masks || []).some(function (q) { return q.id === L.id; })); });
  if (usedBy.length) section('This layer is a mask', [
    h('p', { class: 'hint', text: 'It shapes: ' + usedBy.map(function (o) { return o.name; }).join(', ') + '. It is hidden itself unless you tick the box below. Its outline shows in orange while the masked layer is selected.' }),
    full([la('matteShow', 'Keep this layer visible as well', 'check')])
  ]);
  section('Matte (use another layer as a mask)', [
    full([attr('Mask with', 'select', function () { return L.matte || ''; }, function (v) { each(function (x) { x.matte = x.id === v ? '' : v; }); }, { options: [['', 'None']].concat(others) })]),
    L.matte ? full([la('matteMode', 'Mode', 'select', { options: [['alpha', 'Alpha - show where the mask layer is'], ['alphaInv', 'Alpha inverted - hide where it is'], ['luma', 'Luma - white shows, black hides'], ['lumaInv', 'Luma inverted']] })]) : null,
    L.matte ? h('p', { class: 'hint', text: 'The mask layer itself is hidden and only shapes this layer. Animate the mask layer for wipes and reveals.' }) : null,
    L.matte ? h('div', { class: 'sub', text: 'More shapes in this mask' }) : null
  ].concat(!L.matte ? [] : (L.matteMore || []).map(function (m, mi) {
    var os = h('select', { class: 'mop', title: 'How this layer changes the mask' }), ls = h('select');
    [['add', 'Add'], ['sub', 'Subtract'], ['int', 'Intersect']].forEach(function (o) { os.appendChild(h('option', { value: o[0], text: o[1] })); });
    others.forEach(function (o) { ls.appendChild(h('option', { value: o[0], text: o[1] })); });
    os.value = m.op || 'add'; ls.value = m.id;
    os.addEventListener('change', function () { m.op = os.value; os.blur(); App.commit(); });
    ls.addEventListener('change', function () { m.id = ls.value; ls.blur(); App.commit(); });
    return h('div', { class: 'f' }, [os, ls, btn('\u00D7', function () { L.matteMore.splice(mi, 1); App.commit(); Inspector.build(); }, 'Remove from the mask')]);
  }), !L.matte ? [] : [
    full([btn('+ Add another layer to the mask', function () {
      var used = [L.matte].concat((L.matteMore || []).map(function (m) { return m.id; })), free = others.filter(function (o) { return used.indexOf(o[0]) < 0; })[0];
      if (!free) { UI.status('There is no other layer left to add.'); return; }
      (L.matteMore = L.matteMore || []).push({ id: free[0], op: 'add' });
      App.commit(); Inspector.build();
    })]),
    (L.matteMore && L.matteMore.length) ? h('p', { class: 'hint', text: 'Combined masks use alpha (luma is ignored). The Nodes button under the viewer shows all of this as a diagram.' }) : null
  ]));

  var anchorGrid = h('div', { class: 'agrid', title: 'Move the anchor point without moving the layer' });
  [0, 0.5, 1].forEach(function (fy) { [0, 0.5, 1].forEach(function (fx) {
    anchorGrid.appendChild(h('i', { onclick: function () {
      each(function (x) {
        var it = Stage.item(x.id); if (!it) return;
        var kx = it.kx || 1, ky = it.ky || 1, nax = (fx * it.w - it.alignOff) * it.fit / kx, nay = fy * it.h / ky, oax = App.val(x, 'ax'), oay = App.val(x, 'ay');
        var dx = (nax - oax) * kx, dy = (nay - oay) * ky, b = it.base, pi = Stage.parentInv(x);
        var wx = b[0] * dx + b[2] * dy, wy = b[1] * dx + b[3] * dy;   /* shift in comp space, then into the parent's space */
        App.setProp(x, 'ax', round2(nax)); App.setProp(x, 'ay', round2(nay));
        App.setProp(x, 'x', round2(App.val(x, 'x') + pi[0] * wx + pi[2] * wy));
        App.setProp(x, 'y', round2(App.val(x, 'y') + pi[1] * wx + pi[3] * wy));
      });
      App.commit();
    } }));
  }); });
  section('Transform', [
    grid([num('x', 'X'), num('y', 'Y'), num('sx', 'Scale X'), num('sy', 'Scale Y'), num('rot', 'Rotation'), num('op', 'Opacity', { min: 0, max: 100 }), num('skx', 'Skew X', { min: -89, max: 89 }), num('sky', 'Skew Y', { min: -89, max: 89 }), num('ax', 'Anchor X'), num('ay', 'Anchor Y')]),
    h('div', { class: 'full arow' }, [h('span', { class: 'lbl', text: 'Anchor preset' }), anchorGrid])
  ]);

  if (L.type === 'text') {
    var fonts = [];
    for (var id in App.project.assets) if (App.project.assets[id].type === 'font') fonts.push(App.project.assets[id].family);
    fonts.sort(natCmp);
    ['Arial', 'Segoe UI', 'Verdana', 'Tahoma', 'Georgia', 'Times New Roman', 'Courier New', 'Impact'].forEach(function (f) { if (fonts.indexOf(f) < 0) fonts.push(f); });
    if (L.font && fonts.indexOf(L.font) < 0) fonts.unshift(L.font);
    var keyRow = [attr('Editable from CasparCG', 'check', function () { return !!L.key; }, function (v) { each(function (x) { x.key = v ? (x.key || Inspector.nextKey()) : ''; }); })];
    if (L.key) keyRow.push(la('key', 'Field name', 'text'));
    section('Text', [
      full([la('text', 'Text', 'textarea')]),
      full(keyRow),
      full([la('font', 'Font', 'select', { options: fonts.map(function (f) { return [f, f]; }) })]),
      full([color('color', 'Colour')]),
      grid([num('fontSize', 'Size', { min: 1 }), num('tracking', 'Spacing', { step: 0.5 }), num('lineHeight', 'Line H', { step: 0.01 })]),
      h('div', { class: 'ibar' }, [
        icons('align', [['left', lines([14, 9, 14, 7], 'l'), 'Align left'], ['center', lines([14, 9, 14, 7], 'c'), 'Centre'], ['right', lines([14, 9, 14, 7], 'r'), 'Align right']].concat(L.box ? [['justify', lines([14, 14, 14, 14], 'l'), 'Justify']] : []), 'al'),
        L.box ? icons('valign', [['top', vicon(0), 'Align to the top of the box'], ['middle', vicon(1), 'Centre vertically in the box'], ['bottom', vicon(2), 'Align to the bottom of the box']], 'va') : null,
        h('span', { class: 'igrp' }, [toggle('weight', 'B', 'Bold', 'tb', 700, 400), toggle('italic', 'I', 'Italic', 'ti')])
      ]),
      full([attr('Convert case', 'select', function () { return L.upper ? 'upper' : (L.tcase === 'lower' || L.tcase === 'title' ? L.tcase : 'none'); }, function (v) {
        each(function (x) { if (x.type !== 'text') return; x.upper = v === 'upper'; x.tcase = v; });
      }, { options: [['none', 'As typed'], ['upper', 'ALL CAPS'], ['lower', 'lowercase'], ['title', 'Capitalise Each Word']] })]),
      full([la('weight', 'Weight', 'select', { options: [[400, 'Regular'], [500, 'Medium'], [600, 'Semi-bold'], [700, 'Bold'], [900, 'Black'], [300, 'Light']] })]),
      full([attr('Text box (fixed size, text laid out inside)', 'check', function () { return !!L.box; }, function (v) {
        each(function (x) { if (x.type !== 'text') return; if (v && !x.box) Inspector.toBox(x); else x.box = v; });
      })]),
      L.box ? grid([num('w', 'Box W', { min: 1 }), num('h', 'Box H', { min: 1 }),
        la('clip', 'Clip to box', 'check')]) : null,
      L.box ? full([attr('Wrap text onto new lines', 'check', function () { return L.boxWrap !== false; }, function (v) { each(function (x) { x.boxWrap = v; }); }),
        L.boxWrap === false ? la('squeeze', 'Squeeze long text to fit the width', 'check') : null]) : null,
      (L.box && L.boxWrap !== false) ? full([la('fitBox', 'Shrink the text until every line fits the box', 'check')]) : null,
      full([attr('Line break code', 'text', function () { return L.lineBreak == null ? '\\n' : L.lineBreak; }, function (v) { each(function (x) { x.lineBreak = v; }); }, { placeholder: 'none' })]),
      h('p', { class: 'hint', text: 'Type Enter in the text, or send the line break code in the CasparCG field (\\n by default), to start a new line.' }),
      L.box ? full([attr('Scale resizes the box (text keeps its size)', 'check', function () { return L.boxScale !== false; }, function (v) { each(function (x) { x.boxScale = v; }); })]) : null,
      L.box ? h('p', { class: 'hint', text: 'Drag the handles in the viewer to resize the box; the text keeps its size and is aligned inside it (Align and Vertical). Margins below are the inner padding.' }) : null,
      L.box ? null : grid([la('maxW', 'Fit width', 'number'), la('wrapW', 'Wrap width', 'number')]),
      h('div', { class: 'sub', text: 'Background' }),
      full([color('bg', 'Fill')]),
      full([color('stroke', 'Outline')]),
      grid([num('strokeW', 'Outline W', { min: 0 }), num('radius', 'Corners', { min: 0 })]),
      h('div', { class: 'sub', text: 'Margins' }),
      grid([la('padL', 'Left', 'number'), la('padR', 'Right', 'number'), la('padT', 'Top', 'number'), la('padB', 'Bottom', 'number')]),
      Inspector.stylesEditor(L, each, attr, fonts),
      L.box ? null : h('p', { class: 'hint', text: 'Fit width: long text is squeezed to stay inside this many pixels (0 = off). Wrap width: text wraps onto new lines instead.' })
    ]);
  }
  if ((L.type === 'table' || L.type === 'chart' || L.type === 'crawl') && layers.length === 1) {
    section('Data', [h('div', { class: 'pbar' }, [h('button', { class: 'primary', text: 'Edit in the Data panel', title: 'A grid to add and remove rows, columns, series and items without typing the text format', onclick: function () { Dock.show('data'); Panels.build(); } })]),
      h('p', { class: 'hint', text: 'Opens a grid beside the timeline. You can also type the data in the box below.' })]);
  }
  if (L.type === 'table' || L.type === 'chart' || L.type === 'crawl') {
    var fl = Inspector.fontList(L);
    var keyRow2 = [attr('Filled from CasparCG', 'check', function () { return !!L.key; }, function (v) { each(function (x) { x.key = v ? (x.key || Inspector.nextKey()) : ''; }); })];
    if (L.key) keyRow2.push(la('key', 'Field name', 'text'));
    var cellRow = L.key ? full([attr('Every cell as its own field too', 'check', function () { return L.cells !== false; }, function (v) { each(function (x) { x.cells = v; }); }),
      h('span', { class: 'hint', text: L.type === 'table' ? L.key + '_r1c2 = row 1, cell 2' : (L.type === 'crawl' ? L.key + '_i2 = item 2' : (L.chart === 'dual' ? L.key + '_a1 / _b1 = stat 1' : L.key + '_v1 = series 1 values')) })]) : null;
    var typeRows = [
      full([la('font', 'Font', 'select', { options: fl.map(function (f) { return [f, f]; }) })]),
      grid([la('weight', 'Weight', 'select', { options: [[400, 'Regular'], [300, 'Light'], [500, 'Medium'], [600, 'Semi-bold'], [700, 'Bold'], [900, 'Black']] }), num('fontSize', 'Size', { min: 1 })]),
      full([color('color', 'Text')])
    ];
    if (L.type === 'table') {
      section('Table', [
        full([la('rows', 'Rows', 'textarea')]),
        h('p', { class: 'hint', text: 'One row per line, cells split by | (or paste straight from Excel). JSON also works: [["Pos","Team"],["1","Proteas"]]. Rows share the box height; resize the box to space them.' }),
        full(keyRow2), cellRow,
        grid([la('cellSep', 'Cell split', 'text', { placeholder: 'auto' }), la('rowSep', 'Row split', 'text', { placeholder: 'new line' })]),
        full([la('cols', 'Column widths', 'text', { placeholder: 'e.g. 1,4,1,1' })]),
        full([la('aligns', 'Column alignment', 'text', { placeholder: 'l,c,r per column' })]),
        grid([la('padX', 'Cell margin', 'number', { placeholder: '12' }), la('firstBold', 'First column bold', 'check')]),
        h('div', { class: 'sub', text: 'Look' })
      ].concat(typeRows, [
        full([la('upper', 'All capitals', 'check')]),
        full([la('header', 'First row is a header', 'check')]),
        L.header ? full([color('bg', 'Header fill')]) : null,
        L.header ? full([la('headColor', 'Header text colour', 'text', { placeholder: '#RRGGBB (blank = same)' })]) : null,
        full([color('fill', 'Row fill')]),
        full([color('fill2', 'Alternate row')]),
        full([color('stroke', 'Row lines')]),
        grid([num('strokeW', 'Line W', { min: 0 })]),
        h('div', { class: 'sub', text: 'Rows come in' }),
        grid([la('reveal', 'Style', 'select', { options: [['none', 'All at once'], ['fade', 'Fade, one by one'], ['slide', 'Slide in, one by one'], ['drop', 'Drop in, one by one']] }),
          la('stagger', 'Frames apart', 'number'), la('revealDur', 'Frames each', 'number')]),
        h('p', { class: 'hint', text: 'Rows start coming in at the layer\'s In frame.' }),
        Inspector.stylesEditor(L, each, attr, fl, 'Cells can style their parts too, with a separator that is not the cell split (for example ^).')
      ]));
    } else if (L.type === 'chart') {
      var ct = L.chart || 'line', pieish = ct === 'pie' || ct === 'donut' || ct === 'hbar';
      section('Chart', [
        full([la('chart', 'Type', 'select', { options: [['line', 'Line (worm)'], ['bar', 'Bars (manhattan)'], ['hbar', 'Horizontal bars (votes, stats)'], ['dual', 'Double bars (stat comparison)'], ['pie', 'Pie'], ['donut', 'Donut']] })]),
        full([la('data', 'Data', 'textarea')]),
        h('p', { class: 'hint', text: ct === 'dual' ? 'First line: the two names, "Proteas | Australia". Then one stat per line: "Fours: 22 | 18", "Possession: 54% | 46%". Units are kept and count up with the animation.' : (pieish ? 'One item per line: "Yes: 62". Colours follow the order of the items.' : 'One series per line: "Proteas: 4, 8, 3, 12w". Add w to a value for a wicket in that over (ww = two). JSON also works.') }),
        full(keyRow2), cellRow
      ].concat(typeRows, [
        full([la('colors', 'Colours', 'text', { placeholder: '#00ff83, #3b9dff, ... (blank = defaults)' })]),
        full([color('bg', 'Background')]),
        grid([la('pad', 'Inner margin', 'number', { placeholder: '0' })]),
        ct === 'line' ? full([la('cumul', 'Add up the values (worm: runs per over become the total)', 'check')]) : null,
        ct === 'line' ? grid([num('strokeW', 'Line W', { min: 1 }), la('points', 'Dots on points', 'check'), la('area', 'Fill under', 'check')]) : null,
        (ct === 'bar' || ct === 'hbar') ? grid([la('barGap', 'Gap %', 'number', { placeholder: ct === 'bar' ? '25' : '30' }), la('barRadius', 'Corners', 'number')]) : null,
        ct === 'hbar' ? full([la('suffix', 'After values', 'text', { placeholder: 'e.g. %' })]) : null,
        ct === 'dual' ? full([la('split2', 'One split bar per stat (each side\'s share, like possession)', 'check')]) : null,
        ct === 'dual' ? grid([attr('Highlight the leader', 'check', function () { return L.leadBold !== false; }, function (v) { each(function (x) { x.leadBold = v; }); }), la('barRadius', 'Corners', 'number'), la('gridColor', 'Track colour', 'text', { placeholder: '#ffffff22' })]) : null,
        (ct === 'pie' || ct === 'donut') ? grid([la('pieLabels', 'Labels', 'select', { options: [['percent', 'Percent'], ['value', 'Value'], ['label', 'Name + percent'], ['outside', 'Outside'], ['none', 'None']] }),
          ct === 'donut' ? la('hole', 'Hole %', 'number', { placeholder: '55' }) : la('gap', 'Slice gap', 'number')]) : null,
        (ct === 'pie' || ct === 'donut') ? full([la('labelColor', 'Label colour', 'text', { placeholder: '#111111' })]) : null,
        (ct === 'line' || ct === 'bar') ? grid([la('axes', 'Axes', 'check'), la('grid', 'Grid', 'check'), la('legend', 'Legend', 'check')]) : (ct === 'dual' ? null : full([la('legend', 'Legend', 'check')])),
        (ct === 'line' || ct === 'bar') ? grid([la('ymax', 'Scale max', 'number', { placeholder: 'auto' }), la('ysteps', 'Grid lines', 'number', { placeholder: '4' }), la('xStart', 'First label', 'number', { placeholder: 'auto' }), la('xEvery', 'Label every', 'number', { placeholder: 'auto' })]) : null,
        (ct === 'line' || ct === 'bar') ? grid([la('gridColor', 'Grid colour', 'text', { placeholder: '#ffffff33' }), la('markColor', 'Wicket colour', 'text', { placeholder: '#ff4d4d' })]) : null,
        h('div', { class: 'sub', text: 'Animation' }),
        grid([la('anim', 'Draws on over (frames)', 'number', { placeholder: '0 = off' }), num('prog', 'Progress %', { min: 0 })]),
        h('p', { class: 'hint', text: 'The chart draws on from the layer\'s In frame over this many frames (lines grow, bars rise, pies sweep). Or keyframe Progress yourself.' })
      ]));
    } else {
      var imgs = [['', 'None (use the text below)']];
      for (var sid in App.project.assets) if (App.project.assets[sid].type === 'image') imgs.push([sid, App.project.assets[sid].name]);
      section('Crawl', [
        full([la('text', 'Items', 'textarea')]),
        full(keyRow2), cellRow,
        grid([la('itemSep', 'Item split', 'text', { placeholder: '|' }), la('speed', 'Speed px/s', 'number', { placeholder: '150' })]),
        h('p', { class: 'hint', text: 'Items are split wherever the item split appears (it is not shown). Each item can style its parts with Text styles below, using a different separator (for example ^: "SPORT^Proteas win by 5 wickets").' })
      ].concat(typeRows, [
        grid([num('tracking', 'Spacing', { step: 0.5 }), la('upper', 'All capitals', 'check'), la('italic', 'Italic', 'check')]),
        full([color('bg', 'Background')]),
        h('div', { class: 'sub', text: 'Between items' }),
        grid([la('sepText', 'Separator', 'text', { placeholder: '•' }), la('sepColor', 'Its colour', 'text', { placeholder: 'same' }), la('sepSize', 'Size %', 'number', { placeholder: '100' })]),
        full([la('sepImg', 'Or a picture', 'select', { options: imgs })]),
        grid([la('gap', 'Space around it', 'number', { placeholder: '40' }), la('fade', 'Fade edges px', 'number', { placeholder: '0' })]),
        full([la('startFull', 'Start already filled (instead of entering from the right)', 'check')]),
        h('p', { class: 'hint', text: 'On air the crawl keeps running while the template holds on a stop marker. In the editor it follows the playhead.' }),
        Inspector.stylesEditor(L, each, attr, fl)
      ]));
    }
  }
  if (L.type === 'shape') {
    section('Shape', [
      full([la('shape', 'Type', 'select', { options: [['rect', 'Rectangle'], ['ellipse', 'Ellipse']].concat(L.shape === 'poly' ? [['poly', 'Custom outline (imported)']] : []) })]),
      full([color('fill', 'Fill')]),
      grid([num('w', 'Width', { min: 0 }), num('h', 'Height', { min: 0 }), L.shape === 'ellipse' ? null : num('radius', 'Radius', { min: 0 })]),
      full([la('gradient', 'Gradient fill', 'check')]),
      L.gradient ? full([color('fill2', 'Fill 2')]) : null,
      L.gradient ? grid([num('gradAngle', 'Angle')]) : null,
      full([color('stroke', 'Stroke')]),
      grid([num('strokeW', 'Stroke W', { min: 0 })])
    ]);
  }
  if (L.type === 'image' || L.type === 'sequence' || L.type === 'lottie') {
    var kind = L.type, as = [];
    for (var aid in App.project.assets) if (App.project.assets[aid].type === kind) as.push([aid, App.project.assets[aid].name]);
    var kids = [
      full([la('asset', 'Source', 'select', { options: kind === 'image' ? [['', 'None - empty slot filled by CasparCG']].concat(as) : as })]),
      grid([num('w', 'Width', { min: 0 }), num('h', 'Height', { min: 0 })]),
      full([btn('Reset to original size', function () {
        var a = App.project.assets[L.asset]; if (!a) return;
        each(function (x) { App.setProp(x, 'w', a.w); App.setProp(x, 'h', a.h); }); App.commit();
      })])
    ];
    if (kind === 'image') {
      kids.push(full([la('fit', 'Fit', 'select', { options: [['fill', 'Stretch'], ['contain', 'Contain'], ['cover', 'Cover']] })]));
      var kr = [attr('Replaceable from CasparCG', 'check', function () { return !!L.key; }, function (v) { each(function (x) { x.key = v ? (x.key || Inspector.nextKey()) : ''; }); })];
      if (L.key) kr.push(la('key', 'Field name', 'text'));
      kids.push(full(kr));
      if (L.key) {
        kids.push(grid([la('prefix', 'Before', 'text', { placeholder: 'e.g. logos/' }), la('suffix', 'After', 'text', { placeholder: 'e.g. .png' })]));
        kids.push(h('p', { class: 'hint', text: 'Send a file path or web address in this field and the picture loads on air. With Before "logos/" and After ".png", the operator only types the team code (SA becomes logos/SA.png, next to the template). Full paths like C:\\logos\\sa.png also work. Use Fit: Contain so logos of any shape sit inside the box.' }));
      }
    } else {
      kids.push(grid([la('loop', 'Playback', 'select', { options: [['hold', 'Play once, hold'], ['loop', 'Loop']].concat(kind === 'sequence' ? [['pingpong', 'Ping-pong']] : []) }),
        kind === 'sequence' ? la('fps', 'FPS', 'number') : la('speed', 'Speed', 'number', { step: 0.1 })]));
      kids.push(full([la('freeRun', 'Keep running while the timeline is paused', 'check')]));
      if (kind === 'sequence') kids.push(grid([la('seqStart', 'First frame', 'number', { placeholder: '0' }), la('seqLen', 'Frames used', 'number', { placeholder: 'all' })]));
    }
    if (kind === 'lottie') {
      var bl = (L.bindings || []).map(function (b) {
        return attr(b.layer, 'text', function () { return b.key || ''; }, function (v) { b.key = v; }, { placeholder: 'field name, e.g. f0' });
      });
      kids.push(h('div', { class: 'sub', text: 'Lottie text layers' }));
      kids.push(bl.length ? full(bl) : h('p', { class: 'hint', text: 'This Lottie file has no text layers.' }));
      if (bl.length) kids.push(h('p', { class: 'hint', text: 'Give a text layer a field name to change its text from CasparCG.' }));
    }
    section(TYPE_NAMES[kind], kids);
  }
  if (L.type === 'comp') {
    section('Composition layer', [
      full([btn('Open composition', function () { App.openComp(L.comp); })]),
      full([attr('Show outside its frame (shadows, overshoot)', 'check', function () { return !!L.noClip; }, function (v) { each(function (x) { x.noClip = v; }); })]),
      full([la('triggered', 'Runs independently (controlled by invokes)', 'check')]),
      L.triggered ? full([la('autoPlay', 'Starts by itself when the template plays', 'check')]) : null,
      L.triggered ? h('p', { class: 'hint', text: 'To play it on repeat, set Repeat to Loop on its invoke in the Control tab. A second invoke (for example an "out" range) ends the loop.' }) :
        grid([la('loop', 'Playback', 'select', { options: [['', 'Play once, hold'], ['loop', 'Loop'], ['pingpong', 'Back and forth']] }), la('freeRun', 'Keep running while paused', 'check')]),
      full([attr('Repeat this composition (rows / columns)', 'check', function () { return !!(L.rep && L.rep.on); }, function (v) {
        each(function (x) { if (x.type !== 'comp') return; x.rep = x.rep || { n: 5, dir: 'v', gap: 100, stagger: 0, first: 1, countKey: '' }; x.rep.on = v; });
      })]),
      (L.rep && L.rep.on) ? (function () {
        function ra(label, key, type, o) { return attr(label, type, function () { var v = L.rep[key]; return v == null ? '' : v; }, function (v) { each(function (x) { if (x.rep) x.rep[key] = (type === 'number' && key === 'n') ? Math.max(1, Math.min(100, Math.round(v))) : v; }); }, o); }
        return h('div', {}, [
          h('div', { class: 'grid' }, [ra('Copies', 'n', 'number'), ra('Direction', 'dir', 'select', { options: [['v', 'Down (rows)'], ['h', 'Across (columns)']] }), ra('Spacing', 'gap', 'number'), ra('Stagger', 'stagger', 'number'), ra('First no.', 'first', 'number')]),
          h('div', { class: 'full' }, [ra('Copies shown field', 'countKey', 'text', { placeholder: 'optional, e.g. rows' })]),
          h('p', { class: 'hint', text: 'Every copy looks the same but has its own fields: a field called "name" inside becomes name' + (L.rep.first == null ? 1 : L.rep.first) + ', name' + ((L.rep.first == null ? 1 : +L.rep.first) + 1) + ', ... Send plain "name" to set all copies at once. Type {#} in any text to show the copy number. Spacing is the distance in pixels from one copy to the next, Stagger delays each copy by that many frames, and the optional field sets how many copies show on air.' })
        ]);
      })() : null,
      h('p', { class: 'hint', text: L.triggered ? 'On air this composition waits on its first frame until an invoke plays it. In the editor it follows the timeline so you can see it.' : 'Follows the parent timeline.' })
    ]);
  }

  var mk = L.mask || (L.mask = { on: false, shape: 'rect' });
  section('Crop mask', [
    full([attr('Enable', 'check', function () { return !!L.mask.on; }, function (v) {
      each(function (x) {
        x.mask.on = v;
        var it = Stage.item(x.id);
        if (v && it && x.p.mw === undefined && !x.a.mw) { x.p.mx = 0; x.p.my = 0; x.p.mw = Math.round(it.w); x.p.mh = Math.round(it.h); }
      });
    })]),
    mk.on ? full([attr('Shape', 'select', function () { return L.mask.shape; }, function (v) { each(function (x) { x.mask.shape = v; }); }, { options: [['rect', 'Rectangle'], ['ellipse', 'Ellipse']] })]) : null,
    mk.on ? grid([num('mx', 'X'), num('my', 'Y'), num('mw', 'Width'), num('mh', 'Height'), mk.shape === 'rect' ? num('mr', 'Radius', { min: 0 }) : null]) : null
  ]);

  if (L.type !== 'null' && L.type !== 'sequence') {
    var texCfg = L.tex || {}, tOn = !!texCfg.on, tKind = texCfg.kind || 'grain';
    var TEXK = [['grain', 'Film grain'], ['paper', 'Paper'], ['brushed', 'Brushed metal'], ['carbon', 'Carbon fibre'], ['scan', 'Scan lines'], ['lines', 'Diagonal lines'], ['grid', 'Grid'], ['dots', 'Polka dots'], ['hex', 'Hexagons'], ['halftone', 'Halftone'], ['gradient', 'Gradient'], ['radial', 'Radial glow'], ['rays', 'Rays'], ['rings', 'Rings'], ['vignette', 'Vignette'], ['gloss', 'Gloss'], ['shine', 'Shine streak'], ['image', 'Your own picture']];
    function ta(label, key, type, o) {
      return attr(label, type, function () { var v = (L.tex || {})[key]; return v == null ? (o && o.dflt != null ? o.dflt : (type === 'select' && o && o.options && o.options[0] ? o.options[0][0] : '')) : v; }, function (v) { each(function (x) { x.tex = x.tex || { on: true, kind: 'grain' }; x.tex[key] = type === 'number' ? +v : v; }); }, o);
    }
    var swatches = h('div', { class: 'tex-sw' }, TEXK.map(function (k) {
      var tile = k[0] === 'image' ? null : (RT.TEX_PREVIEW[k[0]] ? { css: RT.TEX_PREVIEW[k[0]] } : (RT.TEX_CSS[k[0]] ? { css: RT.TEX_CSS[k[0]] } : RT.texTile(k[0], k[0] === 'halftone' ? '#000000ff' : ((texCfg.color && RT.normColor(texCfg.color)) || '#ffffffff'))));
      var bgi = k[0] === 'image' ? 'none' : (tile.css || 'url("' + tile.url + '")');
      var b = h('button', { class: 'tex-b' + (tOn && tKind === k[0] ? ' on' : ''), title: k[1], onclick: function () {
        each(function (x) { x.tex = x.tex || { blend: 'overlay', scale: 100 }; x.tex.on = true; x.tex.kind = k[0]; if (k[0] === 'halftone') { x.tex.blend = 'normal'; if (!x.a.texOp) x.p.texOp = 100; if (!x.tex.color || /^#?f{6}/i.test(x.tex.color)) x.tex.color = '#000000'; } if (x.tex.kind === 'image' && !x.tex.asset) { for (var id in App.project.assets) if (App.project.assets[id].type === 'image') { x.tex.asset = id; break; } } });
        App.commit(); Inspector.build();
      } }, [h('span', { class: 'tex-t', style: 'background-image:' + bgi + ';background-size:' + (tile && tile.css ? '100% 100%' : (tile ? (tile.w * 0.5) + 'px ' + (tile.h * 0.5) + 'px' : 'auto')) + (k[0] === 'image' ? '' : ';background-blend-mode:overlay'), text: k[0] === 'image' ? 'Pic' : '' }), h('span', { class: 'tex-n', text: k[1] })]);
      return b;
    }));
    var imgs2 = [];
    for (var iid in App.project.assets) if (App.project.assets[iid].type === 'image') imgs2.push([iid, App.project.assets[iid].name]);
    var tMot = texCfg.motion || 'none', tFade = texCfg.fade || 'none';
    function preset(name, title, o) { return btn(name, function () { each(function (x) { x.tex = x.tex || { on: true, kind: 'grain', blend: 'overlay', scale: 100 }; for (var q in o) { if (q === 'p') { for (var r in o.p) x.p[r] = o.p[r]; } else x.tex[q] = o[q]; } }); App.commit(); Inspector.build(); }, title); }
    var motRows = [];
    if (tMot === 'scroll') motRows.push(grid([ta('Direction °', 'dir', 'number', { dflt: 0 }), ta('Speed px/s', 'speed', 'number', { dflt: 30 })]));
    if (tMot === 'pingpong') motRows.push(grid([ta('Direction °', 'dir', 'number', { dflt: 0 }), ta('Distance px', 'dist', 'number', { dflt: 80 }), ta('Seconds', 'period', 'number', { dflt: 4, step: 0.1 })]), full([ta('Ease', 'ease', 'select', { options: [['smooth', 'Smooth (slows at the ends)'], ['linear', 'Even speed']] })]));
    if (tMot === 'flicker') motRows.push(grid([ta('Jumps / s', 'rate', 'number', { dflt: 12 }), ta('Jump px', 'amount', 'number', { dflt: 200 })]));
    if (tMot === 'orbit') motRows.push(grid([ta('Radius px', 'dist', 'number', { dflt: 40 }), ta('Seconds', 'period', 'number', { dflt: 6, step: 0.1 })]));
    var tMasks = texCfg.masks || [], mOthers = others.filter(function (o) { return o[0] !== L.id; });
    var maskRows = tMasks.map(function (m, mi) {
      var os = h('select', { class: 'mop', title: 'How this layer changes the texture mask' }), ls = h('select');
      [['add', 'Add'], ['sub', 'Subtract'], ['int', 'Intersect']].forEach(function (o) { os.appendChild(h('option', { value: o[0], text: o[1] })); });
      mOthers.forEach(function (o) { ls.appendChild(h('option', { value: o[0], text: o[1] })); });
      os.value = m.op || 'add'; ls.value = m.id;
      os.addEventListener('change', function () { m.op = os.value; os.blur(); App.commit(); });
      ls.addEventListener('change', function () { m.id = ls.value; ls.blur(); App.commit(); });
      return h('div', { class: 'f' }, [os, ls, btn('×', function () { tMasks.splice(mi, 1); App.commit(); Inspector.build(); }, 'Remove from the texture mask')]);
    });
    var texBind = h('select', { title: 'Let CasparCG change a texture setting' });
    texBind.appendChild(h('option', { value: '', text: '+ Control a texture setting from CasparCG...' }));
    App.bindable(L).forEach(function (ab) { if (/^tex/.test(ab.k) && !(L.bind && L.bind[ab.k])) texBind.appendChild(h('option', { value: ab.k, text: ab.label })); });
    texBind.addEventListener('change', function () {
      var k = texBind.value; if (!k) return;
      var key = Inspector.nextKey();
      each(function (x) { x.bind = x.bind || {}; if (!x.bind[k]) x.bind[k] = { key: key, mode: 'set', glide: 0 }; });
      texBind.blur(); App.commit(); Inspector.build();
      UI.status('Linked to the field "' + key + '" - rename it under CasparCG variables.');
    });
    /* a slider and a number box for one texture setting; dragging previews live, letting go saves */
    function tr(label, key, min, max, step, dflt) {
      var cur = function () { var v = (L.tex || {})[key]; return v == null ? dflt : +v; };
      var rg = h('input', { type: 'range', min: min, max: max, step: step || 1, class: 'tex-rg' }), nb = h('input', { type: 'number', step: step || 1, class: 'tex-nb' });
      rg.value = cur(); nb.value = cur();
      function set(v, done) { v = +v; if (isNaN(v)) return; each(function (x) { x.tex = x.tex || { on: true, kind: 'grain' }; x.tex[key] = v; }); if (done) App.commit(); else App.touch(); }
      rg.addEventListener('input', function () { nb.value = rg.value; set(rg.value); });
      rg.addEventListener('change', function () { set(rg.value, true); rg.blur(); });
      nb.addEventListener('change', function () { rg.value = nb.value; set(nb.value, true); });
      rg.addEventListener('dblclick', function () { rg.value = nb.value = dflt; set(dflt, true); });
      Inspector.fields.push({ el: nb, get: cur });
      return h('div', { class: 'f tex-sl', title: 'Double-click the slider to reset' }, [h('label', { text: label }), rg, nb]);
    }
    /* presets: built in, saved on this PC (any project), and the ones in this project (CasparCG can pick those by name) */
    var TEX_BUILTIN = {
      'Comic halftone': { tex: { kind: 'halftone', blend: 'multiply', color: '#000000', htFrom: 0, htTo: 100 }, p: { texOp: 60 } },
      'Radial halftone': { tex: { kind: 'halftone', htMode: 'radial', blend: 'multiply', color: '#000000', htFrom: 90, htTo: 0 }, p: { texOp: 50 } },
      'Retro scanlines': { tex: { kind: 'scan', blend: 'overlay', motion: 'scroll', dir: 90, speed: 30 }, p: { texOp: 30 } },
      'Film grain': { tex: { kind: 'grain', blend: 'overlay', motion: 'flicker', rate: 12, amount: 300 }, p: { texOp: 35 } },
      'Carbon sheen': { tex: { kind: 'carbon', blend: 'overlay' }, p: { texOp: 70 } },
      'Brushed steel': { tex: { kind: 'brushed', blend: 'overlay' }, p: { texOp: 60 } },
      'Paper print': { tex: { kind: 'paper', blend: 'multiply' }, p: { texOp: 40 } },
      'Sunburst spin': { tex: { kind: 'rays', count: 24, duty: 50, spin: 6, blend: 'soft-light' }, p: { texOp: 40 } },
      'Soft glow': { tex: { kind: 'radial', color: '#ffffff', color2: '#ffffff00', blend: 'soft-light' }, p: { texOp: 60 } },
      'Shine sweep': { tex: { kind: 'shine', blend: 'soft-light', motion: 'scroll', dir: 0, speed: 700 }, p: { texOp: 70 } }
    };
    var myPresets = Inspector.texLibrary(), projPresets = App.project.texPresets || {};
    var psel = h('select', { title: 'Apply a texture preset' });
    psel.appendChild(h('option', { value: '', text: 'Apply a preset...' }));
    function group(label, obj, pre) { var names = Object.keys(obj); if (!names.length) return; var og = h('optgroup', { label: label }); names.sort(natCmp).forEach(function (n) { og.appendChild(h('option', { value: pre + n, text: n })); }); psel.appendChild(og); }
    group('In this project', projPresets, 'p:'); group('My presets', myPresets, 'm:'); group('Built in', TEX_BUILTIN, 'b:');
    psel.addEventListener('change', function () {
      var v = psel.value; if (!v) return;
      var name = v.slice(2), ps = (v[0] === 'p' ? projPresets : (v[0] === 'm' ? myPresets : TEX_BUILTIN))[name];
      if (ps) Inspector.applyTexPreset(each, name, ps);
      psel.blur(); App.commit(); Inspector.build();
      UI.status('Applied the texture preset "' + name + '". CasparCG can switch to it by name too.');
    });
    var presetRow = h('div', { class: 'pbar tex-pre' }, [psel,
      btn('Save as preset', function () {
        UI.prompt('Name for this texture preset', (L.tex && L.tex.kind ? L.tex.kind : 'Texture') + ' ' + (Object.keys(myPresets).length + 1)).then(function (name) {
          if (!name) return;
          var ps = Inspector.texSnapshot(L);
          myPresets[name] = ps; Inspector.texLibrary(myPresets);
          (App.project.texPresets = App.project.texPresets || {})[name] = ps;
          App.commit(); Inspector.build(); UI.status('Saved the texture preset "' + name + '" (in this project and on this PC).');
        });
      }, 'Save these texture settings under a name, for any layer or project, and for CasparCG'),
      btn('Delete...', function () {
        var names = Object.keys(myPresets).concat(Object.keys(projPresets).filter(function (n) { return !myPresets[n]; }));
        if (!names.length) { UI.status('There are no saved texture presets yet.'); return; }
        UI.prompt('Delete which preset? (' + names.join(', ') + ')', names[0]).then(function (name) {
          if (!name || (!myPresets[name] && !projPresets[name])) return;
          delete myPresets[name]; Inspector.texLibrary(myPresets);
          if (App.project.texPresets) delete App.project.texPresets[name];
          App.commit(); Inspector.build(); UI.status('Deleted the texture preset "' + name + '".');
        });
      }, 'Delete a saved preset')]);
    var noisy = /^(grain|paper|brushed)$/.test(tKind), cgOn = !!texCfg.cgKey;
    var tb = !RT.TEX_CSS[tKind];
    section('Texture', [
      full([attr('Add a texture over this layer', 'check', function () { return tOn; }, function (v) { each(function (x) { x.tex = x.tex || { kind: 'grain', blend: 'overlay', scale: 100 }; x.tex.on = v; }); })]),
      tOn ? presetRow : null,
      tOn ? swatches : h('p', { class: 'hint', text: 'Lays a pattern such as film grain, scan lines or carbon fibre over the layer\'s background, or a picture of your own. Text, tables, charts and crawls keep their content on top.' }),
      tOn && tKind === 'image' ? full([ta('Picture', 'asset', 'select', { options: imgs2.length ? imgs2 : [['', 'Add a picture in Assets first']] })]) : null,
      tOn && tKind === 'image' ? full([ta('Fit', 'fit', 'select', { options: [['tile', 'Repeat (tile)'], ['cover', 'Cover'], ['stretch', 'Stretch']] })]) : null,
      tOn ? grid([ta('Blend', 'blend', 'select', { options: [['overlay', 'Overlay'], ['soft-light', 'Soft light'], ['multiply', 'Multiply (darken)'], ['screen', 'Screen (lighten)'], ['hard-light', 'Hard light'], ['color-dodge', 'Colour dodge'], ['difference', 'Difference'], ['normal', 'Normal']] }), num('texOp', 'Opacity %', { min: 0 })]) : null,
      tOn ? h('div', { class: 'sub', text: 'Size' }) : null,
      tOn && tb ? tr('Size %', 'scale', 5, 500, 1, 100) : null,
      tOn ? tr('Width %', 'wpct', 5, 400, 1, 100) : null,
      tOn ? tr('Height %', 'hpct', 5, 400, 1, 100) : null,
      tOn ? tr('Angle °', 'angle', -180, 180, 1, 0) : null,
      tOn && noisy ? tr('Variation', 'seed', 0, 50, 1, 0) : null,
      tOn && /^(scan|lines|grid|dots|hex|rays|rings)$/.test(tKind) ? full([ta('Pattern colour', 'color', 'text', { placeholder: '#ffffff (blank = white)' })]) : null,
      tOn && tKind === 'halftone' ? full([ta('Dot colour', 'color', 'text', { placeholder: '#000000 (blank = black)' })]) : null,
      tOn && tKind === 'halftone' ? grid([ta('Layout', 'htMode', 'select', { options: [['linear', 'Straight (use Angle)'], ['radial', 'Radial (from the centre)']] }), ta('Dot', 'htShape', 'select', { options: [['dot', 'Round'], ['square', 'Square'], ['diamond', 'Diamond'], ['line', 'Lines']] })]) : null,
      tOn && tKind === 'halftone' ? grid([ta(texCfg.htMode === 'radial' ? 'Centre %' : 'Start %', 'htFrom', 'number', { dflt: texCfg.htMode === 'radial' ? 100 : 0 }), ta(texCfg.htMode === 'radial' ? 'Outside %' : 'End %', 'htTo', 'number', { dflt: texCfg.htMode === 'radial' ? 0 : 100 }), ta('Curve', 'htCurve', 'number', { dflt: 1, step: 0.1 })]) : null,
      tOn && tKind === 'halftone' ? grid([ta('Staggered rows', 'htStagger', 'check'), texCfg.htMode === 'radial' ? ta('Reach %', 'reach', 'number', { dflt: 100 }) : null]) : null,
      tOn && tKind === 'halftone' ? h('p', { class: 'hint', text: 'Dot coverage goes from Start to End (0 = no dots, 100 = solid). Size % sets the dot spacing; Curve above 1 keeps it light for longer.' }) : null,
      tOn && (tKind === 'gradient' || tKind === 'radial') ? grid([ta('Colour 1', 'color', 'text', { placeholder: '#ffffff' }), ta('Colour 2', 'color2', 'text', { placeholder: '#ffffff00 (clear)' })]) : null,
      tOn && (tKind === 'gradient' || tKind === 'radial') ? grid([ta('Colour 1 at %', 'gFrom', 'number', { dflt: 0 }), ta('Colour 2 at %', 'gTo', 'number', { dflt: 100 })]) : null,
      tOn && tKind === 'rays' ? grid([ta('Rays', 'count', 'number', { dflt: 24 }), ta('Ray width %', 'duty', 'number', { dflt: 50 })]) : null,
      tOn && tKind === 'rings' ? grid([ta('Ring width %', 'duty', 'number', { dflt: 50 })]) : null,
      tOn && /^(gradient|radial|rays|rings)$/.test(tKind) ? h('p', { class: 'hint', text: tKind === 'gradient' ? 'Angle turns the gradient; Offset slides it.' : 'Centred on the layer; Offset X / Y moves the centre' + (tKind === 'rays' ? ', Angle and Spin turn the rays.' : ', Size % sets ' + (tKind === 'rings' ? 'the ring spacing.' : 'how far it reaches.')) }) : null,

      tOn ? h('div', { class: 'sub', text: 'Refine (the circles add keyframes)' }) : null,
      tOn ? grid([num('texX', 'Offset X'), num('texY', 'Offset Y'), num('texSc', 'Zoom %', { min: 1 }), num('texRot', 'Turn °')]) : null,
      tOn ? grid([num('texBr', 'Bright', { min: 0 }), num('texCt', 'Contrast', { min: 0 }), num('texBlur', 'Soften', { min: 0, step: 0.5 }), num('texHue', 'Hue °'), num('texSat', 'Saturate', { min: 0 })]) : null,
      tOn ? grid([ta('Invert', 'invert', 'check'), ta('Black and white', 'gray', 'check')]) : null,

      tOn ? h('div', { class: 'sub', text: 'Motion' }) : null,
      tOn ? h('div', { class: 'pbar tex-pre' }, [
        preset('Slow drift', 'Scrolls gently at an angle', { motion: 'scroll', dir: 20, speed: 15 }),
        preset('Scanline roll', 'Rolls downwards, like an old monitor', { motion: 'scroll', dir: 90, speed: 40 }),
        preset('Film flicker', 'Jumps around 12 times a second, like film grain', { motion: 'flicker', rate: 12, amount: 300 }),
        preset('Sway', 'Slides back and forth', { motion: 'pingpong', dir: 0, dist: 60, period: 6, ease: 'smooth' }),
        preset('Shine sweep', 'A light streak sweeping across, again and again', { kind: 'shine', motion: 'scroll', dir: 0, speed: 700, blend: 'soft-light' }),
        preset('Breathe', 'Fades softly in and out', { pulse: 50, pulseT: 3 }),
        preset('Still', 'No motion', { motion: 'none', spin: 0, pulse: 0 })
      ]) : null,
      tOn ? full([ta('Motion', 'motion', 'select', { options: [['none', 'None'], ['scroll', 'Scroll (keeps going)'], ['pingpong', 'Back and forth'], ['flicker', 'Flicker (random jumps)'], ['orbit', 'Circle round']] })]) : null
    ].concat(tOn ? motRows : []).concat([
      tOn ? grid([ta('Spin °/s', 'spin', 'number', { dflt: 0 }), ta('Pulse %', 'pulse', 'number', { dflt: 0 }), ta('Pulse sec', 'pulseT', 'number', { dflt: 2, step: 0.1 })]) : null,
      tOn ? h('p', { class: 'hint', text: 'Motion runs from the layer\'s In frame in the editor and keeps running on air, also while the template holds on a stop marker. For a motion of your own, keyframe Offset, Zoom and Turn above with any ease.' }) : null,

      tOn ? h('div', { class: 'sub', text: 'Where it shows' }) : null,
      tOn ? full([ta('Pinned to', 'anchor', 'select', { options: [['layer', 'The layer (moves with it)'], ['comp', 'The composition (stays put)']] })]) : null,
      tOn ? grid([ta('Inset T', 'inT', 'number', { dflt: 0 }), ta('Inset R', 'inR', 'number', { dflt: 0 }), ta('Inset B', 'inB', 'number', { dflt: 0 }), ta('Inset L', 'inL', 'number', { dflt: 0 })]) : null,
      tOn ? grid([ta('Fade', 'fade', 'select', { options: [['none', 'Everywhere'], ['edges', 'Soft edges'], ['top', 'Strong at the top'], ['bottom', 'Strong at the bottom'], ['left', 'Strong on the left'], ['right', 'Strong on the right'], ['centre', 'Strong in the middle'], ['outside', 'Strong at the outside']] }),
        tFade === 'edges' ? ta('Edge px', 'feather', 'number', { dflt: 40 }) : (tFade !== 'none' ? ta('Fade size %', 'fadeLen', 'number', { dflt: 100 }) : null)]) : null,
      tOn ? h('div', { class: 'sub', text: 'Mask the texture with other layers' }) : null
    ]).concat(tOn ? maskRows : []).concat([
      tOn ? full([btn('+ Add a mask layer', function () {
        var used = tMasks.map(function (m) { return m.id; }), free = mOthers.filter(function (o) { return used.indexOf(o[0]) < 0; })[0];
        if (!free) { UI.status('Add a shape (or any layer) to this composition first, to use as the texture mask.'); return; }
        each(function (x) { x.tex = x.tex || { on: true, kind: 'grain' }; (x.tex.masks = x.tex.masks || []).push({ id: free[0], op: 'add' }); });
        App.commit(); Inspector.build();
      }, 'Use another layer to shape where the texture shows')]) : null,
      tOn && tMasks.length ? full([ta('Invert the mask (texture outside the mask layers)', 'maskInv', 'check')]) : null,
      tOn ? h('p', { class: 'hint', text: tMasks.length ? 'The texture only shows inside the mask layers (add, subtract or intersect them). Mask layers are hidden themselves, and can be animated for texture wipes.' : 'Shape the texture with any other layer of this composition, like a layer mask: a shape, text, picture, sequence or composition.' }) : null,

      tOn ? h('div', { class: 'sub', text: 'CasparCG' }) : null,
      tOn ? full([attr('Control this texture from CasparCG', 'check', function () { return cgOn; }, function (v) { each(function (x) { x.tex = x.tex || { on: true, kind: 'grain' }; x.tex.cgKey = v ? (x.tex.cgKey || App.freeKey('texture')) : ''; }); })]) : null,
      tOn && cgOn ? full([ta('Field name', 'cgKey', 'text')]) : null,
      tOn && cgOn ? h('p', { class: 'hint', text: 'Send "' + texCfg.cgKey + '" = 1 or 0 to show or hide it, a preset name to switch to that preset, or JSON like {"kind":"halftone","opacity":60,"size":150}. Single settings: ' + texCfg.cgKey + '_kind, _preset, _opacity, _size, _width, _height, _color, _blend, _motion, _speed, _dir, _angle, _x, _y, _zoom, _pic (a picture path or URL). They are all listed in the Control panel.' }) : null,
      tOn ? full([texBind]) : null,
      tOn ? h('p', { class: 'hint', text: 'Any texture setting can be driven by a field: on/off, type, a picture path, opacity, offset, speed, direction and more. The links show under CasparCG variables below.' }) : null
    ]));
  }
  section('Effects', [
    grid([num('blur', 'Blur', { min: 0, step: 0.5 }), num('bright', 'Bright', { min: 0 }), num('contrast', 'Contrast', { min: 0 }), num('sat', 'Saturate', { min: 0 }), num('hue', 'Hue')]),
    full([la('mblur', 'Motion blur', 'check')]),
    L.mblur ? h('p', { class: 'hint', text: 'Blurs the layer along the way it moves (position, scale, rotation and its parents). Set the strength with the shutter angle in the composition settings (click an empty spot). Each blurred layer costs some playback speed, so use it on the fast movers.' }) : null,
    full([la('shadow', 'Drop shadow', 'check')]),
    L.shadow ? full([color('shColor', 'Colour')]) : null,
    L.shadow ? grid([num('shX', 'X'), num('shY', 'Y'), num('shBlur', 'Blur', { min: 0 })]) : null
  ]);

  /* ----- map any property to a CasparCG field ----- */
  var able = App.bindable(L), binds = L.bind || {}, rows = [];
  able.forEach(function (ab) {
    var bd = binds[ab.k];
    if (!bd) return;
    var kids = [
      h('div', { class: 'f' }, [h('label', { text: 'Field', title: 'The name CasparCG sends' }), (function () {
        var i = h('input', { type: 'text', value: bd.key });
        i.addEventListener('change', function () { bd.key = i.value.replace(/[^A-Za-z0-9_]/g, '') || bd.key; App.commit(); });
        return i;
      })(), btn('\u00D7', function () { each(function (x) { if (x.bind) delete x.bind[ab.k]; }); App.commit(); Inspector.build(); }, 'Remove this mapping')])
    ];
    if (ab.kind === 'number') {
      var ms = h('select', { title: 'How the value from CasparCG is used' });
      [['set', 'Replace the value'], ['add', 'Add to the designed value'], ['mul', 'Multiply the designed value']].forEach(function (o) { ms.appendChild(h('option', { value: o[0], text: o[1] })); });
      ms.value = bd.mode || 'set';
      ms.addEventListener('change', function () { bd.mode = ms.value; ms.blur(); App.commit(); });
      kids.push(h('div', { class: 'f' }, [h('label', { text: 'Use' }), ms]));
    }
    if (ab.kind === 'number' || ab.kind === 'colour') {
      var gi = h('input', { type: 'number', min: 0, step: 1, value: bd.glide || 0, title: 'On air, ease to a new value over this many frames (0 = jump)' });
      gi.addEventListener('change', function () { bd.glide = Math.max(0, parseInt(gi.value, 10) || 0); App.commit(); });
      kids.push(h('div', { class: 'f' }, [h('label', { text: 'Glide', title: 'Frames taken to ease to a new value on air' }), gi, h('span', { class: 'lbl', text: 'frames' })]));
    }
    rows.push(h('div', { class: 'card' }, [h('div', { class: 'sub0', text: ab.label })].concat(kids)));
  });
  var pick = h('select');
  pick.appendChild(h('option', { value: '', text: '+ Map a property...' }));
  able.forEach(function (ab) { if (!binds[ab.k]) pick.appendChild(h('option', { value: ab.k, text: ab.label })); });
  pick.addEventListener('change', function () {
    var k = pick.value;
    if (!k) return;
    var key = Inspector.nextKey();
    each(function (x) { x.bind = x.bind || {}; if (!x.bind[k]) x.bind[k] = { key: key, mode: 'set', glide: 0 }; });
    pick.blur(); App.commit(); Inspector.build();
  });
  section('CasparCG variables', rows.concat([
    full([pick]),
    h('p', { class: 'hint', text: 'Pick any property of this layer and give it a field name. Whatever CasparCG sends in that field drives the property: a number, a colour, or on/off (1/0, true/false). Several properties can share one field name. Try values in the Control tab.' })
  ]));
  Inspector.sync();
};

Inspector.sync = function () {
  var L = App.selLayers()[0], t = Math.round(App.time);
  Inspector.fields.forEach(function (f) {
    if (f.apply) { try { f.apply(f.get()); } catch (e0) {} }
    else if (f.el !== UI.active()) {
      var v;
      try { v = f.get(); } catch (e) { return; }
      if (f.check) f.el.checked = !!v; else f.el.value = v;
    }
    if (f.sw && L) {
      f.sw.classList.toggle('on', !!L.a[f.prop]);
      f.sw.classList.toggle('key', !!(L.a[f.prop] && App.keyAt(L, f.prop, t)));
    }
  });
};
