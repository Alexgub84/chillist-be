export const config = {
  port: parseInt(process.env.PORT || '3333', 10),
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
  isDev: process.env.NODE_ENV !== 'production',
} as const
