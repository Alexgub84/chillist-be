/**
 * The plan tags response is a static JSON file served as-is.
 * We declare the schema as a free-form object so Fastify does not strip
 * any keys during serialization, while still producing valid OpenAPI docs.
 */
export const planTagsResponseSchema = {
  $id: 'PlanTagsResponse',
  type: 'object',
  description:
    'Full plan tag taxonomy (version, tier1, universal_flags, tier2_axes, tier3, item_generation_bundles). Served from a static versioned JSON file bundled with the server.',
  additionalProperties: true,
  properties: {
    version: {
      type: 'string',
      description: 'Taxonomy version string, e.g. "1.1"',
    },
    description: {
      type: 'string',
      description: 'Human-readable description of this taxonomy version',
    },
  },
  required: ['version'],
} as const
