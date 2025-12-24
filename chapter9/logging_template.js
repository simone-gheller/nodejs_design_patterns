import { createWriteStream } from "fs"
import { join } from "path"


class LoggerTemplate {

  debug(msg) { throw new Error('not implemented') }

  info(msg) { throw new Error('not implemented') }

  warn(msg) { throw new Error('not implemented') }

  error(msg) { throw new Error('not implemented') }
}

class ConsoleLogger extends LoggerTemplate{
  debug(msg) {
    console.debug(msg)
  }
  info(msg) {
    console.info(msg)
  }
  warn(msg) {
    console.warn(msg)
  }
  error(msg) {
    console.error(msg)
  }
}

class FileLogger extends LoggerTemplate {
  constructor (filename) {
    super()
    filename = join(import.meta.dirname, filename)
    this.stream = createWriteStream(filename)
  }
  debug(msg) {
    this.stream.write(`[DEBUG] ${msg}\n`)
  }
  info(msg) {
    this.stream.write(`[INFO] ${msg}\n`)
  }
  warn(msg) {
    this.stream.write(`[WARN] ${msg}\n`)
  }
  error(msg) {
    this.stream.write(`[ERROR] ${msg}\n`)
  }
}

const logger = new ConsoleLogger()
logger.info('this is an info message')
logger.error('this is an error message')

const logger2 = new FileLogger('template_log')
logger2.info('this is an info message')
logger2.error('this is an error message')