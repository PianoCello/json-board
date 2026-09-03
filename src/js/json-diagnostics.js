(function attachJsonDiagnostics(global) {
  'use strict';

  const VALUE_START = /[\[\{"'\-0-9tfnNuI]/;

  class JsonInspector {
    constructor(text) {
      this.text = text;
      this.index = 0;
      this.depth = 0;
      this.problem = null;
    }

    location(index) {
      const before = this.text.slice(0, index);
      const lines = before.split('\n');
      return { line: lines.length, column: lines.at(-1).length + 1 };
    }

    fail(code, message, suggestion, index = this.index, length = 1) {
      if (this.problem) return false;
      const safeIndex = Math.max(0, Math.min(index, this.text.length));
      this.problem = {
        valid: false,
        code,
        message,
        suggestion,
        index: safeIndex,
        length: Math.max(0, Math.min(length, this.text.length - safeIndex)),
        ...this.location(safeIndex)
      };
      return false;
    }

    skipWhitespace() {
      while (/\s/.test(this.text[this.index] || '')) this.index += 1;
    }

    parse() {
      this.skipWhitespace();
      if (!this.text.length || this.index >= this.text.length) return { valid: true };
      if (this.text.charCodeAt(this.index) === 0xfeff) {
        return this.fail('bom', '开头包含不可见的 BOM 字符。', '删除文件最前面的不可见字符后再试。', this.index);
      }
      if (!this.parseValue()) return this.problem;
      this.skipWhitespace();
      if (this.index < this.text.length) {
        const character = this.text[this.index];
        if (character === '}' || character === ']') {
          return this.fail('extra-closing', `这里多了一个“${character}”。`, '删除这个多余的闭合括号。');
        }
        return this.fail('multiple-root', '一个 JSON 文本只能有一个最外层值。', '删除后面的多余内容，或把多个值放进同一个数组中。');
      }
      return { valid: true };
    }

    parseValue() {
      this.skipWhitespace();
      if (this.index >= this.text.length) {
        return this.fail('missing-value', '这里缺少一个 JSON 值。', '补充字符串、数字、对象、数组、true、false 或 null。', this.index, 0);
      }
      const character = this.text[this.index];
      if (character === '{') return this.parseObject();
      if (character === '[') return this.parseArray();
      if (character === '"') return this.parseString();
      if (character === "'") return this.fail('single-quote', 'JSON 字符串不能使用单引号。', '把单引号改成双引号。');
      if (character === '-' || /\d/.test(character)) return this.parseNumber();
      if (this.text.startsWith('true', this.index)) { this.index += 4; return true; }
      if (this.text.startsWith('false', this.index)) { this.index += 5; return true; }
      if (this.text.startsWith('null', this.index)) { this.index += 4; return true; }
      if (this.text.startsWith('//', this.index) || this.text.startsWith('/*', this.index)) {
        return this.fail('comment', '标准 JSON 不支持注释。', '删除注释；如果必须保留注释，请改用 JSON5。', this.index, 2);
      }
      const invalidLiteral = this.text.slice(this.index).match(/^(undefined|NaN|Infinity|-Infinity)/)?.[0];
      if (invalidLiteral) {
        return this.fail('invalid-literal', `“${invalidLiteral}”不是合法的 JSON 值。`, '按实际含义改成 null、数字或字符串。', this.index, invalidLiteral.length);
      }
      if (character === '}' || character === ']') {
        return this.fail('unexpected-closing', `这里出现了没有配对的“${character}”。`, '删除它，或在前面补上对应的开始括号。');
      }
      return this.fail('invalid-value', `无法识别以“${character}”开头的 JSON 值。`, '检查拼写，并确认字符串和属性名都使用双引号。');
    }

    parseString() {
      const start = this.index;
      this.index += 1;
      while (this.index < this.text.length) {
        const character = this.text[this.index];
        if (character === '"') { this.index += 1; return true; }
        if (character === '\n' || character === '\r' || character.charCodeAt(0) < 0x20) {
          return this.fail('control-character', '字符串中包含未转义的换行或控制字符。', '在这里结束字符串，或使用 \\n、\\r、\\t 等转义写法。');
        }
        if (character === '\\') {
          const escapeIndex = this.index;
          this.index += 1;
          if (this.index >= this.text.length) {
            return this.fail('unterminated-string', '字符串在转义符后意外结束。', '补全转义内容并添加结束双引号。', escapeIndex, 1);
          }
          const escaped = this.text[this.index];
          if ('"\\/bfnrt'.includes(escaped)) { this.index += 1; continue; }
          if (escaped === 'u') {
            const unicode = this.text.slice(this.index + 1, this.index + 5);
            if (!/^[\da-fA-F]{4}$/.test(unicode)) {
              return this.fail('unicode-escape', 'Unicode 转义必须是 \\u 后跟 4 个十六进制字符。', '例如使用 \\u4e2d 表示“中”。', escapeIndex, Math.min(6, this.text.length - escapeIndex));
            }
            this.index += 5;
            continue;
          }
          return this.fail('invalid-escape', `“\\${escaped}”不是合法的 JSON 转义。`, '只使用 \\"、\\\\、\\/、\\b、\\f、\\n、\\r、\\t 或 \\uXXXX。', escapeIndex, 2);
        }
        this.index += 1;
      }
      return this.fail('unterminated-string', '字符串缺少结束双引号。', '在字符串末尾补上一个双引号。', start, Math.max(1, this.text.length - start));
    }

    parseNumber() {
      const start = this.index;
      const match = this.text.slice(start).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
      if (!match) return this.fail('invalid-number', '这里不是合法的 JSON 数字。', '数字只能使用十进制写法，例如 -12、3.14 或 1e6。');
      this.index += match[0].length;
      const next = this.text[this.index] || '';
      if (/[\d.eE+-]/.test(next)) {
        return this.fail('invalid-number', '数字格式不正确。', '检查前导零、小数点或科学计数法是否完整。', start, this.index - start + 1);
      }
      return true;
    }

    enterContainer(openingIndex) {
      this.depth += 1;
      if (this.depth > 1000) return this.fail('too-deep', 'JSON 嵌套层级过深。', '减少对象或数组的嵌套层级。', openingIndex);
      return true;
    }

    parseObject() {
      const openingIndex = this.index;
      if (!this.enterContainer(openingIndex)) return false;
      this.index += 1;
      this.skipWhitespace();
      if (this.text[this.index] === '}') { this.index += 1; this.depth -= 1; return true; }
      while (this.index < this.text.length) {
        if (this.text.startsWith('//', this.index) || this.text.startsWith('/*', this.index)) {
          return this.fail('comment', '标准 JSON 不支持注释。', '删除注释；如果必须保留注释，请改用 JSON5。', this.index, 2);
        }
        if (this.text[this.index] === "'") return this.fail('single-quote-key', 'JSON 属性名不能使用单引号。', '把属性名两侧的单引号改成双引号。');
        if (this.text[this.index] !== '"') {
          if (this.text[this.index] === '}') return this.fail('trailing-comma', '对象最后一个属性后面多了逗号。', '删除闭合花括号前面的逗号。');
          const key = this.text.slice(this.index).match(/^[A-Za-z_$][\w$-]*/)?.[0];
          if (key) return this.fail('unquoted-key', `属性名“${key}”缺少双引号。`, `改成 “\"${key}\"”。`, this.index, key.length);
          return this.fail('missing-key', '这里应该是一个使用双引号包裹的属性名。', '补充属性名，或检查前一个属性后是否缺少逗号。');
        }
        if (!this.parseString()) return false;
        this.skipWhitespace();
        if (this.text[this.index] !== ':') {
          return this.fail('missing-colon', '属性名后面缺少冒号。', '在属性名和值之间添加英文冒号“:”。', this.index, 0);
        }
        this.index += 1;
        if (!this.parseValue()) return false;
        this.skipWhitespace();
        const separator = this.text[this.index];
        if (separator === '}') { this.index += 1; this.depth -= 1; return true; }
        if (separator === ',') {
          this.index += 1;
          this.skipWhitespace();
          if (this.text[this.index] === '}') return this.fail('trailing-comma', '对象最后一个属性后面多了逗号。', '删除闭合花括号前面的逗号。', this.index - 1);
          continue;
        }
        if (separator === ']') return this.fail('mismatched-bracket', '对象使用了错误的闭合方括号“]”。', '这里应该使用闭合花括号“}”。');
        if (separator === undefined) return this.fail('missing-closing-object', '对象缺少闭合花括号“}”。', '在 JSON 末尾补上“}”。', this.index, 0);
        if (separator === '"' || separator === "'" || /[A-Za-z_$]/.test(separator)) {
          return this.fail('missing-comma-object', '两个对象属性之间缺少逗号。', '在前一个属性值后添加英文逗号“,”。', this.index, 0);
        }
        return this.fail('object-separator', '属性值后面应该是逗号或闭合花括号。', '添加英文逗号“,”，或检查是否多写了字符。');
      }
      return this.fail('missing-closing-object', '对象缺少闭合花括号“}”。', '在 JSON 末尾补上“}”。', this.index, 0);
    }

    parseArray() {
      const openingIndex = this.index;
      if (!this.enterContainer(openingIndex)) return false;
      this.index += 1;
      this.skipWhitespace();
      if (this.text[this.index] === ']') { this.index += 1; this.depth -= 1; return true; }
      while (this.index < this.text.length) {
        if (!this.parseValue()) return false;
        this.skipWhitespace();
        const separator = this.text[this.index];
        if (separator === ']') { this.index += 1; this.depth -= 1; return true; }
        if (separator === ',') {
          this.index += 1;
          this.skipWhitespace();
          if (this.text[this.index] === ']') return this.fail('trailing-comma-array', '数组最后一个元素后面多了逗号。', '删除闭合方括号前面的逗号。', this.index - 1);
          continue;
        }
        if (separator === '}') return this.fail('mismatched-brace', '数组使用了错误的闭合花括号“}”。', '这里应该使用闭合方括号“]”。');
        if (separator === undefined) return this.fail('missing-closing-array', '数组缺少闭合方括号“]”。', '在 JSON 末尾补上“]”。', this.index, 0);
        if (VALUE_START.test(separator)) return this.fail('missing-comma-array', '两个数组元素之间缺少逗号。', '在前一个数组元素后添加英文逗号“,”。', this.index, 0);
        return this.fail('array-separator', '数组元素后面应该是逗号或闭合方括号。', '添加英文逗号“,”，或检查是否多写了字符。');
      }
      return this.fail('missing-closing-array', '数组缺少闭合方括号“]”。', '在 JSON 末尾补上“]”。', this.index, 0);
    }
  }

  function analyze(text) {
    const source = String(text || '');
    if (!source.trim()) return { valid: true, empty: true };
    try {
      JSON.parse(source);
      return { valid: true };
    } catch (_) {
      const inspector = new JsonInspector(source);
      const result = inspector.parse();
      if (inspector.problem) return inspector.problem;
      if (result && result.valid === false) return result;
      const index = Math.max(0, source.length - 1);
      const before = source.slice(0, index);
      return {
        valid: false,
        code: 'unknown',
        message: 'JSON 格式不正确。',
        suggestion: '检查该位置附近的逗号、冒号、引号和括号是否完整。',
        index,
        length: 1,
        line: before.split('\n').length,
        column: index - before.lastIndexOf('\n')
      };
    }
  }

  global.JsonDiagnostics = Object.freeze({ analyze });
})(globalThis);
