import { request as httpRequest } from 'http'
import { request as httpsRequest } from 'https'

class RequestBuilder {
  constructor() {
    this.options = {
      method: 'GET',
      port: 80,
      protocol: 'http:'
    }
    this.body = null
  }

  invoke() {
    const requestFn = this.options.protocol === 'https:' ? httpsRequest : httpRequest

    return new Promise((res, rej) => {
      const req = requestFn(this.options, (response) => {
        let data = ''
        response.on('data', (chunk) => {
          data += chunk
        })
        response.on('end', () => {
          res({status: response.statusCode, data: data})
        })
        response.on('error', (err) => {
          rej(err)
        })
      })
      req.on('error', (err) => {
        rej(err)
      })

      req.end(this.body)
    })
  }

  hostname(hostname) {
    this.options.hostname = hostname
    return this
  }

  protocol(protocol) {
    this.options.protocol = protocol
    return this
  }

  path(path) {
    this.options.path = path
    return this
  }

  port(port) {
    this.options.port = port
    return this
  }
  
  method(method) {
    this.options.method = method
    return this
  }

  headers(headers) {
    if (typeof(headers) !== 'object') {
      throw new Error('Headers should be an object')
    }
    this.options.headers = headers
    return this
  }

  data(body) {
    this.body = body
    return this
  }

}

const rq = new RequestBuilder()
  .protocol('https:')
  .hostname('jsonplaceholder.typicode.com')
  .path('/posts')
  .port(443)
  .method('POST')
  .headers({ 'Content-Type': 'application/json' })
  .data(JSON.stringify({
    title: 'footest',
    body: 'barbrov',
    userId: 1,
  }))
  .invoke()

const res = await rq
console.log(res.status)
console.log(res.data)