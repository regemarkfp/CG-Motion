/* CG Motion - Data panel: edit the rows, columns, series and items of tables, charts and crawls in a grid
   instead of typing the text format. The grid reads and writes the same text CasparCG sends, so both stay in step. */
var DataEd = {};

DataEd.layer = function () {
  var ls = App.selLayers();
  return ls.length === 1 && /^(table|chart|crawl)$/.test(ls[0].type) ? ls[0] : null;
};

/* ---------- reading and writing the text formats ---------- */
DataEd.read = function (L) {
  if (L.type === 'table') {
    var rows = RT.parseTable(L.rows || '', L), n = 0;
    rows.forEach(function (r) { n = Math.max(n, r.length); });
    rows.forEach(function (r) { while (r.length < n) r.push(''); });
    return { kind: 'table', rows: rows, cols: n };
  }
  if (L.type === 'crawl') {
    var sep = L.itemSep || '|', st = L.styles && L.styles.on && L.styles.sep ? L.styles : null, parts = st ? Math.max(1, (st.segs || []).length) : 1;
    var items = String(L.text || '').split(sep).map(function (x) { return x.replace(/^\s+|\s+$/g, ''); }).filter(function (x) { return x !== ''; });
    var rws = items.map(function (it) { var a = st ? it.split(st.sep) : [it]; while (a.length < parts) a.push(''); return a; });
    rws.forEach(function (r) { parts = Math.max(parts, r.length); });
    rws.forEach(function (r) { while (r.length < parts) r.push(''); });
    return { kind: 'crawl', rows: rws, cols: parts, partSep: st ? st.sep : '' };
  }
  var ct = L.chart || 'line';
  if (ct === 'dual') {
    var d = RT.parseDual(L.data || '');
    return { kind: 'dual', names: d.names, rows: d.rows.map(function (r) { return [r.label, r.a, r.b]; }), cols: 3 };
  }
  var ser = RT.parseSeries(L.data || '');
  if (ct === 'line' || ct === 'bar') {
    var pts = 0;
    ser.forEach(function (s) { pts = Math.max(pts, s.vals.length); });
    pts = Math.max(pts, +L.dataPts || 0);
    return { kind: 'series', pts: pts, rows: ser.map(function (s) {
      var r = [s.name];
      for (var i = 0; i < pts; i++) r.push(i < s.vals.length ? String(s.vals[i]) + new Array((s.marks[i] || 0) + 1).join('w') : '');
      return r;
    }) };
  }
  return { kind: 'items', rows: ser.map(function (s) { return [s.name, s.vals.length ? String(s.vals[0]) : '']; }), cols: 2 };
};
DataEd.write = function (L, m) {
  function clean(v) { return String(v == null ? '' : v).replace(/^\s+|\s+$/g, ''); }
  if (m.kind === 'table') {
    var cs = L.cellSep || '|', rs = L.rowSep || '\n', risky = false;
    m.rows.forEach(function (r) { r.forEach(function (c) { if (String(c).indexOf(cs) >= 0 || String(c).indexOf(rs) >= 0 || /\n/.test(c)) risky = true; }); });
    /* a cell holding the separator itself is kept safe by storing the table as JSON */
    L.rows = risky ? JSON.stringify(m.rows.map(function (r) { return r.map(clean); })) : m.rows.map(function (r) { return r.map(clean).join(cs); }).join(rs);
  } else if (m.kind === 'crawl') {
    var isep = L.itemSep || '|';
    L.text = m.rows.map(function (r) {
      var parts = r.map(clean);
      while (parts.length > 1 && parts[parts.length - 1] === '') parts.pop();
      return m.partSep ? parts.join(m.partSep) : parts[0];
    }).filter(function (x) { return x !== ''; }).join(' ' + isep + ' ');
  } else if (m.kind === 'dual') {
    L.data = [clean(m.names[0]) + ' | ' + clean(m.names[1])].concat(m.rows.filter(function (r) { return clean(r[0]) || clean(r[1]) || clean(r[2]); }).map(function (r) { return clean(r[0]) + ': ' + clean(r[1]) + ' | ' + clean(r[2]); })).join('\n');
  } else if (m.kind === 'series') {
    L.data = m.rows.map(function (r) {
      var vals = r.slice(1).map(clean);
      while (vals.length && vals[vals.length - 1] === '') vals.pop();
      return (clean(r[0]) || 'Series') + ': ' + vals.map(function (v) { return v === '' ? '0' : v; }).join(', ');
    }).join('\n');
  } else {
    L.data = m.rows.filter(function (r) { return clean(r[0]) || clean(r[1]); }).map(function (r) { return (clean(r[0]) || 'Item') + ': ' + (clean(r[1]) || '0'); }).join('\n');
  }
};
/* the text CasparCG would send for this layer */
DataEd.fieldText = function (L) { return L.type === 'table' ? (L.rows || '') : (L.type === 'chart' ? (L.data || '') : (L.text || '')); };

