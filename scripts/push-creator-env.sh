#!/usr/bin/env bash
# Pushes the /creators secrets from .env.local to Vercel (production + preview) without
# printing them. Usage: scripts/push-creator-env.sh [VAR ...]  (default: both secrets)
set -euo pipefail
cd "$(dirname "$0")/.."
vars=("$@")
[ ${#vars[@]} -eq 0 ] && vars=(POSTHOG_PERSONAL_API_KEY INSTAGRAM_SESSION_ID)
for name in "${vars[@]}"; do
  value="$(grep -E "^${name}=" .env.local | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')"
  if [ -z "$value" ]; then
    echo "skip $name: empty in .env.local"
    continue
  fi
  for env in production preview; do
    npx vercel env rm "$name" "$env" --yes >/dev/null 2>&1 || true
    printf '%s' "$value" | npx vercel env add "$name" "$env" --sensitive >/dev/null 2>&1 \
      && echo "set $name ($env, ${#value} chars)" \
      || echo "FAILED $name ($env)"
  done
done
