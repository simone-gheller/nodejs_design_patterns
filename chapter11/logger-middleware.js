export function createLoggerMiddleware(options = {}) {
  const {
    logger = console.log,
    getMetadata = () => ({})
  } = options

  return function loggerMiddleware(req, res) {
    const startTime = Date.now()
    const originalEnd = res.end

    res.end = function (...args) {
      const logData = {
        timestamp: new Date().toISOString(),
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        durationMs: Date.now() - startTime,
        ...getMetadata(req, res)
      }

      logger(JSON.stringify(logData))
      return originalEnd.apply(res, args)
    }
  }
}
