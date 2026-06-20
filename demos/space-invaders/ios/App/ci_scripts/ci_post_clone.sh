#!/bin/sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="${CI_WORKSPACE:-}"

if [ -z "$REPO_ROOT" ] || [ ! -f "$REPO_ROOT/package-lock.json" ]; then
  REPO_ROOT="$SCRIPT_DIR"

  while [ "$REPO_ROOT" != "/" ] && [ ! -f "$REPO_ROOT/package-lock.json" ]; do
    REPO_ROOT="$(dirname "$REPO_ROOT")"
  done
fi

if [ ! -f "$REPO_ROOT/package-lock.json" ]; then
  echo "Could not find repository root from $SCRIPT_DIR."
  exit 1
fi

cd "$REPO_ROOT"

echo "Preparing Capacitor iOS app for Xcode Cloud..."
echo "Repository root: $REPO_ROOT"
echo "Xcode Cloud branch: ${CI_BRANCH:-unknown}"
echo "Xcode Cloud workflow: ${CI_WORKFLOW:-unknown}"

ensure_node_22() {
  if command -v node >/dev/null 2>&1; then
    NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"

    if [ "$NODE_MAJOR" -ge 22 ]; then
      return
    fi
  fi

  echo "Node.js 22+ is required for Capacitor. Installing node@22..."

  if ! command -v brew >/dev/null 2>&1; then
    echo "Homebrew is not available, so Xcode Cloud cannot install node@22."
    exit 1
  fi

  brew install node@22
  export PATH="/opt/homebrew/opt/node@22/bin:/usr/local/opt/node@22/bin:$PATH"
}

ensure_node_22

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is not available after setting up Node.js."
  exit 1
fi

echo "Node version: $(node --version)"
echo "npm version: $(npm --version)"

npm ci
npx tsc -b packages/core packages/dev packages/phaser --force
npm run ios:sync --workspace @ai-game-assets/demo-space-invaders

echo "Capacitor iOS app is ready for archiving."
