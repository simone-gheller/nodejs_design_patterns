class MyPromise {
  constructor(executor) {
    this.state = 'pending'
    this.value = undefined
    this.fulfilledCallbacks = []
    this.rejectedCallbacks = []

    const resolve = (value) => {
      queueMicrotask(() => {
        if (this.state !== 'pending') return
        this.state = 'fulfilled'
        this.value = value
        this.fulfilledCallbacks.forEach(cb => cb(value))
      })
    }

    const reject = (reason) => {
      queueMicrotask(() => {
        if (this.state !== 'pending') return
        this.state = 'rejected'
        this.value = reason
        this.rejectedCallbacks.forEach(cb => cb(reason))
      })
    }

    try {
      executor(resolve, reject)
    } catch (err) {
      reject(err)
    }
  }

  then(onFulfilled, onRejected) {
    return new MyPromise((resolve, reject) => {
      const handleFulfilled = (value) => {
        try {
          resolve(onFulfilled ? onFulfilled(value) : value)
        } catch (err) {
          reject(err)
        }
      }

      const handleRejected = (reason) => {
        try {
          resolve(onRejected ? onRejected(reason) : reason)
        } catch (err) {
          reject(err)
        }
      }

      if (this.state === 'pending') {
        this.fulfilledCallbacks.push(handleFulfilled)
        this.rejectedCallbacks.push(handleRejected)
      } else if (this.state === 'fulfilled') {
        queueMicrotask(() => handleFulfilled(this.value))
      } else if (this.state === 'rejected') {
        queueMicrotask(() => handleRejected(this.value))
      }
    })
  }
}
