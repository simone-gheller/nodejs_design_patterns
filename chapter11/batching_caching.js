import { Level } from 'level'
import { createServer } from 'http'
import { parse } from 'url'
import { createLoggerMiddleware } from './logger-middleware.js'

const db = new Level('./db/sales',)
const table = db.sublevel('sales', { valueEncoding: 'json' })
const CACHE_TTL = 30 * 1000

let productCache = new Map()

function batchQuery(product) {
  const cacheHit = productCache.get(product)
  if(cacheHit) {
    return cacheHit
  }
  const resultPromise = query(product)
  resultPromise.finally(()=>{
    setTimeout(()=>productCache.delete(product), CACHE_TTL)
  })

  productCache.set(product, resultPromise)
  return resultPromise
}

async function query(product){
  let sum = 0
  for await (const record of table.values()){
    if (typeof product === 'undefined' || record.product === product) {
      sum += record.amount
    }
  }

  return sum
}

const loggerMiddleware = createLoggerMiddleware({
  logger: console.log,
  getMetadata: (req) => {
    if(req.url.startsWith('/totalsales'))
      return {
        product: parse(req.url, true).query?.product || 'all',
      }
  }
})

const server = createServer(async (req, res)=>{
  loggerMiddleware(req, res)

  if (!req.url.startsWith('/totalsales')){
    res.writeHead(200)
    res.end('Im alive\n')
    return
  }

  const product = parse(req.url, true).query?.product
  const totaleSales = await batchQuery(product)

  res.writeHead(200)
  res.end(JSON.stringify({'totalSales':totaleSales}))
})
server.listen(3000, ()=>{
  console.log('listening on http://localhost:3000')
})