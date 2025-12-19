
function async_map(arr, cb, finalCb) {

  function iterate(index) {
    if (index >= arr.length) {
      return finalCb(null)
    }

    process.nextTick(() => {
      arr[index] = cb(arr[index])
      iterate(index + 1);
    })
  }

  iterate(0);
}

let arr = [1, 2, 3, 4, 5];
const squared = (x) => x ** 2;

async_map(arr, squared, () => {
  console.log('All done');
  console.log(arr);
})