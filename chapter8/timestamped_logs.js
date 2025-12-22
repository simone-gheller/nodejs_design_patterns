
const enhancedLog = new Proxy(console, {
  get (target, prop, receiver) {
    if (['log', 'info', 'warn', 'error', 'debug'].includes(prop)) {
      const timestamp = new Date().toISOString();
      return (...args) =>
        Reflect.get(target, prop, receiver)(...[`[${timestamp}]`, ...args]);
    }
    return Reflect.get(target, prop, receiver);
  }
});

console.error('This is a regular log message.');
enhancedLog.error('Enhanced log message with timestamp.');