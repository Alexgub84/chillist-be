import { writeFileSync, readFileSync, existsSync } from 'fs'

process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://dummy:dummy@localhost:5432/dummy'

const { buildApp } = await import('../src/app.js')

const OPENAPI_OUTPUT_PATH = './docs/openapi.json'

async function generateOpenAPISpec() {
  const isValidateMode = process.argv.includes('--validate')

  const mockDb = {
    select: () => ({ from: () => ({ orderBy: () => Promise.resolve([]) }) }),
  }

  const app = await buildApp({ db: mockDb as never }, { enableDocs: true })

  await app.ready()

  const spec = app.swagger()

  if (isValidateMode) {
    if (!existsSync(OPENAPI_OUTPUT_PATH)) {
      console.error(`OpenAPI spec not found at ${OPENAPI_OUTPUT_PATH}`)
      console.error('Run "npm run openapi:generate" first')
      process.exit(1)
    }

    const existingSpec = JSON.parse(readFileSync(OPENAPI_OUTPUT_PATH, 'utf-8'))
    const newSpecString = JSON.stringify(spec, null, 2)
    const existingSpecString = JSON.stringify(existingSpec, null, 2)

    if (newSpecString !== existingSpecString) {
      console.error('OpenAPI spec is out of date!')
      console.error('Run "npm run openapi:generate" to update it')
      process.exit(1)
    }

    console.log('OpenAPI spec is up to date')
  } else {
    writeFileSync(OPENAPI_OUTPUT_PATH, JSON.stringify(spec, null, 2))
    console.log(`OpenAPI spec generated at ${OPENAPI_OUTPUT_PATH}`)
  }

  await app.close()
}

generateOpenAPISpec().catch((err) => {
  console.error('Failed to generate OpenAPI spec:', err)
  process.exit(1)
})
