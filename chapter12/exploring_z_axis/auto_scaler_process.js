import { request } from 'http'
import Consul from 'consul'
import { fork } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { getPortPromise } from 'portfinder'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const CONSUL_HOST = process.env.CONSUL_HOST || 'localhost'
const CONSUL_PORT = process.env.CONSUL_PORT || 8500

// Scaling thresholds
const CPU_THRESHOLD = parseFloat(process.env.CPU_THRESHOLD || '70') // CPU %
const MEMORY_THRESHOLD = parseFloat(process.env.MEMORY_THRESHOLD || '80') // Memory %
const MIN_INSTANCES = parseInt(process.env.MIN_INSTANCES || '1')
const MAX_INSTANCES = parseInt(process.env.MAX_INSTANCES || '5')
const CHECK_INTERVAL = parseInt(process.env.CHECK_INTERVAL || '30000') // 30 seconds

// Partition configuration
const PARTITIONS = ['A-D', 'E-P', 'Q-Z']

// Track spawned processes
const processes = new Map() // partition -> [process objects]

// Initialize Consul client
const consul = new Consul({
  host: CONSUL_HOST,
  port: CONSUL_PORT,
  promisify: true
})

/**
 * Get all healthy servers for a partition from Consul
 */
async function getServersForPartition(partition) {
  try {
    const serviceName = `api-server-${partition}`
    const services = await consul.health.service({
      service: serviceName,
      passing: true
    })

    return services.map(s => ({
      address: s.Service.Address,
      port: s.Service.Port,
      id: s.Service.ID,
      partition: partition
    }))
  } catch (err) {
    console.error(`[AUTO-SCALER] Error querying Consul for ${partition}:`, err.message)
    return []
  }
}

/**
 * Fetch metrics from a specific server
 */
async function fetchMetrics(server) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: server.address,
      port: server.port,
      path: '/metrics',
      method: 'GET',
      timeout: 5000
    }

    const req = request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        try {
          resolve(JSON.parse(data))
        } catch (err) {
          reject(new Error('Invalid JSON response'))
        }
      })
    })

    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('Request timeout'))
    })

    req.end()
  })
}

/**
 * Calculate average metrics across all servers in a partition
 */
async function getPartitionMetrics(partition) {
  const servers = await getServersForPartition(partition)

  if (servers.length === 0) {
    return null
  }

  const metricsPromises = servers.map(async (server) => {
    try {
      return await fetchMetrics(server)
    } catch (err) {
      console.error(`[AUTO-SCALER] Failed to fetch metrics from ${server.id}:`, err.message)
      return null
    }
  })

  const allMetrics = await Promise.all(metricsPromises)
  const validMetrics = allMetrics.filter(m => m !== null)

  if (validMetrics.length === 0) {
    return null
  }

  // Calculate averages
  const avgCpu = validMetrics.reduce((sum, m) => sum + m.cpuUsagePercent, 0) / validMetrics.length
  const avgMemoryPercent = validMetrics.reduce((sum, m) => {
    return sum + (m.memoryUsed / m.memoryTotal * 100)
  }, 0) / validMetrics.length

  return {
    instanceCount: servers.length,
    avgCpu: avgCpu.toFixed(2),
    avgMemoryPercent: avgMemoryPercent.toFixed(2)
  }
}

/**
 * Spawn a new worker process for a partition
 */
async function spawnWorker(partition) {
  const dbName = `${partition}.db`  // DAO adds 'db/' prefix automatically
  const port = await getPortPromise()

  return new Promise((resolve) => {
    const child = fork(join(__dirname, 'api_server.js'), [dbName], {
      env: {
        ...process.env,
        PARTITION: partition,
        DB_NAME: dbName,
        PORT: port.toString()
      },
      stdio: ['inherit', 'inherit', 'inherit', 'ipc']
    })

    child.on('exit', (code, signal) => {
      console.log(`[AUTO-SCALER] Worker for ${partition} exited (${signal || code})`)

      // Remove from tracking
      const partitionProcs = processes.get(partition) || []
      const index = partitionProcs.indexOf(child)
      if (index > -1) {
        partitionProcs.splice(index, 1)
      }
    })

    // Wait for worker to signal it's ready
    child.once('message', (msg) => {
      if (msg === 'ready') {
        console.log(`[AUTO-SCALER] Worker ${child.pid} for partition ${partition} ready on port ${port}`)
        resolve(child)
      }
    })

    // Track process
    if (!processes.has(partition)) {
      processes.set(partition, [])
    }
    processes.get(partition).push(child)

    console.log(`[AUTO-SCALER] Spawned worker ${child.pid} for partition ${partition} on port ${port}`)
  })
}

