import { z } from 'zod'

const envSchema = z
  .object({
    PORT: z.coerce.number().default(3333),
    HOST: z.string().default('0.0.0.0'),
    NODE_ENV: z
      .enum(['development', 'production', 'test'])
      .default('development'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
      .default('info'),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    FRONTEND_URL: z.string().url().default('http://localhost:5173'),
    API_KEY: z.string().optional(),
    SUPABASE_URL: z.string().url().optional(),
  })
  .refine((env) => env.NODE_ENV !== 'production' || !!env.SUPABASE_URL, {
    message: 'SUPABASE_URL is required in production',
    path: ['SUPABASE_URL'],
  })

export type Env = z.infer<typeof envSchema>

function validateEnv(): Env {
  const result = envSchema.safeParse(process.env)

  if (!result.success) {
    const errors = result.error.flatten().fieldErrors
    const messages = Object.entries(errors)
      .map(([field, msgs]) => `  ${field}: ${msgs?.join(', ')}`)
      .join('\n')

    console.error('Environment validation failed:\n' + messages)
    process.exit(1)
  }

  return result.data
}

export const env = validateEnv()
