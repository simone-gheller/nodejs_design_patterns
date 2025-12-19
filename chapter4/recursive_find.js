import fs from 'fs';
import path from 'path';
import { TaskQueue } from './TaskQueue.js';

function recursiveFind(dir, keyword, cb) {
  let results = [];
  const taskQueue = new TaskQueue(5); // Limit concurrency to 5
  taskQueue.on('empty', () => {
    return cb(null, results); 
  });

  function processFile(filePath, done) {
    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) return cb(err);
      if (data.includes(keyword)) results.push(filePath);
      done()
    });
  }

  function iterate(dir, done) {
    fs.readdir(dir, (err, files) => {
      if (err) {
        if (err.code !== 'ENOTDIR') return cb(err)
        taskQueue.pushTask((done) => {
          processFile(dir, done);
        });
      } else {
        files.forEach((file) => {
          taskQueue.pushTask((done) => {
            iterate(path.join(dir, file), done);
          });
        });
      }
      done();
    })
  }

  taskQueue.pushTask((done) => {
    iterate(dir, done);
  });
}

recursiveFind('/Users/sgheller/workbench/esercizi/', 'ticker', (err, res) => {
  if (err) {
    console.error('Error searching :', err);
  } else {
    console.log('Finished listing files.', res);
  }
});