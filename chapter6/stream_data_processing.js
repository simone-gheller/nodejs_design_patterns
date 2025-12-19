import { createReadStream } from 'fs'
import { Transform } from 'stream'
import { createGunzip } from 'zlib'
import { parse } from 'csv-parse'

const dataFile = process.argv[2] || 'chapter6/london_crime_by_lsoa.csv.gz'

const source = createReadStream(dataFile)

let crimesNumberYearly = new Map()
let crimesNumberPerBorough = new Map()
let crimesPerTypePerBorough = new Map()
let crimesPerTypeTotal = new Map()

source
  .pipe(createGunzip())
  .pipe(parse({ columns: true }))
  .pipe(new Transform({
    objectMode: true,
    transform(chunk, encoding, callback) {
      const year = chunk.year
      const numCrimes = chunk.value
      const borough = chunk.borough
      const crimeType = chunk.major_category
      crimesNumberYearly.set(year, (crimesNumberYearly.get(year) || 0) + parseInt(numCrimes, 10))
      crimesNumberPerBorough.set(borough, (crimesNumberPerBorough.get(borough) || 0) + parseInt(numCrimes, 10))
      crimesPerTypePerBorough.set(borough, crimesPerTypePerBorough.get(borough) || new Map())
      const typeMap = crimesPerTypePerBorough.get(borough)
      typeMap.set(crimeType, (typeMap.get(crimeType) || 0) + parseInt(numCrimes, 10))
      crimesPerTypeTotal.set(crimeType, (crimesPerTypeTotal.get(crimeType) || 0) + parseInt(numCrimes, 10))
      callback()
    }
  }))  
  .on('finish', () => {
    console.log('Did the number of crimes go up or down over the years? ', crimesNumberYearly)
    
    const topBoroughs = Array.from(crimesNumberPerBorough.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
    
    console.log('What are the most dangerous areas of London? ', topBoroughs)

    console.log('What is the most common crime per area?', crimesPerTypePerBorough)

    console.log('What is the least common crime?', crimesPerTypeTotal)
  })