import fs from 'fs';
import path from 'path';

function listNestedFiles(dir, cb) {

  let queue = [dir];
  let files = []

  function iterate(currentDir) {
    fs.readdir(currentDir, { withFileTypes: true }, (err, entries) => {
      if (err) return cb(err, null);

      entries.forEach(entry => {
        const fullPath = path.join(currentDir, entry.name);
        entry.isDirectory() ? queue.push(fullPath) : files.push(fullPath);
      });
      if (queue.length == 0) return setImmediate(()=>cb(null, files)) // No more entries
      setImmediate(()=>iterate(queue.shift()));
    });
  }

  iterate(queue.shift());
}


// Example usage:
listNestedFiles('/Users/sgheller/workbench/esercizi/', (err, res) => {
  if (err) {
    console.error('Error listing files:', err);
  } else {
    console.log('Finished listing files.', res);
  }
});