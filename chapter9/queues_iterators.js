class AsyncQueue {
  constructor() {
    this.items = []
    this.isDone = false
    this.waitingConsumers = []
  }

  enqueue(item) {
    if (this.waitingConsumers.length > 0) {
      const { resolve } = this.waitingConsumers.shift()
      resolve({ value: item, done: false })
    } else {
      this.items.push(item)
    }
  }

  done() {
    this.isDone = true
    for (const { resolve } of this.waitingConsumers) {
      resolve({ done: true })
    }
    this.waitingConsumers = []
  }

  [Symbol.asyncIterator]() {
    return {
      next: () => {
        if (this.items.length > 0) {
          return Promise.resolve({ value: this.items.shift(), done: false })
        }
        if (this.isDone) {
          return Promise.resolve({ done: true })
        }
        return new Promise((resolve) => {
          this.waitingConsumers.push({ resolve })
        })
      }
    }
  }
}

async function main() {
  const queue = new AsyncQueue()
  setTimeout(() => queue.enqueue('item1'), 100)
  setTimeout(() => queue.enqueue('item2'), 200)
  setTimeout(() => queue.enqueue('item3'), 300)
  setTimeout(() => queue.done(), 400)

  console.log('Consumer 1 started')
  for await (const item of queue) {
    console.log('Consumer 1 processing:', item)
  }
  console.log('Consumer 1 finished')
}

async function multiConsumerExample() {
  const queue = new AsyncQueue()

  setTimeout(() => queue.enqueue('task1'), 50)
  setTimeout(() => queue.enqueue('task2'), 100)
  setTimeout(() => queue.enqueue('task3'), 150)
  setTimeout(() => queue.enqueue('task4'), 200)
  setTimeout(() => queue.enqueue('task5'), 250)
  setTimeout(() => queue.done(), 300)

  const consumer1 = (async () => {
    console.log('Consumer 1 started')
    for await (const item of queue) {
      console.log('Consumer 1 processing:', item)
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    console.log('Consumer 1 finished')
  })()

  const consumer2 = (async () => {
    console.log('Consumer 2 started')
    for await (const item of queue) {
      console.log('Consumer 2 processing:', item)
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    console.log('Consumer 2 finished')
  })()

  await Promise.all([consumer1, consumer2])
  console.log('All consumers finished')
}

await main()
await multiConsumerExample()
