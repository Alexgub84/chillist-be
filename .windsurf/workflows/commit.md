---
description: How to commit changes and push to a new branch
---

# Commit and Push

When the user asks to commit changes, follow these steps in order:

## 1. Regenerate OpenAPI spec

// turbo
```bash
npx tsx scripts/generate-openapi.ts
```

If the spec changed, stage `docs/openapi.json` along with all other files.

## 2. Stage and commit

- `git add -A`
- Commit with a conventional commit message summarizing the changes

## 3. Create branch (if on main)

If currently on `main`, create a new descriptively-named branch **before** committing:

```bash
git checkout -b <descriptive-branch-name>
```

## 4. Push

```bash
git push -u origin <branch-name>
```
