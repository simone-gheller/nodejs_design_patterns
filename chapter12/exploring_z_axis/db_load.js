import { faker } from '@faker-js/faker'
import { open } from 'sqlite'
import sqlite3 from 'sqlite3'

const totalPeople = 1e5
const batchSize = 5e3

const groups = [
  { name: 'A-D', regex: /^[A-D]/i },
  { name: 'E-P', regex: /^[E-P]/i },
  { name: 'Q-Z', regex: /^[Q-Z]/i }
]

const getDbIndex = (lastName) => {
  const firstLetter = lastName.charAt(0)
  return groups.findIndex(group => group.regex.test(firstLetter))
}

const databases = await Promise.all(
  groups.map(group =>
    open({
      filename: `${import.meta.dirname}/db/${group.name}.db`,
      driver: sqlite3.Database
    })
  )
)

await Promise.all(databases.map(db =>
  db.exec(`
    CREATE TABLE IF NOT EXISTS people (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      firstName TEXT NOT NULL,
      lastName TEXT NOT NULL,
      sex TEXT NOT NULL,
      jobTitle TEXT NOT NULL
    )
  `)
))

const batches = [[], [], []]

const flushBatch = async (dbIndex) => {
  const stmt = await databases[dbIndex].prepare(
  'INSERT INTO people (firstName, lastName, sex, jobTitle) VALUES (?, ?, ?, ?)'
  )
  for (const p of batches[dbIndex]) {
    await stmt.run(p.firstName, p.lastName, p.sex, p.jobTitle)
  }
  await stmt.finalize()
}

for (let i = 0; i < totalPeople; i++) {
  const person = {
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    sex: faker.person.sex(),
    jobTitle: faker.person.jobTitle()
  }

  const dbIndex = getDbIndex(person.lastName)

  if (dbIndex !== -1) {
    batches[dbIndex].push(person)

    if (batches[dbIndex].length >= batchSize) {
      await flushBatch(dbIndex)
      batches[dbIndex] = []
    }
  }
}

await Promise.all(
  batches.map(async (batch, index) => {
    if (batch.length > 0) {
      await flushBatch(index)
    }
  })
)

await Promise.all(databases.map(db => db.close()))

console.log(`Completed loading ${totalPeople} records across ${groups.length} databases`)

