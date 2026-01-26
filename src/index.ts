import { buildApp } from './app.js'
import { config } from './config.js'

async function start() {
  const app = await buildApp()

  try {
    await app.listen({ port: config.port, host: config.host })
    app.log.info(`Server running at http://${config.host}:${config.port}`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()
