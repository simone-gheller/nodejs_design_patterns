import http from 'http'
import { Worker } from 'worker_threads'
import { join } from 'path'

const __dirname = import.meta.dirname
const PORT = 3000

function executeInWorker(functionCode, args) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(join(__dirname, 'compute-worker.js'))

    const timeout = setTimeout(() => {
      worker.terminate()
      reject(new Error('Worker execution timeout'))
    }, 30000)

    worker.on('message', (message) => {
      clearTimeout(timeout)
      worker.terminate()

      if (message.success) {
        resolve(message.result)
      } else {
        reject(new Error(message.error))
      }
    })

    worker.postMessage({ functionCode, args })
  })
}

const server = http.createServer(async (req, res) => {

  if (req.url !== '/compute') {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Not found. Use /compute endpoint.' }))
    return
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Method not allowed. Use POST.' }))
    return
  }

  let body = ''

  req.on('data', (chunk) => {
    body += chunk.toString()
  })

  req.on('end', async () => {
    try {
      const { functionCode, args } = JSON.parse(body)

      if (!functionCode || typeof functionCode !== 'string') {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'functionCode must be a string' }))
        return
      }

      if (!Array.isArray(args)) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'args must be an array' }))
        return
      }

      console.log(`Executing function with ${args.length} arguments`)
      const result = await executeInWorker(functionCode, args)

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: true, result }))
    } catch (error) {
      console.error('Error executing function:', error.message)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        success: false,
        error: error.message
      }))
    }
  })

  req.on('error', (error) => {
    console.error('Request error:', error.message)
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Bad request' }))
  })
})

server.listen(PORT, () => {
  console.log(`server listening on http://localhost:${PORT}`)
})
