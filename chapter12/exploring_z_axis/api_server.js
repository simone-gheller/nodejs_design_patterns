import { createServer } from 'http'
import { SqliteDAO } from './dao.js'
import { pid } from 'process'
import { hostname, cpus, freemem, totalmem } from 'os'
import { createLogger } from './logger.js'
import { SERVICE_NAME_TEMPLATE } from './config.js'
import { createConsulClient, registerService, deregisterService } from './consul_client.js'

// PORT must be provided by cluster manager via environment variable
if (!process.env.PORT) {
  console.error('ERROR: PORT environment variable is required when running as cluster worker')
  process.exit(1)
}

const PORT = parseInt(process.env.PORT)
const DB_NAME = process.argv[2] || process.env.DB_NAME
const PARTITION = process.env.PARTITION || DB_NAME.replace('.db', '')
const HOST_NAME = hostname()
// Service name includes partition for DNS lookup
const SERVICE_NAME = SERVICE_NAME_TEMPLATE(PARTITION)
const SERVICE_ID = `${SERVICE_NAME}-${HOST_NAME}-${PORT}`

const logger = createLogger(`API-SERVER-${PARTITION}`, `api_server_${PARTITION}_${pid}.log`)
const db_dao = new SqliteDAO(DB_NAME)

// Initialize Consul client
const consul = createConsulClient()

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
  logger.info(`[PID ${pid}:${PORT}] Fetching people with last name starting with ${letter}`)
  try {
    const people = await db_dao.all(
      'SELECT * FROM people WHERE lastName LIKE ?',
      [`${letter}%`]
    )

    logger.info(`[PID ${pid}:${PORT}] Returning ${people.length} results for letter ${letter}`)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(people))
  } catch (err) {
    logger.error(`[PID ${pid}:${PORT}] Database error:`, err)
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Database error' }))
  }
})

server.on('error', (err)=>{
  logger.error(`[PID ${pid}:${PORT}] Server error:`, err)
})

server.listen(PORT, async () => {
  logger.info(`[PID ${pid}:${PORT}] Server listening on http://localhost:${PORT}`)
  logger.info(`[PID ${pid}:${PORT}] Database: ${DB_NAME}`)
  logger.info(`[PID ${pid}:${PORT}] Partition: ${PARTITION}`)

  // Register service with Consul
  const serviceAddress = hostname()

  try {
    await registerService(consul, {
      id: SERVICE_ID,
      name: SERVICE_NAME,
      address: serviceAddress,
      port: PORT,
      meta: {
        partition: PARTITION,
        database: DB_NAME
      },
      healthCheckPath: '/health'
    })
    logger.info(`[PID ${pid}:${PORT}] Registered with Consul as ${SERVICE_NAME} (ID: ${SERVICE_ID}) at ${serviceAddress}:${PORT}`)

    // Notify parent process that we're ready (if spawned by cluster manager)
    if (process.send) {
      process.send('ready')
    }
  } catch (err) {
    logger.error(`[PID ${pid}:${PORT}] Failed to register with Consul:`, err)
    process.exit(1)
  }
})

// Graceful shutdown
async function shutdown() {
  logger.info(`[PID ${pid}:${PORT}] Shutting down...`)

  try {
    await deregisterService(consul, SERVICE_ID)
    logger.info(`[PID ${pid}:${PORT}] Deregistered from Consul`)
  } catch (err) {
    logger.error(`[PID ${pid}:${PORT}] Error deregistering from Consul:`, err)
  }

  server.close(() => {
    logger.info(`[PID ${pid}:${PORT}] Server closed`)
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)