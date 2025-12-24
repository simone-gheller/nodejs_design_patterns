import { consoleStrategy } from './logging_strategy.js'
import { writeFile } from 'fs/promises'
import { join } from 'path'

class MiddlewareLogger {
  constructor(strategy){
    this.middlewares = []
    this.strategy = strategy
  }
  use(middleware){
    this.middlewares.push(middleware)
  }
  //middlewares that have void return type will return the same msg
  runMiddlewares(msg){
    this.middlewares.forEach(m => {
      msg = m(msg) || msg
    })
    return msg
  }
  info(msg) {
    msg = this.runMiddlewares(msg)
    this.strategy.info(msg)
  }
  debug(msg) {
    msg = this.runMiddlewares(msg)
    this.strategy.debug(msg)
  }
  warn(msg) {
    msg = this.runMiddlewares(msg)
    this.strategy.warn(msg)
  }
  error(msg) {
    msg = this.runMiddlewares(msg)
    this.strategy.error(msg)
  }
}

const middlewareLogger = new MiddlewareLogger(consoleStrategy())
middlewareLogger.info('this is a regular info message with console strategy')
middlewareLogger.error('this is an error log level msg with console strategy')

//serialize middleware
middlewareLogger.use((msg) => {
  if (typeof(msg) === 'string') 
    return msg
  return JSON.stringify(msg)
})

middlewareLogger.warn({ id:1, operator: 'simone', date: Date.now()})

//savetofile middleware
middlewareLogger.use((msg)=>{
  const filepath = join(import.meta.dirname, Date.now().toString())
  writeFile(filepath, msg).then(()=>console.log('msg saved in ', filepath))
})

middlewareLogger.warn({ id:13, operator: 'simone', date: Date.now()})
