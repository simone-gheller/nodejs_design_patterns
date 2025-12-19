import { EventEmitter } from "events"

export class TaskQueue extends EventEmitter{
  constructor (concurrency) {
    super()
    this.concurrency = concurrency
    this.running = 0
    this.queue = []
  }

  pushTask (task) {
    this.queue.push(task)
    process.nextTick(this.next.bind(this))
    return this
  }

  next () {
    if (this.queue.length === 0 && this.running === 0) {
      this.emit('empty')
    }
    while (this.running <= this.concurrency && this.queue.length) {
      const task = this.queue.shift()
      task(() => {
        this.running--
        process.nextTick(this.next.bind(this))
      })
      this.running++
    }
  }
}
