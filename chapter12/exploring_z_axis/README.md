# Z-Axis Scaling with Consul

Distributed architecture with auto-scaling based on Consul for service discovery and health checking. Node.js workers run **outside Docker** for simplified dynamic scaling.

## Architecture

```
Client → Load Balancer (8080) → Consul → API Servers (Node.js)
                                            ↓
                              SQLite DBs (A-D, E-P, Q-Z)

Auto-scaler → Monitors metrics → Spawns/Kills workers
```

## Components

- **Consul** (Docker): Service registry, health checks, DNS
- **API Servers** (Node.js): 3 separate services per partition
- **Load Balancer** (Node.js): Routes requests via Consul with round-robin
- **Auto-scaler** (Node.js): Monitors `/metrics` and spawns workers using `child_process.fork()`

## Partitions

Data is sharded by last name:
- **A-D**: Last names starting with A, B, C, D
- **E-P**: Last names starting with E-P
- **Q-Z**: Last names starting with Q-Z

## Quick Start

### 1. Start Consul

```bash
docker-compose up -d
```

Consul UI: http://localhost:8500

### 2. Start Auto-scaler

The auto-scaler spawns 1 worker per partition and monitors metrics:

```bash
node auto_scaler_process.js
```

Environment variables (optional):
- `CPU_THRESHOLD=70` - CPU% threshold for scale-up
- `MEMORY_THRESHOLD=80` - Memory% threshold for scale-up
- `MIN_INSTANCES=1` - Minimum workers per partition
- `MAX_INSTANCES=5` - Maximum workers per partition
- `CHECK_INTERVAL=30000` - Check interval (ms)

### 3. Start Load Balancer

In another terminal:

```bash
node load_balancer.js
```

Listens on port **8080** and routes to healthy servers via Consul.

## Testing

```bash
# Query partitions
curl http://localhost:8080/api/people/byLastName/A | jq '. | length'
curl http://localhost:8080/api/people/byLastName/E | jq '. | length'
curl http://localhost:8080/api/people/byLastName/Q | jq '. | length'

# Load balancer metrics
curl http://localhost:8080/metrics | jq

# Consul services
curl http://localhost:8500/v1/catalog/services | jq

# Worker metrics
curl http://localhost:8000/metrics | jq
```

## How Auto-scaling Works

**Every 30 seconds:**
1. Query Consul for healthy servers per partition
2. Fetch `/metrics` from each server
3. Calculate average CPU and memory usage

**Scale UP if:**
- CPU > 70% OR Memory > 80%
- Instances < MAX

**Scale DOWN if:**
- CPU < 35% AND Memory < 40%
- Instances > MIN

## Consul UI

Visit http://localhost:8500/ui to view:
- Registered services
- Health checks
- Instance counts

## Cleanup

```bash
# Stop auto-scaler (Ctrl+C)
# Stop load balancer (Ctrl+C)

docker-compose down

# Kill remaining processes
pkill -f "node.*api_server"
```
