/* CG Motion - Affinity import (.af, .afdesign, .afphoto, .afpub, .aftemplate)
   Affinity has no published file format. This reader follows the public descriptions of
   VMDevCpp/afread (MIT) and storytold/vectorcraft's affinity crate (MIT / Apache-2.0); see NOTICE.md.
   Layout: a container (header + allocation tables + compressed entries) holding doc.dat,
   a self-describing tagged object stream, plus raster tiles and embedded files. */
var AF = (typeof AF !== 'undefined' && AF) || {};

/* ---------- little-endian cursor ---------- */
AF.cur = function (u8, pos) {
  var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  var c = { u8: u8, p: pos || 0 };
  function need(n) { if (c.p + n > u8.length) throw new Error('truncated data'); }
  c.left = function () { return u8.length - c.p; };
  c.take = function (n) { need(n); var s = u8.subarray(c.p, c.p + n); c.p += n; return s; };
  c.b = function () { need(1); return u8[c.p++]; };
  c.u16 = function () { need(2); var v = dv.getUint16(c.p, true); c.p += 2; return v; };
  c.i16 = function () { need(2); var v = dv.getInt16(c.p, true); c.p += 2; return v; };
  c.u32 = function () { need(4); var v = dv.getUint32(c.p, true); c.p += 4; return v; };
  c.i32 = function () { need(4); var v = dv.getInt32(c.p, true); c.p += 4; return v; };
  c.u64 = function () { var lo = c.u32(), hi = c.u32(); return hi * 4294967296 + lo; };
  c.i64 = function () { var lo = c.u32(), hi = c.i32(); return hi * 4294967296 + lo; };
  c.f32 = function () { need(4); var v = dv.getFloat32(c.p, true); c.p += 4; return v; };
  c.f64 = function () { need(8); var v = dv.getFloat64(c.p, true); c.p += 8; return v; };
  c.str4 = function () { return String.fromCharCode.apply(null, c.take(4)); };
  /* tags are stored byte-reversed: 'dseD' on disk reads as 'Desc' */
  c.tag = function () { var s = c.take(4); return String.fromCharCode(s[3], s[2], s[1], s[0]); };
  return c;
};
AF.utf8 = function (b) { try { return new TextDecoder('utf-8').decode(b); } catch (e) { return String.fromCharCode.apply(null, b); } };

/* ---------- CRC-32 ---------- */
AF.crcT = null;
AF.crc32 = function (b) {
  var T = AF.crcT;
  if (!T) { T = AF.crcT = new Int32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; T[n] = c; } }
  var crc = -1; for (var i = 0; i < b.length; i++) crc = T[(crc ^ b[i]) & 255] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
};

