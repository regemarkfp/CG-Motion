/* CG Motion - Zstandard decoder (RFC 8878), written for reading Affinity files.
   Decodes one or more concatenated frames; skippable frames are ignored; dictionaries are not supported. */
var ZSTD = (function () {
  /* ---------- bit readers ---------- */
  function Back(src, start, end) { // backward bitstream over src[start, end)
    if (end <= start) throw new Error('zstd: empty bitstream');
    var last = src[end - 1]; if (!last) throw new Error('zstd: bad bitstream padding');
    var hb = 31 - Math.clz32(last);
    this.s = src; this.st = start; this.pos = (end - start - 1) * 8 + hb; // bits available
  }
  Back.prototype.bits = function (n) {
    if (n === 0) return 0;
    if (n > 24) { var hi = this.bits(n - 16); return hi * 65536 + this.bits(16); }
    this.pos -= n;
    var p = this.pos, s = this.s, st = this.st, v = 0;
    if (p < 0) { // reading past the start gives zeros in the low bits
      var have = n + p; if (have <= 0) return 0;
      var w0 = (s[st] | (s[st + 1] << 8) | (s[st + 2] << 16) | (s[st + 3] << 24)) >>> 0;
      return ((w0 & ((1 << have) - 1)) << (-p)) >>> 0;
    }
    var b = p >> 3, sh = p & 7, i0 = st + b;
    v = s[i0] | (s[i0 + 1] << 8) | (s[i0 + 2] << 16) | ((s[i0 + 3] || 0) << 24);
    return ((v >>> sh) & ((1 << n) - 1)) >>> 0;
  };
  Back.prototype.done = function () { return this.pos <= 0; };

  /* ---------- FSE ---------- */
  function hb(x) { return 31 - Math.clz32(x); }
  // read a normalized distribution (forward bits); returns {probs, log, size}
  function readDist(src, p, end, maxSym) {
    var bitPos = p * 8;
    function rd(n) { var v = 0; for (var i = 0; i < n; i++) { var bp = bitPos + i; v |= ((src[bp >> 3] >> (bp & 7)) & 1) << i; } bitPos += n; return v; }
    function peekRd(n) { var save = bitPos, v = rd(n); bitPos = save; return v; }
    var log = rd(4) + 5, remaining = 1 << log, probs = [], sym = 0;
    while (remaining > 0 && sym <= maxSym) {
      var bits = hb(remaining + 1) + 1, v = rd(bits);
      var lowMask = (1 << (bits - 1)) - 1, thr = (1 << bits) - 1 - (remaining + 1);
      if ((v & lowMask) < thr) { bitPos -= 1; v = v & lowMask; }
      else if (v > lowMask) v -= thr;
      var prob = v - 1;
      probs[sym++] = prob;
      remaining -= prob < 0 ? -prob : prob;
      if (prob === 0) {
        for (;;) { var rep = rd(2); for (var r = 0; r < rep; r++) probs[sym++] = 0; if (rep !== 3) break; }
      }
    }
    if (remaining !== 0) throw new Error('zstd: bad FSE distribution');
    return { probs: probs, log: log, size: Math.ceil(bitPos / 8) - p };
  }
  // build a decoding table: arrays sym, nb, base
  function buildTable(probs, log) {
    var size = 1 << log, sym = new Uint8Array(size), nb = new Uint8Array(size), base = new Uint16Array(size);
    var high = size - 1, next = [], s;
    for (s = 0; s < probs.length; s++) if (probs[s] === -1) { sym[high--] = s; next[s] = 1; }
    var step = (size >> 1) + (size >> 3) + 3, mask = size - 1, pos = 0;
    for (s = 0; s < probs.length; s++) {
      if (probs[s] <= 0) continue;
      next[s] = probs[s];
      for (var i = 0; i < probs[s]; i++) { sym[pos] = s; do pos = (pos + step) & mask; while (pos > high); }
    }
    if (pos !== 0) throw new Error('zstd: bad FSE table');
    for (var u = 0; u < size; u++) {
      var sy = sym[u], ns = next[sy]++;
      var nbits = log - hb(ns);
      nb[u] = nbits; base[u] = (ns << nbits) - size;
    }
    return { sym: sym, nb: nb, base: base, log: log };
  }
  function rleTable(symbol) { return { sym: new Uint8Array([symbol]), nb: new Uint8Array([0]), base: new Uint16Array([0]), log: 0 }; }

  /* ---------- predefined sequence tables ---------- */
  var LL_DEF = [4, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 2, 1, 1, 1, 1, 1, -1, -1, -1, -1];
  var ML_DEF = [1, 4, 3, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, -1, -1, -1, -1, -1, -1, -1];
  var OF_DEF = [1, 1, 1, 1, 1, 1, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, -1, -1, -1, -1, -1];
  var LL_BASE = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 28, 32, 40, 48, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536];
  var LL_BITS = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 3, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
  var ML_BASE = [], ML_BITS = [];
  (function () {
    for (var i = 0; i < 32; i++) { ML_BASE[i] = i + 3; ML_BITS[i] = 0; }
    var rest = [[35, 1], [37, 1], [39, 1], [41, 1], [43, 2], [47, 2], [51, 3], [59, 3], [67, 4], [83, 4], [99, 5], [131, 7], [259, 8], [515, 9], [1027, 10], [2051, 11], [4099, 12], [8195, 13], [16387, 14], [32771, 15], [65539, 16]];
    rest.forEach(function (r, k) { ML_BASE[32 + k] = r[0]; ML_BITS[32 + k] = r[1]; });
  })();
  var T_LL, T_ML, T_OF;
  function defs() { if (!T_LL) { T_LL = buildTable(LL_DEF, 6); T_ML = buildTable(ML_DEF, 6); T_OF = buildTable(OF_DEF, 5); } }

  /* ---------- Huffman ---------- */
  function readHuffTable(src, p) {
    var hdr = src[p], weights = [], used;
    if (hdr < 128) { // FSE-compressed weights
      var d = readDist(src, p + 1, p + 1 + hdr, 255), t = buildTable(d.probs, d.log);
      var br = new Back(src, p + 1 + d.size, p + 1 + hdr);
      var s1 = br.bits(t.log), s2 = br.bits(t.log);
      for (;;) {
        weights.push(t.sym[s1]); s1 = t.base[s1] + br.bits(t.nb[s1]);
        if (br.pos < 0) { weights.push(t.sym[s2]); break; }
        weights.push(t.sym[s2]); s2 = t.base[s2] + br.bits(t.nb[s2]);
        if (br.pos < 0) { weights.push(t.sym[s1]); break; }
        if (weights.length > 255) throw new Error('zstd: too many Huffman weights');
      }
      used = 1 + hdr;
    } else {
      var n = hdr - 127;
      for (var i = 0; i < n; i++) { var b = src[p + 1 + (i >> 1)]; weights.push(i & 1 ? b & 15 : b >> 4); }
      used = 1 + Math.ceil(n / 2);
    }
    var total = 0; weights.forEach(function (w) { if (w) total += 1 << (w - 1); });
    var maxBits = hb(total) + 1, left = (1 << maxBits) - total;
    if (left & (left - 1)) throw new Error('zstd: bad Huffman weights');
    weights.push(hb(left) + 1);
    var size = 1 << maxBits, sym = new Uint8Array(size), nb = new Uint8Array(size), pos = 0;
    // assign codes: longest codes (smallest weight) first, by symbol order within a weight
    for (var w = 1; w <= maxBits; w++) {
      for (var s = 0; s < weights.length; s++) {
        if (weights[s] !== w) continue;
        var len = 1 << (w - 1), bits = maxBits + 1 - w;
        for (var k = 0; k < len; k++) { sym[pos + k] = s; nb[pos + k] = bits; }
        pos += len;
      }
    }
    return { used: used, t: { sym: sym, nb: nb, max: maxBits } };
  }
  function huffStream(src, start, end, H, out, o, n) {
    var br = new Back(src, start, end), max = H.max;
    for (var i = 0; i < n; i++) {
      // peek max bits without consuming, then give back the unused ones
      var v = br.bits(max), u = H.nb[v];
      br.pos += max - u;
      out[o + i] = H.sym[v];
    }
  }

  /* ---------- frames ---------- */
  function decode(src, sizeHint) {
    var chunks = [], total = 0, p = 0;
    while (p < src.length) {
      if (src.length - p < 4) break;
      var magic = (src[p] | (src[p + 1] << 8) | (src[p + 2] << 16) | (src[p + 3] << 24)) >>> 0;
      if ((magic & 0xFFFFFFF0) === 0x184D2A50) { var sl = (src[p + 4] | (src[p + 5] << 8) | (src[p + 6] << 16) | (src[p + 7] << 24)) >>> 0; p += 8 + sl; continue; }
      if (magic !== 0xFD2FB528) throw new Error('zstd: not a zstd frame');
      var r = frame(src, p + 4, sizeHint ? sizeHint - total : 0);
      chunks.push(r.out); total += r.out.length; p = r.end;
    }
    if (chunks.length === 1) return chunks[0];
    var all = new Uint8Array(total), q = 0; chunks.forEach(function (c) { all.set(c, q); q += c.length; });
    return all;
  }
  function frame(src, p, hint) {
    var fhd = src[p++], fcsFlag = fhd >> 6, single = (fhd >> 5) & 1, check = (fhd >> 2) & 1, didFlag = fhd & 3;
    var win = 0;
    if (!single) { var wd = src[p++], exp = wd >> 3, mant = wd & 7, wb = Math.pow(2, 10 + exp); win = wb + (wb / 8) * mant; }
    p += [0, 1, 2, 4][didFlag];
    if (didFlag && false) throw new Error('zstd: dictionaries are not supported');
    var fcsLen = [single ? 1 : 0, 2, 4, 8][fcsFlag], fcs = -1;
    if (fcsLen) { fcs = 0; for (var i = fcsLen - 1; i >= 0; i--) fcs = fcs * 256 + src[p + i]; if (fcsLen === 2) fcs += 256; p += fcsLen; }
    var cap = fcs >= 0 ? fcs : (hint || (1 << 20));
    var st = { out: new Uint8Array(cap), o: 0, rep: [1, 4, 8], huff: null, tLL: null, tML: null, tOF: null };
    for (;;) {
      var bh = src[p] | (src[p + 1] << 8) | (src[p + 2] << 16); p += 3;
      var last = bh & 1, type = (bh >> 1) & 3, size = bh >>> 3;
      if (type === 0) { ensure(st, size); st.out.set(src.subarray(p, p + size), st.o); st.o += size; p += size; }
      else if (type === 1) { ensure(st, size); st.out.fill(src[p], st.o, st.o + size); st.o += size; p += 1; }
      else if (type === 2) { block(src, p, p + size, st); p += size; }
      else throw new Error('zstd: reserved block type');
      if (last) break;
    }
    if (check) p += 4;
    return { out: st.o === st.out.length ? st.out : st.out.slice(0, st.o), end: p };
  }
  function ensure(st, n) {
    if (st.o + n <= st.out.length) return;
    var nn = Math.max(st.out.length * 2, st.o + n), b = new Uint8Array(nn); b.set(st.out.subarray(0, st.o)); st.out = b;
  }
  function block(src, p, end, st) {
    /* literals */
    var b0 = src[p], ltype = b0 & 3, sf = (b0 >> 2) & 3, regen, csize, streams = 1, lit;
    if (ltype < 2) {
      if (sf === 0 || sf === 2) { regen = b0 >> 3; p += 1; }
      else if (sf === 1) { regen = (b0 >> 4) + (src[p + 1] << 4); p += 2; }
      else { regen = (b0 >> 4) + (src[p + 1] << 4) + (src[p + 2] << 12); p += 3; }
      if (ltype === 0) { lit = src.subarray(p, p + regen); p += regen; }
      else { lit = new Uint8Array(regen).fill(src[p]); p += 1; }
    } else {
      var h = 0;
      if (sf < 2) { h = src[p] | (src[p + 1] << 8) | (src[p + 2] << 16); regen = (h >> 4) & 1023; csize = (h >> 14) & 1023; streams = sf === 0 ? 1 : 4; p += 3; }
      else if (sf === 2) { h = (src[p] | (src[p + 1] << 8) | (src[p + 2] << 16) | (src[p + 3] << 24)) >>> 0; regen = (h >>> 4) & 16383; csize = (h >>> 18) & 16383; streams = 4; p += 4; }
      else { var lo = (src[p] | (src[p + 1] << 8) | (src[p + 2] << 16) | (src[p + 3] << 24)) >>> 0; regen = (lo >>> 4) & 262143; csize = ((lo >>> 22) | (src[p + 4] << 10)) & 262143; streams = 4; p += 5; }
      var cend = p + csize;
      if (ltype === 2) { var ht = readHuffTable(src, p); st.huff = ht.t; p += ht.used; }
      else if (!st.huff) throw new Error('zstd: missing Huffman table');
      lit = new Uint8Array(regen);
      if (streams === 1) huffStream(src, p, cend, st.huff, lit, 0, regen);
      else {
        var s1 = src[p] | (src[p + 1] << 8), s2 = src[p + 2] | (src[p + 3] << 8), s3 = src[p + 4] | (src[p + 5] << 8);
        var q = p + 6, seg = Math.ceil(regen / 4), n4 = regen - 3 * seg;
        huffStream(src, q, q + s1, st.huff, lit, 0, seg); q += s1;
        huffStream(src, q, q + s2, st.huff, lit, seg, seg); q += s2;
        huffStream(src, q, q + s3, st.huff, lit, 2 * seg, seg); q += s3;
        huffStream(src, q, cend, st.huff, lit, 3 * seg, n4);
      }
      p = cend;
    }
    /* sequences */
    var nseq = src[p++];
    if (nseq >= 128) { if (nseq < 255) nseq = ((nseq - 128) << 8) + src[p++]; else { nseq = src[p] + (src[p + 1] << 8) + 0x7F00; p += 2; } }
    if (nseq === 0) { ensure(st, lit.length); st.out.set(lit, st.o); st.o += lit.length; return; }
    var modes = src[p++];
    defs();
    function table(mode, def, maxSym, prev) {
      if (mode === 0) return def;
      if (mode === 1) return rleTable(src[p++]);
      if (mode === 2) { var d = readDist(src, p, end, maxSym); p += d.size; return buildTable(d.probs, d.log); }
      if (!prev) throw new Error('zstd: missing repeat table');
      return prev;
    }
    st.tLL = table(modes >> 6, T_LL, 35, st.tLL);
    st.tOF = table((modes >> 4) & 3, T_OF, 31, st.tOF);
    st.tML = table((modes >> 2) & 3, T_ML, 52, st.tML);
    var LL = st.tLL, OF = st.tOF, ML = st.tML;
    var br = new Back(src, p, end);
    var sLL = br.bits(LL.log), sOF = br.bits(OF.log), sML = br.bits(ML.log);
    var lp = 0, rep = st.rep;
    for (var i = 0; i < nseq; i++) {
      var ofc = OF.sym[sOF], mlc = ML.sym[sML], llc = LL.sym[sLL];
      var ofv = ofc > 0 ? Math.pow(2, ofc) + br.bits(ofc) : 1;
      if (ofc === 0) ofv = 1 + br.bits(0);
      var ml = ML_BASE[mlc] + br.bits(ML_BITS[mlc]);
      var ll = LL_BASE[llc] + br.bits(LL_BITS[llc]);
      var off;
      if (ofv > 3) { off = ofv - 3; rep[2] = rep[1]; rep[1] = rep[0]; rep[0] = off; }
      else {
        var idx = ofv - 1 + (ll === 0 ? 1 : 0);
        if (idx === 0) off = rep[0];
        else {
          off = idx === 3 ? rep[0] - 1 : rep[idx];
          if (idx > 1) rep[2] = rep[1];
          rep[1] = rep[0]; rep[0] = off;
        }
      }
      if (i < nseq - 1) {
        sLL = LL.base[sLL] + br.bits(LL.nb[sLL]);
        sML = ML.base[sML] + br.bits(ML.nb[sML]);
        sOF = OF.base[sOF] + br.bits(OF.nb[sOF]);
      }
      ensure(st, ll + ml);
      var out = st.out, o = st.o;
      if (ll) { out.set(lit.subarray(lp, lp + ll), o); o += ll; lp += ll; }
      if (off > o) throw new Error('zstd: offset beyond output');
      var from = o - off;
      if (off >= ml) { out.copyWithin(o, from, from + ml); o += ml; }
      else for (var k = 0; k < ml; k++) out[o++] = out[from + k];
      st.o = o;
    }
    if (lp < lit.length) { ensure(st, lit.length - lp); st.out.set(lit.subarray(lp), st.o); st.o += lit.length - lp; }
  }
  return { decode: decode };
})();
if (typeof module !== 'undefined') module.exports = ZSTD;
