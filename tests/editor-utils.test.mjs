import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const context = { globalThis: {} };
vm.runInNewContext(readFileSync(new URL('../src/js/editor-utils.js', import.meta.url), 'utf8'), context);
const { buildBracketPairs, lineClipboardRange, shouldAutoFormatPaste } = context.globalThis.JsonBoardEditor;

assert.equal(JSON.stringify(buildBracketPairs('{"ignored":"}","nested":[1]}')), JSON.stringify([[24, 26], [0, 27]]));
assert.equal(JSON.stringify(buildBracketPairs('{/* } */"value":1}')), JSON.stringify([[0, 17]]));

assert.equal(shouldAutoFormatPaste({
  currentText: '',
  selectionStart: 0,
  selectionEnd: 0,
  pastedText: '{"name":"JSON Board"}',
  mode: 'json'
}), true);
assert.equal(shouldAutoFormatPaste({
  currentText: '{\n  "first": 1\n}',
  selectionStart: 0,
  selectionEnd: 16,
  pastedText: '{"second":2}',
  mode: 'json'
}), true);
assert.equal(shouldAutoFormatPaste({
  currentText: '{\n  "first": 1\n}',
  selectionStart: 15,
  selectionEnd: 15,
  pastedText: '  "second": 2,\n',
  mode: 'json'
}), false);
assert.equal(shouldAutoFormatPaste({
  currentText: '<root>\n  <first />\n</root>',
  selectionStart: 9,
  selectionEnd: 9,
  pastedText: '  <second />\n',
  mode: 'xml'
}), false);

assert.deepEqual(
  JSON.parse(JSON.stringify(lineClipboardRange('first\nsecond\nthird', 8))),
  { start: 6, end: 13, deleteStart: 6, deleteEnd: 13, text: 'second\n' }
);
assert.deepEqual(
  JSON.parse(JSON.stringify(lineClipboardRange('first\nlast', 10))),
  { start: 6, end: 10, deleteStart: 5, deleteEnd: 10, text: 'last\n' }
);

console.log('editor utilities contract: bracket pairs, paste detection and line clipboard ranges');