/**
 * Kill a worker for a partition
 */
function killWorker(partition) {
  const partitionProcs = processes.get(partition) || []

  if (partitionProcs.length === 0) {
    console.error(`[AUTO-SCALER] No workers to kill for partition ${partition}`)
    return false
  }

  // Kill the last spawned worker
  const worker = partitionProcs.pop()
  console.log(`[AUTO-SCALER] Killing worker ${worker.pid} for partition ${partition}`)
  worker.kill()
  return true
}

/**
 * Make scaling decision for a partition
 */
async function makeScalingDecision(partition, metrics) {
  if (!metrics) {
    console.log(`[AUTO-SCALER] No metrics available for ${partition}`)
    return
  }

  const { instanceCount, avgCpu, avgMemoryPercent } = metrics

  console.log(`[AUTO-SCALER] ${partition}: ${instanceCount} instances, CPU: ${avgCpu}%, Memory: ${avgMemoryPercent}%`)

  // Scale up if CPU or Memory exceed thresholds
  if ((avgCpu > CPU_THRESHOLD || avgMemoryPercent > MEMORY_THRESHOLD) && instanceCount < MAX_INSTANCES) {
    console.log(`[AUTO-SCALER] 🔼 Scaling UP ${partition}: ${instanceCount} -> ${instanceCount + 1}`)
    await spawnWorker(partition)
  }
  // Scale down if both CPU and Memory are low
  else if (avgCpu < CPU_THRESHOLD / 2 && avgMemoryPercent < MEMORY_THRESHOLD / 2 && instanceCount > MIN_INSTANCES) {
    console.log(`[AUTO-SCALER] 🔽 Scaling DOWN ${partition}: ${instanceCount} -> ${instanceCount - 1}`)
    killWorker(partition)
  }
}

/**
 * Main monitoring loop
 */
async function monitorAndScale() {
  try {
    console.log('\n[AUTO-SCALER] Checking metrics...')

    for (const partition of PARTITIONS) {
      const metrics = await getPartitionMetrics(partition)
      await makeScalingDecision(partition, metrics)
    }
  } catch (err) {
    console.error('[AUTO-SCALER] Error in monitoring loop:', err.message)
  }
}

// Start monitoring
console.log('[AUTO-SCALER] Starting auto-scaler...')
console.log(`[AUTO-SCALER] Consul: ${CONSUL_HOST}:${CONSUL_PORT}`)
console.log(`[AUTO-SCALER] CPU threshold: ${CPU_THRESHOLD}%`)
console.log(`[AUTO-SCALER] Memory threshold: ${MEMORY_THRESHOLD}%`)
console.log(`[AUTO-SCALER] Instance limits: ${MIN_INSTANCES}-${MAX_INSTANCES}`)
console.log(`[AUTO-SCALER] Check interval: ${CHECK_INTERVAL}ms`)

// Spawn initial workers
console.log('\n[AUTO-SCALER] Spawning initial workers...')
for (const partition of PARTITIONS) {
  await spawnWorker(partition)
}

// Run monitoring at intervals
setInterval(monitorAndScale, CHECK_INTERVAL)

// Graceful shutdown
function shutdown() {
  console.log('\n[AUTO-SCALER] Shutting down...')

  for (const [partition, procs] of processes.entries()) {
    console.log(`[AUTO-SCALER] Killing ${procs.length} workers for ${partition}`)
    procs.forEach(proc => proc.kill())
  }

  setTimeout(() => {
    console.log('[AUTO-SCALER] All workers stopped')
    process.exit(0)
  }, 2000)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
