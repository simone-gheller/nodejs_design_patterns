import http from 'http'

function sendComputeRequest(functionCode, args) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ functionCode, args })

    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/compute',
      method: 'POST',
    }

    const req = http.request(options, (res) => {
      let data = ''

      res.on('data', (chunk) => {
        data += chunk
      })

      res.on('end', () => {
        try {
          resolve(JSON.parse(data))
        } catch (error) {
          reject(new Error('Failed to parse response'))
        }
      })
    })

    req.on('error', reject)
    req.write(postData)
    req.end()
  })
}

const result1 = await sendComputeRequest('(a, b) => a + b', [5, 3])
console.log('Result:', result1)

const result2 = await sendComputeRequest(
  '(n) => { let result = 1; for (let i = 2; i <= n; i++) result *= i; return result; }',
  [10]
)
console.log('Result:', result2)

const result3 = await sendComputeRequest(
  '(a, b) => { if (b === 0) throw new Error("Division by zero"); return a / b; }',
  [10, 0]
)
console.log('Result:', result3)

