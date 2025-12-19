console.log('1. Inizio')

const promise = new Promise((resolve) => {
  console.log('2. Dentro executor (SINCRONO)')
  resolve('valore')
  console.log('3. Dopo resolve (ancora SINCRONO)')
})

console.log('4. Promise creata')

promise.then(value => {
  console.log('6. Then callback:', value)
})

console.log('5. Dopo then')


// ### Analisi Fase per Fase

// Call Stack:          Microtask Queue:        Output:
// -----------          ----------------        -------

// [main]               []                      
//   ↓
// [main, Promise]      []                      "1. Inizio"
//   ↓
// [main, executor]     []                      "2. Dentro executor"
//   ↓
// [main, executor]     []                      "3. Dopo resolve"
//   resolve() viene chiamato → la Promise cambia stato a 'fulfilled'
  
// [main]               []                      "4. Promise creata"
//   ↓
// [main, then()]       []                      
//   then() registra il callback, ma siccome la Promise è già risolta,
//   il callback viene SCHEDULATO nella microtask queue
  
// [main]               [thenCallback]          "5. Dopo then"
//   ↓
// []                   [thenCallback]          
  
//   Call stack vuoto! Event loop prende dalla microtask queue
  
// [thenCallback]       []                      "6. Then callback: valore"
//   ↓
// []                   []                      

// **Output finale:**

// 1. Inizio
// 2. Dentro executor (SINCRONO)
// 3. Dopo resolve (ancora SINCRONO)
// 4. Promise creata
// 5. Dopo then
// 6. Then callback: valore

function delay (ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function leakingLoop () {
  await delay(1000)
  console.log(`Tick ${Date.now()}`)
  return leakingLoop()
}

for (let i = 0; i < 100000; i++) {
  leakingLoop()
}