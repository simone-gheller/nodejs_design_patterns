import { request } from 'http'
import { exec } from 'child_process'
import { promisify } from 'util'
import Consul from 'consul'

const execAsync = promisify(exec)

const LOAD_BALANCER_HOST = process.env.LOAD_BALANCER_HOST || 'localhost'
const LOAD_BALANCER_PORT = process.env.LOAD_BALANCER_PORT || 8080
const CONSUL_HOST = process.env.CONSUL_HOST || 'localhost'
const CONSUL_PORT = process.env.CONSUL_PORT || 8500

// Scaling thresholds
const SCALE_UP_THRESHOLD = parseFloat(process.env.SCALE_UP_THRESHOLD || '10') // requests per second
const SCALE_DOWN_THRESHOLD = parseFloat(process.env.SCALE_DOWN_THRESHOLD || '2') // requests per second
const MIN_INSTANCES = parseInt(process.env.MIN_INSTANCES || '1')
const MAX_INSTANCES = parseInt(process.env.MAX_INSTANCES || '5')
const CHECK_INTERVAL = parseInt(process.env.CHECK_INTERVAL || '30000') // 30 seconds

// Map partition names to docker-compose service names
const PARTITION_TO_SERVICE = {
  'A-D': 'api-server-ad',
  'E-P': 'api-server-ep',
  'Q-Z': 'api-server-qz'
}

// Initialize Consul client
const consul = new Consul({
  host: CONSUL_HOST,
  port: CONSUL_PORT,
  promisify: true
})

/**
 * Fetch metrics from load balancer
 */
async function fetchMetrics() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: LOAD_BALANCER_HOST,
      port: LOAD_BALANCER_PORT,
      path: '/metrics',
      method: 'GET'
    }

    const req = request(options, (res) => {
      let data = ''

      res.on('data', (chunk) => {
        data += chunk
      })

      res.on('end', () => {
        try {
          const metrics = JSON.parse(data)
          resolve(metrics)
        } catch (err) {
          reject(err)
        }
      })
    })

    req.on('error', reject)
    req.end()
  })
}

/**
 * Get current number of instances for a partition from Consul
 */
async function getCurrentInstances(partition) {
  try {
    const services = await consul.health.service({
      service: 'api-server',
      passing: true
    })

    const partitionServers = services.filter(service => {
      return service.Service.Tags.includes(`partition:${partition}`)
    })

    return partitionServers.length
  } catch (err) {
    console.error(`Error querying Consul for partition ${partition}:`, err)
    return 0
  }
}

/**
 * Scale a service using docker-compose
 */
async function scaleService(serviceName, instances) {
  try {
    console.log(`[AUTO-SCALER] Scaling ${serviceName} to ${instances} instances...`)

    // Use docker compose (v2 CLI) and specify the project directory
    const { stdout, stderr } = await execAsync(
      `cd /app && docker compose up --scale ${serviceName}=${instances} -d ${serviceName}`,
      { shell: '/bin/sh' }
    )

    if (stdout) {
      console.log(`[AUTO-SCALER] stdout: ${stdout}`)
    }

    if (stderr && !stderr.includes('Starting') && !stderr.includes('Creating') && !stderr.includes('Running')) {
      console.error(`[AUTO-SCALER] stderr: ${stderr}`)
    }

    console.log(`[AUTO-SCALER] Successfully scaled ${serviceName} to ${instances}`)
    return true
  } catch (err) {
    console.error(`[AUTO-SCALER] Error scaling ${serviceName}:`, err.message)
    return false
  }
}

/**
 * Make scaling decision based on metrics
 */
async function makeScalingDecision(partition, metrics) {
  const serviceName = PARTITION_TO_SERVICE[partition]
  const requestsPerSecond = parseFloat(metrics.requestsPerSecond)
  const currentInstances = await getCurrentInstances(partition)

  console.log(`[AUTO-SCALER] Partition ${partition}: ${requestsPerSecond} req/s, ${currentInstances} instances`)

  let targetInstances = currentInstances

  // Scale up if requests per second exceed threshold
  if (requestsPerSecond > SCALE_UP_THRESHOLD && currentInstances < MAX_INSTANCES) {
    targetInstances = Math.min(currentInstances + 1, MAX_INSTANCES)
    console.log(`[AUTO-SCALER] 🔼 Scale up decision for ${partition}: ${currentInstances} -> ${targetInstances}`)
  }
  // Scale down if requests per second below threshold
  else if (requestsPerSecond < SCALE_DOWN_THRESHOLD && currentInstances > MIN_INSTANCES) {
    targetInstances = Math.max(currentInstances - 1, MIN_INSTANCES)
    console.log(`[AUTO-SCALER] 🔽 Scale down decision for ${partition}: ${currentInstances} -> ${targetInstances}`)
  }

  // Execute scaling if needed
  if (targetInstances !== currentInstances) {
    await scaleService(serviceName, targetInstances)
  }
}

/**
 * Main monitoring loop
 */
async function monitorAndScale() {
  try {
    console.log('[AUTO-SCALER] Fetching metrics...')
    const metrics = await fetchMetrics()

    console.log('[AUTO-SCALER] Current metrics:', JSON.stringify(metrics, null, 2))

    // Make scaling decisions for each partition
    for (const [partition, partitionMetrics] of Object.entries(metrics)) {
      await makeScalingDecision(partition, partitionMetrics)
    }
  } catch (err) {
    console.error('[AUTO-SCALER] Error in monitoring loop:', err.message)
  }
}

// Start monitoring
console.log('[AUTO-SCALER] Starting auto-scaler...')
console.log(`[AUTO-SCALER] Load Balancer: ${LOAD_BALANCER_HOST}:${LOAD_BALANCER_PORT}`)
console.log(`[AUTO-SCALER] Consul: ${CONSUL_HOST}:${CONSUL_PORT}`)
console.log(`[AUTO-SCALER] Scale up threshold: ${SCALE_UP_THRESHOLD} req/s`)
console.log(`[AUTO-SCALER] Scale down threshold: ${SCALE_DOWN_THRESHOLD} req/s`)
console.log(`[AUTO-SCALER] Instance limits: ${MIN_INSTANCES}-${MAX_INSTANCES}`)
console.log(`[AUTO-SCALER] Check interval: ${CHECK_INTERVAL}ms`)

// Run immediately, then at intervals
monitorAndScale()
setInterval(monitorAndScale, CHECK_INTERVAL)

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[AUTO-SCALER] Shutting down...')
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('\n[AUTO-SCALER] Shutting down...')
  process.exit(0)
})
