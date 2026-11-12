/* CG Motion - imports vMix GT titles (.gtzip) and turns them into CG Motion compositions.
   A .gtzip is a zip with document.xml (the title: layers > objects, plus the In and Out storyboards),
   resources.xml (which picture file each bitmap name is) and the pictures themselves, named by GUID. */
var VMix = {};

VMix.is = function (path) { return /\.gtzip$/i.test(path || ''); };

/* ---------- a small zip reader (stored and deflated entries) ---------- */
VMix.unzip = async function (bytes) {
  var u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), i;
  for (i = u8.length - 22; i >= Math.max(0, u8.length - 70000); i--) if (dv.getUint32(i, true) === 0x06054b50) break;
  if (i < 0 || dv.getUint32(i, true) !== 0x06054b50) throw new Error('This is not a .gtzip file (no zip directory found).');
  var n = dv.getUint16(i + 10, true), off = dv.getUint32(i + 16, true), out = {}, dec = new TextDecoder('utf-8');
  for (var k = 0; k < n; k++) {
    if (dv.getUint32(off, true) !== 0x02014b50) break;
    var method = dv.getUint16(off + 10, true), csize = dv.getUint32(off + 20, true), nlen = dv.getUint16(off + 28, true),
      elen = dv.getUint16(off + 30, true), clen = dv.getUint16(off + 32, true), lho = dv.getUint32(off + 42, true);
    var name = dec.decode(u8.subarray(off + 46, off + 46 + nlen));
    off += 46 + nlen + elen + clen;
    var start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true), data = u8.subarray(start, start + csize);
    if (method === 0) out[name] = data.slice();
    else if (method === 8) out[name] = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    else throw new Error('The .gtzip uses a compression CG Motion cannot read (method ' + method + ').');
  }
  return out;
};

