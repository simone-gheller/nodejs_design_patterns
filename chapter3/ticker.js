import EventEmitter from 'events';

function ticker(number, cb) {
  let ev = new EventEmitter();
  let tickCount = 0;

  const recursiveTimeout = () => setTimeout(() => {
    if (tickCount * 50 >= number) {
      ev.removeAllListeners('tick');
      cb(null, tickCount)
    } else {
      ev.emit('tick', ++tickCount);
      recursiveTimeout()
    }
  }, 50);

  recursiveTimeout();
  return ev;
}

ticker(200, (err, ticks) => {
  if (err) {
    console.error(err);
  }
  console.log(`Ticker finished after ${ticks} ticks.`);
})
.on('tick', (count) => {
  console.log(`Tick ${count}`);
})
.on('tick', (count) => {
  if (count === 3) {
    console.log('Tick 3 reached, doing something special!');
  }
})