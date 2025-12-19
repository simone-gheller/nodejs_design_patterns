function async_reduce(arr, cb, finalCb) {
  let accumulator = 0;

  function iterate(index) {
    if (index >= arr.length) {
      return finalCb(null, accumulator)
    }

    process.nextTick(() => {
      accumulator = cb(accumulator, arr[index]);
      iterate(index + 1);
    });
  }

  iterate(0);
}

let arr = [1, 2, 3, 4, 5];
const sum = (acc, x) => acc + x;

async_reduce(arr, sum, (result) => {
  console.log('result:', result);
})

console.log('This will log before the reduction is complete');