import fs from 'fs'

function concatFiles(...args) {
  const dir = import.meta.dirname
  const cb = args.pop()
  const destFile = args.pop()
  let fileContents = args.slice()

  const iterate = () => {
    const file = fileContents.shift()
    if (!file) return cb(null)

    fs.readFile(`${dir}/${file}`, 'utf8', (err, data) => {
      if (err) return cb(err)
      fs.appendFile(`${dir}/${destFile}`, data, (err) => {
        if (err) return cb(err)
        iterate()
      })
    })
  }

  iterate()

}

concatFiles('file1.txt', 'file2.txt', 'file3.txt', 'output.txt', (err) => {
  if (err) {
    console.error('Error concatenating files:', err)
  } else {
    console.log('Files concatenated successfully into output.txt')
  }
})
