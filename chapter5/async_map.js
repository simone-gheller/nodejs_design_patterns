import { promisify } from 'util'
const asyncTimeout = promisify(setTimeout)

async function mapAsync(iterable, concurrency, cb) {
  let promisees = []
  let consumers = []
  let results = Array(iterable.length)
  let hasError = false

  // Handle optional concurrency parameter
  // while cb is the last parameter per convention
  if (typeof concurrency === 'function') {
    cb = concurrency
    concurrency = iterable.length
  }

  if (concurrency > iterable.length)
    concurrency = iterable.length

  async function consumer() {
    return new Promise(async (resolve, reject) => {
      while(promisees.length>0){
        try{
          const p = promisees.shift()
          await pi
        } catch(err) {
          reject(err)
        }
      } 
      resolve()
    })
  }

  async function consumer2(){
    while(promisees.length>0){
      try{
        const p = promisees.shift()
        await p()
      } catch(err) {
        throw err
      }
    } 
  }


  iterable.forEach((item, index) => {
    const p = () => Promise
      .resolve(cb(item))
      .then(res=>results[index] = res)
    promisees.push(p)
  })

  for(let i=0; i<concurrency; i++) {
    consumers.push(consumer2())
  }
  
  return Promise.all(consumers).then(()=>results)
}


const test = [0, 2, 34, 12, 3, 2, 543, -123, 34, 0, 12, 3, 90]

mapAsync(test, async (num) => {
    await asyncTimeout(2000)
    return num * 2
}).then(results => console.log(...results))

mapAsync(test, 4, async (num) => {
    await asyncTimeout(4000)
    return num * 4
}).then(results => console.log(...results))

mapAsync(test, 5, async (num) => {
    throw Error('custom error')
}).then(results => console.log(...results))
  .catch(err => console.log('outer main catch: ', err.message))

mapAsync(test, 5, async (num) => {
    await asyncTimeout(3000)
    throw Error('async custom error')
}).then(results => console.log(...results))
  .catch(err => console.log('outer main catch: ', err.message))

mapAsync(test, (num) => {
    return num * 10 
}).then(results => {
    console.log('Testing zalgo release:', ...results)
})
console.log('Tests are pending - this should print BEFORE results')
