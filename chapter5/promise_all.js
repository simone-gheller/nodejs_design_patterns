function PromiseAll(promises) {
  let results = Array(promises.length)
  let completed = 0
  let err = false

  if (promises.length === 0) {
    return Promise.resolve([])
  }

  return new Promise((resolve, reject) => {
    promises.forEach((p, i) => {
      Promise.resolve(p)
        .then((value) => {
          results[i] = value
          completed++
          if (!err && completed === promises.length) {
            resolve(results)
          }
        })
        .catch((error) => {
          if (err) return 
          console.log('one of the promise threw an error:', error)
          err = true
          reject(error)
        })
    })
  })
}

// Example usage:
const promise1 = Promise.resolve(3);
const promise2 = 42;
const promise3 = new Promise((resolve, reject) => {
  setTimeout(()=> {
    console.log('promise3 6000ms later')
    resolve('ciao')
  }, 6000, 'foo');
});
const promise4 = new Promise((resolve, reject) => {
  setTimeout(() => reject('error occurred'), 1000);
});
// promise4.catch(e => console.log('promise4 caught error:', e));

await PromiseAll([promise1, promise2, promise3, promise4])
  .then((values) => {
    console.log(values); // [3, 42, 'foo']
  })
  .catch((error) => {
    console.error('Error:', error);
  });