/* per-column lists (widths, alignment, colours) follow columns and rows as they are added, moved and removed */
function deList(s, n, dflt) { var a = String(s == null ? '' : s).split(',').map(function (x) { return x.replace(/^\s+|\s+$/g, ''); }); if (a.length === 1 && a[0] === '') a = []; while (a.length < n) a.push(a.length ? a[a.length - 1] : dflt); return a; }

/* ---------- the panel ---------- */
Panels.data = function (el) {
  var L = DataEd.layer();
  if (!L) {
    el.appendChild(h('div', { class: 'ghead', text: 'Data' }));
    el.appendChild(h('p', { class: 'hint', text: 'Select a table, chart or crawl layer to edit its rows, columns, series and items here in a grid.' }));
    return;
  }
  var m = DataEd.read(L), ct = L.chart || 'line';
  /* edits typed in the grid do not rebuild the grid (the cursor stays where it is) */
  function commit() { DataEd.write(L, m); DataEd.quiet = true; try { App.commit(); } finally { DataEd.quiet = false; } }
  function rebuild() { DataEd.write(L, m); App.commit(); Panels.build(); }
  function btn(t, fn, title, cls) { return h('button', { text: t, title: title || '', class: cls || '', onclick: function () { fn(); } }); }
  var kindName = L.type === 'table' ? 'Table' : (L.type === 'crawl' ? 'Crawl items' : { line: 'Line chart', bar: 'Bar chart', hbar: 'Horizontal bars', pie: 'Pie', donut: 'Donut', dual: 'Double bars' }[ct] || 'Chart');
  el.appendChild(h('div', { class: 'ghead' }, [kindName + ': ' + L.name, h('span', { class: 'grow' }),
    btn('Copy as field data', function () { UI.copy(DataEd.fieldText(L)); UI.status('Copied in the format CasparCG sends' + (L.key ? ' in the "' + L.key + '" field.' : '.')); }, 'Copy this data as the text CasparCG sends, for RFP Manager or a test')]));
  /* ---- CasparCG control ---- */
  var onAir = h('input', { type: 'checkbox', title: 'CasparCG can replace this data on air' });
  onAir.checked = !!L.key;
  onAir.addEventListener('change', function () { L.key = onAir.checked ? (L.key || App.freeKey(L.type)) : ''; App.commit(); Panels.build(); });
  var cg = [h('label', { class: 'de-cg' }, [onAir, ' Filled from CasparCG'])];
  if (L.key) {
    var kin = h('input', { type: 'text', value: L.key, class: 'de-key', title: 'Field name' });
    kin.addEventListener('change', function () { var v = kin.value.replace(/[^A-Za-z0-9_]/g, ''); if (v) L.key = v; App.commit(); Panels.build(); });
    var cells = h('input', { type: 'checkbox' });
    cells.checked = L.cells !== false;
    cells.addEventListener('change', function () { L.cells = cells.checked; App.commit(); Panels.build(); });
    cg.push(h('span', { text: 'field' }), kin, h('label', { class: 'de-cg', title: 'Each cell, value, name and colour also gets its own field, so CasparCG can change one number without sending the whole table' }, [cells, ' every cell as its own field']));
  }
  el.appendChild(h('div', { class: 'pbar de-cgbar' }, cg));
  if (L.key) el.appendChild(h('p', { class: 'hint', text: 'This is the design data. On air the "' + L.key + '" field replaces all of it' + (L.cells !== false ? ', and single cells can be changed with their own fields: point at a cell to see its field name.' : '.') }));
  else el.appendChild(h('p', { class: 'hint', text: 'Tick "Filled from CasparCG" so the data can be changed on air.' }));
  function cellKey(ri, c) {
    if (!L.key || L.cells === false) return '';
    var k = L.key + '_', hd = L.header ? 1 : 0;
    if (m.kind === 'table') return k + (hd && ri === 0 ? 'h' + (c + 1) : 'r' + (ri - hd + 1) + 'c' + (c + 1));
    if (m.kind === 'series') return k + (c === 0 ? 'n' + (ri + 1) : 'v' + (ri + 1) + 'p' + c);
    if (m.kind === 'items') return k + (c === 0 ? 'n' : 'v') + (ri + 1);
    if (m.kind === 'dual') return k + ['s', 'a', 'b'][c] + (ri + 1);
    if (m.kind === 'crawl') return k + 'i' + (ri + 1);
    return '';
  }

  var colours = String(L.colors || '').split(/[,\s]+/).filter(Boolean);
  var PAL = ['#00ff83', '#3b9dff', '#ff9f1a', '#ff4d6d', '#b56ce6', '#f5c542', '#19c2c2', '#e4576e'];
  function colourChip(i) {
    var cp = UI.colorParts(function () { var a = String(L.colors || '').split(/[,\s]+/).filter(Boolean); while (a.length <= i) a.push(PAL[a.length % PAL.length]); a[i] = cp.val.slice(0, 7); L.colors = a.join(', '); App.commit(); });
    cp.show((colours[i] || PAL[i % PAL.length]) + 'ff');
    cp.chip.title = 'Colour' + (L.key && L.cells !== false ? '  (CasparCG field: ' + L.key + '_c' + (i + 1) + ')' : '');
    return cp.chip;
  }
  /* colours follow their row when rows move or go */
  function moveColour(from, to) { var a = String(L.colors || '').split(/[,\s]+/).filter(Boolean); if (!a.length) return; while (a.length <= Math.max(from, to)) a.push(PAL[a.length % PAL.length]); var c = a.splice(from, 1)[0]; if (to >= 0) a.splice(to, 0, c); L.colors = a.join(', '); }

  var grid = h('table', { class: 'de-grid' }), cols = m.kind === 'series' ? m.pts + 1 : (m.cols || 2);
  /* ---- column header row ---- */
  var head = h('tr');
  head.appendChild(h('th', { class: 'de-rh' }));
  if (m.kind === 'table') {
    var wts = deList(L.cols, cols, '1'), als = deList(L.aligns, cols, 'l');
    for (var c = 0; c < cols; c++) (function (c) {
      var w = h('input', { type: 'number', value: wts[c], min: 0.1, step: 0.5, title: 'Column width (relative to the others)', class: 'de-num' });
      w.addEventListener('change', function () { var a = deList(L.cols, cols, '1'); a[c] = String(Math.max(0.1, +w.value || 1)); L.cols = a.join(','); App.commit(); });
      var al = h('select', { title: 'Alignment' }, [['l', 'Left'], ['c', 'Centre'], ['r', 'Right']].map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
      al.value = (als[c] || 'l').charAt(0).toLowerCase();
      al.addEventListener('change', function () { var a = deList(L.aligns, cols, 'l'); a[c] = al.value; L.aligns = a.join(','); App.commit(); });
      head.appendChild(h('th', {}, [h('div', { class: 'de-ch' }, [h('b', { text: 'Column ' + (c + 1) }), h('span', { class: 'grow' }),
        c > 0 ? btn('←', function () { m.rows.forEach(function (r) { var x = r.splice(c, 1)[0]; r.splice(c - 1, 0, x); }); var a = deList(L.cols, cols, '1'), b = deList(L.aligns, cols, 'l'); a.splice(c - 1, 0, a.splice(c, 1)[0]); b.splice(c - 1, 0, b.splice(c, 1)[0]); L.cols = a.join(','); L.aligns = b.join(','); rebuild(); }, 'Move left') : null,
        c < cols - 1 ? btn('→', function () { m.rows.forEach(function (r) { var x = r.splice(c, 1)[0]; r.splice(c + 1, 0, x); }); var a = deList(L.cols, cols, '1'), b = deList(L.aligns, cols, 'l'); a.splice(c + 1, 0, a.splice(c, 1)[0]); b.splice(c + 1, 0, b.splice(c, 1)[0]); L.cols = a.join(','); L.aligns = b.join(','); rebuild(); }, 'Move right') : null,
        cols > 1 ? btn('×', function () { m.rows.forEach(function (r) { r.splice(c, 1); }); var a = deList(L.cols, cols, '1'), b = deList(L.aligns, cols, 'l'); a.splice(c, 1); b.splice(c, 1); L.cols = a.join(','); L.aligns = b.join(','); rebuild(); }, 'Remove this column') : null]),
        h('div', { class: 'de-cs' }, [w, al])]));
    })(c);
  } else if (m.kind === 'series') {
    head.appendChild(h('th', { text: 'Series' }));
    var first = L.xStart == null || L.xStart === '' ? (L.cumul ? 1 : 1) : +L.xStart;
    for (var p = 0; p < m.pts; p++) (function (p) {
      head.appendChild(h('th', {}, [h('div', { class: 'de-ch' }, [h('b', { text: String(p + first) }), h('span', { class: 'grow' }),
        btn('×', function () { m.rows.forEach(function (r) { r.splice(p + 1, 1); }); m.pts--; L.dataPts = m.pts; rebuild(); }, 'Remove this point (over)')])]));
    })(p);
  } else if (m.kind === 'dual') {
    ['Stat', 'Left', 'Right'].forEach(function (t) { head.appendChild(h('th', { text: t })); });
  } else if (m.kind === 'crawl') {
    for (var q = 0; q < cols; q++) head.appendChild(h('th', { text: cols > 1 ? 'Part ' + (q + 1) : 'Item' }));
  } else {
    ['Label', 'Value'].forEach(function (t) { head.appendChild(h('th', { text: t })); });
  }
  if (m.kind === 'series' || m.kind === 'items') head.appendChild(h('th', { text: 'Colour' }));
  head.appendChild(h('th'));
  grid.appendChild(head);

  /* ---- the dual chart's two names ---- */
  if (m.kind === 'dual') {
    var nr = h('tr', { class: 'de-names' }, [h('td', { class: 'de-rh', text: 'Names' }), h('td', { class: 'hint', text: 'Shown above the bars' })]);
    [0, 1].forEach(function (i) {
      var inp = h('input', { type: 'text', value: m.names[i] || '', placeholder: i ? 'Right side' : 'Left side' });
      if (L.key && L.cells !== false) inp.title = 'CasparCG field: ' + L.key + '_n' + (i + 1) + '  (colour: ' + L.key + '_c' + (i + 1) + ')';
      inp.addEventListener('input', function () { m.names[i] = inp.value; DataEd.write(L, m); App.touch(); });
      inp.addEventListener('change', commit);
      nr.appendChild(h('td', {}, [h('div', { class: 'de-nc' }, [colourChip(i), inp])]));
    });
    nr.appendChild(h('td'));
    grid.appendChild(nr);
  }

  /* ---- rows ---- */
  var nCells = m.kind === 'series' ? m.pts + 1 : cols;
  m.rows.forEach(function (r, ri) {
    var tr = h('tr');
    var rowLabel = m.kind === 'table' ? (L.header && ri === 0 ? 'Header' : String(ri + (L.header ? 0 : 1))) : String(ri + 1);
    var rowKey = !L.key || L.cells === false ? '' : (m.kind === 'table' ? (L.header && ri === 0 ? '' : L.key + '_r' + (ri + (L.header ? 0 : 1)) + '  (the whole row)') : (m.kind === 'series' ? L.key + '_v' + (ri + 1) + '  (all values, e.g. "4, 8, 3w")' : ''));
    tr.appendChild(h('td', { class: 'de-rh', text: rowLabel, title: rowKey ? 'CasparCG field: ' + rowKey : '' }));
    for (var c = 0; c < nCells; c++) (function (c) {
      var inp = h('input', { type: 'text', value: r[c] == null ? '' : r[c], class: 'de-cell' + (m.kind === 'series' && c > 0 ? ' de-numc' : '') });
      inp.dataset.r = ri; inp.dataset.c = c;
      var ck = cellKey(ri, c);
      if (ck) inp.title = 'CasparCG field: ' + ck + (m.kind === 'crawl' ? ' (the whole item)' : '');
      inp.addEventListener('input', function () { r[c] = inp.value; DataEd.write(L, m); App.touch(); });
      inp.addEventListener('change', commit);
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); r[c] = inp.value; commit(); var nx = el.querySelector('.de-cell[data-r="' + (ri + (e.shiftKey ? -1 : 1)) + '"][data-c="' + c + '"]'); if (nx) nx.focus(); else inp.blur(); }
      });
      /* paste a block of cells straight from Excel */
      inp.addEventListener('paste', function (e) {
        var t = (e.clipboardData || window.clipboardData).getData('text');
        if (!/[\t\n]/.test(t.replace(/\n$/, ''))) return;
        e.preventDefault();
        var block = t.replace(/\r/g, '').replace(/\n$/, '').split('\n').map(function (l) { return l.split('\t'); });
        block.forEach(function (br, bi) {
          var rr = ri + bi;
          while (m.rows.length <= rr) m.rows.push(new Array(nCells).join('.').split('.').map(function () { return ''; }));
          br.forEach(function (v, bj) {
            var cc = c + bj;
            if (m.kind === 'series') { while (m.pts + 1 <= cc) { m.pts++; L.dataPts = m.pts; m.rows.forEach(function (x) { x.push(''); }); } }
            else if (m.kind === 'table' || m.kind === 'crawl') { if (cc >= m.cols) { m.cols = cc + 1; m.rows.forEach(function (x) { while (x.length < m.cols) x.push(''); }); } }
            else if (cc >= nCells) return;
            m.rows[rr][cc] = v;
          });
        });
        rebuild();
      });
      tr.appendChild(h('td', {}, [inp]));
    })(c);
    if (m.kind === 'series' || m.kind === 'items') tr.appendChild(h('td', { class: 'de-col' }, [colourChip(ri)]));
    tr.appendChild(h('td', { class: 'de-ops' }, [
      ri > 0 ? btn('↑', function () { m.rows.splice(ri - 1, 0, m.rows.splice(ri, 1)[0]); if (m.kind === 'series' || m.kind === 'items') moveColour(ri, ri - 1); rebuild(); }, 'Move up') : null,
      ri < m.rows.length - 1 ? btn('↓', function () { m.rows.splice(ri + 1, 0, m.rows.splice(ri, 1)[0]); if (m.kind === 'series' || m.kind === 'items') moveColour(ri, ri + 1); rebuild(); }, 'Move down') : null,
      btn('×', function () { m.rows.splice(ri, 1); if (m.kind === 'series' || m.kind === 'items') moveColour(ri, -1); rebuild(); }, 'Remove')
    ]));
    grid.appendChild(tr);
  });
  el.appendChild(h('div', { class: 'de-wrap' }, [grid]));

  /* ---- add buttons ---- */
  function blankRow(n) { var r = []; for (var i = 0; i < n; i++) r.push(''); return r; }
  var adds = [];
  if (m.kind === 'table') {
    adds.push(btn('+ Row', function () { m.rows.push(blankRow(cols)); rebuild(); }, '', 'primary'));
    adds.push(btn('+ Column', function () { m.rows.forEach(function (r) { r.push(''); }); if (!m.rows.length) m.rows.push(['']); var a = deList(L.cols, cols, '1'); a.push('1'); var b = deList(L.aligns, cols, 'l'); b.push('c'); L.cols = a.join(','); L.aligns = b.join(','); m.cols++; rebuild(); }));
  } else if (m.kind === 'series') {
    adds.push(btn('+ Series', function () { m.rows.push(['Series ' + (m.rows.length + 1)].concat(blankRow(m.pts))); rebuild(); }, '', 'primary'));
    adds.push(btn('+ Point', function () { m.pts++; L.dataPts = m.pts; m.rows.forEach(function (r) { r.push(''); }); rebuild(); }, 'Add an over / point at the end'));
  } else if (m.kind === 'dual') {
    adds.push(btn('+ Stat', function () { m.rows.push(['Stat', '0', '0']); rebuild(); }, '', 'primary'));
  } else if (m.kind === 'crawl') {
    adds.push(btn('+ Item', function () { m.rows.push(blankRow(cols)); m.rows[m.rows.length - 1][cols - 1] = 'New item'; rebuild(); }, '', 'primary'));
  } else {
    adds.push(btn('+ Item', function () { m.rows.push(['Item ' + (m.rows.length + 1), '0']); rebuild(); }, '', 'primary'));
  }
  el.appendChild(h('div', { class: 'pbar' }, adds));
  var tips = {
    table: 'Tab and Enter move between cells. Paste a block of cells from Excel into any cell. Column widths are relative to each other.' + (L.header ? ' The first row is the header (untick "First row is a header" in the Inspector to make it a normal row).' : ''),
    series: 'One row per series (team), one column per point (over). Type a w after a value for a wicket, e.g. 12w.' + (L.cumul ? ' The chart adds the values up (worm).' : ''),
    dual: 'One row per stat; values keep their units, e.g. 54%.',
    items: 'One row per item; the colour sets its slice or bar.',
    crawl: (cols > 1 ? 'Each part takes its look from Text styles in the Inspector. ' : '') + 'Items scroll in this order, with the separator between them.'
  };
  el.appendChild(h('p', { class: 'hint', text: tips[m.kind] }));
};
