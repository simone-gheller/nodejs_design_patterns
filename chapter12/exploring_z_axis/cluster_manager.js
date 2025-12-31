import cluster from 'cluster'
import { createLogger } from './logger.js'
import { PARTITIONS } from './config.js'

const logger = createLogger('CLUSTER-MANAGER', 'cluster_manager.log')

// Track workers by partition
const workers = new Map()

// Track special workers
let autoScalerWorker = null
let loadBalancerWorker = null

// Track allocated ports to avoid race conditions
const allocatedPorts = new Set()
let nextPort = 8000

if (cluster.isPrimary) {
  await (async () => {
    logger.info(`Primary process ${process.pid} is running`)

    // First, spawn the load balancer
    logger.info('Starting load balancer process...')
    loadBalancerWorker = cluster.fork({ WORKER_TYPE: 'LOAD_BALANCER' })
    logger.info(`Load balancer started with PID ${loadBalancerWorker.process.pid}`)

    // Then, spawn the auto-scaler
    logger.info('Starting auto-scaler process...')
    autoScalerWorker = cluster.fork({ WORKER_TYPE: 'AUTO_SCALER' })
    logger.info(`Auto-scaler started with PID ${autoScalerWorker.process.pid}`)

    // Listen for messages from auto-scaler
    autoScalerWorker.on('message', handleAutoScalerMessage)

    // Fork initial workers for each partition
    logger.info('Starting initial API server workers...')
    for (const partition of PARTITIONS) {
      forkWorker(partition)
    }
  })()

  // Handle worker exit
  cluster.on('exit', (worker, code, signal) => {
    // During shutdown, worker.process might be undefined
    if (!worker.process || !worker.process.env) {
      return
    }

    const workerType = worker.process.env.WORKER_TYPE

    if (workerType === 'LOAD_BALANCER') {
      logger.error(`Load balancer worker ${worker.process.pid} died (${signal || code})`)
      logger.info('Restarting load balancer...')
      loadBalancerWorker = cluster.fork({ WORKER_TYPE: 'LOAD_BALANCER' })
      return
    }

    if (workerType === 'AUTO_SCALER') {
      logger.error(`Auto-scaler worker ${worker.process.pid} died (${signal || code})`)
      logger.info('Restarting auto-scaler...')
      autoScalerWorker = cluster.fork({ WORKER_TYPE: 'AUTO_SCALER' })
      autoScalerWorker.on('message', handleAutoScalerMessage)
      return
    }

    const partitionName = worker.process.env.PARTITION
    logger.warn(`Worker ${worker.process.pid} (${partitionName}) died (${signal || code})`)

    // Remove from tracking
    const partitionWorkers = workers.get(partitionName) || []
    const index = partitionWorkers.indexOf(worker)
    if (index > -1) {
      partitionWorkers.splice(index, 1)
    }

    // Auto-restart only if it was the last worker for this partition
    if (partitionWorkers.length === 0) {
      logger.info(`Restarting worker for partition ${partitionName}`)
      const partition = PARTITIONS.find(p => p.name === partitionName)
      if (partition) {
        forkWorker(partition).catch(err => {
          logger.error(`Failed to restart worker for partition ${partitionName}:`, err)
        })
      }
    }
  })

  // Graceful shutdown
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

} else {
  // Worker process
  const workerType = process.env.WORKER_TYPE

  if (workerType === 'LOAD_BALANCER') {
    // This is the load balancer worker
    const { startLoadBalancer } = await import('./load_balancer.js')
    await startLoadBalancer()
  } else if (workerType === 'AUTO_SCALER') {
    // This is the auto-scaler worker
    const { startAutoScaler } = await import('./auto_scaler_process.js')
    await startAutoScaler()
  } else {
    // This is an API server worker
    await import('./api_server.js')
  }
}

/**
 * Handle messages from auto-scaler
 */
