/**
 * Schema for GET /plan-tags and GET /api/internal/plan-tags (same bundled document).
 *
 * The taxonomy is a static JSON file bundled with the server (src/data/plan-creation-tags.json).
 * Every user-facing "label" is bilingual: { en: string, he: string }. Consumers pick the
 * language at render time.
 *
 * ## Rendering guide (for the frontend wizard)
 *
 * 1. Show all `tier1.options` — single-select.
 * 2. Show every `universal_flags` entry (asked for ALL tier1 values, in definition order).
 *    - `select: "single"` → radio / segmented control
 *    - `select: "multi"` + `max_select` → checkbox group capped at max_select
 *    - If a flag's option has `injects_bundle`, add the matching
 *      `item_generation_bundles[injects_bundle]` items when that option is selected.
 * 3. For each `tier2_axes` entry:
 *    - Show it only if the chosen tier1 id is in `shown_for_tier1`.
 *    - Pre-select `defaults_by_tier1[chosenTier1Id]` if present.
 *    - Hide options whose id appears in `hidden_options_by_tier1[chosenTier1Id]`.
 *    - `select: "single"` for most axes; `select: "multi"` for `activities`.
 * 4. After a tier2 option is chosen, check `tier3.options_by_parent[tier2OptionId]`.
 *    If entries exist → show as a follow-up drill-down.
 *    - Check `tier3.multi_select_parents.includes(tier2OptionId)`:
 *      YES → multi-select (checkbox). NO → single-select (radio).
 * 5. For multi-select flags with `contradictions`:
 *    When the user selects option A, find all pairs containing A and deselect+disable
 *    the other option in each pair. Re-enable when A is deselected.
 *
 * ## Stable id contract
 * All `id` values are stable English slugs safe to store in the database.
 * Renaming an id is a breaking change; editing a label text is not.
 *
 * ## selection_by_tier
 * Top-level summary of single vs multi for each tier (`tier1`, `universal_flags.flags`,
 * `tier2_axes.axes`, `tier3`). Prefer reading nested `select` on each object; use
 * `selection_by_tier` for quick UI routing.
 */

/** Shared bilingual label shape used on every user-facing string. */
const bilingualLabel = {
  type: 'object',
  description:
    'Bilingual label. Pick the language matching the active locale at render time.',
  required: ['en', 'he'],
  additionalProperties: false,
  properties: {
    en: { type: 'string', description: 'English label' },
    he: { type: 'string', description: 'Hebrew label (RTL)' },
  },
} as const

/** A single selectable tag option (used in tier1, tier2 axes, tier3, and universal_flags). */
const tagOption = {
  type: 'object',
  description: 'A single selectable option.',
  required: ['id', 'label'],
  properties: {
    id: {
      type: 'string',
      description:
        'Stable slug, safe to store as a tag value. Never changes between versions.',
    },
    label: bilingualLabel,
    emoji: {
      type: 'string',
      description: 'Optional emoji decoration shown next to the label.',
    },
    injects_bundle: {
      type: 'string',
      description:
        'When present, selecting this option should also inject the named item_generation_bundles entry into the item list.',
    },
  },
} as const

/** A tier3 drill-down option (no emoji, no bundle injection). */
const tier3Option = {
  type: 'object',
  required: ['id', 'label'],
  properties: {
    id: { type: 'string', description: 'Stable slug.' },
    label: bilingualLabel,
  },
} as const

