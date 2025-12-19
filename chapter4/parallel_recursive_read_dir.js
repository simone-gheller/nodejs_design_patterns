import fs from 'fs';
import path from 'path';

export function recursiveRead(dir, cb) {

  let results = []

  function iterate(dir, cb) {
    fs.readdir(dir, { withFileTypes: true }, (err, res) => {
      if (err) return cb(err, null);  

      let dirs = []
      let completed = 0
      res.forEach(el => {
        if (!el.isDirectory()) results.push(path.join(dir, el.name));
        else dirs.push(el);
      });
      const total = dirs.length;

      if (total === 0) return cb(null, results); // nothing to do

      dirs.forEach(el => {
        iterate(path.join(dir, el.name), (err) => {
          if (err) return cb(err, null);
          if (++completed == total) return cb(null, results);
        });
      })
    });
  }

  iterate(dir, (err, res) => {
    if (err) return cb(err);
    console.log('done')
    cb(null, res);
  })
}


recursiveRead('/Users/sgheller/workbench/esercizi/', (err, res) => {
  if (err) {
    console.error('Error searching :', err);
  } else {
    console.log('Finished listing files.', res);
  }
});