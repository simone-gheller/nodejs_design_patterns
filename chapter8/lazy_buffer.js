import { Buffer } from 'buffer';

function createLazyBuffer (size) {
  const state = {
    buffer: Buffer.alloc(0),
  };
  
  return new Proxy(state.buffer, {
    get (target, prop) {
      if (prop === 'write') {
        if (state.buffer.length > 0) {
          return target.write.bind(state.buffer);
        }
        return (str) => {
          state.buffer = Buffer.alloc(size);
          return state.buffer.write(str);
        };
      }
      const value = state.buffer[prop];
      if (typeof value === 'function') {
        return value.bind(state.buffer);
      }
      return value;
    }
  });
}

const lazyBuffer = createLazyBuffer(12);
console.log('Buffer length before write:', lazyBuffer.length);
lazyBuffer.write('Hello');
console.log('Buffer length after write:', lazyBuffer.length);
console.log(lazyBuffer.toString());
lazyBuffer.write(' World!', 5);
console.log('Buffer length after write:', lazyBuffer.length);
console.log('Final Buffer content:', lazyBuffer.toString());
