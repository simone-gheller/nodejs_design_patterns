import cluster from 'cluster'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Partition configuration
const PARTITIONS = [
  { name: 'A-D', db: 'A-D.db' },
  { name: 'E-P', db: 'E-P.db' },
  { name: 'Q-Z', db: 'Q-Z.db' }
]

// Track workers by partition
const workers = new Map()

if (cluster.isPrimary) {
  console.log(`[CLUSTER] Primary process ${process.pid} is running`)
  console.log(`[CLUSTER] Starting initial workers...`)

  // Fork one worker for each partition
  for (const partition of PARTITIONS) {
    forkWorker(partition)
  }

  // Handle worker exit
  cluster.on('exit', (worker, code, signal) => {
    const partitionName = worker.process.env.PARTITION
    console.log(`[CLUSTER] Worker ${worker.process.pid} (${partitionName}) died (${signal || code})`)

    // Remove from tracking
    const partitionWorkers = workers.get(partitionName) || []
    const index = partitionWorkers.indexOf(worker)
    if (index > -1) {
      partitionWorkers.splice(index, 1)
    }

    // Auto-restart only if it was the last worker for this partition
    if (partitionWorkers.length === 0) {
      console.log(`[CLUSTER] Restarting worker for partition ${partitionName}`)
      const partition = PARTITIONS.find(p => p.name === partitionName)
      if (partition) {
        forkWorker(partition)
      }
    }
  })

  // Graceful shutdown
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

} else {
  // Worker process - start API server
  const { default: apiServer } = await import('./api_server.js')
}

/**
 * Fork a new worker for a partition
 */
function forkWorker(partition) {
  const worker = cluster.fork({
    PARTITION: partition.name,
    DB_NAME: partition.db
  })

  // Track worker
  if (!workers.has(partition.name)) {
    workers.set(partition.name, [])
  }
  workers.get(partition.name).push(worker)

  console.log(`[CLUSTER] Started worker ${worker.process.pid} for partition ${partition.name}`)

  return worker
}

/**
 * Spawn an additional replica for a partition
 */
export function spawnReplica(partitionName) {
  if (!cluster.isPrimary) {
    console.error('[CLUSTER] spawnReplica can only be called from primary')
    return null
  }

  const partition = PARTITIONS.find(p => p.name === partitionName)
  if (!partition) {
    console.error(`[CLUSTER] Unknown partition: ${partitionName}`)
    return null
  }

  console.log(`[CLUSTER] Spawning additional replica for partition ${partitionName}`)
  return forkWorker(partition)
}

/**
 * Kill a specific worker
 */
export function killWorker(workerId) {
  if (!cluster.isPrimary) {
    console.error('[CLUSTER] killWorker can only be called from primary')
    return false
  }

  const worker = cluster.workers[workerId]
  if (!worker) {
    console.error(`[CLUSTER] Worker ${workerId} not found`)
    return false
  }

  const partitionName = worker.process.env.PARTITION
  const partitionWorkers = workers.get(partitionName) || []

  // Don't kill if it's the last worker for this partition
  if (partitionWorkers.length <= 1) {
    console.error(`[CLUSTER] Cannot kill last worker for partition ${partitionName}`)
    return false
  }

  console.log(`[CLUSTER] Killing worker ${workerId} (${partitionName})`)
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
  console.log('\n[CLUSTER] Shutting down...')

  for (const id in cluster.workers) {
    cluster.workers[id].kill()
  }

  setTimeout(() => {
    console.log('[CLUSTER] All workers stopped')
    process.exit(0)
  }, 2000)
}
