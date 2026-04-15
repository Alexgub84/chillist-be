#!/usr/bin/env bash
#
# Run per-category AI prompt quality tests against the real provider.
#
# Loads AI-related vars from .env, sets RUN_PROMPT_QUALITY_PER_CATEGORY=true.
#
# Requirements: .env with AI_PROVIDER and the matching API key.
#
# How to run:
#   npm run test:ai-prompt-quality-per-category
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "test-ai-prompt-quality-per-category: no .env in $ROOT"
  echo "Add AI_PROVIDER and ANTHROPIC_API_KEY (or OPENAI_API_KEY for openai)."
  exit 1
fi

# shellcheck disable=SC2046
export $(grep -E '^AI_PROVIDER=|^ANTHROPIC_API_KEY=|^OPENAI_API_KEY=' .env | xargs)

PROVIDER="${AI_PROVIDER:-anthropic}"
if [[ "$PROVIDER" == "openai" ]]; then
  if [[ -z "${OPENAI_API_KEY:-}" ]]; then
    echo "test-ai-prompt-quality-per-category: OPENAI_API_KEY is empty (AI_PROVIDER=openai)."
    exit 1
  fi
else
  if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
    echo "test-ai-prompt-quality-per-category: ANTHROPIC_API_KEY is empty (default provider is anthropic)."
    exit 1
  fi
fi

export RUN_PROMPT_QUALITY_PER_CATEGORY=true

echo "test-ai-prompt-quality-per-category: RUN_PROMPT_QUALITY_PER_CATEGORY=true AI_PROVIDER=$PROVIDER"
echo "test-ai-prompt-quality-per-category: running real API tests (slow, costs tokens)…"
echo

exec npx vitest run tests/unit/ai/item-suggestions/prompt-quality-per-category.test.ts "$@"
