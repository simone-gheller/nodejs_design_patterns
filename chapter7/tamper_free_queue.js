import { createServer } from 'http'
import { parse } from 'url'

class Queue {
  #data = []
  #promises = []

  constructor(executor) {
    const enqueue = async (item)=>{
      this.#data.push(item)
      this.#promises.shift()?.(this.#data.shift())
    }
    executor(enqueue)
  }

  dequeue(){
    return new Promise((res, rej)=>{
      if(this.#data.length === 0){
        this.#promises.push(res)
      } else {
        res(this.#data.shift())
      }
    })
  }
}


const q = new Queue((enqueue)=>{
  createServer((req, res)=>{
    // to enqueue msg append ?msg=your_message to the url
    const msg = parse(req.url, true).query?.msg
    if (!msg) {
      res.writeHead(400)
      return res.end('msg query param required')
    }
    enqueue(msg)
    res.writeHead(200)
    res.end('enqueued')
  }).listen(3000, ()=>{console.log('listening on http://localhost:3000')})
})

while(true){
  const msg = await q.dequeue()
  console.log('dequeued msg:', msg)
}