
import { createServer } from 'http'
import { getPortPromise } from 'portfinder'
import { SqliteDAO } from './dao.js'
import { pid } from 'process'
import { hostname } from 'os'
import Consul from 'consul'

const PORT = await getPortPromise()
const DB_NAME = process.argv[2]
const PARTITION = process.env.PARTITION || DB_NAME.replace('.db', '')
const CONSUL_HOST = process.env.CONSUL_HOST || 'localhost'
const CONSUL_PORT = process.env.CONSUL_PORT || 8500
const HOST_NAME = hostname()
const SERVICE_ID = `api-server-${PARTITION}-${HOST_NAME}-${PORT}`

const db_dao = new SqliteDAO(DB_NAME)

// Initialize Consul client
const consul = new Consul({
  host: CONSUL_HOST,
  port: CONSUL_PORT,
  promisify: true
})

const server = createServer(async (req, res) => {
  // Health check endpoint for Consul
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'healthy', partition: PARTITION, pid }))
    return
  }

  if (!req.url.startsWith('/api/people/byLastName/')) {
    res.writeHead(200)
    res.end('Im alive\n')
    return
  }

  const letter = req.url.split('/').at(-1)
  console.log(`[WORKER: ${pid}] Fetching people with last name starting with A.`)
  try {
    const people = await db_dao.all(
      'SELECT * FROM people WHERE lastName LIKE ?',
      [`${letter}%`]
    )

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(people))
  } catch (err) {
    console.error('Database error:', err)
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Database error' }))
  }
})

server.on('error', (err)=>{
  console.log(err)
})

server.listen(PORT, async () => {
  console.log(`Server listening on http://localhost:${PORT}`)
  console.log(`Database: ${DB_NAME}`)
  console.log(`Partition: ${PARTITION}`)

  // Register service with Consul
  const serviceAddress = hostname()

  try {
    await consul.agent.service.register({
      id: SERVICE_ID,
      name: 'api-server',
      address: serviceAddress,
      port: PORT,
      tags: [`partition:${PARTITION}`],
      meta: {
        partition: PARTITION,
        database: DB_NAME
      },
      check: {
        http: `http://${serviceAddress}:${PORT}/health`,
        interval: '10s',
        timeout: '5s'
      }
    })
    console.log(`Registered with Consul as ${SERVICE_ID} at ${serviceAddress}:${PORT}`)
  } catch (err) {
    console.error('Failed to register with Consul:', err)
    process.exit(1)
  }
})

// Graceful shutdown
async function shutdown() {
  console.log('\nShutting down...')

  try {
    await consul.agent.service.deregister(SERVICE_ID)
    console.log('Deregistered from Consul')
  } catch (err) {
    console.error('Error deregistering from Consul:', err)
  }

  server.close(() => {
    console.log('Server closed')
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)