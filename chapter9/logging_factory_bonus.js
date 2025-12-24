import { createWriteStream } from 'fs'
import { join } from 'path'

class Logger {

  constructor(stream) {
    this.stream = stream
  }

  debug(msg) { this.stream.write(`[DEBUG] ${msg}\n`) }

  info(msg) { this.stream.write(`[INFO] ${msg}\n`) }

  warn(msg) { this.stream.write(`[WARN] ${msg}\n`)   }

  error(msg) { this.stream.write(`[ERROR] ${msg}\n`)   }
}

function getLogger(dest) {
  if (dest == console) {
    return new Logger(process.stdout)
  } else if (typeof dest === 'string') {
    console.log('boh')
    const __dirname = import.meta.dirname
    return new Logger(createWriteStream(join(__dirname, dest)))
  } else {
    throw Error ('Output stream is not a valid stream')
  }
}

const logger = getLogger(console)
logger.info('this is console info message')
logger.error('this is console error message')

const logger2 = getLogger('log2')
logger2.info('this is an info message')
logger2.error('this is an error message')