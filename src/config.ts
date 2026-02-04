import { env } from './env.js'

export const config = {
  port: env.PORT,
  host: env.HOST,
  nodeEnv: env.NODE_ENV,
  logLevel: env.LOG_LEVEL,
  isDev: env.NODE_ENV !== 'production',
  databaseUrl: env.DATABASE_URL,
  frontendUrl: env.FRONTEND_URL,
  apiKey: env.API_KEY,
} as const
