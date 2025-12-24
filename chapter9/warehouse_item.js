

class WarehouseItem {
  constructor(id, state = 'arriving') {
    this.id = id
    this.state = state
  }
  store(locationId) {
    if (this.state == 'delivered') {
      throw new Error('cant store a delivered package')
    }
    this.locationId = locationId
    this.state = 'stored'
  }
  deliver(address) {
    if (this.state == 'arriving' || this.state == 'delivered') {
      throw new Error('cant store a package that is arriving or already delivered')
    }
    this.delivery_address = address
    delete this.locationId
    this.state = 'delivered'
  }
  describe() {
    const prefix = `Item ${this.id} `
    switch(this.state) {
      case 'arriving':
        return prefix + 'is on its way to the Warehouse'
      case 'stored':
        return prefix + `is stored in location ${this.locationId}`
      case 'delivered':
        return prefix + `was delivered to ${this.delivery_address}`
    }
  }
}

const item1 = new WarehouseItem('PKG-001')
console.log(item1.describe())
item1.store('A-12')
console.log(item1.describe())
item1.deliver('Via Roma 123, Milano')
console.log(item1.describe())

const item2 = new WarehouseItem('PKG-002')

try {
  item2.deliver('Via Verdi 45, Roma')
} catch (error) {
  console.log(`Expected error: ${error.message}`)
}

item2.store('B-05')
console.log(item2.describe())
item2.deliver('Via Verdi 45, Roma')
console.log(item2.describe())

try {
  item2.store('C-20')
} catch (error) {
  console.log(`Expected error: ${error.message}`)
}