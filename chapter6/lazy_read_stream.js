import { PassThrough } from 'stream';
import { createReadStream } from 'fs';

function lazyReadStream(generator) {
  let pass = new PassThrough();
  pass._read_original = pass._read;
  pass._read = (size) => {
    let actualStream = generator();
    actualStream.pipe(pass)
    actualStream.on('error', (err) => pass.emit('error', err));
    pass._read = pass._read_original;
    pass._read_original(size);
  }
  return pass
}

const lazyStream = lazyReadStream(() => {
  return createReadStream('chapter6/lazy_stream.js', { encoding: 'utf8', highWaterMark: 20 });
});

// Example usage
lazyStream.on('data', (chunk) => {
  console.log(`Received: ${chunk}`);
});

lazyStream.on('end', () => {
  console.log('No more data.');
});

