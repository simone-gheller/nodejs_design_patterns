
function getColoredConsole (targetConsole) {
  targetConsole.yellow = (...args) => {
    targetConsole.log('\x1b[33m%s\x1b[0m', args.join(' '));
  };

  targetConsole.green = (...args) => {
    targetConsole.log('\x1b[32m%s\x1b[0m', args.join(' '));
  };

  targetConsole.red = (...args) => {
    targetConsole.log('\x1b[31m%s\x1b[0m', args.join(' '));
  };

  return targetConsole;
}

const coloredConsole = getColoredConsole(console);
coloredConsole.yellow('This is a yellow message');
coloredConsole.green('This is a green message');
coloredConsole.red('This is a red message', 'with multiple parts');
coloredConsole.log('This is a normal message', 'without color');
console.red('This is a red message using the original console');