#!/usr/bin/env bash
# Runs CG Motion from this folder on Linux (while working on the app):  bash start-cg-motion.sh
# Add --safe to start without graphics acceleration and with the default panel layout.
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo " CG Motion needs Node.js 20 or newer: https://nodejs.org (or your distribution's nodejs package)."
  exit 1
fi
if [ ! -x node_modules/electron/dist/electron ]; then
  echo " First run: downloading the app shell and Lottie player. This takes a few minutes and only happens once."
  npm install || { echo " The download failed. Check your internet connection and run this file again."; exit 1; }
fi
exec node_modules/electron/dist/electron . "$@"
