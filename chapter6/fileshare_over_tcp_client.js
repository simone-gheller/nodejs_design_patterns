import { createReadStream } from 'fs'
import { basename } from 'path'
import { request } from 'http'
import { Readable, Writable, Transform } from 'stream'

const files = process.argv.splice(2)

const options = {
  method: 'POST',
  headers: {
    'content-type': 'application/octet-stream',
  },
  hostname: 'localhost',
  path: '/',
  port: 3000,
}

const req = request(options, (res) => {
  res.setEncoding('utf8')
  res.on('data', (chunk) => {
    console.log(`Response: (${res.statusCode}) ${chunk}`)
  })
})

class MultiplexStream extends Transform {
  constructor(filename, options) {
    super({ ...options, objectMode: true })
    this.filename = filename
  }
  _transform(chunk, encoding, callback) {
    const packet = {
      filename: this.filename,
      data: chunk.toString('base64')
    }
    this.push(JSON.stringify(packet))
    callback()
  }
}


new Readable.from(files)
  .pipe(new Writable({
    objectMode: true,
    write(file, encoding, callback) {
      const filename = basename(file)
      console.log(`Sending file: ${filename}`)

      const multiplexStream = new MultiplexStream(file)
      createReadStream(file, { highWaterMark: 10 })
        .pipe(multiplexStream)
        .pipe(req, { end: false })

      multiplexStream
        .on('end', callback)
        .on('error', callback)
    }
  }))
  .on('finish', () => {
    req.end()
    console.log('All files sent')
  })
  .on('error', (err) => {
    console.error('File upload failed', err)
  })  