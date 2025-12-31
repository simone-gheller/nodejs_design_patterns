# Z-Axis Scaling with Consul

Distributed architecture with auto-scaling based on Consul for service discovery and dynamic load-balancing. Uses Node.js `cluster` module for process management with structured logging.

## Architecture

```
Client
  ↓
Cluster Manager (Primary Process) - SINGLE ENTRY POINT
  ├─ Load Balancer Worker (Port 8080)
  ├─ Auto-scaler Worker → Monitors metrics → Requests scaling
  └─ API Server Workers (1+ per partition)
       ↓
    Consul (Service Registry)
       ↓
    Database Partitions (A-D, E-P, Q-Z)
```

## Components

- **Cluster Manager** (Node.js): **Single entry point** - manages all workers via `cluster` module
- **Load Balancer Worker** (Node.js): Routes requests via Consul with round-robin (Port 8080), registered in Consul for monitoring
- **Auto-scaler Worker** (Node.js): Monitors `/metrics` and communicates with cluster manager for scaling
- **API Server Workers** (Node.js): 1+ replicas per partition, managed by cluster manager, registered in Consul
- **Consul** (Docker): Service registry, health checks for all services (load balancer + API servers)
- **Database** (SQLite): Randomly generated people with `@faker-js/faker`, sharded by last name into 3 partitions
- **Logger**: Structured logging to both console and individual log files per component

## Quick Start

### 1. Start Consul

```bash
docker-compose up -d
```

Consul UI: http://localhost:8500

### 2. Start Cluster Manager

The cluster manager is the main entrypoint, it starts:
- Load Balancer (Port 8080)
- Auto-scaler
- API Server workers (1 per partition initially)

```bash
npm start
```

Environment variables (optional):
- `CPU_THRESHOLD=70` - CPU% threshold for scale-up
- `MEMORY_THRESHOLD=80` - Memory% threshold for scale-up
- `MIN_INSTANCES=1` - Minimum workers per partition
- `MAX_INSTANCES=5` - Maximum workers per partition
- `CHECK_INTERVAL=30000` - Check interval (ms)
- `DEBUG=1` - Enable debug logging

## Testing

```bash
# Query partitions
curl http://localhost:8080/api/people/byLastName/A | jq '. | length'
curl http://localhost:8080/api/people/byLastName/E | jq '. | length'
curl http://localhost:8080/api/people/byLastName/Q | jq '. | length'

# Load balancer health and metrics
curl http://localhost:8080/health | jq
curl http://localhost:8080/metrics | jq

# Consul: Check API server health (per partition)
curl 'http://localhost:8500/v1/health/service/api-server-A-D?passing=true' | jq
curl 'http://localhost:8500/v1/health/service/api-server-E-P?passing=true' | jq
curl 'http://localhost:8500/v1/health/service/api-server-Q-Z?passing=true' | jq

# Worker metrics (direct to API server)
curl http://localhost:8000/metrics | jq
```

## How Auto-scaling Works

**Every 30 seconds:**
1. Auto-scaler queries Consul for healthy servers per partition
2. Fetches `/metrics` from each server
3. Calculates average CPU and memory usage
4. Sends scaling requests to cluster manager via IPC

**Scale UP if:**
- CPU > 70% OR Memory > 80%
- Instances < MAX
- Cluster manager spawns new worker for partition

**Scale DOWN if:**
- CPU < 35% AND Memory < 40%
- Instances > MIN
- Cluster manager kills worker for partition

## Cleanup

```bash
# Stop cluster manager (Ctrl+C) or
# pkill -f "node cluster_manager.js"

docker-compose down

# Clear logs (optional)
rm -rf logs/
```
