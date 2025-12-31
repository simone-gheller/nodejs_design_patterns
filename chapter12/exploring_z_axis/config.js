/**
 * Centralized configuration for the Z-axis scaling architecture
 */

// Partition configuration - single source of truth
export const PARTITIONS = [
  { name: 'A-D', db: 'A-D.db', regex: /^[A-D]/i },
  { name: 'E-P', db: 'E-P.db', regex: /^[E-P]/i },
  { name: 'Q-Z', db: 'Q-Z.db', regex: /^[Q-Z]/i }
]

// Consul configuration
export const CONSUL_CONFIG = {
  host: process.env.CONSUL_HOST || 'localhost',
  port: parseInt(process.env.CONSUL_PORT || '8500')
}

// Auto-scaling thresholds
export const SCALING_CONFIG = {
  cpuThreshold: parseFloat(process.env.CPU_THRESHOLD || '70'),
  memoryThreshold: parseFloat(process.env.MEMORY_THRESHOLD || '80'),
  minInstances: parseInt(process.env.MIN_INSTANCES || '1'),
  maxInstances: parseInt(process.env.MAX_INSTANCES || '5'),
  checkInterval: parseInt(process.env.CHECK_INTERVAL || '30000')
}

// Service naming
export const SERVICE_NAME_TEMPLATE = (partition) => `api-server-${partition}`

/**
 * Get partition configuration for a given letter
 */
export function getPartitionForLetter(letter) {
  return PARTITIONS.find(p => p.regex.test(letter))
}

/**
 * Get partition configuration by name
 */
export function getPartitionByName(name) {
  return PARTITIONS.find(p => p.name === name)
}