/* ---------- the container ---------- */
AF.is = function (u8) { return u8.length > 8 && u8[0] === 0 && u8[1] === 0xFF && u8[2] === 0x4B && u8[3] === 0x41; };
AF.header = function (u8) {
  if (!AF.is(u8)) throw new Error('This is not an Affinity file.');
  var c = AF.cur(u8, 4), version = c.u16(), flags = c.u16();
  if (version < 7 || version > 13) throw new Error('This Affinity file uses a container version CG Motion does not know (' + version + ').');
  if (flags & 3) throw new Error('This kind of Affinity file is not supported.');
  if (c.str4() !== 'nsrP') throw new Error('This Affinity file is a library (assets, brushes or styles), not a document.');
  if (c.str4() !== '#Inf') throw new Error('The Affinity file header is damaged.');
  var fat = c.u64(), thumb = c.u64(); c.take(16); var saved = c.u64(); c.take(8);
  if (c.str4() !== 'Prot') throw new Error('The Affinity file header is damaged.');
  return { version: version, flags: flags, fat: fat, thumb: thumb, saved: saved };
};
AF.archive = function (u8) {
  var h = AF.header(u8), latest = {}, names = {}, seen = {}, next = h.fat, tables = 0;
  while (next) {
    if (seen[next]) throw new Error('The Affinity file is damaged (its tables loop).');
    seen[next] = 1; if (++tables > 4096) throw new Error('Too many saved revisions.');
    var c = AF.cur(u8, next), tag = c.str4();
    var level = { '#FAT': 1, '#FT2': 2, '#FT3': 3, '#FT4': 4 }[tag];
    if (!level) throw new Error('The Affinity file is damaged (missing table).');
    next = c.u64(); var date = c.u64(); c.take(24);
    var files = c.u32(); c.take(8); var dirs = c.u16(); c.take(1);
    for (var i = 0; i < files; i++) {
      var id = c.u32(), flag = c.b(), rec = null;
      if (flag === 0 || flag === 1) {
        rec = { offset: c.u64(), size: c.u64(), comp: c.u64(), crc: c.u32() };
        var stored = c.b();
        if (level >= 2) c.take(4);
        if (level >= 4) c.take(4);
        rec.method = level <= 2 ? ({ 1: 0x01, 2: 0x41, 3: 0x81, 4: 0xC1 }[stored] || 0) : stored;
      } else if (flag !== 2) throw new Error('The Affinity file is damaged (unknown record).');
      if (flag === 0) { var len = c.u16(), nm = AF.utf8(c.take(len)); if (!(id in names)) names[id] = nm; }
      if (!(id in latest) || date > latest[id].date) latest[id] = { date: date, rec: rec };
    }
    for (var d = 0; d < dirs; d++) { var dl = c.u16(); c.take(10); c.take(dl); }
  }
  var entries = {};
  Object.keys(latest).forEach(function (id) { var L = latest[id]; if (L.rec && names[id] != null) { L.rec.name = names[id]; entries[names[id]] = L.rec; } });
  return { u8: u8, header: h, entries: entries, revisions: tables };
};
/* one entry: decompress, undo the byte predictor, check the CRC */
AF.read = async function (A, name) {
  var e = A.entries[name]; if (!e) throw new Error('missing entry ' + name);
  var c = AF.cur(A.u8, e.offset);
  if (c.str4() !== '#Fil') throw new Error('entry ' + name + ' has no data');
  var m = e.method & 3, data = c.take(m === 1 || m === 2 ? e.comp : e.size), out;
  if (m === 1) out = await AF.inflate(data);
  else if (m === 2) out = AF.unzstd(data, e.size);
  else out = data.slice();
  if (out.length !== e.size) throw new Error('entry ' + name + ' has the wrong size');
  AF.unpredict(out, e.method);
  if (AF.crc32(out) !== e.crc) throw new Error('entry ' + name + ' is damaged (checksum)');
  return out;
};
AF.inflate = async function (data) {
  var ds = new DecompressionStream('deflate');
  var out = new Response(new Blob([data]).stream().pipeThrough(ds));
  return new Uint8Array(await out.arrayBuffer());
};
AF.unzstd = function (data, size) { return ZSTD.decode(data, size); };
AF.unpredict = function (b, method) {
  var hi = method & 0xC0, i, prev;
  function delta() { var p = 0; for (var k = 0; k < b.length; k++) { b[k] = (b[k] + p) & 255; p = b[k]; } }
  if (hi === 0) return;
  if (hi === 0x40) return delta();
  if (hi === 0x80 && !(method & 0x20)) {
    prev = 0;
    for (i = 0; i + 1 < b.length; i += 2) { var v = ((b[i] | (b[i + 1] << 8)) + prev) & 65535; b[i] = v & 255; b[i + 1] = v >> 8; prev = v; }
    return;
  }
  if (hi === 0x80) {
    delta();
    if (b.length === 0x10000) {
      var pl = b.slice(), H = 0, L = 0x8000;
      for (i = 0; i < 0x4000; i++) { b[i * 4] = pl[L + 2 * i]; b[i * 4 + 1] = pl[H + 2 * i]; b[i * 4 + 2] = pl[L + 2 * i + 1]; b[i * 4 + 3] = pl[H + 2 * i + 1]; }
    }
    return;
  }
  throw new Error('unsupported entry predictor');
};
/* the PNG preview Affinity stores of itself (its own render, up to ~512 px) */
AF.thumbnail = function (A) {
  var u8 = A.u8, p = A.header.thumb;
  if (!p || p + 29 > u8.length) return null;
  if (!(u8[p] === 255 && u8[p + 1] === 255 && u8[p + 2] === 255 && u8[p + 3] === 255 && String.fromCharCode(u8[p + 4], u8[p + 5], u8[p + 6], u8[p + 7]) === 'Thmb')) return null;
  var size = AF.cur(u8, p + 24).u32();
  if (p + 29 + size > u8.length || u8[p + 29] !== 0x89) return null;
  return u8.slice(p + 29, p + 29 + size);
};

/* ---------- the tagged object stream (doc.dat) ---------- */
/* objects: {cls, kind, chain:[], f:{tag:value}, order:[[tag,value]]}; values: numbers, strings,
   arrays, Uint8Array (bytes), {entry:name}, {en:id}, {obj:object}|null */
