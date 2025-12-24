import { createWriteStream } from 'fs'
import { join } from 'path'

export const consoleStrategy = function (){
  return {
    debug : (msg) => {
      console.debug(msg)
    },
    info : (msg) => {
      console.info(msg)
    },
    warn : (msg) => {
      console.warn(msg)
    },
    error : (msg) => {
      console.error(msg)
    }
  }
}

export const fileStrategy = function (fileName) {
  const __dirname = import.meta.dirname
  const outputStream = createWriteStream(join(__dirname, fileName))
  return {
    debug : (msg) => {
      outputStream.write(`[DEBUG] ${msg}\n`)
    },
    info : (msg) => {
      outputStream.write(`[INFO] ${msg}\n`)
    },
    warn : (msg) => {
      outputStream.write(`[WARN] ${msg}\n`)
    },
    error : (msg) => {
      outputStream.write(`[ERROR] ${msg}\n`)
    }
  }

}


class LoggingConsole {
  constructor(strategy) {
    this.strategy = strategy
  }

  debug(msg) { this.strategy.debug(msg)}

  info(msg) { this.strategy.info(msg) }

  warn(msg) { this.strategy.warn(msg) }

  error(msg) { this.strategy.error(msg) }
}

if (import.meta.url == `file://${process.argv[1]}`) {
  const logger = new LoggingConsole(consoleStrategy())
  logger.info('this is an info message')
  logger.error('this is an error message')

  const logger2 = new LoggingConsole(fileStrategy('my_log'))
  logger2.info('this is an info message')
  logger2.error('this is an error message')
}