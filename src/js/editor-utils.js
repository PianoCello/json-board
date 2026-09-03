(function attachJsonBoardEditor(global) {
  'use strict';

  function buildBracketPairs(text) {
    const pairs = [];
    const stack = [];
    let quote = '';
    let escaped = false;
    let lineComment = false;
    let blockComment = false;
    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];
      const next = text[index + 1];
      if (lineComment) {
        if (character === '\n') lineComment = false;
        continue;
      }
      if (blockComment) {
        if (character === '*' && next === '/') { blockComment = false; index += 1; }
        continue;
      }
      if (quote) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === quote) quote = '';
        continue;
      }
      if (character === '/' && next === '/') { lineComment = true; index += 1; continue; }
      if (character === '/' && next === '*') { blockComment = true; index += 1; continue; }
      if (character === '"' || character === "'" || character === '`') { quote = character; continue; }
      if (character === '{' || character === '[') stack.push({ character, index });
      if (character === '}' || character === ']') {
        const expected = character === '}' ? '{' : '[';
        const opening = stack.at(-1);
        if (opening?.character === expected) {
          stack.pop();
          pairs.push([opening.index, index]);
        }
      }
    }
    return pairs;
  }

  global.JsonBoardEditor = Object.freeze({ buildBracketPairs });
})(globalThis);
