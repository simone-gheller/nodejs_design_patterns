import { readdir } from 'fs/promises'
import asciify from 'asciify-image'
import { createServer } from 'http'
import { createReadStream } from 'fs'
import { Transform } from 'stream'

// assuming frames are numbered starting from 000
const frameDir = process.argv[2] || './chapter6/frames'
let frames = []

const pngFiles = await readdir(frameDir)

await Promise.all(
  pngFiles.map(async file => {
    //skipping .extentions character
    const frameNumber = parseInt(file.slice(-6,-3), 10)
    const asciiArt = await asciify(`${frameDir}/${file}`, {
      fit: 'box',
      width: 50,
      height: 40,
      color: true,
    })
    frames[frameNumber] = asciiArt
  })
)

function animate(stream){
  let frameIndex = 0

  function loop(){
    stream.write('\u001b[2J\u001b[3J\u001b[H')
    const ok = stream.write(frames[frameIndex])
    frameIndex = (frameIndex + 1) % frames.length
    if (!ok) {
      console.log('backpressure')
      stream.once('drain', () => {
        setTimeout(loop, 70)
      })
    } else {
      setTimeout(loop, 70)
    }
  }
  loop()
}

const server = createServer((req, res) => {
  if (req.headers['user-agent'].includes('curl')) {
    res.writeHead(200, {'Content-Type': 'text/plain'})
    animate(res)
  }
  else {
    res.writeHead(200, {'Content-Type': 'text/plain'})
    createReadStream(process.argv[1], { highWaterMark: 10 })
      .pipe(res)
  }
})

server.listen(3000, ()=> {
  console.log('Server listening on http://localhost:3000')
})
