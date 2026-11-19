/* CG Motion - checking GitHub for a newer version, and the About window */
var Update = { repo: 'regemarkfp/CG-Motion', last: null };

/* is version a newer than b? (1.10 > 1.9, 1.2.1 > 1.2) */
Update.newer = function (a, b) {
  var x = String(a || '').replace(/^v/i, '').split('.'), y = String(b || '').replace(/^v/i, '').split('.'), i;
  for (i = 0; i < Math.max(x.length, y.length); i++) {
    var p = parseInt(x[i] || '0', 10) || 0, q = parseInt(y[i] || '0', 10) || 0;
    if (p !== q) return p > q;
  }
  return false;
};
Update.auto = function () { try { return localStorage.getItem('cgm.updateCheck') !== 'off'; } catch (e) { return true; } };
Update.setAuto = function (on) { try { localStorage.setItem('cgm.updateCheck', on ? 'on' : 'off'); } catch (e) {} };
Update.version = function () {
  if (IO.version) return Promise.resolve(IO.version);
  return Api.readApp('../package.json').then(function (t) { return String(JSON.parse(t).version || '').replace(/^(\d+\.\d+)\.0$/, '$1'); }).catch(function () { return ''; });
};
/* the newest release on GitHub: { tag, name, url, notes, assets: [{ name, url, size }] } or { error } */
Update.latest = function () {
  if (N && N.latestRelease) return N.latestRelease();
  return fetch('https://api.github.com/repos/' + Update.repo + '/releases/latest', { headers: { Accept: 'application/vnd.github+json' } })
    .then(function (r) { if (!r.ok) throw new Error('GitHub answered ' + r.status); return r.json(); })
    .then(function (j) { return { tag: j.tag_name, name: j.name, url: j.html_url, notes: j.body || '', assets: (j.assets || []).map(function (a) { return { name: a.name, url: a.browser_download_url, size: a.size }; }) }; })
    .catch(function (e) { return { error: e.message }; });
};
/* the installer that suits this computer, or null (then the release page is opened) */
Update.assetFor = function (rel) {
  var pf = (N && N.platform) || (/Win/.test(navigator.platform) ? 'win32' : /Mac/.test(navigator.platform) ? 'darwin' : 'linux');
  var arch = (N && N.arch) || '', list = rel.assets || [], pick = null;
  function find(re) { for (var i = 0; i < list.length; i++) if (re.test(list[i].name)) return list[i]; return null; }
  if (pf === 'win32') pick = find(/Setup.*\.exe$/i);
  else if (pf === 'darwin') pick = find(arch === 'arm64' ? /arm64\.dmg$/i : /x64\.dmg$/i) || find(/\.dmg$/i);
  else pick = find(/\.deb$/i) || find(/\.AppImage$/i);
  return pick;
};
Update.open = function (url) {
  if (N && N.openExternal) return N.openExternal(url);
  window.open(url, '_blank');
  return Promise.resolve(true);
};
/* check: manual = from the menu (always says what it found); otherwise quietly at start-up */
Update.check = function (manual) {
  return Promise.all([Update.version(), Update.latest()]).then(function (r) {
    var cur = r[0], rel = r[1];
    if (rel && !rel.error && !rel.tag) rel = { error: 'GitHub sent no version' };
    if (!rel || rel.error) {
      Update.last = { error: (rel && rel.error) || 'no answer' };
      if (manual) UI.status('Could not check for updates: ' + Update.last.error + '. Check the internet connection and try again.', true);
      return Update.last;
    }
    var ver = String(rel.tag || '').replace(/^v/i, ''), isNew = cur && Update.newer(ver, cur);
    Update.last = { current: cur, latest: ver, rel: rel, isNew: isNew, at: new Date() };
    var skipped = false;
    try { skipped = localStorage.getItem('cgm.skipVersion') === ver; } catch (e) {}
    if (isNew && (manual || !skipped)) Update.notify(Update.last, manual);
    else if (manual) UI.status('CG Motion ' + cur + ' is the newest version.');
    if (Update.aboutRefresh) Update.aboutRefresh();
    return Update.last;
  });
};
/* the "new version" card in the corner */
Update.notify = function (u, manual) {
  var old = document.getElementById('upd-toast');
  if (old) old.parentNode.removeChild(old);
  var asset = Update.assetFor(u.rel);
  var box = h('div', { id: 'upd-toast', class: 'upd-toast' }, [
    h('div', { class: 'upd-t-title', text: 'CG Motion ' + u.latest + ' is available' }),
    h('div', { class: 'hint', text: 'You have version ' + u.current + '. ' + (asset ? 'The download is ' + asset.name + '.' : 'Pick the download for this computer on the release page.') }),
    h('div', { class: 'upd-t-btns' }, [
      h('button', { class: 'primary', text: 'Download', title: asset ? asset.name : 'Open the release page', onclick: function () { Update.open(asset ? asset.url : u.rel.url); close(); UI.status(asset ? 'Downloading ' + asset.name + ' in your browser. Close CG Motion before installing it.' : 'Opened the release page.', true); } }),
      h('button', { text: "What's new", onclick: function () { Update.open(u.rel.url); } }),
      h('button', { text: 'Later', onclick: close }),
      manual ? null : h('button', { text: 'Skip this version', onclick: function () { try { localStorage.setItem('cgm.skipVersion', u.latest); } catch (e) {} close(); } })
    ])
  ]);
  function close() { if (box.parentNode) box.parentNode.removeChild(box); }
  UI.doc.body.appendChild(box);
};
/* About CG Motion */
Update.about = function () {
  var host = UI.doc.body, bg, status = h('div', { class: 'hint upd-status' });
  var auto = h('input', { type: 'checkbox', checked: Update.auto() });
  auto.addEventListener('change', function () { Update.setAuto(auto.checked); });
  function refresh() {
    var u = Update.last;
    if (!u) status.textContent = 'Not checked yet.';
    else if (u.error) status.textContent = 'Could not check for updates: ' + u.error + '.';
    else if (u.isNew) status.textContent = 'Version ' + u.latest + ' is available.';
    else status.textContent = 'This is the newest version (checked ' + u.at.toLocaleTimeString() + ').';
  }
  Update.aboutRefresh = refresh;
  function done() { Update.aboutRefresh = null; if (bg.parentNode) host.removeChild(bg); }
  var ver = h('div', { class: 'about-ver', text: 'Version ' + (IO.version || '') });
  Update.version().then(function (v) { ver.textContent = 'Version ' + v; });
  bg = h('div', { class: 'modal-bg', onclick: function (e) { if (e.target === bg) done(); } }, h('div', { class: 'modal about' }, [
    h('img', { class: 'about-logo', src: 'logo.png', alt: 'RegemarkFP' }),
    h('div', { class: 'about-name', text: 'CG Motion' }), ver,
    h('div', { class: 'hint', text: 'Timeline editor for CasparCG HTML templates, by RegemarkFP.' }),
    status,
    h('label', { class: 'chk' }, [auto, h('span', { text: ' Check for updates when CG Motion starts' })]),
    h('div', { class: 'modal-btns' }, [
      h('button', { text: 'Releases on GitHub', onclick: function () { Update.open('https://github.com/' + Update.repo + '/releases'); } }),
      h('button', { text: 'Check for updates', onclick: function () { status.textContent = 'Checking...'; Update.check(true); } }),
      h('button', { class: 'primary', text: 'Close', onclick: done })
    ])
  ]));
  refresh();
  host.appendChild(bg);
};
