import { open } from 'sqlite'
import sqlite3 from 'sqlite3'
import { EventEmitter } from 'events'

export class AsyncDBinit extends EventEmitter {

  constructor() {
    super()
    this.db = undefined
    this.initialized = false
    this.commandQueue = []

    const vent = () => {
      while (this.commandQueue.length > 0) {
        const cmd = this.commandQueue.shift()
        cmd()
      }
    }

    this.on('connected', vent)
  }

  connect(){
    open({
      filename: './db/database.db',
      driver: sqlite3.Database
    }).then((db) => {
      this.db = db
      this.initialized = true
      this.emit('connected')
    })
    return 
  }

  async get(query){
    if (!this.initialized){
      return new Promise((resolve, reject) => {
        const cmd = () => this.db.get(query).then(resolve).catch(reject)
        this.commandQueue.push(cmd)
      })
    }
    return this.db.get(query)
  }

  async all(query){
    if (!this.initialized){
      return new Promise((resolve, reject) => {
        const cmd = () => this.db.all(query).then(resolve).catch(reject)
        this.commandQueue.push(cmd)
      })
    }
    return this.db.all(query)
  }

  async exec(query){
    if (!this.initialized){
      return new Promise((resolve, reject) => {
        const cmd = () => this.db.exec(query).then(resolve).catch(reject)
        this.commandQueue.push(cmd)
      })
    }
    return this.db.exec(query)
  }
}

const db = new AsyncDBinit()

db.connect()
console.log(db.initialized)

db.exec('CREATE TABLE IF NOT EXISTS test (col TEXT)')
console.log(db.initialized)
db.exec(`INSERT INTO test VALUES ("${Date.now().toString()}")`)
console.log(db.initialized)
db.get('SELECT * FROM test').then(res=>{
  console.log(db.initialized)
  console.log(res)
})
console.log(db.initialized)
db.all('SELECT * FROM test').then(res=>{
  console.log(db.initialized)
  console.log(res)
})
console.log(db.initialized)