AF.stream = function (u8) {
  var c = AF.cur(u8, 0);
  if (c.str4() !== '\x00\xffKS') throw new Error('The Affinity document data is damaged.');
  var version = c.u16(); if (version > 2) throw new Error('This Affinity document version is not supported yet.');
  var cls = c.tag(); c.u16(); if (version === 2) c.u32();
  var shared = {}, depth = 0, count = 0;
  function mk(cls, kind, chain) { return { cls: cls, kind: kind, chain: chain, f: {}, list: [] }; }
  function put(o, tag, v) { o.list.push([tag, v]); if (!(tag in o.f)) o.f[tag] = v; }
  function fields(o, tagged, cls) {
    if (++depth > 384) throw new Error('objects nested too deeply');
    for (;;) {
      var t = c.b(), code = t & 0x7F;
      if (!code) break;
      if (++count > 16777216) throw new Error('document too large');
      var tag = tagged ? c.tag() : '';
      put(o, tag, t & 0x80 ? array(code, cls) : scalar(code, tagged, cls));
    }
    depth--;
    return o;
  }
  function string() { return AF.utf8(c.take(c.u32())); }
  function floats(n, wide) { var v = []; for (var i = 0; i < n; i++) v.push(wide ? c.f64() : c.f32()); return v; }
  function scalar(code, tagged, cls) {
    switch (code) {
      case 0x01: return c.b(); case 0x02: return c.u16(); case 0x03: case 0x2f: case 0x34: return c.u32(); case 0x04: return c.u64();
      case 0x05: var b = c.b(); return b > 127 ? b - 256 : b; case 0x06: return c.i16(); case 0x07: return c.i32(); case 0x08: return c.i64();
      case 0x09: return c.f32(); case 0x0a: return c.f64();
      case 0x29: return c.b() !== 0;
      case 0x2a: return { en: c.u16(), ver: c.u16() };
      case 0x2b: case 0x2e: return string();
      case 0x2c: return c.take(c.u16()).slice();
      case 0x2d: return { blob: c.take(c.u32()).slice() };
      case 0x33: c.u32(); return { entry: AF.utf8(c.take(c.u32())) };
      case 0x75: c.u16(); var n = c.b(); if (n > 8) throw new Error('flags'); var fb = c.take(n), fv = 0; for (var i = n - 1; i >= 0; i--) fv = fv * 256 + fb[i]; return fv;
      case 0x30: return { obj: fields(mk(cls, 'pos', []), false, cls) };
      case 0x31: if (!tagged) throw new Error('object without a tag'); return sharedObj();
      case 0x32: if (!tagged) throw new Error('object without a tag'); return inline(null);
    }
    if (code >= 0x15 && code <= 0x19) { var v = []; for (var k = 0; k < code - 0x13; k++) v.push(c.i32()); return v; }
    if (code >= 0x1f && code <= 0x23) return floats(code - 0x1d, false);
    if (code >= 0x24 && code <= 0x28) return floats(code - 0x22, true);
    if (code >= 0x35 && code <= 0x74) return c.take(code - 0x34).slice();
    throw new Error('unknown field type 0x' + code.toString(16));
  }
  function array(code, cls) {
    var n, v = [], i;
    switch (code) {
      case 0x29: n = c.u32(); var bits = c.take(Math.ceil(n / 8)); for (i = 0; i < n; i++) v.push(!!(bits[i >> 3] >> (i & 7) & 1)); return v;
      case 0x2a: n = c.u32(); var ver = c.u16(); for (i = 0; i < n; i++) v.push({ en: c.u16(), ver: ver }); return v;
      case 0x2b: case 0x2e: c.u32(); n = c.u32(); for (i = 0; i < n; i++) v.push(string()); return v;
      case 0x2c: n = c.u32(); var sz = c.u16(); for (i = 0; i < n; i++) v.push(c.take(sz).slice()); return v;
      case 0x32: n = c.u32(); var ac = c.tag(); c.u16(); for (i = 0; i < n; i++) v.push(inline(ac)); return v;
      case 0x2d: case 0x33: case 0x75: throw new Error('array of an unarrayable type');
    }
    n = c.u32(); if (n > c.left()) throw new Error('array longer than its data');
    for (i = 0; i < n; i++) v.push(scalar(code, true, cls));
    return v;
  }
  function inline(cls) {
    var m = c.b(); if (m === 0) return null; if (m !== 1) throw new Error('object marker');
    if (!cls) { cls = c.tag(); c.u16(); }
    return { obj: fields(mk(cls, 'inline', [cls]), true, cls) };
  }
  function sharedObj() {
    var flag = c.b(); if (flag === 0) return null;
    var key = c.u32();
    if (flag === 2) { if (!shared[key]) throw new Error('reference to an undefined object'); return { obj: shared[key] }; }
    if (flag !== 1) throw new Error('object marker');
    var o = mk('', 'shared', []); shared[key] = o;
    for (;;) {
      var m = c.b();
      if (m === 0) { var t = c.tag(); c.u16(); o.chain.push(t); fields(o, true, t); }
      else if (m === 1) { o.chain.push(c.tag()); break; }
      else if (m === 2) break;
      else throw new Error('object class chain');
      if (o.chain.length > 64) throw new Error('class chain too long');
    }
    o.cls = o.chain[0] || '';
    fields(o, true, o.cls);
    return { obj: o };
  }
  var root = mk(cls, 'root', [cls]);
  fields(root, true, cls);
  return root;
};
/* helpers for walking objects */
AF.o = function (v) { return v && v.obj ? v.obj : null; };
AF.get = function (o, tag) { return o && o.f ? o.f[tag] : undefined; };
AF.is_ = function (o, cls) { return !!o && (o.cls === cls || o.chain.indexOf(cls) >= 0); };

if (typeof module !== 'undefined') module.exports = AF;
