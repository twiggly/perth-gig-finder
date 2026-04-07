#!/bin/sh

set -eu

NODE22_PREFIX="/opt/homebrew/opt/node@22/bin"

if [ -x "${NODE22_PREFIX}/node" ]; then
  PATH="${NODE22_PREFIX}:$PATH"
  export PATH
fi

if ! node scripts/check-node-version.mjs >/dev/null 2>&1; then
  echo "Perth Gig Finder Codex actions require a supported Node version." >&2
  echo "Expected: 20.19+, 22.12+, or 24.x" >&2
  echo "Current: $(node -v 2>/dev/null || echo unavailable)" >&2
  echo "" >&2
  echo "This action wrapper looks for Homebrew node@22 at:" >&2
  echo "  /opt/homebrew/opt/node@22/bin/node" >&2
  echo "" >&2
  echo "If that path is missing, install it with:" >&2
  echo "  brew install node@22" >&2
  exit 1
fi

exec "$@"
