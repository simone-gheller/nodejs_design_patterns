import assert from "assert";
import { parse } from "csv-parse";

const records = [];
// Initialize the parser
const parser = parse({
  delimiter: ":",
});
// Use the readable stream api to consume records
parser.on("data", function (record) {
  records.push(record);
  console.log(`read ${record.length} data`)
});
// Catch any error
parser.on("error", function (err) {
  console.error(err.message);
});
// Test that the parsed records matched the expected records
parser.on("end", function () {
  assert.deepStrictEqual(records, [
    ["root", "x", "0", "0", "root", "/root", "/bin/bash"],
    ["someone", "x", "1022", "1022", "", "/home/someone", "/bin/bash"],
  ])
  console.log("All records parsed successfully.");
});
// Write data to the stream
parser.write("root:x:0:0:root:/root:/bin/bash\n");
parser.write("someone:x:1022:1022::/home/someone:/bin/bash\n");
// Close the readable stream
parser.end();