import { open } from 'sqlite'
import sqlite3 from 'sqlite3'
import { EventEmitter } from 'events'
import { exit } from 'process'

export class SqliteDAO extends EventEmitter {

  constructor(db_name) {
    super()
    this.db = undefined
    this.commandQueue = []
    this.initialized = false

    const vent = () => {
      while (this.commandQueue.length > 0) {
        const cmd = this.commandQueue.shift()
        cmd()
      }
    }

    this.on('connected', vent)

    const filename = `${import.meta.dirname}/db/${db_name}`

      open({
        filename,
        driver: sqlite3.Database,
        mode: sqlite3.OPEN_READWRITE
      }).then((db) => {
        this.db = db
        this.initialized = true
        this.emit('connected')
      }).catch(err => {
        console.log('error while connecting to db: ', err)
        exit(1)
      })
  }

  async run(query, params = []) {
    if (!this.initialized) {
      return new Promise((resolve, reject) => {
        const cmd = () => this.db.run(query, params).then(resolve).catch(reject)
        this.commandQueue.push(cmd)
      })
    }
    return this.db.run(query, params)
  }

  async all(query, params = []) {
    if (!this.initialized) {
      return new Promise((resolve, reject) => {
        const cmd = () => this.db.all(query, params).then(resolve).catch(reject)
        this.commandQueue.push(cmd)
      })
    }
    return this.db.all(query, params)
  }

}