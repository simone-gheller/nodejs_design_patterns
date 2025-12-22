import { request } from 'http';

const request_cache = new Proxy(request, {
  apply (target, thisArg, args) {
    const [options, callback] = args;

    const cache = request_cache._cache || (request_cache._cache = new Map());
    const cacheKey = JSON.stringify(options);

    if (cache.has(cacheKey)) {
      console.log('Serving from cache:', cacheKey);
      const cachedResponse = cache.get(cacheKey);
      // avoid zalgo by deferring the callback
      process.nextTick(() => callback(cachedResponse));
      return;
    } 

    const cb = (res) => {
      cache.set(cacheKey, res);
      callback(res);
    };

    return Reflect.apply(target, thisArg, [options, cb]);
  }
});

const request_list = [
  { hostname: 'www.example.com', port: 80 },
  { hostname: 'www.google.com', port: 80 },
  { hostname: 'www.example.com', port: 80 },
];

for (const req_options of request_list) {
  const r = request_cache(req_options, (res)=>{
    res.on('data', (chunk) => {
      console.log(`BODY: ${chunk}`);
    });
  });
  r.end();
}