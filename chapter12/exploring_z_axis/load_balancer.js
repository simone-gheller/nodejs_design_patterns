import { createServer } from 'http'
import httpProxy from 'http-proxy'
import Consul from 'consul'

const PORT = process.env.PORT || 8080
const CONSUL_HOST = process.env.CONSUL_HOST || 'localhost'
const CONSUL_PORT = process.env.CONSUL_PORT || 8500

// Initialize Consul client
const consul = new Consul({
  host: CONSUL_HOST,
  port: CONSUL_PORT,
  promisify: true
})

// Initialize HTTP proxy
const proxy = httpProxy.createProxyServer({})

proxy.on('error', (err, req, res) => {
  console.error('Proxy error:', err)
  if (!res.headersSent) {
    res.writeHead(502, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Bad Gateway' }))
  }
})

// Partition mapping: maps letter ranges to partition names
const PARTITION_MAP = [
  { name: 'A-D', regex: /^[A-D]/i, rrCounter: 0, metrics_count: 0, metrics_lastReset: Date.now() },
  { name: 'E-P', regex: /^[E-P]/i, rrCounter: 0, metrics_count: 0, metrics_lastReset: Date.now() },
  { name: 'Q-Z', regex: /^[Q-Z]/i, rrCounter: 0, metrics_count: 0, metrics_lastReset: Date.now() },
]
/**
 * Get the partition name for a given letter
 */
function getPartitionForLetter(letter) {
  const partitionIndex = PARTITION_MAP.findIndex(group => group.regex.test(letter))
  if (partitionIndex === -1) return null
  return PARTITION_MAP[partitionIndex]
}


/**
 * Query Consul for healthy servers in a specific partition
 */
async function getServersForPartition(partition) {
  try {
    const services = await consul.health.service({
      service: 'api-server',
      passing: true
    })

    // Filter services by partition tag
    const partitionServers = services.filter(service => {
      return service.Service.Tags.includes(`partition:${partition}`)
    })

    return partitionServers.map(s => ({
      address: s.Service.Address,
      port: s.Service.Port,
      id: s.Service.ID,
      partition: partition
    }))
  } catch (err) {
    console.error(`Error querying Consul for partition ${partition}:`, err)
    return []
  }
}

/**
 * Select a server using round-robin strategy
 */
function selectServer(servers, partition) {
  if (!servers || servers.length === 0) {
    return null
  }
  const index = partition.rrCounter++ % servers.length
  return servers[index]
}

/**
 * Proxy HTTP request to backend server using http-proxy
 */
function proxyRequest(backendServer, req, res) {
  const target = `http://${backendServer.address}:${backendServer.port}`

  console.log(`[LOAD BALANCER] Proxying to ${target}`)

  proxy.web(req, res, {
    target: target,
    changeOrigin: true
  })
}

/**
 * Main load balancer server
 */
const server = createServer(async (req, res) => {
  console.log(`[LOAD BALANCER] ${req.method} ${req.url}`)

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

  if (!letter || letter.length === 0) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Letter parameter is required' }))
    return
  }

  // Determine which partition to use
  const partition = getPartitionForLetter(letter)

  if (!partition) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: `No partition found for letter: ${letter}` }))
    return
  }

  console.log(`[LOAD BALANCER] Letter '${letter}' mapped to partition '${partition.name}'`)

  // Track request for auto-scaling metrics
  partition.metrics_count++

  // Get healthy servers for this partition
  const servers = await getServersForPartition(partition.name)

  if (servers.length === 0) {
    console.error(`[LOAD BALANCER] No healthy servers available for partition '${partition.name}'`)
    res.writeHead(503, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      error: 'Service Unavailable',
      message: `No servers available for partition ${partition.name}`
    }))
    return
  }

  // Select a server using round-robin
  const selectedServer = selectServer(servers, partition)
  console.log(`[LOAD BALANCER] Selected server: ${selectedServer.id} (${selectedServer.address}:${selectedServer.port})`)

  // Proxy the request to the selected server
  proxyRequest(selectedServer, req, res)
})

server.on('error', (err) => {
  console.error('Load balancer error:', err)
})

server.listen(PORT, () => {
  console.log(`Load Balancer listening on http://localhost:${PORT}`)
  console.log(`Consul endpoint: ${CONSUL_HOST}:${CONSUL_PORT}`)
  console.log('Partition mapping:')
  for (const partition of PARTITION_MAP) {
    console.log(`  ${partition.name}: ${partition.regex}`)
  }
})

// Graceful shutdown
function shutdown() {
  console.log('\nShutting down load balancer...')
  server.close(() => {
    console.log('Load balancer closed')
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
