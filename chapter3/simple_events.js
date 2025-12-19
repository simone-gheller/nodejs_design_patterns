import { EventEmitter } from 'events';
import { readFile } from 'fs';

class FindRegex extends EventEmitter {
  constructor(regex) {
    super();
    this.regex = regex;
    this.files = [];
  }

  addFile(file) {
    this.files.push(file);
    return this
  }

  find() {
    process.nextTick(() => this.emit('start', this.files));
    for (const file of this.files) {
      readFile(file, 'utf8', (err, content) => {
        if (err) {
          this.emit('error', err);
          return;
        }

        this.emit('fileread', file);

        const match = content.match(this.regex);
        if (match) {
          match.forEach((m) => this.emit('found', file, m));
        }
      });
    }
    return this
  }
}

const findRegex = new FindRegex(/hello \w+/g);

findRegex
  .on('start', (files) => {
    console.log(`Starting search in files: ${files.join(', ')}`);
  })
  .on('fileread', (file) => {
    console.log(`Finished reading file: ${file}`);
  })
  .on('found', (file, match) => {
    console.log(`Found match in ${file}: ${match}`);
  })
  .on('error', (err) => {
    console.error(`Error occurred: ${err.message}`);
  })
  .addFile(import.meta.dirname + '/file1.txt')
  .addFile(import.meta.dirname + '/file2.txt')
  .find();

