import { Level } from 'level'

const db = new Level('./db/sales',)
const table = db.sublevel('sales', { valueEncoding: 'json' })

const products = ['machineA', 'itemB', 'basketC']

function getRandomProduct() {
  return products[Math.floor(Math.random() * products.length)]
}

function getRandomAmount() {
  return Math.floor(Math.random() * 9990) + 10
}

async function populateSales(count = 1000000) {
  console.log(`Starting to insert ${count} records...`)
  const startTime = Date.now()

  const batch = []

  for (let i = 0; i < count; i++) {
    const salesId = `sale_${i + 1}`
    const record = {
      salesId,
      amount: getRandomAmount(),
      product: getRandomProduct()
    }

    batch.push({ type: 'put', key: salesId, value: record })

  }
  await table.batch(batch)

  const endTime = Date.now()
  const duration = ((endTime - startTime) / 1000).toFixed(2)

  console.log(`✓ Successfully inserted ${count} records in ${duration} seconds`)


  await db.close()
}

populateSales(1000000).catch(console.error)