function handleAutoScalerMessage(message) {
  if (!message || typeof message !== 'object') {
    return
  }

  const { action, partition } = message

  switch (action) {
    case 'SCALE_UP':
      logger.info(`Auto-scaler requested scale up for partition ${partition}`)
      const spawned = spawnReplica(partition)
      if (spawned) {
        autoScalerWorker.send({
          action: 'SCALE_UP_SUCCESS',
          partition,
          workerId: spawned.id
        })
      } else {
        autoScalerWorker.send({
          action: 'SCALE_UP_FAILED',
          partition
        })
      }
      break

    case 'SCALE_DOWN':
      logger.info(`Auto-scaler requested scale down for partition ${partition}`)
      const killed = killWorkerForPartition(partition)
      if (killed) {
        autoScalerWorker.send({
          action: 'SCALE_DOWN_SUCCESS',
          partition
        })
      } else {
        autoScalerWorker.send({
          action: 'SCALE_DOWN_FAILED',
          partition
        })
      }
      break

    case 'GET_WORKER_COUNT':
      const count = getWorkerCount(partition)
      autoScalerWorker.send({
        action: 'WORKER_COUNT',
        partition,
        count
      })
      break

    default:
      logger.warn(`Unknown message action from auto-scaler: ${action}`)
  }
}

/**
 * Allocate next available port
 */
function allocatePort() {
  while (allocatedPorts.has(nextPort)) {
    nextPort++
  }
  allocatedPorts.add(nextPort)
  return nextPort++
}

/**
 * Fork a new worker for a partition
 */
function forkWorker(partition) {
  // Allocate a unique port for this worker (no race condition)
  const port = allocatePort()

  const worker = cluster.fork({
    WORKER_TYPE: 'API_SERVER',
    PARTITION: partition.name,
    DB_NAME: partition.db,
    PORT: port.toString()
  })

  // Track worker
  if (!workers.has(partition.name)) {
    workers.set(partition.name, [])
  }
  workers.get(partition.name).push(worker)

  logger.info(`Started worker ${worker.process.pid} for partition ${partition.name} on port ${port}`)

  return worker
}

/**
 * Spawn an additional replica for a partition
 */
export function spawnReplica(partitionName) {
  if (!cluster.isPrimary) {
    logger.error('spawnReplica can only be called from primary')
    return null
  }

  const partition = PARTITIONS.find(p => p.name === partitionName)
  if (!partition) {
    logger.error(`Unknown partition: ${partitionName}`)
    return null
  }

  logger.info(`Spawning additional replica for partition ${partitionName}`)
  return forkWorker(partition)
}

/**
 * Kill a worker for a specific partition
 */
function killWorkerForPartition(partitionName) {
  if (!cluster.isPrimary) {
    logger.error('killWorkerForPartition can only be called from primary')
    return false
  }

  const partitionWorkers = workers.get(partitionName) || []

  // Don't kill if it's the last worker for this partition
  if (partitionWorkers.length <= 1) {
    logger.warn(`Cannot kill last worker for partition ${partitionName}`)
    return false
  }

  // Kill the last worker
  const worker = partitionWorkers[partitionWorkers.length - 1]
  logger.info(`Killing worker ${worker.process.pid} (${partitionName})`)
  worker.kill()
  return true
}

/**
 * Kill a specific worker by ID
 */
export function killWorker(workerId) {
  if (!cluster.isPrimary) {
    logger.error('killWorker can only be called from primary')
    return false
  }

  const worker = cluster.workers[workerId]
  if (!worker) {
    logger.error(`Worker ${workerId} not found`)
    return false
  }

  const partitionName = worker.process.env.PARTITION
  const partitionWorkers = workers.get(partitionName) || []

  // Don't kill if it's the last worker for this partition
  if (partitionWorkers.length <= 1) {
    logger.error(`Cannot kill last worker for partition ${partitionName}`)
    return false
  }

  logger.info(`Killing worker ${workerId} (${partitionName})`)
  worker.kill()
  return true
}

/**
 * Get worker count by partition
 */
export function getWorkerCount(partitionName) {
  const partitionWorkers = workers.get(partitionName) || []
  return partitionWorkers.length
}

/**
 * Get all workers for a partition
 */
export function getWorkersForPartition(partitionName) {
  return workers.get(partitionName) || []
}

/**
 * Graceful shutdown
 */
function shutdown() {
  logger.info('Shutting down...')

  // Kill special workers first
  if (loadBalancerWorker) {
    loadBalancerWorker.kill()
  }
  if (autoScalerWorker) {
    autoScalerWorker.kill()
  }

  // Kill all workers
  for (const id in cluster.workers) {
    cluster.workers[id].kill()
  }

  setTimeout(() => {
    logger.info('All workers stopped')
    process.exit(0)
  }, 2000)
}
