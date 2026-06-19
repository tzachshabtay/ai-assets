#!/bin/sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../../.." && pwd)"

cd "$REPO_ROOT"

echo "Preparing Capacitor iOS app for Xcode Cloud..."

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is not available in this Xcode Cloud image."
  echo "Install Node.js in the workflow environment or choose an image that includes Node.js."
  exit 1
fi

npm ci
npm run ios:sync --workspace @ai-game-assets/demo-space-invaders

echo "Capacitor iOS app is ready for archiving."
