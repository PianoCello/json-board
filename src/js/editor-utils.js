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

  function shouldAutoFormatPaste({ currentText, selectionStart, selectionEnd, pastedText, mode }) {
    const source = String(currentText ?? '');
    const pasted = String(pastedText ?? '').trim();
    const replacesWholeDocument = source.trim() === ''
      || (selectionStart === 0 && selectionEnd === source.length);
    if (!replacesWholeDocument || !pasted) return false;
    if (mode === 'xml') return pasted.includes('<') && pasted.includes('>');
    return (pasted.startsWith('{') && pasted.endsWith('}'))
      || (pasted.startsWith('[') && pasted.endsWith(']'));
  }

  function lineClipboardRange(text, offset) {
    const source = String(text ?? '');
    const caret = Math.max(0, Math.min(Number(offset) || 0, source.length));
    const start = source.lastIndexOf('\n', caret - 1) + 1;
    const nextBreak = source.indexOf('\n', caret);
    const end = nextBreak === -1 ? source.length : nextBreak + 1;
    return {
      start,
      end,
      deleteStart: nextBreak === -1 && start > 0 ? start - 1 : start,
      deleteEnd: end,
      text: `${source.slice(start, end)}${nextBreak === -1 ? '\n' : ''}`
    };
  }

  global.JsonBoardEditor = Object.freeze({ buildBracketPairs, lineClipboardRange, shouldAutoFormatPaste });
})(globalThis);
