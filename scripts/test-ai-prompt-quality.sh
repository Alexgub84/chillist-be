#!/usr/bin/env bash
#
# Run AI "prompt quality" tests against the real provider (Anthropic or OpenAI).
#
# What this does
#   - Loads only AI-related vars from .env (so a broken unrelated line in .env
#     does not block you; full `source .env` can fail on special characters).
#   - Sets RUN_PROMPT_QUALITY=true so Vitest actually runs the suite (it is
#     skipped in normal test runs to avoid API cost).
#   - Executes: tests/unit/ai/item-suggestions/prompt-quality.test.ts
#
# Requirements
#   - .env in the repo root with AI_PROVIDER and the matching API key:
#       - anthropic (default): ANTHROPIC_API_KEY
#       - openai: OPENAI_API_KEY
#
# How to run
#   npm run test:ai-prompt-quality
#
#   Extra Vitest args after -- :
#   npm run test:ai-prompt-quality -- --reporter=verbose
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "test-ai-prompt-quality: no .env in $ROOT"
  echo "Add AI_PROVIDER and ANTHROPIC_API_KEY (or OPENAI_API_KEY for openai)."
  exit 1
fi

# shellcheck disable=SC2046
export $(grep -E '^AI_PROVIDER=|^ANTHROPIC_API_KEY=|^OPENAI_API_KEY=' .env | xargs)

PROVIDER="${AI_PROVIDER:-anthropic}"
if [[ "$PROVIDER" == "openai" ]]; then
  if [[ -z "${OPENAI_API_KEY:-}" ]]; then
    echo "test-ai-prompt-quality: OPENAI_API_KEY is empty (AI_PROVIDER=openai)."
    exit 1
  fi
else
  if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
    echo "test-ai-prompt-quality: ANTHROPIC_API_KEY is empty (default provider is anthropic)."
    exit 1
  fi
fi

export RUN_PROMPT_QUALITY=true

echo "test-ai-prompt-quality: RUN_PROMPT_QUALITY=true AI_PROVIDER=$PROVIDER"
echo "test-ai-prompt-quality: running real API tests (slow, costs tokens)…"
echo

exec npx vitest run tests/unit/ai/item-suggestions/prompt-quality.test.ts "$@"
