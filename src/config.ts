import { env } from './env.js'

export const config = {
  port: env.PORT,
  host: env.HOST,
  nodeEnv: env.NODE_ENV,
  logLevel: env.LOG_LEVEL,
  isDev: env.NODE_ENV !== 'production',
  databaseUrl: env.DATABASE_URL,
  frontendUrl: env.FRONTEND_URL,
  supabaseUrl: env.SUPABASE_URL,
  whatsappProvider: env.WHATSAPP_PROVIDER,
  greenApiInstanceId: env.GREEN_API_INSTANCE_ID,
  greenApiToken: env.GREEN_API_TOKEN,
  chatbotServiceKey: env.CHATBOT_SERVICE_KEY,
  supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
} as const
