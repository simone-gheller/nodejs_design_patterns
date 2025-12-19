import { PassThrough } from 'stream';
import { createGzip, createBrotliCompress, createDeflate } from 'zlib';
import { createReadStream, createWriteStream } from 'fs';
import { basename } from 'path';


const file = process.argv[2];

if (!file) {
  console.error('Usage: node data_compression_efficiency.js <file>');
  process.exit(1);
}

function createMonitoredCompression(source, algorithm, fileExtension) {
  const readMonitor = new PassThrough();
  const compressMonitor = new PassThrough();

  readMonitor.on('data', (chunk) => {
    readMonitor.bytesRead = (readMonitor.bytesRead || 0) + chunk.length;
    readMonitor.startTime = readMonitor.startTime || Date.now();
  });

  compressMonitor.on('data', (chunk) => {
    compressMonitor.compressedBytes = (compressMonitor.compressedBytes || 0) + chunk.length;
  });

  compressMonitor.on('end', () => {
    const endTime = Date.now();
    const duration = endTime - (readMonitor.startTime || endTime);
    const compressionRatio = ((1 - (compressMonitor.compressedBytes / readMonitor.bytesRead)) * 100).toFixed(2);

    console.log(`\n${algorithm.constructor.name}:`);
    console.log(`  Original size: ${readMonitor.bytesRead} bytes`);
    console.log(`  Compressed size: ${compressMonitor.compressedBytes} bytes`);
    console.log(`  Compression ratio: ${compressionRatio}%`);
    console.log(`  Duration: ${duration} ms`);
    console.log(`  Throughput: ${(compressMonitor.compressedBytes / duration).toFixed(2)} bytes/ms`);
  });

  // Create the pipeline
  source
    .pipe(readMonitor)
    .pipe(algorithm)
    .pipe(compressMonitor)
    .pipe(createWriteStream(basename(file) + fileExtension));
}

// Testa tutti e tre gli algoritmi
console.log(`Compressing file: ${file}\n`);
const sourceStream = createReadStream(file)

// condiviso per tutti gli algoritmi, la backpressure sarà condivisa
// performance peggiori rispetto a creare un nuovo stream per ogni algoritmo
//ma risparmia I/O e si usano meno fd
createMonitoredCompression(sourceStream, createGzip(), '.gz');
createMonitoredCompression(sourceStream, createDeflate(), '.deflate');
createMonitoredCompression(sourceStream, createBrotliCompress(), '.br');