import { createWriteStream } from 'fs'
import { mkdir } from 'fs/promises'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const LOG_DIR = join(__dirname, 'logs')

// Ensure logs directory exists
await mkdir(LOG_DIR, { recursive: true })

const logStreams = new Map()

/**
 * Get or create a write stream for a specific log file
 */
function getLogStream(filename) {
  if (!logStreams.has(filename)) {
    const stream = createWriteStream(join(LOG_DIR, filename), {
      flags: 'a',
      encoding: 'utf8'
    })
    logStreams.set(filename, stream)
  }
  return logStreams.get(filename)
}

/**
 * Format timestamp
 */
function timestamp() {
  return new Date().toISOString()
}

/**
 * Create a logger for a specific component
 */
export function createLogger(component, logFile = null) {
  const logFileName = logFile || `${component}.log`
  const stream = getLogStream(logFileName)

  const safeWrite = (formattedMessage, args) => {
    try {
      if (!stream.destroyed && stream.writable) {
        stream.write(formattedMessage + (args.length > 0 ? ' ' + JSON.stringify(args) : '') + '\n')
      }
    } catch (err) {
      // Ignore write errors during shutdown
    }
  }

  const log = (level) => {
    return (message, ...args) => {
      const formattedMessage = `[${timestamp()}] [${component}] [${level}] ${message}`
      if (level === 'ERROR') {
        console.error(formattedMessage, ...args)
      } else if (level === 'WARN') {
        console.warn(formattedMessage, ...args)
      } else if (level === 'DEBUG') {
        if (process.env.DEBUG) {
          console.log(formattedMessage, ...args)
        }
      } else {
        console.log(formattedMessage, ...args)
      }
      safeWrite(formattedMessage, args)
    }
  }
  return {
    info: (message, ...args) => log('INFO')(message, ...args),

    error: (message, ...args) => log('ERROR')(message, ...args),

    warn: (message, ...args) => log('WARN')(message, ...args),

    debug: (message, ...args) => log('DEBUG')(message, ...args),
  }
}

/**
 * Close all log streams (for graceful shutdown)
 */
export function closeAllLogs() {
  for (const [filename, stream] of logStreams.entries()) {
    if (!stream.destroyed) {
      stream.end()
    }
  }
  logStreams.clear()
}

// Only close logs on normal exit, not on signals
// This prevents "write after end" errors during shutdown
process.on('exit', closeAllLogs)
