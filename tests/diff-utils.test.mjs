import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../diff-utils.js', import.meta.url), 'utf8');
const context = {};
vm.runInNewContext(source, context);
const { lineDiff } = context.JsonBoardDiff;

function counts(diff) {
  return {
    added: diff.rightStatus.filter(status => status === 'added').length,
    removed: diff.leftStatus.filter(status => status === 'removed').length,
    modified: diff.leftStatus.filter(status => status === 'modified').length
  };
}

const baseLines = Array.from({ length: 900 }, (_, index) => `const value_${index} = ${index};`);
const insertedLines = [...baseLines.slice(0, 25), 'const extra_a = true;', 'const extra_b = true;', 'const extra_c = true;', ...baseLines.slice(25)];
assert.deepEqual(counts(lineDiff(baseLines.join('\n'), insertedLines.join('\n'))), {
  added: 3,
  removed: 0,
  modified: 0
});

const changedLines = [...insertedLines];
changedLines[304] = 'const value_301 = "changed";';
changedLines[703] = 'const value_700 = "changed";';
assert.deepEqual(counts(lineDiff(baseLines.join('\n'), changedLines.join('\n'))), {
  added: 3,
  removed: 0,
  modified: 2
});

const deletedLines = [...baseLines.slice(0, 410), ...baseLines.slice(414)];
assert.deepEqual(counts(lineDiff(baseLines.join('\n'), deletedLines.join('\n'))), {
  added: 0,
  removed: 4,
  modified: 0
});

assert.deepEqual(counts(lineDiff('  const x = 1;\n}', 'const x = 1;  \n  }')), {
  added: 0,
  removed: 0,
  modified: 0
});

const repeatedLeft = Array.from({ length: 300 }, (_, index) => [`function item_${index}() {`, '  if (ok) {', '    run();', '  }', '}']).flat();
const repeatedRight = [...repeatedLeft.slice(0, 502), '    inserted();', ...repeatedLeft.slice(502)];
assert.deepEqual(counts(lineDiff(repeatedLeft.join('\n'), repeatedRight.join('\n'))), {
  added: 1,
  removed: 0,
  modified: 0
});

console.log('diff contract: large shifted code is anchored without cascading modifications');
