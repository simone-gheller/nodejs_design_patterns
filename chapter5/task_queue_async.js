import { promisify } from 'util'

const delay = promisify(setTimeout)

export class TaskQueue{
  constructor (concurrency) {
    this.concurrency = concurrency
    this.running = 0
    this.queue = []
  }

  pushTask (task) {
    return new Promise((resolve, reject) => {
      this.queue.push(() => task().then(resolve, reject))
      this.next()
    })
  }

  async next () {
    while (this.running < this.concurrency && this.queue.length) {
      const task = this.queue.shift()
      this.running++
      // await here changes the behaviour of the queue slightly
      // without await the first next() call would start all tasks up to concurrency limit
      // with await each next() call only starts one task
      await task()
      this.running--
      this.next()
    }
  }
}

let queue = new TaskQueue(2)

async function createTask (time, name) {
  return await delay(time).then(() => {
    console.log(`Task ${name} completed`)
  })
}

async function rejectingTask (time, name) {
  return await delay(time).then(() => {
    throw new Error(`Task ${name} failed`)
  })
}
queue.pushTask(()=>rejectingTask(2000, 'E'))
  .catch(err=>console.error(err.message))
queue.pushTask(()=>createTask(5000, 'A'))
queue.pushTask(()=>createTask(1000, 'B'))
queue.pushTask(()=>createTask(5000, 'C'))
queue.pushTask(()=>createTask(5000, 'D'))  

