#!/usr/bin/env bash
# Builds CG Motion for Linux: an AppImage (runs anywhere) and a .deb (Ubuntu, Debian, Mint) in the dist folder.
# Run it on a Linux PC from the CG Motion folder:  bash build-linux.sh
set -e
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo
  echo " Building CG Motion needs Node.js 20 or newer. On Ubuntu or Debian:"
  echo "   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs"
  echo " or download it from https://nodejs.org, then run this file again."
  exit 1
fi
echo
echo " Step 1 of 2: getting the build tools (the first time this downloads a few hundred MB)..."
npm install
echo
echo " Step 2 of 2: building the AppImage and the .deb..."
npx electron-builder --linux AppImage deb --x64 --publish never
node tools/check-build.js linux
[ -f "docs/CG Motion Guide.pdf" ] && cp "docs/CG Motion Guide.pdf" dist/
chmod +x dist/*.AppImage 2>/dev/null || true
echo
echo " Done. In the dist folder:"
echo "   CG-Motion-<version>-x86_64.AppImage  runs without installing (chmod +x, then double-click or ./CG-Motion-...AppImage)"
echo "   CG-Motion-<version>-amd64.deb        installs CG Motion:  sudo apt install ./dist/CG-Motion-<version>-amd64.deb"
echo "   CG Motion Guide.pdf                  the user guide (also installed next to CG Motion, Help > Open the guide)"