export const planTagsResponseSchema = {
  $id: 'PlanTagsResponse',
  type: 'object',
  description: `
Plan tag taxonomy served as a static versioned JSON file.
Labels are bilingual objects \`{ en, he }\` — pick the active locale at render time.
All \`id\` values are stable slugs safe to persist as tag values.

**Rendering order:** tier1 → universal_flags → tier2_axes (filtered by chosen tier1) → tier3 (drill-down per chosen tier2 value).

**Selection summary:** Read \`selection_by_tier\` for explicit single vs multi per tier and per flag/axis. Nested objects remain authoritative (\`tier1.select\`, each flag/axis \`select\`, \`tier3.default_select\` + \`multi_select_parents\`).
  `.trim(),
  required: [
    'version',
    'selection_by_tier',
    'tier1',
    'universal_flags',
    'tier2_axes',
    'tier3',
    'item_generation_bundles',
  ],
  properties: {
    version: {
      type: 'string',
      description: 'Taxonomy version string, e.g. "1.5".',
      example: '1.5',
    },

    description: {
      type: 'string',
      description: 'Human-readable summary of this taxonomy version.',
    },

    selection_by_tier: {
      type: 'object',
      description: `
At-a-glance summary of **single vs multi-select** for each wizard tier. Mirrors the \`select\` fields on nested definitions; use for routing (radio vs checkbox) without scanning the full tree.

- **tier1.select** — always \`single\`.
- **universal_flags.flags** — each flag has its own \`select\` (\`single\` or \`multi\` + optional \`max_select\`).
- **tier2_axes.axes** — each axis has its own \`select\` (only \`activities\` is \`multi\` today).
- **tier3** — \`default_select\` is \`single\`; parents listed in \`multi_select_parents\` use multi-select for that drill-down group.
      `.trim(),
      required: ['tier1', 'universal_flags', 'tier2_axes', 'tier3'],
      properties: {
        description: {
          type: 'string',
          description: 'Internal note for consumers.',
        },
        tier1: {
          type: 'object',
          required: ['select'],
          properties: {
            select: {
              type: 'string',
              enum: ['single'],
              description: 'Tier 1 is always single-select.',
            },
            note: { type: 'string' },
          },
        },
        universal_flags: {
          type: 'object',
          description:
            'Each entry in `flags` matches a key under `universal_flags`.',
          required: ['mode', 'flags'],
          properties: {
            mode: {
              type: 'string',
              enum: ['per_flag'],
              description:
                'Each flag is independent; open each definition for full options.',
            },
            note: { type: 'string' },
            flags: {
              type: 'object',
              additionalProperties: {
                type: 'object',
                required: ['select'],
                properties: {
                  select: { type: 'string', enum: ['single', 'multi'] },
                  max_select: { type: 'integer' },
                },
              },
            },
          },
        },
        tier2_axes: {
          type: 'object',
          required: ['mode', 'axes'],
          properties: {
            mode: {
              type: 'string',
              enum: ['per_axis'],
              description: 'Each axis is one question.',
            },
            note: { type: 'string' },
            axes: {
              type: 'object',
              additionalProperties: {
                type: 'object',
                required: ['select'],
                properties: {
                  select: { type: 'string', enum: ['single', 'multi'] },
                },
              },
            },
          },
        },
        tier3: {
          type: 'object',
          required: ['mode', 'default_select', 'multi_select_parents'],
          properties: {
            mode: {
              type: 'string',
              enum: ['per_tier2_option_id'],
              description:
                'Groups keyed by tier2 option id in options_by_parent.',
            },
            note: { type: 'string' },
            default_select: {
              type: 'string',
              enum: ['single'],
              description:
                'Each drill-down group is single-select unless the parent id is in multi_select_parents.',
            },
            multi_select_parents: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Tier2 option ids whose tier3 follow-up allows multiple selections.',
            },
          },
        },
      },
    },

    // ─── Tier 1 ────────────────────────────────────────────────────────────
    tier1: {
      type: 'object',
      description:
        'Step 1: plan archetype. Always shown. Single-select (one tier1 id stored on the plan).',
      required: ['key', 'select', 'options', 'label'],
      properties: {
        label: {
          ...bilingualLabel,
          description: 'Question label shown above the options.',
        },
        key: {
          type: 'string',
          description: 'Field name used when storing the selected value.',
          example: 'plan_type',
        },
        select: {
          type: 'string',
          enum: ['single'],
          description:
            'Always "single" — the user picks exactly one archetype.',
        },
        options: {
          type: 'array',
          description: 'Ordered list of plan archetype options.',
          items: tagOption,
        },
      },
    },

    // ─── Universal Flags ───────────────────────────────────────────────────
    universal_flags: {
      type: 'object',
      description: `
Flags shown for every tier1 choice, in definition order.
Each key is the flag name (matches the \`key\` field inside the definition).
Render after tier1, before tier2_axes.
      `.trim(),
      additionalProperties: {
        type: 'object',
        description: 'A single universal flag definition.',
        required: ['key', 'select', 'required', 'options', 'label'],
        properties: {
          label: {
            ...bilingualLabel,
            description: 'Question label shown above the options.',
          },
          key: {
            type: 'string',
            description:
              'Field name used when storing selected value(s) on the plan.',
          },
          select: {
            type: 'string',
            enum: ['single', 'multi'],
            description:
              '"single" → radio/segmented. "multi" → checkbox (respect max_select if set).',
          },
          max_select: {
            type: 'integer',
            description:
              'Only present on multi-select flags. Maximum number of options the user may choose.',
          },
          required: {
            type: 'boolean',
            description:
              'Whether the user must answer this flag before proceeding.',
          },
          asked_for_all_tier1: {
            type: 'boolean',
            description:
              'Always true — flag is shown regardless of tier1 choice.',
          },
          purpose: {
            type: 'string',
            description:
              'Internal note explaining why this flag exists. Not shown to users.',
          },
          contradictions: {
            type: 'array',
            description: `
Only present on multi-select flags. Lists pairs of option ids that CANNOT both be selected at the same time.

**FE handling:** When the user selects option A, check every pair in this array. If A appears in a pair, automatically deselect (and visually disable) the other option in that pair. Re-enable it if A is later deselected.

Example: \`[["chill", "party_oriented"], ["chill", "adventurous"]]\` means selecting "chill" should deselect "party_oriented" and "adventurous".
            `.trim(),
            items: {
              type: 'array',
              description: 'A pair of mutually exclusive option ids.',
              minItems: 2,
              maxItems: 2,
              items: { type: 'string' },
            },
          },
          options: {
            type: 'array',
            items: tagOption,
          },
        },
      },
    },

    // ─── Tier 2 Axes ───────────────────────────────────────────────────────
    tier2_axes: {
      type: 'object',
      description: `
Named axes shown conditionally after tier1 + universal_flags.
Each key is the axis name (matches the \`key\` field inside).

**Rendering rules per axis:**
- Show only if the selected tier1 id is in \`shown_for_tier1\`.
- Pre-select \`defaults_by_tier1[chosenTier1Id]\` when entering the step.
- Hide options listed in \`hidden_options_by_tier1[chosenTier1Id]\`.
- Most axes are \`select: "single"\`; \`activities\` is \`select: "multi"\`.
      `.trim(),
      additionalProperties: {
        type: 'object',
        description: 'A single tier2 axis definition.',
        required: ['key', 'select', 'shown_for_tier1', 'options', 'label'],
        properties: {
          label: {
            ...bilingualLabel,
            description: 'Question label shown above the options.',
          },
          key: {
            type: 'string',
            description: 'Field name used when storing selected value(s).',
          },
          select: {
            type: 'string',
            enum: ['single', 'multi'],
            description:
              'Single-select for most axes. Multi-select only for "activities".',
          },
          shown_for_tier1: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Tier1 option ids for which this axis should be shown. Hide the axis when the chosen tier1 id is NOT in this list.',
          },
          options: {
            type: 'array',
            items: tagOption,
            description: 'All available options for this axis (before hiding).',
          },
          defaults_by_tier1: {
            type: 'object',
            additionalProperties: { type: 'string' },
            description:
              'Maps a tier1 option id → the axis option id to pre-select. Keys are tier1 ids; values are option ids within this axis.',
          },
          hidden_options_by_tier1: {
            type: 'object',
            additionalProperties: {
              type: 'array',
              items: { type: 'string' },
            },
            description:
              'Maps a tier1 option id → list of axis option ids to hide for that tier1 choice. Options in this list should not be shown or selectable.',
          },
        },
      },
    },

    // ─── Tier 3 ────────────────────────────────────────────────────────────
    tier3: {
      type: 'object',
      description: `
Optional drill-down specifics, conditional on tier2 selections.

**Default behaviour: single-select.** Most tier3 groups are mutually exclusive — the user picks exactly one option. Only parent ids listed in \`multi_select_parents\` allow the user to pick multiple options.

**FE rendering:**
1. After a tier2 option is chosen, look up \`options_by_parent[tier2OptionId]\`.
2. If the array exists → show it as a follow-up question below the tier2 axis.
3. Check if \`tier2OptionId\` is in \`multi_select_parents\`:
   - YES → render as a **checkbox group** (multi-select, no limit).
   - NO  → render as a **radio group** (single-select).
4. If \`options_by_parent[tier2OptionId]\` is absent → no drill-down for that selection.
      `.trim(),
      required: [
        'select',
        'default_select',
        'multi_select_parents',
        'options_by_parent',
      ],
      properties: {
        description: {
          type: 'string',
          description: 'Internal note. Not shown to users.',
        },
        select: {
          type: 'string',
          enum: ['per_parent'],
          description:
            'Tier 3 is organized as one follow-up group per tier2 option id (parent key in options_by_parent).',
        },
        default_select: {
          type: 'string',
          enum: ['single'],
          description:
            'Unless a parent tier2 id is in multi_select_parents, the user picks exactly one tier3 option.',
        },
        multi_select_parents: {
          type: 'array',
          items: { type: 'string' },
          description: `
Array of tier2 option ids whose tier3 drill-down allows **multiple selections** (checkbox). All other tier3 groups are **single-select** (radio).

Currently only \`"booked_activity"\` is multi-select because its options are additive facts (equipment needed AND bookable AND rentable can all be true simultaneously). Every other tier3 group represents mutually exclusive alternatives.

**FE check:** \`tier3.multi_select_parents.includes(chosenTier2OptionId)\`
          `.trim(),
        },
        options_by_parent: {
          type: 'object',
          description: `
Maps a **tier2 option id** → array of drill-down options shown after that tier2 value is selected.
Absence of a key means no drill-down for that tier2 option.
Select mode (single vs multi) is determined by \`multi_select_parents\` — NOT by this map.
          `.trim(),
          additionalProperties: {
            type: 'array',
            items: tier3Option,
          },
        },
      },
    },

    // ─── Item Generation Bundles ───────────────────────────────────────────
    item_generation_bundles: {
      type: 'object',
      description: `
Pre-defined item bundles injected when a flag option with \`injects_bundle\` is selected.
Each bundle is an array of bilingual item name objects \`{ en, he }\`.
These items should be added to the plan's item list in the plan's active language.
      `.trim(),
      required: ['travel_abroad'],
      properties: {
        description: {
          type: 'string',
          description: 'Internal note. Not shown to users.',
        },
        travel_abroad: {
          type: 'array',
          description:
            'Injected when the user selects "abroad" in the destination_scope flag. Essential travel-abroad checklist items.',
          items: {
            type: 'object',
            description: 'Bilingual item name.',
            required: ['en', 'he'],
            properties: {
              en: { type: 'string', description: 'Item name in English.' },
              he: { type: 'string', description: 'Item name in Hebrew.' },
            },
          },
        },
      },
      additionalProperties: {
        type: 'array',
        items: {
          type: 'object',
          required: ['en', 'he'],
          properties: {
            en: { type: 'string' },
            he: { type: 'string' },
          },
        },
      },
    },

    // ─── Meta (not used by rendering logic) ───────────────────────────────
    structural_contract: {
      type: 'object',
      description:
        'Documents stable guarantees about this schema. Informational — not used by the wizard UI.',
      additionalProperties: true,
    },

    design_principles: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Design rationale. Informational — not used by the wizard UI.',
    },

    changelog: {
      type: 'object',
      additionalProperties: {
        type: 'array',
        items: { type: 'string' },
      },
      description: 'Per-version change notes. Keys are version strings.',
    },
  },
} as const
