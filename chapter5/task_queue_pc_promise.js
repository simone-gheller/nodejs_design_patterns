import { promisify } from 'util'

const delay = promisify(setTimeout)

class TaskQueuePC {
  constructor(concurrency) {
    this.consumerQueue = [];
    this.taskQueue = []
    
    for (let i = 0; i < concurrency; i++) {
      this.consumer()
    }
  }

  consumer2() {
    return new Promise((resolve, reject) => {
      resolve(this.getNextTask())
    }).then(t => t())
      .then(() => this.consumer2())
      .catch((e) => {
        console.error('Consumer error: ', e.message)
      })
  }

  consumer() {
    return new Promise(() => {
      (function loop() {
        this.getNextTask()
          .then(t => 
            t()
            .catch((e) => {
              console.error('Consumer error: ', e.message)
            })
          )
          .then(()=>loop.bind(this)())
      }).bind(this)()
    })
  }

  getNextTask() {
    return new Promise((resolve) => {
      if (this.taskQueue.length > 0) {
        return resolve(this.taskQueue.shift())
      }
      this.consumerQueue.push(resolve)
    })
  }

  addTask(task) {
    return new Promise((resolve, reject) => {
      const taskWrapper = () => {
        const result = task()
        result.then(resolve, reject)
        return result
      }
      if (this.consumerQueue.length > 0) {
        const consumerResolve = this.consumerQueue.shift()
        consumerResolve(taskWrapper)
      }
      else {
        this.taskQueue.push(taskWrapper)
      }
    })
  }
}

const queue = new TaskQueuePC(2)

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
queue.addTask(()=>rejectingTask(2000, 'E'))
  .catch(err=>console.error(err.message))
queue.addTask(()=>createTask(5000, 'A'))
queue.addTask(()=>createTask(1000, 'B'))
queue.addTask(()=>createTask(5000, 'C'))
queue.addTask(()=>createTask(5000, 'D'))  

