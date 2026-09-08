import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInThisContext } from 'node:vm';

const source = readFileSync(new URL('../src/js/xml-utils.js', import.meta.url), 'utf8');
runInThisContext(source);

const xml = globalThis.JsonBoardXml;
assert.doesNotThrow(() => new Function(xml.workerSource));

assert.equal(xml.analyze('<root><item>值</item></root>').valid, true);
assert.equal(xml.analyze('<root><item></root>').code, 'mismatched-tag');
assert.equal(xml.analyze('<root><item></item>').code, 'unclosed-tag');
assert.equal(xml.analyze('<one/><two/>').code, 'multiple-roots');
assert.equal(xml.analyze('<root>Tom & Jerry</root>').code, 'bare-ampersand');
assert.equal(xml.analyze('<root><!-- bad</root>').code, 'unfinished-markup');
assert.equal(xml.analyze('<root id=1/>').code, 'unquoted-attribute');
assert.equal(xml.analyze('<root id="1" id="2"/>').code, 'duplicate-attribute');
assert.equal(xml.analyze('<root/><?xml version="1.0"?>').code, 'misplaced-declaration');

assert.equal(
  xml.format('<?xml version="1.0"?><root><item id="1">值</item><empty/></root>', 4),
  '<?xml version="1.0"?>\n<root>\n    <item id="1">值</item>\n    <empty/>\n</root>'
);
assert.equal(xml.format('<p>Hello <b>XML</b> world</p>', 4), '<p>Hello <b>XML</b> world</p>');

const ranges = xml.foldRanges('<root>\n    <items>\n        <item/>\n        <item/>\n    </items>\n</root>');
assert.equal(ranges.length, 2);
assert.equal(ranges[0].name, 'root');
assert.equal(ranges[0].itemCount, 1);
assert.equal(ranges[1].name, 'items');
assert.equal(ranges[1].itemCount, 2);

console.log('XML utilities contract: formatting, diagnostics and fold ranges covered');
