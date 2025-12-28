import { parentPort } from 'worker_threads'
import vm from 'vm'

parentPort.on('message', ({ functionCode, args }) => {
  try {
    const context = vm.createContext({
      result: undefined,
      args
    })

    const script = new vm.Script(`result = (${functionCode})(...args)`)
    script.runInContext(context)

    parentPort.postMessage({
      success: true,
      result: context.result
    })
  } catch (error) {
    parentPort.postMessage({
      success: false,
      error: error.message,
      stack: error.stack
    })
  }
})
