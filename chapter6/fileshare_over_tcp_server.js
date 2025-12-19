import { createWriteStream } from 'fs'
import { createServer } from 'http'
import { basename } from 'path'
import { Writable, Transform } from 'stream'

class DemultiplexStream extends Transform {
  constructor(options) {
    super({ ...options, objectMode: true })
  }
  _transform(chunk, encoding, callback) {
    try {
      this.push(JSON.parse(chunk))
    } catch (err) {
      console.error('Error parsing JSON:', err)
    }
    callback()
  }
}

const server = createServer((req, res) => {
  const receivedFiles = new Set()
  const fileStreams = new Map()

  req
    .pipe(new DemultiplexStream())
    .pipe(new Writable({
      objectMode: true,
      write(chunk, encoding, callback) {
        console.log('Received packet:', chunk.filename)
        const filename = basename(chunk.filename)
        const fileData = Buffer.from(chunk.data, 'base64')

        if (!fileStreams.has(filename)) {
          fileStreams.set(filename, createWriteStream(filename.toUpperCase() + '.uploaded'))
        }

        const writeStream = fileStreams.get(filename)
        writeStream.write(fileData, callback)
        receivedFiles.add(filename)
      }
    }))
    .on('finish', () => {
      // Chiudi tutti gli stream aperti
      for (const stream of fileStreams.values()) {
        stream.end()
      }
      console.log(`Received files: ${Array.from(receivedFiles).join(', ')}`)
      res.writeHead(200)
      res.end('File uploaded successfully')
    })
    .on('error', (err) => {
      console.error('Upload error:', err)
      res.writeHead(500)
      res.end('File upload failed')
    })
})

server.listen(3000, () => {
  console.log('File sharing server running at http://localhost:3000/')
})