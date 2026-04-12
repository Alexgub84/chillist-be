const tier1OptionSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      description: 'Unique tier-1 option id, e.g. "camping"',
    },
    label: { type: 'string' },
    emoji: { type: 'string' },
  },
  required: ['id', 'label', 'emoji'],
} as const

const tier1Schema = {
  type: 'object',
  properties: {
    label: { type: 'string', description: 'UI label for the tier-1 question' },
    key: {
      type: 'string',
      description: 'Tier key identifier, e.g. "plan_type"',
    },
    options: { type: 'array', items: tier1OptionSchema },
  },
  required: ['label', 'key', 'options'],
} as const

const tier2Schema = {
  type: 'object',
  properties: {
    label: { type: 'string', description: 'UI label for the tier-2 question' },
    key: {
      type: 'string',
      description: 'Tier key identifier, e.g. "logistics"',
    },
    conditional_on: {
      type: 'string',
      description: 'The tier key this tier depends on, e.g. "tier1"',
    },
    options_by_parent: {
      type: 'object',
      description:
        'Map from tier-1 option id to tier-2 option block (options, mutex_groups, cross_group_rules)',
      additionalProperties: {
        type: 'object',
        properties: {
          options: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                label: { type: 'string' },
              },
              required: ['id', 'label'],
            },
          },
          mutex_groups: {
            type: 'array',
            description:
              'Groups of mutually exclusive option ids — selecting one deselects the others in the same group',
            items: { type: 'array', items: { type: 'string' } },
          },
          cross_group_rules: {
            type: 'array',
            description:
              'Rules that disable or deselect options across mutex groups when a trigger option is selected',
            items: {
              type: 'object',
              properties: {
                trigger: {
                  type: 'string',
                  description: 'Option id that activates this rule',
                },
                disable: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Option ids to disable when trigger is selected',
                },
                deselect: {
                  type: 'array',
                  items: { type: 'string' },
                  description:
                    'Option ids to deselect when trigger is selected',
                },
                disable_tooltip: {
                  type: 'string',
                  description: 'Tooltip shown on disabled options',
                },
              },
              required: ['trigger'],
            },
          },
        },
        required: ['options', 'mutex_groups', 'cross_group_rules'],
      },
    },
  },
  required: ['label', 'key', 'conditional_on', 'options_by_parent'],
} as const

const tier3Schema = {
  type: 'object',
  properties: {
    label: { type: 'string', description: 'UI label for the tier-3 question' },
    key: {
      type: 'string',
      description: 'Tier key identifier, e.g. "specifics"',
    },
    conditional_on: {
      type: 'string',
      description: 'The tier key this tier depends on, e.g. "tier2"',
    },
    options_by_parent: {
      type: 'object',
      description: 'Map from tier-2 option id to array of tier-3 options',
      additionalProperties: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            label: { type: 'string' },
          },
          required: ['id', 'label'],
        },
      },
    },
  },
  required: ['label', 'key', 'conditional_on', 'options_by_parent'],
} as const

export const planTagsResponseSchema = {
  $id: 'PlanTagsResponse',
  type: 'object',
  description: 'Full 3-tier plan tag taxonomy',
  properties: {
    version: {
      type: 'string',
      description: 'Taxonomy version string, e.g. "1.2"',
    },
    description: {
      type: 'string',
      nullable: true,
      description: 'Human-readable description of this taxonomy version',
    },
    tiers: {
      type: 'object',
      properties: {
        tier1: tier1Schema,
        tier2: tier2Schema,
        tier3: tier3Schema,
      },
      required: ['tier1', 'tier2', 'tier3'],
    },
  },
  required: ['version', 'tiers'],
} as const
