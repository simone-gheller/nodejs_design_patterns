/**
 * Consul client utilities - DRY for Consul operations
 */

import Consul from 'consul'
import { CONSUL_CONFIG, SERVICE_NAME_TEMPLATE } from './config.js'

/**
 * Create a configured Consul client
 */
export function createConsulClient() {
  return new Consul({
    host: CONSUL_CONFIG.host,
    port: CONSUL_CONFIG.port,
    promisify: true
  })
}

/**
 * Get all healthy servers for a partition from Consul
 * @param {Consul} consul - Consul client instance
 * @param {string} partitionName - Name of the partition (e.g., 'A-D')
 * @returns {Promise<Array>} Array of server objects
 */
export async function getServersForPartition(consul, partitionName) {
  try {
    const serviceName = SERVICE_NAME_TEMPLATE(partitionName)
    const services = await consul.health.service({
      service: serviceName,
      passing: true
    })

    return services.map(s => ({
      address: s.Service.Address,
      port: s.Service.Port,
      id: s.Service.ID,
      partition: partitionName
    }))
  } catch (err) {
    console.error(`Error querying Consul for ${partitionName}:`, err.message)
    return []
  }
}

/**
 * Register a service with Consul
 * @param {Consul} consul - Consul client instance
 * @param {Object} serviceConfig - Service configuration
 */
export async function registerService(consul, serviceConfig) {
  const { id, name, address, port, meta, healthCheckPath } = serviceConfig

  await consul.agent.service.register({
    id,
    name,
    address,
    port,
    meta,
    check: {
      http: `http://${address}:${port}${healthCheckPath || '/health'}`,
      interval: '10s',
      timeout: '5s'
    }
  })
}

/**
 * Deregister a service from Consul
 * @param {Consul} consul - Consul client instance
 * @param {string} serviceId - Service ID
 */
export async function deregisterService(consul, serviceId) {
  await consul.agent.service.deregister(serviceId)
}
