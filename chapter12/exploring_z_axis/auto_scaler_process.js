import { request } from 'http'
import { createLogger } from './logger.js'
import { PARTITIONS, CONSUL_CONFIG, SCALING_CONFIG } from './config.js'
import { createConsulClient, getServersForPartition } from './consul_client.js'

const logger = createLogger('AUTO-SCALER', 'auto_scaler.log')

// Initialize Consul client
const consul = createConsulClient()

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
async function getPartitionMetrics(partitionName) {
  const servers = await getServersForPartition(consul, partitionName)

  if (servers.length === 0) {
    return null
  }

  const metricsPromises = servers.map(async (server) => {
    try {
      return await fetchMetrics(server)
    } catch (err) {
      logger.error(`Failed to fetch metrics from ${server.id}: ${err.message}`)
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
 * Request cluster manager to spawn a worker
 */
function requestScaleUp(partition) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      logger.warn(`Scale up request for ${partition} timed out`)
      resolve(false)
    }, 5000)

    const handler = (msg) => {
      if (msg.action === 'SCALE_UP_SUCCESS' && msg.partition === partition) {
        clearTimeout(timeout)
        process.off('message', handler)
        logger.info(`Scale up successful for ${partition}, worker ID: ${msg.workerId}`)
        resolve(true)
      } else if (msg.action === 'SCALE_UP_FAILED' && msg.partition === partition) {
        clearTimeout(timeout)
        process.off('message', handler)
        logger.error(`Scale up failed for ${partition}`)
        resolve(false)
      }
    }

    process.on('message', handler)
    process.send({ action: 'SCALE_UP', partition })
  })
}

/**
 * Request cluster manager to kill a worker
 */
function requestScaleDown(partition) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      logger.warn(`Scale down request for ${partition} timed out`)
      resolve(false)
    }, 5000)

    const handler = (msg) => {
      if (msg.action === 'SCALE_DOWN_SUCCESS' && msg.partition === partition) {
        clearTimeout(timeout)
        process.off('message', handler)
        logger.info(`Scale down successful for ${partition}`)
        resolve(true)
      } else if (msg.action === 'SCALE_DOWN_FAILED' && msg.partition === partition) {
        clearTimeout(timeout)
        process.off('message', handler)
        logger.error(`Scale down failed for ${partition}`)
        resolve(false)
      }
    }

    process.on('message', handler)
    process.send({ action: 'SCALE_DOWN', partition })
  })
}

/**
 * Make scaling decision for a partition
 */
async function makeScalingDecision(partition, metrics) {
  if (!metrics) {
    logger.info(`No metrics available for ${partition}`)
    return
  }

  const { instanceCount, avgCpu, avgMemoryPercent } = metrics

  logger.info(`${partition}: ${instanceCount} instances, CPU: ${avgCpu}%, Memory: ${avgMemoryPercent}%`)

  // Scale up if CPU or Memory exceed thresholds
  if ((avgCpu > SCALING_CONFIG.cpuThreshold || avgMemoryPercent > SCALING_CONFIG.memoryThreshold) &&
      instanceCount < SCALING_CONFIG.maxInstances) {
    logger.info(`Scaling UP ${partition}: ${instanceCount} -> ${instanceCount + 1}`)
    await requestScaleUp(partition)
  }
  // Scale down if both CPU and Memory are low
  else if (avgCpu < SCALING_CONFIG.cpuThreshold / 2 &&
           avgMemoryPercent < SCALING_CONFIG.memoryThreshold / 2 &&
           instanceCount > SCALING_CONFIG.minInstances) {
    logger.info(`Scaling DOWN ${partition}: ${instanceCount} -> ${instanceCount - 1}`)
    await requestScaleDown(partition)
  }
}

/**
 * Main monitoring loop
 */
async function monitorAndScale() {
  try {
    logger.debug('Checking metrics...')

    for (const partition of PARTITIONS) {
      const metrics = await getPartitionMetrics(partition.name)
      await makeScalingDecision(partition.name, metrics)
    }
  } catch (err) {
    logger.error(`Error in monitoring loop: ${err.message}`)
  }
}

/**
 * Start the auto-scaler (called by cluster_manager when worker is forked)
 */
export async function startAutoScaler() {
  logger.info('Auto-scaler starting...')
  logger.info(`Consul: ${CONSUL_CONFIG.host}:${CONSUL_CONFIG.port}`)
  logger.info(`CPU threshold: ${SCALING_CONFIG.cpuThreshold}%`)
  logger.info(`Memory threshold: ${SCALING_CONFIG.memoryThreshold}%`)
  logger.info(`Instance limits: ${SCALING_CONFIG.minInstances}-${SCALING_CONFIG.maxInstances}`)
  logger.info(`Check interval: ${SCALING_CONFIG.checkInterval}ms`)

  // Wait a bit for initial workers to register with Consul
  await new Promise(resolve => setTimeout(resolve, 5000))

  // Run monitoring at intervals
  const intervalId = setInterval(monitorAndScale, SCALING_CONFIG.checkInterval)

  // Graceful shutdown
  process.on('SIGTERM', () => {
    logger.info('Received SIGTERM, shutting down...')
    clearInterval(intervalId)
  })

  logger.info('Auto-scaler ready')
}
