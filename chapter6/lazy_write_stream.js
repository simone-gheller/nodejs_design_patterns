import { PassThrough } from 'stream'
import { createWriteStream } from 'fs';

function lazyWriteStream(generator) {
  let pass = new PassThrough();
  pass._write_original = pass._write;
  pass._write = (chunk, encoding, callback) => {
    let actualStream = generator();
    pass.pipe(actualStream);
    actualStream.on('error', (err) => pass.emit('error', err));
    pass._write = pass._write_original;
    pass._write_original(chunk, encoding, callback);
  }
  return pass
}

const lazyStream = lazyWriteStream(() => {
  return createWriteStream('chapter6/lazy_stream_output.txt', { encoding: 'utf8', highWaterMark: 20 });
});

// Example usage
lazyStream.write('Hello, ');
lazyStream.write('this is a lazy write stream example.\n');
lazyStream.end('Goodbye!\n');

lazyStream.on('finish', () => {
  console.log('All data written.');
});
