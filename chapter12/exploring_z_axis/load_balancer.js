import { createServer } from 'http'
import httpProxy from 'http-proxy'
import os from 'os'
import { createLogger } from './logger.js'
import { PARTITIONS, CONSUL_CONFIG, getPartitionForLetter } from './config.js'
import { createConsulClient, getServersForPartition, registerService, deregisterService } from './consul_client.js'

const logger = createLogger('LOAD-BALANCER', 'load_balancer.log')

const PORT = process.env.PORT || 8080
const SERVICE_ID = `load-balancer-${os.hostname()}-${PORT}`
const SERVICE_NAME = 'load-balancer'

// Initialize Consul client
const consul = createConsulClient()

// Initialize HTTP proxy
const proxy = httpProxy.createProxyServer({})

proxy.on('error', (err, req, res) => {
  logger.error('Proxy error:', err)
  if (!res.headersSent) {
    res.writeHead(502, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Bad Gateway' }))
  }
})

// Partition mapping with round-robin counters and metrics
const PARTITION_MAP = PARTITIONS.map(p => ({
  ...p,
  rrCounter: 0,
  metrics_count: 0,
  metrics_lastReset: Date.now()
}))

/**
 * Select a server using round-robin strategy
 */
function selectServer(servers, partition) {
  if (!servers || servers.length === 0) return null
  const index = partition.rrCounter++ % servers.length
  return servers[index]
}

/**
 * Proxy HTTP request to backend server using http-proxy
 */
function proxyRequest(backendServer, req, res) {
  const target = `http://${backendServer.address}:${backendServer.port}`
  logger.info(`Proxying to ${target}`)

  proxy.web(req, res, {
    target: target,
    changeOrigin: true
  })
}

/**
 * Start the load balancer (can be called by cluster_manager or standalone)
 */
export async function startLoadBalancer() {
  const server = createServer(async (req, res) => {
    logger.info(`${req.method} ${req.url}`)

    // Health check endpoint
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: 'healthy', service: 'load-balancer' }))
      return
    }

    // Metrics endpoint for monitoring
    if (req.url === '/metrics') {
      const metrics = {}
      for (const partition of PARTITION_MAP) {
        const timeElapsed = (Date.now() - partition.metrics_lastReset) / 1000 // seconds
        metrics[partition.name] = {
          totalRequests: partition.metrics_count,
          requestsPerSecond: timeElapsed > 0 ? (partition.metrics_count / timeElapsed).toFixed(2) : 0
        }
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(metrics))
      return
    }

    // Parse request to extract the letter
    if (!req.url.startsWith('/api/people/byLastName/')) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Invalid request path' }))
      return
    }

    const letter = req.url.split('/').at(-1)
    // Determine which partition to use
    const partitionConfig = getPartitionForLetter(letter)

    if (!partitionConfig) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: `No partition found for letter: ${letter}` }))
      return
    }

    const partition = PARTITION_MAP.find(p => p.name === partitionConfig.name)
    logger.info(`Letter '${letter}' mapped to partition '${partition.name}'`)
    partition.metrics_count++
    const servers = await getServersForPartition(consul, partition.name)

    if (servers.length === 0) {
      logger.error(`No healthy servers available for partition '${partition.name}'`)
      res.writeHead(503, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        error: 'Service Unavailable',
        message: `No servers available for partition ${partition.name}`
      }))
      return
    }

    // Select a server using round-robin
    const selectedServer = selectServer(servers, partition)
    logger.info(`Selected server: ${selectedServer.id} (${selectedServer.address}:${selectedServer.port})`)

    proxyRequest(selectedServer, req, res)
  })

  server.on('error', (err) => {
    logger.error('Load balancer error:', err)
  })

  server.listen(PORT, async () => {
    logger.info(`Load Balancer listening on http://localhost:${PORT}`)
    logger.info(`Consul endpoint: ${CONSUL_CONFIG.host}:${CONSUL_CONFIG.port}`)

    // Register with Consul
    try {
      const serviceAddress = os.hostname()
      await registerService(consul, {
        id: SERVICE_ID,
        name: SERVICE_NAME,
        address: serviceAddress,
        port: PORT,
        meta: { role: 'load-balancer' },
        healthCheckPath: '/health'
      })
      logger.info(`Registered with Consul as ${SERVICE_NAME} (ID: ${SERVICE_ID}) at ${serviceAddress}:${PORT}`)
    } catch (err) {
      logger.error('Failed to register with Consul:', err)
    }
  })

  // Graceful shutdown
  async function shutdown() {
    logger.info('Shutting down load balancer...')

    // Deregister from Consul
    try {
      await deregisterService(consul, SERVICE_ID)
      logger.info('Deregistered from Consul')
    } catch (err) {
      logger.error('Failed to deregister from Consul:', err)
    }

    server.close(() => {
      logger.info('Load balancer closed')
      process.exit(0)
    })
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  logger.info('Load balancer ready')
}

// If running as standalone script (not imported as module)
if (import.meta.url === `file://${process.argv[1]}`) {
  startLoadBalancer()
}
