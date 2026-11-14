// Fails the build when the packaged app is missing the editor's files (an installer that would open to an empty window).
// node tools/check-build.js          checks the Windows build (dist/win-unpacked)
// node tools/check-build.js linux    checks the Linux build (dist/linux-unpacked)
const fs = require('fs'), path = require('path');
const asar = require('@electron/asar');
const plat = (process.argv[2] || (process.platform === 'linux' ? 'linux' : 'win')).replace(/^windows$/, 'win');
const dist = path.join(__dirname, '..', 'dist', plat + '-unpacked', 'resources', 'app.asar');
if (!fs.existsSync(dist)) { console.error('Build check: ' + dist + ' was not made.'); process.exit(1); }
const list = asar.listPackage(dist).map((f) => f.replace(/\\/g, '/'));
const need = ['/main.js', '/preload.js', '/fontindex.js', '/package.json', '/app/index.html', '/app/runtime.js', '/app/style.css', '/app/js/core.js', '/app/js/io.js'];
const missing = need.filter((f) => !list.includes(f));
const srcJs = fs.readdirSync(path.join(__dirname, '..', 'app', 'js')).filter((f) => f.endsWith('.js')).map((f) => '/app/js/' + f).filter((f) => !list.includes(f));
const all = missing.concat(srcJs);
if (all.length) { console.error('Build check FAILED: the packaged app is missing ' + all.join(', ')); process.exit(1); }
console.log('Build check passed (' + plat + '): ' + list.filter((f) => f.startsWith('/app/')).length + ' editor files packaged.');
