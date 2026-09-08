(function attachJsonBoardXml(global) {
  'use strict';

  const NAME_PATTERN = /^[A-Za-z_][\w.:-]*/;

  function xmlLocation(text, index) {
    const before = text.slice(0, index);
    const lines = before.split('\n');
    return { line: lines.length, column: lines.at(-1).length + 1 };
  }

  function problem(text, code, message, suggestion, index, length = 1) {
    const safeIndex = Math.max(0, Math.min(index, text.length));
    return {
      valid: false,
      code,
      message,
      suggestion,
      index: safeIndex,
      length: Math.max(0, Math.min(length, text.length - safeIndex)),
      ...xmlLocation(text, safeIndex)
    };
  }

  function findMarkupEnd(text, start, terminator = '>') {
    let quote = '';
    let subsetDepth = 0;
    for (let index = start; index < text.length; index += 1) {
      const character = text[index];
      if (quote) {
        if (character === quote) quote = '';
        continue;
      }
      if (character === '"' || character === "'") { quote = character; continue; }
      if (character === '[') subsetDepth += 1;
      else if (character === ']') subsetDepth = Math.max(0, subsetDepth - 1);
      if (subsetDepth === 0 && text.startsWith(terminator, index)) return index + terminator.length;
    }
    return -1;
  }

  function tokenize(text) {
    const tokens = [];
    let cursor = 0;
    while (cursor < text.length) {
      const start = text.indexOf('<', cursor);
      if (start < 0) {
        if (cursor < text.length) tokens.push({ type: 'text', start: cursor, end: text.length, raw: text.slice(cursor) });
        break;
      }
      if (start > cursor) tokens.push({ type: 'text', start: cursor, end: start, raw: text.slice(cursor, start) });
      let type = 'tag';
      let terminator = '>';
      if (text.startsWith('<!--', start)) { type = 'comment'; terminator = '-->'; }
      else if (text.startsWith('<![CDATA[', start)) { type = 'cdata'; terminator = ']]>'; }
      else if (text.startsWith('<?', start)) { type = 'processing'; terminator = '?>'; }
      else if (/^<!DOCTYPE\b/i.test(text.slice(start))) type = 'doctype';
      const end = findMarkupEnd(text, start + (type === 'tag' ? 1 : 2), terminator);
      if (end < 0) {
        tokens.push({ type: 'unfinished', markupType: type, start, end: text.length, raw: text.slice(start) });
        break;
      }
      const raw = text.slice(start, end);
      const token = { type, start, end, raw };
      if (type === 'tag') {
        token.closing = /^<\s*\//.test(raw);
        token.selfClosing = /\/\s*>$/.test(raw);
        const nameSource = raw.slice(raw.indexOf(token.closing ? '/' : '<') + 1).replace(/^\s*\/?\s*/, '');
        token.name = nameSource.match(NAME_PATTERN)?.[0] || '';
      }
      tokens.push(token);
      cursor = end;
    }
    return tokens;
  }

  function validateTag(text, token) {
    const raw = token.raw;
    let cursor = 1;
    while (/\s/.test(raw[cursor] || '')) cursor += 1;
    if (token.closing) cursor += 1;
    while (/\s/.test(raw[cursor] || '')) cursor += 1;
    cursor += token.name.length;
    if (token.closing) {
      while (/\s/.test(raw[cursor] || '')) cursor += 1;
      if (raw[cursor] !== '>') return problem(text, 'closing-tag-content', '结束标签中包含了多余内容。', '结束标签只能包含标签名，例如 </item>。', token.start + cursor);
      return null;
    }
    const attributes = new Set();
    while (cursor < raw.length - 1) {
      while (/\s/.test(raw[cursor] || '')) cursor += 1;
      if (raw[cursor] === '>' || (raw[cursor] === '/' && raw[cursor + 1] === '>')) return null;
      const nameMatch = raw.slice(cursor).match(NAME_PATTERN);
      if (!nameMatch) return problem(text, 'invalid-attribute', '这里的 XML 属性名称无效。', '检查属性名，并确保属性之间使用空格分隔。', token.start + cursor);
      const attributeName = nameMatch[0];
      if (attributes.has(attributeName)) return problem(text, 'duplicate-attribute', `属性“${attributeName}”重复出现。`, '同一个标签内只保留一个同名属性。', token.start + cursor, attributeName.length);
      attributes.add(attributeName);
      cursor += attributeName.length;
      while (/\s/.test(raw[cursor] || '')) cursor += 1;
      if (raw[cursor] !== '=') return problem(text, 'missing-attribute-equals', `属性“${attributeName}”后缺少等号。`, '在属性名和值之间添加“=”。', token.start + cursor);
      cursor += 1;
      while (/\s/.test(raw[cursor] || '')) cursor += 1;
      const quote = raw[cursor];
      if (quote !== '"' && quote !== "'") return problem(text, 'unquoted-attribute', `属性“${attributeName}”的值没有使用引号。`, 'XML 属性值必须使用单引号或双引号包裹。', token.start + cursor);
      const valueStart = ++cursor;
      while (cursor < raw.length && raw[cursor] !== quote) cursor += 1;
      if (cursor >= raw.length) return problem(text, 'unclosed-attribute', `属性“${attributeName}”的引号没有闭合。`, `在属性值末尾补上“${quote}”。`, token.start + valueStart - 1);
      const invalidLessThan = raw.indexOf('<', valueStart);
      if (invalidLessThan >= 0 && invalidLessThan < cursor) return problem(text, 'less-than-in-attribute', '属性值中不能直接出现“<”。', '将它转义为 &lt;。', token.start + invalidLessThan);
      cursor += 1;
    }
    return null;
  }

  function analyze(text) {
    if (!text.trim()) return { valid: true, empty: true };
    const tokens = tokenize(text);
    const stack = [];
    let rootCount = 0;
    let rootClosed = false;
    let declarationSeen = false;
    let significantMarkupSeen = false;

    for (const token of tokens) {
      if (token.type === 'unfinished') {
        const names = { comment: '注释', cdata: 'CDATA 区段', processing: '处理指令', doctype: 'DOCTYPE 声明', tag: '标签' };
        return problem(text, 'unfinished-markup', `${names[token.markupType] || 'XML 标记'}没有正确结束。`, `补上${token.markupType === 'comment' ? '“-->”' : token.markupType === 'cdata' ? '“]]>”' : token.markupType === 'processing' ? '“?>”' : '右尖括号“>”'}。`, token.start, Math.min(2, text.length - token.start));
      }
      if (token.type === 'text') {
        if (token.raw.trim() && stack.length === 0) {
          return problem(text, 'text-outside-root', '根元素外存在文本内容。', '删除根元素外的文本，或把它移动到根元素内部。', token.start + token.raw.search(/\S/));
        }
        continue;
      }
      if (token.type === 'processing' && /^<\?xml\b/i.test(token.raw)) {
        if (declarationSeen || significantMarkupSeen) return problem(text, 'misplaced-declaration', 'XML 声明只能出现在文档最前面。', '把 XML 声明移动到第一行，并且只保留一个。', token.start, token.raw.length);
        declarationSeen = true;
        significantMarkupSeen = true;
        continue;
      }
      if (token.type === 'doctype') {
        if (rootCount > 0) return problem(text, 'misplaced-doctype', 'DOCTYPE 声明必须位于根元素之前。', '把 DOCTYPE 移到根元素开始标签之前。', token.start, token.raw.length);
        significantMarkupSeen = true;
        continue;
      }
      if (token.type !== 'tag') continue;
      if (!token.name) return problem(text, 'invalid-tag', '这里的 XML 标签名称无效。', '标签名应以字母或下划线开头，并检查尖括号是否完整。', token.start, token.raw.length);
      const tagProblem = validateTag(text, token);
      if (tagProblem) return tagProblem;
      significantMarkupSeen = true;
      if (token.closing) {
        if (!stack.length) return problem(text, 'extra-closing-tag', `结束标签“</${token.name}>”没有对应的开始标签。`, '删除这个结束标签，或在前面补上同名开始标签。', token.start, token.raw.length);
        const opening = stack.at(-1);
        if (opening.name !== token.name) {
          return problem(text, 'mismatched-tag', `结束标签“</${token.name}>”与开始标签“<${opening.name}>”不匹配。`, `把它改为“</${opening.name}>”，或检查中间是否漏写了结束标签。`, token.start, token.raw.length);
        }
        stack.pop();
        if (!stack.length) rootClosed = true;
        continue;
      }
      if (!stack.length) {
        if (rootClosed) return problem(text, 'multiple-roots', 'XML 文档只能有一个根元素。', '把这些元素放入同一个根元素中。', token.start, token.raw.length);
        rootCount += 1;
      }
      if (!token.selfClosing) stack.push(token);
      else if (!stack.length) rootClosed = true;
    }

    if (stack.length) {
      const opening = stack.at(-1);
      return problem(text, 'unclosed-tag', `开始标签“<${opening.name}>”没有结束标签。`, `在对应内容后补上“</${opening.name}>”。`, opening.start, opening.raw.length);
    }
    if (rootCount === 0) return problem(text, 'missing-root', '没有找到 XML 根元素。', '添加一个包裹全部内容的根元素。', 0, 0);
    for (const token of tokens) {
      if (token.type !== 'text' && token.type !== 'tag') continue;
      const bareAmpersand = /&(?!#\d+;|#x[\da-fA-F]+;|[A-Za-z_][\w.:-]*;)/.exec(token.raw);
      if (bareAmpersand) return problem(text, 'bare-ampersand', '文本中存在未转义的“&”。', '把普通 & 改为 &amp;，或使用合法的实体引用。', token.start + bareAmpersand.index);
    }
    return { valid: true };
  }

  function format(text, indentSize = 4) {
    const result = analyze(text);
    if (!result.valid) {
      const error = new Error(result.message);
      error.problem = result;
      throw error;
    }
    if (result.empty) return '';
    const tokens = tokenize(text);
    const matchingTags = new Map();
    const tagStack = [];
    tokens.forEach((token, index) => {
      if (token.type !== 'tag' || token.selfClosing) return;
      if (!token.closing) tagStack.push({ index, name: token.name });
      else if (tagStack.at(-1)?.name === token.name) matchingTags.set(tagStack.pop().index, index);
    });
    const lines = [];
    const indent = depth => ' '.repeat(Math.max(0, depth) * indentSize);
    let depth = 0;
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index];
      if (token.type === 'text') {
        const content = token.raw.trim();
        if (content) lines.push(`${indent(depth)}${content}`);
        continue;
      }
      if (token.type !== 'tag') {
        lines.push(`${indent(depth)}${token.raw.trim()}`);
        continue;
      }
      if (token.closing) {
        depth = Math.max(0, depth - 1);
        lines.push(`${indent(depth)}${token.raw.trim()}`);
        continue;
      }
      const matchingIndex = matchingTags.get(index);
      if (Number.isInteger(matchingIndex)) {
        const children = tokens.slice(index + 1, matchingIndex);
        let childDepth = 0;
        let hasText = false;
        let hasElement = false;
        children.forEach(child => {
          if (child.type === 'tag') {
            if (child.closing) childDepth = Math.max(0, childDepth - 1);
            else {
              if (childDepth === 0) hasElement = true;
              if (!child.selfClosing) childDepth += 1;
            }
          } else if ((child.type === 'text' || child.type === 'cdata') && childDepth === 0 && child.raw.trim()) hasText = true;
        });
        if (hasText && hasElement) {
          lines.push(`${indent(depth)}${text.slice(token.start, tokens[matchingIndex].end).trim()}`);
          index = matchingIndex;
          continue;
        }
      }
      const textToken = tokens[index + 1];
      const closingToken = tokens[index + 2];
      if (!token.selfClosing && textToken?.type === 'text' && textToken.raw.trim()
        && closingToken?.type === 'tag' && closingToken.closing && closingToken.name === token.name) {
        lines.push(`${indent(depth)}${token.raw.trim()}${textToken.raw.trim()}${closingToken.raw.trim()}`);
        index += 2;
        continue;
      }
      lines.push(`${indent(depth)}${token.raw.trim()}`);
      if (!token.selfClosing) depth += 1;
    }
    return lines.join('\n');
  }

  function foldRanges(text) {
    const ranges = [];
    const stack = [];
    const tokens = tokenize(text);
    for (const token of tokens) {
      if (token.type !== 'tag' || !token.name) continue;
      if (!token.closing && !token.selfClosing) {
        if (stack.length) stack.at(-1).childCount += 1;
        stack.push({ ...token, childCount: 0, ...xmlLocation(text, token.start) });
        continue;
      }
      if (!token.closing) {
        if (stack.length) stack.at(-1).childCount += 1;
        continue;
      }
      const opening = stack.pop();
      if (!opening || opening.name !== token.name) continue;
      const closingLocation = xmlLocation(text, token.start);
      if (closingLocation.line > opening.line) {
        const openingLineStart = text.lastIndexOf('\n', opening.start - 1) + 1;
        const openingEndColumn = opening.end - openingLineStart - 1;
        ranges.push({
          startLine: opening.line - 1,
          endLine: closingLocation.line - 1,
          openColumn: openingEndColumn,
          closeColumn: closingLocation.column - 1,
          startOffset: opening.start,
          endOffset: token.end,
          opening: '<',
          closing: '>',
          itemCount: opening.childCount,
          type: 'xml-element',
          name: opening.name
        });
      }
    }
    return ranges.sort((first, second) => first.startLine - second.startLine || second.endLine - first.endLine);
  }

  const workerSource = `const NAME_PATTERN = /^[A-Za-z_][\\w.:-]*/;\n${xmlLocation.toString()}\n${problem.toString()}\n${findMarkupEnd.toString()}\n${tokenize.toString()}\n${validateTag.toString()}\n${analyze.toString()}\n${format.toString()}\nself.onmessage = event => { try { self.postMessage({ text: format(event.data.text, event.data.indentSize) }); } catch (error) { self.postMessage({ error: error.message, problem: error.problem }); } };`;

  global.JsonBoardXml = Object.freeze({ analyze, format, foldRanges, workerSource });
})(globalThis);