VMix.text = function (u8) {
  if (u8[0] === 0xff && u8[1] === 0xfe) return new TextDecoder('utf-16le').decode(u8.subarray(2));
  if (u8[0] === 0xfe && u8[1] === 0xff) return new TextDecoder('utf-16be').decode(u8.subarray(2));
  var t = new TextDecoder('utf-8').decode(u8);
  return t.replace(/^﻿/, '');
};
VMix.dataUrl = function (u8, mime) {
  var s = '', CH = 0x8000;
  for (var i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
  return 'data:' + mime + ';base64,' + btoa(s);
};
VMix.mime = function (u8) {
  if (u8[0] === 0x89 && u8[1] === 0x50) return 'image/png';
  if (u8[0] === 0xff && u8[1] === 0xd8) return 'image/jpeg';
  if (u8[0] === 0x47 && u8[1] === 0x49) return 'image/gif';
  if (u8[0] === 0x52 && u8[1] === 0x49 && u8[8] === 0x57) return 'image/webp';
  if (u8[0] === 0x3c) return 'image/svg+xml';
  return 'image/png';
};
VMix.pngSize = function (u8) {
  if (u8[0] === 0x89 && u8[1] === 0x50) { var dv = new DataView(u8.buffer, u8.byteOffset); return { w: dv.getUint32(16), h: dv.getUint32(20) }; }
  return null;
};
/* vMix colours are #AARRGGBB */
VMix.color = function (v) {
  v = String(v || '').trim();
  var m = /^#([0-9a-f]{2})([0-9a-f]{6})$/i.exec(v);
  if (m) return '#' + m[2].toLowerCase() + m[1].toLowerCase();
  return RT.normColor(v) || '#ffffffff';
};
VMix.EASE = { type: 'bezier', b: [0.65, 0, 0.35, 1] };
VMix.WEIGHT = { thin: 100, extralight: 200, ultralight: 200, light: 300, normal: 400, regular: 400, medium: 500, demibold: 600, semibold: 600, bold: 700, extrabold: 800, ultrabold: 800, black: 900, heavy: 900, extrablack: 950 };

/* ---------- one title -> one composition (added to project p) ---------- */
VMix.convertTitle = async function (p, files, title, stats, notes) {
  function note(s) { if (notes.indexOf(s) < 0) notes.push(s); }
  var doc = files['document.xml'];
  if (!doc) throw new Error('"' + title + '" has no document.xml inside; it may not be a vMix GT title.');
  var xml = VMix.text(doc).replace(/^\s*<\?xml[^>]*\?>/, '');
  var dom = new DOMParser().parseFromString(xml, 'application/xml');
  if (dom.getElementsByTagName('parsererror').length) throw new Error('The design in "' + title + '" could not be read.');
  var root = dom.documentElement, uid = 0;
  function nid(pre) { uid++; return pre + Date.now().toString(36).slice(-4) + (stats.n++) + '_' + uid; }

  /* pictures: resources.xml maps the names used in the design to the GUID files */
  var srcToFile = {};
  if (files['resources.xml']) {
    var rdom = new DOMParser().parseFromString(VMix.text(files['resources.xml']).replace(/^\s*<\?xml[^>]*\?>/, ''), 'application/xml');
    Array.prototype.forEach.call(rdom.getElementsByTagName('resource'), function (r) {
      var fn = r.getAttribute('filename'), srcs = r.getElementsByTagName('source');
      Array.prototype.forEach.call(srcs, function (s) { srcToFile[s.textContent.trim()] = s.getAttribute('guid'); });
      if (fn && srcs.length && !srcToFile[fn]) srcToFile[fn] = srcs[0].getAttribute('guid');
    });
  }
  var assetBySrc = {};
  function asset(src) {
    if (!src) return '';
    if (assetBySrc[src]) return assetBySrc[src];
    var g = srcToFile[src], u8 = g && files[g];
    if (!u8) { var base = src.replace(/^.*[\\\/]/, ''); for (var k in files) if (k.replace(/^.*[\\\/]/, '') === base) u8 = files[k]; }
    if (!u8) { note('A picture used in "' + title + '" was not inside the file: ' + src.replace(/^.*[\\\/]/, '')); return ''; }
    var mime = VMix.mime(u8), sz = VMix.pngSize(u8) || { w: 0, h: 0 }, id = nid('a');
    var nm = src.replace(/^.*[\\\/]/, '').replace(/\.psd\.(\d+)\.png$/i, ' $1.png');
    p.assets[id] = { id: id, type: 'image', name: title + ' - ' + nm, src: VMix.dataUrl(u8, mime), w: sz.w, h: sz.h };
    stats.assets++;
    assetBySrc[src] = id;
    return id;
  }
  function kid(el, tag) { for (var c = el.firstElementChild; c; c = c.nextElementSibling) if (c.tagName === tag) return c; return null; }
  function brushOf(el, part) { var w = kid(el, el.tagName + '.' + part); return w ? kid(w, 'Brush') : null; }
  function nums(s, n) { var a = String(s || '').split(',').map(function (v) { return parseFloat(v) || 0; }); while (a.length < n) a.push(0); return a; }

  var W = Math.round(+root.getAttribute('Width') || 1920), H = Math.round(+root.getAttribute('Height') || 1080), fps = 50;
  var comp = { id: nid('c'), name: title, w: W, h: H, fps: fps, duration: 100, bg: '', layers: [], markers: [], loops: [], note: 'Imported from the vMix title "' + title + '".' };
  var order = [], byName = {}, layerInfo = {}, fonts = {};
  function reg(name, o) { (byName[name] = byName[name] || []).push(o); }
  function base(L, nm) { return L.p[nm] != null ? L.p[nm] : RT.DEF[nm]; }
  function newLayer(name, type) {
    return { id: nid('l'), name: name, type: type, start: 0, end: 100, visible: true, locked: false, parent: '', matte: '', matteMode: 'alpha', blend: 'normal', p: {}, a: {}, mask: { on: false, shape: 'rect' }, shadow: false };
  }
  var keys = {};
  function fieldKey(name) {
    var k = String(name || '').trim().replace(/\s+/g, '_').replace(/[^A-Za-z0-9_]/g, '') || 'field';
    var k0 = k, i = 2; while (keys[k]) k = k0 + '_' + (i++);
    keys[k] = 1; return k;
  }

  /* objects of one vMix layer (in that layer's own coordinates ox, oy inside the composition) */
  function objects(compEl, lay) {
    for (var el = compEl.firstElementChild; el; el = el.nextElementSibling) {
      var tag = el.tagName;
      if (tag === 'Layer') { walkLayer(el, lay); continue; }
      if (tag !== 'Rectangle' && tag !== 'TextBlock' && tag !== 'Image') {
        if (!/^(Composition|Storyboard)/.test(tag)) note('An object of type "' + tag + '" in "' + title + '" has no match in CG Motion and was left out.');
        continue;
      }
      var name = el.getAttribute('Name') || tag, d = nums(el.getAttribute('Dimensions'), 2), loc = nums(el.getAttribute('Location'), 2);
      var w = Math.max(1, d[0]), hh = Math.max(1, d[1]), L, fill = brushOf(el, 'Fill');
      if (tag === 'TextBlock') {
        L = newLayer(name, 'text');
        L.text = String(el.getAttribute('Text') || '');
        if (el.getAttribute('DataFlags') !== 'Hidden') { L.key = fieldKey(name); stats.fields[L.key] = 1; }
        L.font = el.getAttribute('FontFamily') || 'Arial'; fonts[L.font] = 1;
        L.weight = VMix.WEIGHT[String(el.getAttribute('FontWeight') || 'normal').toLowerCase()] || 400;
        L.italic = /italic|oblique/i.test(el.getAttribute('FontStyle') || '');
        var ta = String(el.getAttribute('TextAlign') || 'Left').toLowerCase();
        L.align = /^(left|center|right|justify)$/.test(ta) ? ta : 'left';
        var va = String(el.getAttribute('VerticalAlign') || 'Top').toLowerCase();
        L.valign = va === 'center' ? 'middle' : (va === 'bottom' ? 'bottom' : 'top');
        var up = /uppercase/i.test(el.getAttribute('TextEffect') || ''), lo = /lowercase/i.test(el.getAttribute('TextEffect') || '');
        L.upper = up; L.tcase = up ? 'upper' : (lo ? 'lower' : 'none');
        L.box = true; L.boxScale = false; L.clip = false; L.padL = L.padR = L.padT = L.padB = 0; L.maxW = 0; L.wrapW = 0;
        /* vMix keeps a line on one line and shrinks the type to fit the box (Shrink); wrapping only when asked for */
        var auto = el.getAttribute('AutoSize') || '', wrap = el.getAttribute('TextWordWrapping') === 'Wrap';
        L.boxWrap = wrap;
        L.fitBox = auto === 'Shrink';
        L.squeeze = false;
        var fs = parseFloat(el.getAttribute('FontSize'));
        if (!(fs > 0)) { fs = Math.round(hh * 0.8); if (!L.fitBox && !L.squeeze) L.fitBox = true; }
        L.p.fontSize = fs;
        var ls = parseFloat(el.getAttribute('LineSpacing'));
        L.p.lineHeight = ls > 0 ? Math.round(ls / fs * 1000) / 1000 : 1.2;
        L.p.color = fill ? VMix.color(fill.getAttribute('Color')) : '#ffffffff';
        L.p.bg = '#00000000';
      } else if (tag === 'Image') {
        L = newLayer(name, 'image');
        var bmp = kid(kid(el, 'Image.Bitmap') || el, 'Bitmap');
        L.asset = asset(bmp && bmp.getAttribute('Source'));
        L.fit = 'contain'; L.prefix = ''; L.suffix = '';
        L.key = fieldKey(name); stats.fields[L.key] = 1;
      } else {
        var bb = fill && kid(fill, 'Brush.Bitmap'), bm = bb && kid(bb, 'Bitmap');
        if (bm || (fill && fill.getAttribute('Type') === 'Bitmap')) {
          L = newLayer(name, 'image');
          L.asset = asset(bm && bm.getAttribute('Source'));
          L.fit = 'fill'; L.prefix = ''; L.suffix = ''; L.key = '';
        } else {
          L = newLayer(name, 'shape');
          L.shape = 'rect';
          var stops = fill && kid(fill, 'Brush.Stops');
          /* a brush only paints its gradient when its type says so; otherwise vMix uses the plain colour (stops can be left-overs) */
          if (stops && /gradient/i.test(fill.getAttribute('Type') || '') && stops.getElementsByTagName('GradientStop').length >= 2) {
            var gs = Array.prototype.map.call(stops.getElementsByTagName('GradientStop'), function (g) { return { at: parseFloat(g.getAttribute('Position')) || 0, c: VMix.color(g.getAttribute('Color')) }; }).sort(function (a, b) { return a.at - b.at; });
            var sp = nums(fill.getAttribute('StartPoint') || '0.5,0', 2), ep = nums(fill.getAttribute('EndPoint') || '0.5,1', 2);
            L.gradient = true; L.p.fill = gs[0].c; L.p.fill2 = gs[gs.length - 1].c;
            L.p.gradAngle = Math.round(Math.atan2(ep[0] - sp[0], -(ep[1] - sp[1])) * 180 / Math.PI);
            if (gs.length > 2) note('A gradient with more than two colours was simplified to two (object "' + name + '" in "' + title + '").');
          } else L.p.fill = fill ? VMix.color(fill.getAttribute('Color')) : '#ffffffff';
          L.p.strokeW = 0; L.p.radius = 0;
          if (el.hasAttribute('DataFlags') && el.getAttribute('DataFlags') !== 'Hidden' && !L.gradient) {
            var ck = fieldKey(name); L.bind = { fill: { key: ck, mode: 'set', glide: 0 } }; stats.fields[ck] = 1;
          }
        }
        var cr = kid(kid(el, 'Rectangle.Crop') || el, 'Crop');
        if (cr) {
          var rg = nums(cr.getAttribute('Range') || '0,0,1,1', 4);
          L.mask = { on: true, shape: 'rect' };
          L.p.mx = Math.round(rg[0] * w * 10) / 10; L.p.my = Math.round(rg[1] * hh * 10) / 10;
          L.p.mw = Math.round((rg[2] - rg[0]) * w * 10) / 10; L.p.mh = Math.round((rg[3] - rg[1]) * hh * 10) / 10; L.p.mr = 0;
        }
        var bd = kid(kid(el, 'Rectangle.Bounding') || el, 'Bounding');
        if (bd) note('"' + name + '" in "' + title + '" follows the size of "' + bd.getAttribute('Object') + '" in vMix; here it keeps its designed size (use Match parent width / height to rebuild it).');
      }
      var op = parseFloat(el.getAttribute('Opacity'));
      if (op >= 0 && op < 1) L.p.op = Math.round(op * 1000) / 10;
      if (el.getAttribute('Visible') === 'False' || (lay && lay.hidden)) L.visible = false;
      L.p.w = Math.round(w * 100) / 100; L.p.h = Math.round(hh * 100) / 100;
      L.p.ax = L.p.w / 2; L.p.ay = L.p.h / 2;
      var lx = (lay && !lay.nullL ? lay.x : 0) + loc[0], ly = (lay && !lay.nullL ? lay.y : 0) + loc[1];
      L.p.x = Math.round((lx + w / 2) * 100) / 100; L.p.y = Math.round((ly + hh / 2) * 100) / 100;
      /* effects */
      var fx = kid(el, tag + '.Effects');
      if (fx) Array.prototype.forEach.call(fx.getElementsByTagName('Effect'), function (ef) {
        var t = ef.getAttribute('Type');
        if (t === 'Shadow') {
          L.shadow = true; var bl = parseFloat(ef.getAttribute('BlurAmount')) || 0;
          L.p.shX = 3; L.p.shY = 3; L.p.shBlur = Math.round(bl * 2 * 10) / 10; L.p.shColor = VMix.color(ef.getAttribute('Color') || '#80000000');
        } else if (t === 'Skew') {
          var an = nums(ef.getAttribute('Angle'), 2); L.p.skx = an[0]; L.p.sky = an[1];
        } else note('The "' + t + '" effect on "' + name + '" in "' + title + '" is not supported and was left out.');
      });
      var mk = kid(kid(el, tag + '.Mask') || el, 'Mask');
      var o = { L: L, el: el, lay: lay, box: { x: loc[0], y: loc[1], w: w, h: hh }, maskName: mk && mk.getAttribute('Object') };
      order.push(o); reg(name, o);
      if (lay) lay.kids.push(o);
      stats.layers++;
    }
  }
  function walkLayer(lel, parentLay) {
    var name = lel.getAttribute('Name') || 'Layer', d = nums(lel.getAttribute('Dimensions'), 2), loc = nums(lel.getAttribute('Location'), 2);
    var lay = { name: name, x: (parentLay ? parentLay.x : 0) + loc[0], y: (parentLay ? parentLay.y : 0) + loc[1], lx: loc[0], ly: loc[1], w: d[0], h: d[1], kids: [], parentLay: parentLay,
      hidden: lel.getAttribute('Visible') === 'False' || !!(parentLay && parentLay.hidden), nullL: null };
    layerInfo[name] = lay;
    reg(name, { layer: lay });
    var c = kid(kid(lel, 'Layer.Composition') || lel, 'Composition');
    if (c) objects(c, lay);
  }
  objects(root, null);

  /* ---------- storyboards ---------- */
  var sbs = Array.prototype.filter.call(root.children, function (e) { return e.tagName === 'Storyboard'; });
  function anims(sb) { var w = kid(sb, 'Storyboard.Animations'); return w ? Array.prototype.slice.call(w.children) : []; }
  var inSb = sbs.filter(function (s) { return !s.getAttribute('Type') || s.getAttribute('Type') === 'TransitionIn'; })[0];
  var outSb = sbs.filter(function (s) { return s.getAttribute('Type') === 'TransitionOut'; })[0];
  sbs.forEach(function (s) { var t = s.getAttribute('Type'); if (t && t !== 'TransitionIn' && t !== 'TransitionOut') note('The "' + t + '" storyboard in "' + title + '" was not converted.'); });
  var fr = function (s) { return Math.round((parseFloat(s) || 0) * fps); };
  var inEnd = 1;
  if (inSb) anims(inSb).forEach(function (a) { inEnd = Math.max(inEnd, fr(a.getAttribute('Delay')) + Math.max(1, fr(a.getAttribute('Duration') || '0.5'))); });
  var M = inEnd, outEnd = M + 1;
  if (outSb) anims(outSb).forEach(function (a) { outEnd = Math.max(outEnd, M + fr(a.getAttribute('Delay')) + Math.max(1, fr(a.getAttribute('Duration') || '0.5'))); });
  comp.duration = outEnd + 1;
  comp.markers = [{ t: M }];

  /* layers that move as a whole get a null that their objects follow */
  function needNull(name) {
    var t = false;
    [inSb, outSb].forEach(function (sb) { if (sb) anims(sb).forEach(function (a) { if (a.getAttribute('Object') === name && /^(Fly|Zoom|Expand)$/.test(a.tagName)) t = true; }); });
    return t;
  }
  var extra = [];
  Object.keys(layerInfo).forEach(function (nm) {
    var lay = layerInfo[nm];
    if (!needNull(nm)) return;
    var N = newLayer(nm, 'null');
    N.p.x = lay.x + lay.w / 2; N.p.y = lay.y + lay.h / 2; N.p.ax = lay.w / 2; N.p.ay = lay.h / 2;
    lay.nullL = N; extra.push(N);
    lay.kids.forEach(function (o) { o.L.parent = N.id; o.L.p.x = Math.round((o.box.x + o.box.w / 2) * 100) / 100; o.L.p.y = Math.round((o.box.y + o.box.h / 2) * 100) / 100; });
  });

  function keyed(L, nm, list) {
    var arr = (L.a[nm] || []).slice();
    list.forEach(function (q) {
      arr = arr.filter(function (k) { return k.t !== q[0]; });
      arr.push({ t: q[0], v: Math.round(q[1] * 100) / 100, e: q[2] ? JSON.parse(JSON.stringify(q[2])) : { type: 'linear' } });
    });
    arr.sort(function (a, b) { return a.t - b.t; });
    L.a[nm] = arr; stats.keys += list.length;
  }
  /* box of a target in its parent's space and the area it is clipped to (where Fly starts / ends) */
  function targetOf(o) {
    if (o.layer) {
      var lay = o.layer, pl = lay.parentLay;
      return { L: lay.nullL, kids: lay.kids, box: { x: lay.lx, y: lay.ly, w: lay.w, h: lay.h }, bounds: pl ? { w: pl.w, h: pl.h } : { w: W, h: H }, isLayer: true, lay: lay };
    }
    var lay2 = o.lay, inNull = lay2 && lay2.nullL;
    var bx = { x: (lay2 && !inNull ? lay2.x : 0) + o.box.x, y: (lay2 && !inNull ? lay2.y : 0) + o.box.y, w: o.box.w, h: o.box.h };
    return { L: o.L, box: bx, bounds: lay2 ? { x: inNull ? 0 : lay2.x, y: inNull ? 0 : lay2.y, w: lay2.w, h: lay2.h } : { x: 0, y: 0, w: W, h: H }, isLayer: false, o: o };
  }
  var clipNeeded = {};
  function apply(a, out) {
    var type = a.tagName, objName = a.getAttribute('Object'), list = byName[objName];
    if (type === 'None') return;
    if (!list) { note('An animation in "' + title + '" points at "' + objName + '", which is not in the title.'); return; }
    var t0 = out ? M : 0, a0 = t0 + fr(a.getAttribute('Delay')), a1 = a0 + Math.max(1, fr(a.getAttribute('Duration') || '0.5'));
    var E = a.getAttribute('Interpolation') ? VMix.EASE : { type: 'linear' }, dir = a.getAttribute('Direction') || 'Left';
    function ab(L, nm, hidden) { var b = base(L, nm); keyed(L, nm, out ? [[a0, b, E], [a1, hidden, null]] : [[a0, hidden, E], [a1, b, null]]); }
    list.forEach(function (o) {
      var T = targetOf(o);
      if (type === 'Fade') {
        if (T.isLayer) {
          var all = []; (function col(l) { l.kids.forEach(function (k) { all.push(k.L); }); Object.keys(layerInfo).forEach(function (n2) { if (layerInfo[n2].parentLay === l) col(layerInfo[n2]); }); })(T.lay);
          all.forEach(function (L2) { ab(L2, 'op', 0); });
        } else ab(T.L, 'op', 0);
        return;
      }
      if (T.isLayer && !T.L) { note('A "' + type + '" animation on layer "' + objName + '" in "' + title + '" could not be converted.'); return; }
      var L = T.L, b = T.box, cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      if (type === 'Zoom') { ab(L, 'sx', 0); ab(L, 'sy', 0); return; }
      if (type === 'Fly') {
        var bw = T.bounds.w, bh = T.bounds.h, bx0 = T.isLayer ? 0 : (T.bounds.x || 0), by0 = T.isLayer ? 0 : (T.bounds.y || 0);
        if (/Left/.test(dir) || dir === 'Center') ab(L, 'x', base(L, 'x') + (bx0 - (b.x + b.w)));
        if (/Right/.test(dir)) ab(L, 'x', base(L, 'x') + (bx0 + bw - b.x));
        if (/^Top/.test(dir)) ab(L, 'y', base(L, 'y') + (by0 - (b.y + b.h)));
        if (/^Bottom/.test(dir)) ab(L, 'y', base(L, 'y') + (by0 + bh - b.y));
        if (!T.isLayer && o.lay) clipNeeded[L.id] = 1;
        return;
      }
      if (type === 'Expand') {
        var px = cx, py = cy, ax = false, ay = false;
        if (dir === 'Center') { ax = ay = true; }
        if (/Left/.test(dir)) { ax = true; px = b.x; }
        if (/Right/.test(dir)) { ax = true; px = b.x + b.w; }
        if (/^Top/.test(dir)) { ay = true; py = b.y; }
        if (/^Bottom/.test(dir)) { ay = true; py = b.y + b.h; }
        if (/^(Top|Bottom)(Left|Right)$/.test(dir)) { ax = ay = true; }
        var off = T.isLayer ? { x: base(L, 'x') - cx, y: base(L, 'y') - cy } : { x: base(L, 'x') - cx, y: base(L, 'y') - cy };
        if (ax) { ab(L, 'sx', 0); if (Math.abs(px - cx) > 0.01) ab(L, 'x', px + off.x); }
        if (ay) { ab(L, 'sy', 0); if (Math.abs(py - cy) > 0.01) ab(L, 'y', py + off.y); }
        return;
      }
      if (type === 'Reveal') {
        if (T.isLayer) { note('A Reveal on the whole layer "' + objName + '" in "' + title + '" was not converted.'); return; }
        var axis = a.getAttribute('CenterAxis') || (/^(Top|Bottom)/.test(dir) ? 'Y' : 'X');
        if (!L.mask.on) { L.mask = { on: true, shape: 'rect' }; L.p.mx = 0; L.p.my = 0; L.p.mw = b.w; L.p.mh = b.h; L.p.mr = 0; }
        if (axis === 'X') { ab(L, 'mw', 0); ab(L, 'mx', dir === 'Center' ? b.w / 2 : (dir === 'Right' ? b.w : 0)); }
        else { ab(L, 'mh', 0); ab(L, 'my', dir === 'Center' ? b.h / 2 : (dir === 'Bottom' ? b.h : 0)); }
        return;
      }
      note('The "' + type + '" animation in "' + title + '" has no match yet and was left out (on "' + objName + '").');
    });
  }
  if (inSb) anims(inSb).forEach(function (a) { apply(a, false); });
  if (outSb) anims(outSb).forEach(function (a) { apply(a, true); });
  stats.anims += (inSb ? anims(inSb).length : 0) + (outSb ? anims(outSb).length : 0);

  /* ---------- clipping (vMix layers hide what flies outside them) and masks ---------- */
  var areas = {};
  function areaFor(lay) {
    if (areas[lay.name]) return areas[lay.name];
    var A = newLayer(lay.name + ' area', 'shape');
    A.shape = 'rect'; A.p.fill = '#ffffffff'; A.p.w = lay.w; A.p.h = lay.h; A.p.ax = lay.w / 2; A.p.ay = lay.h / 2;
    if (lay.nullL) { A.parent = lay.nullL.id; A.p.x = lay.w / 2; A.p.y = lay.h / 2; } else { A.p.x = lay.x + lay.w / 2; A.p.y = lay.y + lay.h / 2; }
    extra.push(A); areas[lay.name] = A; return A;
  }
  order.forEach(function (o) {
    var L = o.L, mattes = [];
    if (o.maskName) {
      var m = (byName[o.maskName] || []).filter(function (q) { return q.L && q.L !== L; })[0];
      if (m) { mattes.push(m.L.id); stats.masks++; } else note('"' + L.name + '" in "' + title + '" is masked by "' + o.maskName + '", which was not found.');
    }
    var lay = o.lay, b = o.box, outside = lay && (b.x < -0.5 || b.y < -0.5 || b.x + b.w > lay.w + 0.5 || b.y + b.h > lay.h + 0.5);
    if (lay && (clipNeeded[L.id] || outside)) mattes.push(areaFor(lay).id);
    if (mattes.length) { L.matte = mattes[0]; L.matteMode = 'alpha'; if (mattes.length > 1) L.matteMore = mattes.slice(1).map(function (id) { return { id: id, op: 'int' }; }); }
  });

  /* front first in CG Motion; vMix lists from the back */
  var layers = order.map(function (o) { return o.L; }).reverse().concat(extra);
  layers.forEach(function (L) { L.end = comp.duration; });
  comp.layers = layers;
  p.comps.push(comp);
  stats.comps++;
  Object.keys(fonts).forEach(function (f) { stats.fonts[f] = 1; });
  return { comp: comp, thumb: files['thumbnail.png'] ? VMix.dataUrl(files['thumbnail.png'], 'image/png') : '', inEnd: M, outEnd: outEnd };
};

/* several .gtzip files -> one project with a composition per title */
VMix.convert = async function (list) {
  var p = App.blankProject(), notes = [], stats = { comps: 0, layers: 0, masks: 0, keys: 0, anims: 0, fields: {}, fonts: {}, assets: 0, n: 0 }, titles = [];
  p.comps = []; p.assets = {}; p.actions = [];
  p.imported = { from: 'vMix' };
  for (var i = 0; i < list.length; i++) {
    var f = list[i], title = String(f.name || 'Title').replace(/^.*[\\\/]/, '').replace(/\.gtzip$/i, '');
    try {
      var files = await VMix.unzip(f.bytes), r = await VMix.convertTitle(p, files, title, stats, notes);
      titles.push({ name: title, thumb: r.thumb, comp: r.comp.id });
    } catch (e) { notes.push('"' + title + '" could not be imported: ' + e.message); }
  }
  if (!p.comps.length) throw new Error(notes[0] || 'Nothing could be imported.');
  p.name = list.length === 1 ? titles[0].name : 'vMix titles';
  p.rootComp = p.comps[0].id;
  var have = {}; for (var k in p.assets) if (p.assets[k].type === 'font') have[p.assets[k].family] = 1;
  var missing = Object.keys(stats.fonts).filter(function (f2) { return !have[f2] && !/^(Arial|Segoe UI|Verdana|Tahoma|Georgia|Times New Roman|Courier New|Impact)$/i.test(f2); });
  if (missing.length) notes.unshift('Fonts used: ' + missing.join(', ') + '. A .gtzip does not contain fonts: add the font files under Assets > Fonts (then they travel inside the templates), or install them on the CasparCG PC.');
  var fl = Object.keys(stats.fields);
  return { project: p, titles: titles, report: {
    summary: stats.comps + ' title' + (stats.comps === 1 ? '' : 's') + ' (one composition each), ' + stats.layers + ' objects, ' + stats.anims + ' animations as ' + stats.keys + ' keyframes, ' + stats.masks + ' masks, ' + stats.assets + ' pictures.',
    fields: fl, notes: notes, titles: titles
  } };
};

VMix.showReport = function (rep) {
  var host = UI.doc.body;
  function close() { if (bg.parentNode) host.removeChild(bg); }
  var grid = h('div', { class: 'vmix-thumbs' }, rep.titles.map(function (t) {
    return h('button', { class: 'vmix-th', title: 'Open ' + t.name, onclick: function () { close(); App.openComp(t.comp); } }, [t.thumb ? h('img', { src: t.thumb, alt: '' }) : h('div', { class: 'vmix-noth' }), h('span', { text: t.name })]);
  }));
  var kids = [
    h('div', { class: 'modal-title', text: 'Imported from vMix' }),
    h('p', { text: rep.summary }),
    h('p', { class: 'hint', text: 'The pictures are vMix\'s own previews. Click one to open that composition and compare.' }),
    grid,
    rep.fields.length ? h('p', { class: 'hint', text: 'Fields: ' + rep.fields.join(', ') }) : null,
    h('div', { class: 'ghead', text: rep.notes.length ? 'Check these (' + rep.notes.length + ')' : 'Everything in the titles was converted' })
  ];
  if (rep.notes.length) kids.push(h('ul', { class: 'imp-notes' }, rep.notes.map(function (n) { return h('li', { text: n }); })));
  kids.push(h('p', { class: 'hint', text: 'Each title is a composition: In animation, a stop marker, then the Out animation. Fields keep their vMix names (spaces become _). Use Save to keep the project; the .gtzip files are not changed.' }));
  kids.push(h('div', { class: 'modal-btns' }, [h('button', { class: 'primary', text: 'OK', onclick: close })]));
  var bg = h('div', { class: 'modal-bg' }, h('div', { class: 'modal wide' }, kids));
  bg.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Escape' || e.key === 'Enter') close(); });
  host.appendChild(bg);
  var b = bg.querySelector('.modal-btns button'); if (b) b.focus();
};

/* [{name, bytes}] -> loads them as the open project */
VMix.open = function (list) {
  UI.status('Reading vMix title' + (list.length === 1 ? '' : 's') + '...', true);
  return VMix.convert(list).then(function (r) {
    App.load(r.project, null);
    App.setDirty(true);
    VMix.last = r.report;
    UI.status('Imported from vMix: ' + r.report.summary);
    if (!window.__test) VMix.showReport(r.report);
    return r;
  });
};
VMix.b64 = function (s) { var bin = atob(s), u8 = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return u8; };
