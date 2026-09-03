import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const context = { globalThis: {}, JSON };
vm.runInNewContext(readFileSync(new URL('../src/js/json-diagnostics.js', import.meta.url), 'utf8'), context);
const { analyze } = context.globalThis.JsonDiagnostics;

const cases = [
  ['{"a":1,"b":[true,null]}', true],
  ['{"a":1 "b":2}', 'missing-comma-object'],
  ['{"a":1,}', 'trailing-comma'],
  ['{"a" 1}', 'missing-colon'],
  ["{'a':1}", 'single-quote-key'],
  ['{a:1}', 'unquoted-key'],
  ['{"a":"text}', 'unterminated-string'],
  ['{"a":[1,2}', 'mismatched-brace'],
  ['{"a":1}}', 'extra-closing'],
  ['{"a":[1 2]}', 'missing-comma-array'],
  ['{"a":undefined}', 'invalid-literal'],
  ['{"a":"\\x"}', 'invalid-escape'],
  ['{"a":01}', 'invalid-number'],
  ['{/* note */"a":1}', 'comment'],
  ['{\n  "a": 1\n  "b": 2\n}', 'missing-comma-object']
];

for (const [source, expected] of cases) {
  const result = analyze(source);
  if (expected === true) assert.equal(result.valid, true, source);
  else {
    assert.equal(result.valid, false, source);
    assert.equal(result.code, expected, source);
    assert.ok(result.message && result.suggestion, source);
    assert.ok(result.line >= 1 && result.column >= 1, source);
  }
}

const multiline = analyze('{\n  "a": 1\n  "b": 2\n}');
assert.equal(multiline.line, 3);
assert.equal(multiline.column, 3);

console.log(`diagnostics contract: ${cases.length} Chinese JSON syntax scenarios covered`);
