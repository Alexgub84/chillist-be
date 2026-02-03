import { buildApp } from './app.js'
import { config } from './config.js'
import { createDb } from './db/index.js'

async function start() {
  if (!config.databaseUrl) {
    console.error('DATABASE_URL environment variable is required')
    process.exit(1)
  }

  const { db, close: closeDb } = createDb(config.databaseUrl)
  const app = await buildApp({ db })

  const shutdown = async () => {
    app.log.info('Shutting down...')
    await app.close()
    await closeDb()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  try {
    await app.listen({ port: config.port, host: config.host })
    app.log.info(`Server running at http://${config.host}:${config.port}`)
  } catch (err) {
    app.log.error(err)
    await closeDb()
    process.exit(1)
  }
}

start()
