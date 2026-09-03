import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const context = { globalThis: {} };
vm.runInNewContext(readFileSync(new URL('../editor-utils.js', import.meta.url), 'utf8'), context);
const { buildBracketPairs } = context.globalThis.JsonBoardEditor;

assert.equal(JSON.stringify(buildBracketPairs('{"ignored":"}","nested":[1]}')), JSON.stringify([[24, 26], [0, 27]]));
assert.equal(JSON.stringify(buildBracketPairs('{/* } */"value":1}')), JSON.stringify([[0, 17]]));

console.log('editor utilities contract: bracket pairs ignore strings and comments');
