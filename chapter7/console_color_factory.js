import { createWriteStream } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

class ColorConsole {
  constructor(stream) {
    this.stream = stream;
  }
  log(){}
}

class RedConsole extends ColorConsole {
  constructor(stream) {
    super(stream);
  }
  log(message) {
    this.stream.write("\x1b[31m" + message + "\x1b[0m" + "\n");
    this.stream.end();
  }
}

class GreenConsole extends ColorConsole {
  constructor(stream) {
    super(stream);
  }
  log(message) {
    this.stream.write("\x1b[32m" + message + "\x1b[0m" + "\n");
    this.stream.end();
  }
}

class BlueConsole extends ColorConsole {
  constructor(stream) {
    super(stream);
  } 
  log(message) {
    this.stream.write("\x1b[34m" + message + "\x1b[0m" + "\n");
    this.stream.end();
  }
}

function ConsoleFactory(color, stream = process.stdout) {
  switch(color) {
    case 'red':
      return new RedConsole(stream);
    case 'green':
      return new GreenConsole(stream);
    case 'blue':
      return new BlueConsole(stream);
    default:
      throw new Error('Unknown color'); 
  }
}

const color = process.argv[2] || 'red';
const message = process.argv.splice(3).join(' ') || 'Hello, World!';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// const myConsole = ConsoleFactory(color, createWriteStream(join(__dirname, 'logger.txt')));
const myConsole = ConsoleFactory(color);
myConsole.log(message);