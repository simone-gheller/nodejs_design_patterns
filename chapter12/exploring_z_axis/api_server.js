
import { createServer } from 'http'
import { getPortPromise } from 'portfinder'
import { SqliteDAO } from './dao.js'
import { pid } from 'process'
import { hostname, cpus, freemem, totalmem } from 'os'
import Consul from 'consul'

const PORT = process.env.PORT ? parseInt(process.env.PORT) : await getPortPromise()
const DB_NAME = process.argv[2]
const PARTITION = process.env.PARTITION || DB_NAME.replace('.db', '')
const CONSUL_HOST = process.env.CONSUL_HOST || 'localhost'
const CONSUL_PORT = process.env.CONSUL_PORT || 8500
const HOST_NAME = hostname()
// Service name includes partition for DNS lookup
const SERVICE_NAME = `api-server-${PARTITION}`
const SERVICE_ID = `${SERVICE_NAME}-${HOST_NAME}-${PORT}`

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

  if (req.url === '/metrics') {
    const totalMemory = totalmem()
    const usedMemory = totalMemory - freemem()

    // Calculate average CPU usage across all cores
    const cpuInfo = cpus()
    const avgCpuUsage = cpuInfo.reduce((acc, cpu) => {
      const total = Object.values(cpu.times).reduce((sum, time) => sum + time, 0)
      const idle = cpu.times.idle
      const usage = (1 - idle / total) * 100
      return acc + usage
    }, 0) / cpuInfo.length

    const metrics = {
      memoryTotal: totalMemory,
      memoryUsed: usedMemory,
      cpuUsagePercent: parseFloat(avgCpuUsage.toFixed(2))
    }

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(metrics))
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
      name: SERVICE_NAME,  // Each partition is a separate service
      address: serviceAddress,
      port: PORT,
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
    console.log(`Registered with Consul as ${SERVICE_NAME} (ID: ${SERVICE_ID}) at ${serviceAddress}:${PORT}`)

    // Notify parent process that we're ready (if spawned by auto_scaler)
    if (process.send) {
      process.send('ready')
    }
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