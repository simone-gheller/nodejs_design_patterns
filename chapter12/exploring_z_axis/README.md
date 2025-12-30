# Dynamic Load Balancer with Consul Service Registry

Dynamic load balancing system with Consul-based service registry for data partitioning (Z-axis scaling).

## Architecture

```
Client
  ↓
Load Balancer (port 8080)
  ↓
Consul Service Registry
  ↓
API Server Instances (scalable per partition)
  ↓
SQLite Databases (A-D.db, E-P.db, Q-Z.db)
```

## Components

### 1. Consul
External service registry that manages:
- Dynamic service registration
- Automatic health checks
- Service discovery

### 2. Load Balancer
Main application that:
- Listens on port 8080
- Receives requests from clients
- Determines the partition based on the requested letter
- Queries Consul to find available servers
- Proxies the request using **http-proxy** with round-robin strategy
- Tracks request metrics per partition
- Exposes `/metrics` endpoint for monitoring

### 3. Auto-Scaler
Intelligent component that:
- Monitors metrics from the load balancer every 30 seconds
- Calculates requests/second for each partition
- **Automatically scales** partitions based on load:
  - Scale UP if requests/sec > 10
  - Scale DOWN if requests/sec < 2
- Configurable limits: min 1, max 5 instances per partition
- Uses Docker API to scale services independently

### 4. API Servers
Backend servers that:
- Automatically register with Consul on startup
- Handle requests for a specific partition
- Send periodic health checks
- Deregister on graceful shutdown

## Partitions

- **A-D**: letters A, B, C, D
- **E-P**: letters E-P
- **Q-Z**: letters Q-Z

## Usage

### Starting the system

```bash
# Install dependencies
npm install

# Start all services with Docker Compose specifying replicas
docker-compose up --build --scale api-server-ad=2 --scale api-server-ep=2 --scale api-server-qz=2
```

This will start:
- 1 Consul instance (port 8500)
- 1 Load Balancer instance (port 8080)
- 1 Auto-Scaler instance
- 2 API server instances for partition A-D (scalable)
- 2 API server instances for partition E-P (scalable)
- 2 API server instances for partition Q-Z (scalable)

**Note**: With standard docker-compose (not Swarm mode), you need to use `--scale` to specify the number of replicas.

### Testing the system

```bash
# Query for letters in partition A-D
curl http://localhost:8080/api/people/byLastName/A
curl http://localhost:8080/api/people/byLastName/B

# Query for letters in partition E-P
curl http://localhost:8080/api/people/byLastName/E
curl http://localhost:8080/api/people/byLastName/M

# Query for letters in partition Q-Z
curl http://localhost:8080/api/people/byLastName/Q
curl http://localhost:8080/api/people/byLastName/Z

# Load balancer health check
curl http://localhost:8080/health

# View load metrics per partition
curl http://localhost:8080/metrics
```

### Automatic Auto-Scaling

The **auto-scaler** continuously monitors the load and automatically scales partitions:

```bash
# Simulate high load on partition A-D
for i in {1..100}; do curl http://localhost:8080/api/people/byLastName/A & done

# Check metrics
curl http://localhost:8080/metrics

# The auto-scaler will detect the load and automatically scale partition A-D
# Check the auto-scaler logs
docker-compose logs -f auto-scaler
```

After ~30 seconds, the auto-scaler will:
1. Detect that A-D has > 10 req/sec
2. Automatically scale `api-server-ad` from 2 to 3 instances
3. New instances register with Consul
4. The load balancer uses them immediately

### Manual scaling (optional)

You can also scale manually (if the auto-scaler is not active):

```bash
# Scale partition A-D to 5 instances
docker-compose up --scale api-server-ad=5 -d

# Scale partition E-P to 3 instances
docker-compose up --scale api-server-ep=3 -d

# Scale partition Q-Z to 1 instance
docker-compose up --scale api-server-qz=1 -d
```

**Note**: With the auto-scaler active, manual scaling will be overridden at the next monitoring cycle.

### Consul UI

Access the Consul UI to see registered services:

```
http://localhost:8500/ui
```

### Monitoring

View logs:

```bash
# Load balancer logs
docker-compose logs -f load-balancer

# All A-D server logs
docker-compose logs -f api-server-ad

# Auto-scaler logs
docker-compose logs -f auto-scaler

# Consul logs
docker-compose logs -f consul
```

### Stopping the system

```bash
docker-compose down
```

## Features

- **Dynamic Auto-Scaling**: automatic scaling based on real-time metrics
- **Service Discovery**: servers automatically register/deregister with Consul
- **Health Checks**: Consul periodically verifies server health
- **Intelligent Load Balancing**: http-proxy with round-robin per partition
- **Independent Scaling**: each partition scales automatically based on its own load
- **Metrics Monitoring**: `/metrics` endpoint to monitor requests/sec per partition
- **Graceful Shutdown**: clean deregistration on SIGINT/SIGTERM
- **Fault Tolerance**: load balancer handles unavailable servers
- **Z-Axis Scaling**: data partitioning for maximum scalability

## File Structure

```
.
├── api_server.js          # API server with Consul integration
├── load_balancer.js       # Load balancer with http-proxy and metrics
├── auto_scaler.js         # Intelligent auto-scaler
├── dao.js                 # SQLite DAO
├── db_load.js            # Database loading script
├── db/                   # SQLite databases
│   ├── A-D.db
│   ├── E-P.db
│   └── Q-Z.db
├── package.json          # Node.js dependencies (consul, http-proxy)
├── Dockerfile            # Docker image for API server and load balancer
├── Dockerfile.autoscaler # Docker image for auto-scaler with Docker CLI
├── docker-compose.yml    # Complete orchestration
└── .dockerignore         # Files to exclude from build
```

## Environment Variables

### API Server
- `PARTITION`: partition name (A-D, E-P, Q-Z)
- `CONSUL_HOST`: Consul hostname (default: localhost)
- `CONSUL_PORT`: Consul port (default: 8500)

### Load Balancer
- `PORT`: listening port (default: 8080)
- `CONSUL_HOST`: Consul hostname (default: localhost)
- `CONSUL_PORT`: Consul port (default: 8500)

### Auto-Scaler
- `LOAD_BALANCER_HOST`: load balancer hostname (default: localhost)
- `LOAD_BALANCER_PORT`: load balancer port (default: 8080)
- `CONSUL_HOST`: Consul hostname (default: localhost)
- `CONSUL_PORT`: Consul port (default: 8500)
- `SCALE_UP_THRESHOLD`: req/sec threshold for scale up (default: 10)
- `SCALE_DOWN_THRESHOLD`: req/sec threshold for scale down (default: 2)
- `MIN_INSTANCES`: minimum instances per partition (default: 1)
- `MAX_INSTANCES`: maximum instances per partition (default: 5)
- `CHECK_INTERVAL`: check interval in ms (default: 30000)
