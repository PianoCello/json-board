(async () => {
  'use strict';

  const input = document.querySelector('#jsonInput');
  const compareInput = document.querySelector('#compareInput');
  const primaryHighlight = document.querySelector('#primaryHighlight');
  const compareHighlight = document.querySelector('#compareHighlight');
  const primarySearchHighlights = document.querySelector('#primarySearchHighlights');
  const compareSearchHighlights = document.querySelector('#compareSearchHighlights');
  const foldControls = document.querySelector('#foldControls');
  const lineNumbers = document.querySelector('#lineNumbers');
  const compareLineNumbers = document.querySelector('#compareLineNumbers');
  const workspace = document.querySelector('#workspace');
  const comparePane = document.querySelector('#comparePane');
  const splitter = document.querySelector('#splitter');
  const compareSummary = document.querySelector('#compareSummary');
  const leftDiffLines = document.querySelector('#leftDiffLines');
  const rightDiffLines = document.querySelector('#rightDiffLines');
  const diffMessage = document.querySelector('#diffMessage');
  const addedCount = document.querySelector('#addedCount');
  const removedCount = document.querySelector('#removedCount');
  const modifiedCount = document.querySelector('#modifiedCount');
  const previousChange = document.querySelector('#previousChange');
  const nextChange = document.querySelector('#nextChange');
  const changePosition = document.querySelector('#changePosition');
  const errorCard = document.querySelector('#errorCard');
  const errorLocation = document.querySelector('#errorLocation');
  const errorMessage = document.querySelector('#errorMessage');
  const errorSuggestion = document.querySelector('#errorSuggestion');
  const locateError = document.querySelector('#locateError');
  const closeErrorCard = document.querySelector('#closeErrorCard');
  const toast = document.querySelector('#toast');
  const replacePanel = document.querySelector('#replacePanel');
  const replaceTarget = document.querySelector('#replaceTarget');
  const findText = document.querySelector('#findText');
  const replaceText = document.querySelector('#replaceText');
  const findPosition = document.querySelector('#findPosition');
  const previousMatch = document.querySelector('#previousMatch');
  const nextMatch = document.querySelector('#nextMatch');
  const replaceCurrent = document.querySelector('#replaceCurrent');
  const replaceAll = document.querySelector('#replaceAll');
  const closeReplace = document.querySelector('#closeReplace');
  const replaceButton = document.querySelector('[data-action="replace"]');
  const codeModeButton = document.querySelector('[data-action="code-mode"]');
  const languageBadge = document.querySelector('#languageBadge');
  const lineNumbersButton = document.querySelector('[data-action="line-numbers"]');
  const hideNullButton = document.querySelector('[data-action="hide-null"]');
  const compareButton = document.querySelector('[data-action="compare"]');
  const formatButton = document.querySelector('[data-action="format"]');
  const collapseAllButton = document.querySelector('[data-action="collapse-all"]');
  const expandAllButton = document.querySelector('[data-action="expand-all"]');
  const STORAGE_KEY = 'json-board-state-v1';
  const DATABASE_NAME = 'json-board-storage';

  let compareMode = false;
  let codeMode = false;
  let hideNullValues = false;
  let canonicalText = '';
  let diffChanges = [];
  let currentChangeIndex = -1;
  let syncingScroll = false;
  let renderTimer;
  let diffTimer;
  let persistTimer;
  let persistRevision = 0;
  let toastTimer;
  let largeFileNoticeShown = false;
  let foldSourceText = '';
  let foldRows = [];
  let foldDisplayMap = [];
  let foldRanges = [];
  let foldTimer;
  let diagnosticTimer;
  let currentDiagnostic = null;
  let dismissedDiagnosticText = '';
  let stateRestored = false;
  let userEditedBeforeRestore = false;
  let activeEditor = input;
  let currentSearchIndex = -1;
  const foldedStarts = new Set();
  const editorCache = new WeakMap();
  const bracketCache = new WeakMap();
  const languageCache = new WeakMap();
  const LARGE_TEXT_LENGTH = 150000;
  const LOCAL_STORAGE_TEXT_LIMIT = 1500000;
  const VIEW_BUFFER_LINES = 12;
  const LANGUAGE_SAMPLE_LENGTH = 16000;
  const CODE_LANGUAGES = [
    'javascript', 'typescript', 'python', 'java', 'sql', 'bash', 'shell', 'xml', 'css',
    'json', 'yaml', 'c', 'cpp', 'csharp', 'go', 'rust', 'php', 'ruby', 'kotlin', 'swift',
    'markdown', 'ini', 'powershell', 'lua', 'r', 'graphql', 'diff', 'makefile'
  ];
  const LANGUAGE_LABELS = {
    javascript: 'JavaScript', typescript: 'TypeScript', python: 'Python', java: 'Java',
    sql: 'SQL', bash: 'Shell', shell: 'Shell', xml: 'HTML / XML', css: 'CSS', json: 'JSON',
    yaml: 'YAML', c: 'C', cpp: 'C++', csharp: 'C#', go: 'Go', rust: 'Rust', php: 'PHP',
    ruby: 'Ruby', kotlin: 'Kotlin', swift: 'Swift', markdown: 'Markdown', ini: 'INI',
    powershell: 'PowerShell', lua: 'Lua', r: 'R', graphql: 'GraphQL', diff: 'Diff', makefile: 'Makefile'
  };

  const escapeHtml = value => value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');

  function highlightCode(text, sourceOffset = 0) {
    const pattern = /"(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"|-?(?:\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|\b(?:true|false|null)\b|[{}\[\]]/g;
    let html = '';
    let cursor = 0;
    for (const match of text.matchAll(pattern)) {
      const token = match[0];
      const offset = match.index;
      const plainText = text.slice(cursor, offset);
      if (plainText) html += `<span inert>${escapeHtml(plainText)}</span>`;
      if ('{}[]'.includes(token)) {
        html += `<span class="bracket-token" data-bracket-offset="${sourceOffset + offset}">${token}</span>`;
        cursor = offset + 1;
        continue;
      }
      let className = 'token-number';
      if (token.startsWith('"')) {
        className = /^\s*:/.test(text.slice(offset + token.length)) ? 'token-key' : 'token-string';
      } else if (token === 'null') className = 'token-null';
      else if (token === 'true' || token === 'false') className = 'token-boolean';
      html += `<span class="${className}" inert>${escapeHtml(token)}</span>`;
      cursor = offset + token.length;
    }
    const remainingText = text.slice(cursor);
    if (remainingText) html += `<span inert>${escapeHtml(remainingText)}</span>`;
    return text.endsWith('\n') ? `${html} ` : html;
  }

  function languageHint(sample) {
    const trimmed = sample.trim();
    if (!trimmed) return 'plaintext';
    if (/^(?:\{[\s\S]*\}|\[[\s\S]*\])$/.test(trimmed)) {
      try { JSON.parse(trimmed); return 'json'; } catch (_) { /* 继续识别代码 */ }
    }
    if (/^\s*(?:SELECT\b[\s\S]*?\bFROM\b|INSERT\s+INTO\b|UPDATE\b[\s\S]*?\bSET\b|CREATE\s+(?:TABLE|VIEW)\b)/im.test(sample)) return 'sql';
    if (/^\s*#!.*\b(?:bash|sh|zsh)\b/m.test(sample)) return 'bash';
    if (/<(?:!doctype\s+html|html|body|div|script|style|template)\b/i.test(sample)) return 'xml';
    if (/\b(?:interface|type|enum)\s+[A-Za-z_$][\w$]*|:\s*(?:string|number|boolean|unknown|never)(?:\[\])?/m.test(sample)) return 'typescript';
    if (/\b(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=|=>|\b(?:require|console\.log)\s*\(/m.test(sample)) return 'javascript';
    if (/^\s*(?:from\s+\w[\w.]*\s+import|import\s+\w[\w.]*|def\s+\w+\s*\(|class\s+\w+\s*(?:\([^)]*\))?:)/m.test(sample)) return 'python';
    if (/\bpublic\s+(?:static\s+)?(?:class|interface|void)|\bSystem\.out\./m.test(sample)) return 'java';
    return null;
  }

  function detectCodeLanguage(editor, text) {
    const cached = languageCache.get(editor);
    if (cached?.text === text) return cached.language;
    if (!text.trim() || !window.hljs) return 'plaintext';
    const sample = text.length <= LANGUAGE_SAMPLE_LENGTH
      ? text
      : `${text.slice(0, LANGUAGE_SAMPLE_LENGTH * .75)}\n${text.slice(-LANGUAGE_SAMPLE_LENGTH * .25)}`;
    const language = languageHint(sample)
      || window.hljs.highlightAuto(sample, CODE_LANGUAGES).language
      || 'plaintext';
    languageCache.set(editor, { text, language });
    return language;
  }

  function highlightProgrammingCode(text, language) {
    if (!window.hljs || language === 'plaintext') return `<span inert>${escapeHtml(text)}</span>`;
    try {
      const html = window.hljs.highlight(text, { language, ignoreIllegals: true }).value;
      return `<span inert class="hljs-code">${html}</span>`;
    } catch (_) {
      return `<span inert>${escapeHtml(text)}</span>`;
    }
  }

  function updateLanguageBadge(editor, language) {
    if (!codeMode || editor !== activeEditor) return;
    languageBadge.textContent = LANGUAGE_LABELS[language] || (language === 'plaintext' ? '纯文本' : language.toUpperCase());
  }

  function lineIndex(editor) {
    const text = editor.value;
    const cached = editorCache.get(editor);
    if (cached?.text === text) return cached;
    const offsets = [0];
    for (let index = 0; index < text.length; index += 1) {
      if (text.charCodeAt(index) === 10) offsets.push(index + 1);
    }
    const data = { text, offsets, large: text.length >= LARGE_TEXT_LENGTH || offsets.length > 5000 };
    editorCache.set(editor, data);
    return data;
  }

  function visibleLines(editor, data) {
    if (!data.large) return { start: 0, end: data.offsets.length };
    const lineHeight = Number.parseFloat(getComputedStyle(editor).lineHeight) || 22.4;
    const topPadding = Number.parseFloat(getComputedStyle(editor).paddingTop) || 22;
    const start = Math.max(0, Math.floor((editor.scrollTop - topPadding) / lineHeight) - VIEW_BUFFER_LINES);
    const visibleCount = Math.ceil(editor.clientHeight / lineHeight) + VIEW_BUFFER_LINES * 2;
    return { start, end: Math.min(data.offsets.length, start + visibleCount) };
  }

  function updateEditor(editor, highlight, numbers) {
    const data = lineIndex(editor);
    const { start, end } = visibleLines(editor, data);
    const language = codeMode ? detectCodeLanguage(editor, data.text) : null;
    let renderedText;
    let renderedLines;
    let horizontalStart = 0;
    let characterWidth = 0;
    if (data.large) {
      characterWidth = Number.parseFloat(getComputedStyle(editor).fontSize) * .602;
      horizontalStart = Math.max(0, Math.floor(editor.scrollLeft / characterWidth) - 24);
      const horizontalLength = Math.ceil(editor.clientWidth / characterWidth) + 48;
      renderedLines = [];
      for (let line = start; line < end; line += 1) {
        const lineStart = data.offsets[line] ?? data.text.length;
        const nextStart = data.offsets[line + 1] ?? data.text.length;
        const lineEnd = nextStart > lineStart && data.text[nextStart - 1] === '\n' ? nextStart - 1 : nextStart;
        const length = lineEnd - lineStart;
        const visibleStart = lineStart + Math.min(horizontalStart, length);
        renderedLines.push({
          text: data.text.slice(visibleStart, lineStart + Math.min(horizontalStart + horizontalLength, length)),
          offset: visibleStart
        });
      }
      renderedText = renderedLines.map(line => line.text).join('\n');
    } else renderedText = data.text;
    highlight.innerHTML = codeMode
      ? highlightProgrammingCode(renderedText, language)
      : data.large
        ? renderedLines.map(line => highlightCode(line.text, line.offset)).join('\n')
        : highlightCode(renderedText);
    if (codeMode) updateLanguageBadge(editor, language);
    numbers.textContent = Array.from({ length: end - start }, (_, index) => start + index + 1).join('\n');

    if (data.large) {
      const lineHeight = Number.parseFloat(getComputedStyle(editor).lineHeight) || 22.4;
      const topPadding = Number.parseFloat(getComputedStyle(editor).paddingTop) || 22;
      const bottomPadding = Number.parseFloat(getComputedStyle(editor).paddingBottom) || 40;
      highlight.style.transform = `translate(${horizontalStart * characterWidth - editor.scrollLeft}px, ${start * lineHeight - editor.scrollTop}px)`;
      numbers.style.paddingTop = `${topPadding + start * lineHeight}px`;
      numbers.style.paddingBottom = `${bottomPadding + Math.max(0, data.offsets.length - end) * lineHeight}px`;
    } else {
      highlight.style.transform = `translate(${-editor.scrollLeft}px, ${-editor.scrollTop}px)`;
      numbers.style.removeProperty('padding-top');
      numbers.style.removeProperty('padding-bottom');
    }
    numbers.scrollTop = editor.scrollTop;
    if (editor === input && !compareMode && !codeMode) renderFoldControls();
  }

  function syncVisualScroll(editor, highlight, numbers) {
    if (lineIndex(editor).large) updateEditor(editor, highlight, numbers);
    else {
      highlight.style.transform = `translate(${-editor.scrollLeft}px, ${-editor.scrollTop}px)`;
      numbers.scrollTop = editor.scrollTop;
      if (editor === input && !compareMode && !codeMode) renderFoldControls();
    }
  }

  function bracketPairsFor(editor) {
    const cached = bracketCache.get(editor);
    if (cached?.text === editor.value) return cached.pairs;
    const pairs = new Map();
    window.JsonBoardEditor.buildBracketPairs(editor.value).forEach(([opening, closing]) => {
      pairs.set(opening, closing);
      pairs.set(closing, opening);
    });
    bracketCache.set(editor, { text: editor.value, pairs });
    return pairs;
  }

  function clearBracketHighlight(highlight) {
    highlight.querySelectorAll('.matching-bracket').forEach(token => token.classList.remove('matching-bracket'));
  }

  function enableBracketHover(editor, highlight) {
    highlight.addEventListener('pointerover', event => {
      const token = event.target.closest('.bracket-token');
      if (!token) return;
      clearBracketHighlight(highlight);
      const offset = Number(token.dataset.bracketOffset);
      const pairOffset = bracketPairsFor(editor).get(offset);
      if (!Number.isFinite(pairOffset)) return;
      token.classList.add('matching-bracket');
      highlight.querySelector(`[data-bracket-offset="${pairOffset}"]`)?.classList.add('matching-bracket');
    });
    highlight.addEventListener('pointerout', event => {
      if (!event.target.closest('.bracket-token')) return;
      clearBracketHighlight(highlight);
    });
    highlight.addEventListener('pointerdown', event => {
      const token = event.target.closest('.bracket-token');
      if (!token) return;
      event.preventDefault();
      const offset = Number(token.dataset.bracketOffset);
      editor.focus({ preventScroll: true });
      editor.setSelectionRange(offset, offset);
    });
  }

  function findFoldRanges(text) {
    const ranges = [];
    const stack = [];
    let line = 0;
    let column = 0;
    let quote = '';
    let escaped = false;
    let lineComment = false;
    let blockComment = false;

    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];
      const next = text[index + 1];
      if (character === '\n') {
        line += 1;
        column = 0;
        lineComment = false;
        continue;
      }
      if (lineComment) { column += 1; continue; }
      if (blockComment) {
        if (character === '*' && next === '/') { blockComment = false; index += 1; column += 2; }
        else column += 1;
        continue;
      }
      if (quote) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === quote) quote = '';
        column += 1;
        continue;
      }
      if (character === '/' && next === '/') { lineComment = true; index += 1; column += 2; continue; }
      if (character === '/' && next === '*') { blockComment = true; index += 1; column += 2; continue; }
      const activeArray = stack.at(-1)?.character === '[' ? stack.at(-1) : null;
      if (activeArray && character !== ']') {
        if (character === ',') {
          if (activeArray.hasValue) activeArray.itemCount += 1;
          activeArray.hasValue = false;
        } else if (!/\s/.test(character)) activeArray.hasValue = true;
      }
      if (character === '"' || character === "'" || character === '`') { quote = character; column += 1; continue; }
      if (character === '{' || character === '[') stack.push({ character, line, column, offset: index, itemCount: 0, hasValue: false });
      if (character === '}' || character === ']') {
        const expected = character === '}' ? '{' : '[';
        let opening = stack.pop();
        while (opening && opening.character !== expected) opening = stack.pop();
        if (opening && line > opening.line) {
          ranges.push({
            startLine: opening.line,
            endLine: line,
            openColumn: opening.column,
            closeColumn: column,
            startOffset: opening.offset,
            endOffset: index + 1,
            opening: opening.character,
            closing: character,
            itemCount: opening.character === '[' ? opening.itemCount + (opening.hasValue ? 1 : 0) : null
          });
        }
      }
      column += 1;
    }
    return ranges.sort((first, second) => first.startLine - second.startLine || second.endLine - first.endLine);
  }

  function currentPrimaryText() {
    return foldedStarts.size ? foldSourceText : input.value;
  }

  function scheduleFoldScan() {
    clearTimeout(foldTimer);
    if (compareMode || codeMode) { foldControls.replaceChildren(); return; }
    const text = currentPrimaryText();
    const scan = () => {
      if (text !== currentPrimaryText()) return;
      foldRanges = findFoldRanges(text);
      renderFoldControls();
    };
    foldTimer = setTimeout(() => {
      if ('requestIdleCallback' in window && text.length > LARGE_TEXT_LENGTH) requestIdleCallback(scan, { timeout: 600 });
      else scan();
    }, text.length > LARGE_TEXT_LENGTH ? 240 : 80);
  }

  function renderFoldControls() {
    foldControls.replaceChildren();
    if (compareMode || codeMode || !foldRanges.length) return;
    const lineHeight = Number.parseFloat(getComputedStyle(input).lineHeight) || 22.4;
    const topPadding = Number.parseFloat(getComputedStyle(input).paddingTop) || 22;
    const characterWidth = Number.parseFloat(getComputedStyle(input).fontSize) * .602;
    const viewportTop = input.scrollTop - lineHeight;
    const viewportBottom = input.scrollTop + input.clientHeight + lineHeight;
    const sourceLines = currentPrimaryText().split('\n');
    const rows = foldedStarts.size
      ? foldRows
      : foldRanges.map(range => ({ displayLine: range.startLine, fullLine: range.startLine, range, collapsed: false }));
    const fragment = document.createDocumentFragment();

    rows.forEach(row => {
      const y = topPadding + row.displayLine * lineHeight;
      if (y < viewportTop || y > viewportBottom) return;
      const indent = sourceLines[row.fullLine]?.match(/^\s*/)?.[0].length || 0;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `fold-button${row.collapsed ? ' collapsed' : ''}`;
      button.textContent = row.collapsed ? '+' : '−';
      const countDescription = row.range.opening === '[' ? `（${row.range.itemCount} 项）` : '';
      button.title = `${row.collapsed ? '展开' : '折叠'}片段${countDescription}`;
      button.setAttribute('aria-label', `${row.collapsed ? '展开' : '折叠'}第 ${row.fullLine + 1} 行片段${countDescription}`);
      button.style.top = `${y - input.scrollTop + (lineHeight - 17) / 2}px`;
      button.style.left = `${Math.max(2, 18 + indent * characterWidth - 22 - input.scrollLeft)}px`;
      button.dataset.foldLine = String(row.fullLine);
      fragment.append(button);

      const copyLeft = 18 + indent * characterWidth - 41 - input.scrollLeft;
      if (copyLeft >= 1) {
        const copyButton = document.createElement('button');
        copyButton.type = 'button';
        copyButton.className = 'fragment-copy-button';
        copyButton.innerHTML = '<svg viewBox="0 0 18 18" aria-hidden="true"><rect x="6" y="6" width="8" height="9" rx="1"/><path d="M12 6V3H3v9h3"/></svg>';
        const fragmentType = row.range.opening === '[' ? '数组' : '对象';
        const countDescription = row.range.opening === '[' ? `（${row.range.itemCount} 项）` : '';
        copyButton.title = `复制当前${fragmentType}${countDescription}`;
        copyButton.setAttribute('aria-label', `复制第 ${row.fullLine + 1} 行${fragmentType}${countDescription}`);
        copyButton.style.top = `${y - input.scrollTop + (lineHeight - 17) / 2}px`;
        copyButton.style.left = `${copyLeft}px`;
        copyButton.dataset.copyStart = String(row.range.startOffset);
        copyButton.dataset.copyEnd = String(row.range.endOffset);
        copyButton.dataset.copyType = fragmentType;
        fragment.append(copyButton);
      }
    });
    foldControls.append(fragment);
  }

  function renderFoldedView({ preserveScroll = true } = {}) {
    const source = foldSourceText;
    const lines = source.split('\n');
    const rangeByStart = new Map();
    foldRanges.forEach(range => {
      if (!rangeByStart.has(range.startLine)) rangeByStart.set(range.startLine, range);
    });
    const output = [];
    foldRows = [];
    foldDisplayMap = [];
    let fullLine = 0;
    while (fullLine < lines.length) {
      const range = rangeByStart.get(fullLine);
      const displayLine = output.length;
      if (range && foldedStarts.has(fullLine)) {
        const prefix = lines[fullLine].slice(0, range.openColumn + 1);
        const suffix = lines[range.endLine].slice(range.closeColumn);
        const countLabel = range.opening === '[' ? ` ${range.itemCount} 项` : '';
        output.push(`${prefix} …${countLabel} ${suffix}`);
        foldRows.push({ displayLine, fullLine, range, collapsed: true });
        foldDisplayMap.push({ fullLine, range, collapsed: true });
        fullLine = range.endLine + 1;
      } else {
        output.push(lines[fullLine]);
        foldDisplayMap.push({ fullLine, collapsed: false });
        if (range) foldRows.push({ displayLine, fullLine, range, collapsed: false });
        fullLine += 1;
      }
    }
    const previousScroll = input.scrollTop;
    input.value = output.join('\n');
    editorCache.delete(input);
    updateEditor(input, primaryHighlight, lineNumbers);
    if (preserveScroll) input.scrollTop = previousScroll;
    renderFoldControls();
    scheduleSave();
  }

  function toggleFold(fullLine) {
    if (!foldedStarts.size) foldSourceText = input.value;
    foldRanges = findFoldRanges(foldSourceText);
    if (foldedStarts.has(fullLine)) foldedStarts.delete(fullLine);
    else foldedStarts.add(fullLine);
    if (!foldedStarts.size) {
      input.value = foldSourceText;
      foldSourceText = '';
      foldRows = [];
      foldDisplayMap = [];
      editorCache.delete(input);
      updateEditor(input, primaryHighlight, lineNumbers);
      scheduleFoldScan();
      scheduleSave();
      return;
    }
    renderFoldedView();
  }

  function sourceOffsetForDisplayOffset(displayOffset) {
    const before = input.value.slice(0, displayOffset);
    const displayLine = before.split('\n').length - 1;
    const column = displayOffset - before.lastIndexOf('\n') - 1;
    const mapping = foldDisplayMap[displayLine] || { fullLine: displayLine, collapsed: false };
    const sourceLines = foldSourceText.split('\n');
    let fullLine = mapping.fullLine;
    let fullColumn = column;
    if (mapping.collapsed && column > mapping.range.openColumn + 1) {
      fullLine = mapping.range.endLine;
      fullColumn = mapping.range.closeColumn;
    }
    let offset = 0;
    for (let line = 0; line < fullLine; line += 1) offset += sourceLines[line].length + 1;
    return offset + Math.min(fullColumn, sourceLines[fullLine]?.length || 0);
  }

  function expandAllFolds({ preserveSelection = false } = {}) {
    if (!foldedStarts.size) return;
    const selectionStart = preserveSelection ? sourceOffsetForDisplayOffset(input.selectionStart) : 0;
    const selectionEnd = preserveSelection ? sourceOffsetForDisplayOffset(input.selectionEnd) : selectionStart;
    input.value = foldSourceText;
    foldSourceText = '';
    foldedStarts.clear();
    foldRows = [];
    foldDisplayMap = [];
    editorCache.delete(input);
    updateEditor(input, primaryHighlight, lineNumbers);
    if (preserveSelection) input.setSelectionRange(selectionStart, selectionEnd);
    scheduleFoldScan();
    scheduleSave();
  }

  function collapseAllFolds() {
    if (compareMode) return;
    expandAllFolds();
    foldSourceText = input.value;
    foldRanges = findFoldRanges(foldSourceText);
    if (!foldRanges.length) {
      announce('没有可折叠的片段');
      return;
    }
    const root = foldRanges.find(range => range.startLine === 0)
      || foldRanges.reduce((outer, range) => range.startOffset < outer.startOffset ? range : outer);
    const directChildren = foldRanges.filter(range => {
      if (range === root || range.startOffset <= root.startOffset || range.endOffset >= root.endOffset) return false;
      return !foldRanges.some(parent => parent !== root && parent !== range
        && parent.startOffset < range.startOffset && parent.endOffset > range.endOffset);
    });
    const targets = directChildren.length ? directChildren : foldRanges.filter(range => range !== root);
    targets.forEach(range => foldedStarts.add(range.startLine));
    if (!foldedStarts.size) {
      foldSourceText = '';
      announce('没有可折叠的内层片段');
      return;
    }
    renderFoldedView({ preserveScroll: false });
    input.scrollTop = 0;
    announce(`已折叠 ${foldedStarts.size} 个片段`);
  }

  function announce(message) {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add('show');
    toastTimer = setTimeout(() => toast.classList.remove('show'), 1500);
  }

  function searchMatches(editor, query) {
    if (!query) return [];
    const matches = [];
    let offset = 0;
    while (offset <= editor.value.length - query.length) {
      const found = editor.value.indexOf(query, offset);
      if (found < 0) break;
      matches.push(found);
      offset = found + Math.max(1, query.length);
    }
    return matches;
  }

  function prepareSearchEditor() {
    if (activeEditor === compareInput && !compareMode) activeEditor = input;
    if (activeEditor === input && foldedStarts.size) expandAllFolds({ preserveSelection: true });
    replaceTarget.textContent = activeEditor === compareInput ? '新文本' : '当前文本';
    return activeEditor;
  }

  function lineAtOffset(offsets, position) {
    let low = 0;
    let high = offsets.length - 1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      if (offsets[middle] <= position) low = middle + 1;
      else high = middle - 1;
    }
    return Math.max(0, high);
  }

  function visualColumn(text, start, end) {
    let column = 0;
    for (let index = start; index < end; index += 1) {
      column += text.charCodeAt(index) === 9 ? 2 - (column % 2) : 1;
    }
    return column;
  }

  function clearSearchHighlights() {
    primarySearchHighlights.replaceChildren();
    compareSearchHighlights.replaceChildren();
  }

  function renderSearchHighlights(matches, selectedIndex = currentSearchIndex) {
    clearSearchHighlights();
    const query = findText.value;
    if (replacePanel.hidden || !query || !matches.length) return;

    const editor = prepareSearchEditor();
    const container = editor === compareInput ? compareSearchHighlights : primarySearchHighlights;
    const data = lineIndex(editor);
    const style = getComputedStyle(editor);
    const lineHeight = Number.parseFloat(style.lineHeight) || 22.4;
    const paddingTop = Number.parseFloat(style.paddingTop) || 6;
    const paddingLeft = Number.parseFloat(style.paddingLeft) || 18;
    const characterWidth = Number.parseFloat(style.fontSize) * .602;
    const firstLine = Math.max(0, Math.floor((editor.scrollTop - paddingTop) / lineHeight) - 1);
    const lastLine = Math.min(data.offsets.length - 1, firstLine + Math.ceil(editor.clientHeight / lineHeight) + 3);
    const fragment = document.createDocumentFragment();

    matches.forEach((matchStart, matchIndex) => {
      const matchEnd = matchStart + query.length;
      let segmentStart = matchStart;
      while (segmentStart < matchEnd) {
        const line = lineAtOffset(data.offsets, segmentStart);
        const lineStart = data.offsets[line];
        const nextLineStart = data.offsets[line + 1] ?? data.text.length;
        const lineEnd = nextLineStart > lineStart && data.text[nextLineStart - 1] === '\n'
          ? nextLineStart - 1
          : nextLineStart;
        const segmentEnd = Math.min(matchEnd, lineEnd);
        if (line >= firstLine && line <= lastLine && segmentEnd > segmentStart) {
          const startColumn = visualColumn(data.text, lineStart, segmentStart);
          const endColumn = visualColumn(data.text, lineStart, segmentEnd);
          const marker = document.createElement('span');
          marker.className = `search-hit${matchIndex === selectedIndex ? ' current' : ''}`;
          marker.style.top = `${paddingTop + line * lineHeight - editor.scrollTop}px`;
          marker.style.left = `${paddingLeft + startColumn * characterWidth - editor.scrollLeft}px`;
          marker.style.width = `${Math.max(characterWidth, (endColumn - startColumn) * characterWidth)}px`;
          fragment.append(marker);
        }
        if (segmentEnd >= matchEnd) break;
        segmentStart = nextLineStart > segmentStart ? nextLineStart : segmentStart + 1;
      }
    });
    container.append(fragment);
  }

  function refreshSearchHighlights() {
    if (replacePanel.hidden) {
      clearSearchHighlights();
      return;
    }
    const matches = searchMatches(prepareSearchEditor(), findText.value);
    if (!matches.length) currentSearchIndex = -1;
    else currentSearchIndex = Math.min(Math.max(0, currentSearchIndex), matches.length - 1);
    updateFindPosition(matches, currentSearchIndex);
  }

  function updateFindPosition(matches, selectedIndex = -1) {
    currentSearchIndex = matches.length ? Math.min(Math.max(0, selectedIndex), matches.length - 1) : -1;
    findPosition.textContent = matches.length ? `${Math.max(0, selectedIndex) + 1} / ${matches.length}` : '0 / 0';
    const disabled = !matches.length;
    previousMatch.disabled = disabled;
    nextMatch.disabled = disabled;
    replaceCurrent.disabled = disabled;
    replaceAll.disabled = disabled;
    renderSearchHighlights(matches, currentSearchIndex);
  }

  function selectMatch(direction = 1, fromQueryInput = false, focusEditor = false) {
    const editor = prepareSearchEditor();
    const query = findText.value;
    const matches = searchMatches(editor, query);
    if (!matches.length) {
      updateFindPosition(matches);
      return -1;
    }
    let selectedIndex;
    if (fromQueryInput) {
      selectedIndex = matches.findIndex(position => position >= editor.selectionStart);
      if (selectedIndex < 0) selectedIndex = 0;
    } else if (direction > 0) {
      selectedIndex = matches.findIndex(position => position >= editor.selectionEnd);
      if (selectedIndex < 0) selectedIndex = 0;
    } else {
      selectedIndex = matches.findLastIndex(position => position < editor.selectionStart);
      if (selectedIndex < 0) selectedIndex = matches.length - 1;
    }
    const position = matches[selectedIndex];
    if (focusEditor) editor.focus({ preventScroll: true });
    editor.setSelectionRange(position, position + query.length);
    const lineHeight = Number.parseFloat(getComputedStyle(editor).lineHeight) || 22.4;
    const line = editor.value.slice(0, position).split('\n').length - 1;
    editor.scrollTop = Math.max(0, line * lineHeight - editor.clientHeight * .38);
    editor.dispatchEvent(new Event('scroll'));
    updateFindPosition(matches, selectedIndex);
    return selectedIndex;
  }

  function openReplacePanel() {
    prepareSearchEditor();
    replacePanel.hidden = false;
    replaceButton.classList.add('active');
    replaceButton.setAttribute('aria-pressed', 'true');
    requestAnimationFrame(() => {
      findText.focus();
      findText.select();
      selectMatch(1, true, false);
    });
  }

  function closeReplacePanel() {
    replacePanel.hidden = true;
    replaceButton.classList.remove('active');
    replaceButton.setAttribute('aria-pressed', 'false');
    currentSearchIndex = -1;
    clearSearchHighlights();
    prepareSearchEditor().focus();
  }

  function replaceSelectedMatch() {
    const editor = prepareSearchEditor();
    const query = findText.value;
    if (!query) return;
    const selected = editor.value.slice(editor.selectionStart, editor.selectionEnd);
    if (selected !== query) {
      if (selectMatch(1, true) < 0) return;
    }
    const start = editor.selectionStart;
    editor.setRangeText(replaceText.value, start, editor.selectionEnd, 'end');
    editor.dispatchEvent(new Event('input'));
    editor.setSelectionRange(start, start);
    selectMatch(1);
  }

  function replaceEveryMatch() {
    const editor = prepareSearchEditor();
    const query = findText.value;
    const matches = searchMatches(editor, query);
    if (!matches.length) return;
    editor.value = editor.value.split(query).join(replaceText.value);
    editor.dispatchEvent(new Event('input'));
    editor.setSelectionRange(0, 0);
    updateFindPosition([]);
    announce(`已替换 ${matches.length} 处`);
  }

  function openStateDatabase() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) { reject(new Error('IndexedDB unavailable')); return; }
      const request = indexedDB.open(DATABASE_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('state');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function readLargeState() {
    const database = await openStateDatabase();
    return new Promise((resolve, reject) => {
      const request = database.transaction('state', 'readonly').objectStore('state').get('current');
      request.onsuccess = () => { database.close(); resolve(request.result || null); };
      request.onerror = () => { database.close(); reject(request.error); };
    });
  }

  async function writeLargeState(state) {
    const database = await openStateDatabase();
    await new Promise((resolve, reject) => {
      const transaction = database.transaction('state', 'readwrite');
      transaction.objectStore('state').put(state, 'current');
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();
  }

  async function clearLargeState() {
    try {
      const database = await openStateDatabase();
      const transaction = database.transaction('state', 'readwrite');
      transaction.objectStore('state').delete('current');
      transaction.oncomplete = () => database.close();
      transaction.onerror = () => database.close();
    } catch (_) { /* 无历史大文件状态 */ }
  }

  async function loadState() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!value || typeof value !== 'object') return null;
      if (value.largeState) {
        try {
          const databaseState = await readLargeState();
          if (databaseState) return databaseState;
        } catch (_) { /* file:// 下 IndexedDB 可能不可用，继续读取压缩备份 */ }
        if (typeof value.compressedState === 'string') {
          try { return JSON.parse(await decompressState(value.compressedState)); }
          catch (_) { /* 压缩备份损坏时仅恢复可用的界面设置 */ }
        }
      }
      return value;
    } catch (_) {
      return null;
    }
  }

  function bytesToBase64(bytes) {
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 32768) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
    }
    return btoa(binary);
  }

  function base64ToBytes(value) {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  async function compressState(value) {
    if (!('CompressionStream' in window)) throw new Error('CompressionStream unavailable');
    const stream = new Blob([value]).stream().pipeThrough(new CompressionStream('gzip'));
    return bytesToBase64(new Uint8Array(await new Response(stream).arrayBuffer()));
  }

  async function decompressState(value) {
    if (!('DecompressionStream' in window)) throw new Error('DecompressionStream unavailable');
    const stream = new Blob([base64ToBytes(value)]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).text();
  }

  async function persistLargeState(state, revision) {
    const serialized = JSON.stringify(state);
    const tasks = [writeLargeState(state).catch(() => null)];
    tasks.push(compressState(serialized).then(compressedState => {
      if (revision !== persistRevision) return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        largeState: true,
        compressedState,
        compareMode: state.compareMode,
        codeMode: state.codeMode,
        lineNumbers: state.lineNumbers,
        hideNullValues: state.hideNullValues,
        split: state.split,
        foldedLines: state.foldedLines
      }));
    }).catch(() => null));
    await Promise.all(tasks);
  }

  function saveState() {
    clearTimeout(persistTimer);
    const revision = ++persistRevision;
    const fullPrimaryText = currentPrimaryText();
    const state = {
      leftText: hideNullValues ? canonicalText : fullPrimaryText,
      canonicalText: hideNullValues ? canonicalText : fullPrimaryText,
      filteredText: hideNullValues ? fullPrimaryText : '',
      rightText: compareInput.value,
      compareMode,
      codeMode,
      lineNumbers: document.body.classList.contains('show-lines'),
      hideNullValues,
      split: Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--split')) || 50,
      foldedLines: compareMode ? [] : [...foldedStarts]
    };
    try {
      const serialized = JSON.stringify(state);
      if (serialized.length > LOCAL_STORAGE_TEXT_LIMIT) {
        // 先尝试同步写入，刷新发生得再快也能恢复；超出配额时再依赖双重异步备份。
        try { localStorage.setItem(STORAGE_KEY, serialized); } catch (_) { /* 保留上一份完整快照 */ }
        void persistLargeState(state, revision);
      } else {
        localStorage.setItem(STORAGE_KEY, serialized);
        void clearLargeState();
      }
    } catch (_) { /* file:// 隐私模式或超大文本时可能无法持久化 */ }
  }

  function scheduleSave() {
    clearTimeout(persistTimer);
    const size = currentPrimaryText().length + compareInput.value.length;
    persistTimer = setTimeout(saveState, size > LARGE_TEXT_LENGTH ? 180 : 80);
  }

  function renderDiagnostic(problem, { force = false } = {}) {
    currentDiagnostic = problem;
    if (!problem || problem.valid) {
      errorCard.hidden = true;
      return;
    }
    if (!force && dismissedDiagnosticText === currentPrimaryText()) return;
    errorLocation.textContent = `第 ${problem.line} 行 · 第 ${problem.column} 列`;
    errorMessage.textContent = problem.message;
    errorSuggestion.textContent = `建议：${problem.suggestion}`;
    errorCard.hidden = false;
  }

  function runDiagnostics({ force = false } = {}) {
    clearTimeout(diagnosticTimer);
    if (compareMode || codeMode) {
      renderDiagnostic(null);
      return { valid: true };
    }
    const text = currentPrimaryText();
    if (!text.trim()) {
      renderDiagnostic(null);
      return { valid: true, empty: true };
    }
    const result = window.JsonDiagnostics.analyze(text);
    renderDiagnostic(result, { force });
    return result;
  }

  function scheduleDiagnostics() {
    clearTimeout(diagnosticTimer);
    if (compareMode || codeMode) { renderDiagnostic(null); return; }
    const delay = currentPrimaryText().length > LARGE_TEXT_LENGTH ? 850 : 420;
    diagnosticTimer = setTimeout(runDiagnostics, delay);
  }

  function showError() {
    runDiagnostics({ force: true });
  }

  function locateCurrentDiagnostic() {
    if (!currentDiagnostic || currentDiagnostic.valid) return;
    if (foldedStarts.size) expandAllFolds();
    const position = Math.min(currentDiagnostic.index, input.value.length);
    const length = Math.max(1, currentDiagnostic.length || 1);
    const lineHeight = Number.parseFloat(getComputedStyle(input).lineHeight) || 22.4;
    input.focus({ preventScroll: true });
    input.setSelectionRange(position, Math.min(input.value.length, position + length));
    input.scrollTop = Math.max(0, (currentDiagnostic.line - 1) * lineHeight - input.clientHeight * .38);
    syncVisualScroll(input, primaryHighlight, lineNumbers);
  }

  function validateJson({ quiet = true } = {}) {
    errorCard.hidden = true;
    const text = currentPrimaryText();
    if (!text.trim()) return null;
    try {
      return JSON.parse(text);
    } catch (error) {
      showError();
      if (!quiet) announce('JSON 格式有误');
      return null;
    }
  }

  function stripNulls(value) {
    if (Array.isArray(value)) return value.map(stripNulls);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value)
        .filter(([, child]) => child !== null)
        .map(([key, child]) => [key, stripNulls(child)]));
    }
    return value;
  }

  function formatInWorker(text) {
    return new Promise((resolve, reject) => {
      const workerSource = `self.onmessage = event => {
        try { self.postMessage({ text: JSON.stringify(JSON.parse(event.data), null, 4) }); }
        catch (error) { self.postMessage({ error: error.message || String(error) }); }
      };`;
      const url = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
      const worker = new Worker(url);
      worker.onmessage = event => {
        worker.terminate();
        URL.revokeObjectURL(url);
        if (event.data.error) reject(new Error(event.data.error));
        else resolve(event.data.text);
      };
      worker.onerror = event => {
        worker.terminate();
        URL.revokeObjectURL(url);
        reject(new Error(event.message || '格式化失败'));
      };
      worker.postMessage(text);
    });
  }

  function mergePreservingNulls(original, edited) {
    if (Array.isArray(edited)) {
      const oldArray = Array.isArray(original) ? original : [];
      return edited.map((item, index) => mergePreservingNulls(oldArray[index], item));
    }
    if (edited && typeof edited === 'object') {
      const oldObject = original && typeof original === 'object' && !Array.isArray(original) ? original : {};
      const result = {};
      Object.entries(edited).forEach(([key, value]) => {
        result[key] = mergePreservingNulls(oldObject[key], value);
      });
      Object.entries(oldObject).forEach(([key, value]) => {
        if (value === null && !Object.prototype.hasOwnProperty.call(result, key)) result[key] = null;
      });
      return result;
    }
    return edited;
  }

  function syncCanonicalFromFiltered() {
    if (!hideNullValues) {
      canonicalText = currentPrimaryText();
      return true;
    }
    try {
      const original = canonicalText.trim() ? JSON.parse(canonicalText) : {};
      const filtered = currentPrimaryText();
      const edited = filtered.trim() ? JSON.parse(filtered) : {};
      canonicalText = JSON.stringify(mergePreservingNulls(original, edited), null, 4);
      return true;
    } catch (_) {
      return false;
    }
  }

  function toggleNullValues(button) {
    expandAllFolds();
    if (!hideNullValues) {
      const parsed = validateJson({ quiet: false });
      if (parsed === null && currentPrimaryText().trim() !== 'null') return;
      canonicalText = input.value;
      input.value = JSON.stringify(stripNulls(parsed), null, 4);
      hideNullValues = true;
    } else {
      if (!syncCanonicalFromFiltered()) {
        announce('请先修正 JSON，再显示 null');
        return;
      }
      hideNullValues = false;
      input.value = canonicalText;
    }
    button.classList.toggle('active', hideNullValues);
    button.setAttribute('aria-pressed', String(hideNullValues));
    button.setAttribute('aria-label', hideNullValues ? '显示值为 null 的键值' : '隐藏值为 null 的键值');
    button.title = hideNullValues ? '显示 null 值' : '隐藏 null 值';
    errorCard.hidden = true;
    updateEditor(input, primaryHighlight, lineNumbers);
    scheduleFoldScan();
    if (compareMode) updateDiff();
    scheduleSave();
    announce(hideNullValues ? '已隐藏 null 键值' : '已显示 null 键值');
  }

  async function formatJson({ announceResult = true } = {}) {
    if (codeMode) return false;
    expandAllFolds();
    const source = currentPrimaryText();
    if (source.length > LARGE_TEXT_LENGTH) {
      errorCard.hidden = true;
      if (announceResult) announce('正在后台格式化大文件…');
      try {
        const formatted = await formatInWorker(source);
        if (currentPrimaryText() !== source) return false;
        input.value = formatted;
        editorCache.delete(input);
        if (hideNullValues) syncCanonicalFromFiltered();
        else canonicalText = input.value;
        updateEditor(input, primaryHighlight, lineNumbers);
        scheduleFoldScan();
        scheduleSave();
        if (announceResult) announce('格式化完成');
        return true;
      } catch (error) {
        showError();
        if (announceResult) announce('JSON 格式有误');
        return false;
      }
    }
    const parsed = validateJson({ quiet: !announceResult });
    if (parsed === null && currentPrimaryText().trim() !== 'null') return false;
    input.value = JSON.stringify(parsed, null, 4);
    if (hideNullValues) syncCanonicalFromFiltered();
    else canonicalText = input.value;
    updateEditor(input, primaryHighlight, lineNumbers);
    scheduleFoldScan();
    scheduleSave();
    if (announceResult) announce('格式化完成');
    return true;
  }

  function autoFormatCompactJson() {
    if (compareMode || codeMode) return;
    const raw = input.value.trim();
    if (!raw) {
      renderDiagnostic(null);
      return;
    }
    if (raw.length > LARGE_TEXT_LENGTH) {
      if (!largeFileNoticeShown) {
        largeFileNoticeShown = true;
        announce('大文件已启用极速渲染，按 ⌘/Ctrl + Enter 格式化');
      }
      scheduleFoldScan();
      scheduleDiagnostics();
      return;
    }
    if (!raw.includes('\n')) void formatJson({ announceResult: false });
    else scheduleDiagnostics();
  }

  async function copyText() {
    const text = currentPrimaryText();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      input.select();
      document.execCommand('copy');
      input.setSelectionRange(0, 0);
    }
    announce('已复制');
  }

  async function copyFragment(start, end, type) {
    const text = currentPrimaryText().slice(start, end);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      const helper = document.createElement('textarea');
      helper.value = text;
      helper.style.position = 'fixed';
      helper.style.opacity = '0';
      document.body.append(helper);
      helper.select();
      document.execCommand('copy');
      helper.remove();
    }
    announce(`已复制${type}`);
  }

  function renderDiffLines(container, statuses) {
    const fragment = document.createDocumentFragment();
    statuses.forEach(status => {
      const line = document.createElement('div');
      line.className = `diff-line ${status}`;
      fragment.append(line);
    });
    container.replaceChildren(fragment);
  }

  function clearDiff() {
    leftDiffLines.replaceChildren();
    rightDiffLines.replaceChildren();
    addedCount.textContent = '0';
    removedCount.textContent = '0';
    modifiedCount.textContent = '0';
    diffMessage.textContent = '粘贴文本后自动对比';
    diffChanges = [];
    currentChangeIndex = -1;
    updateDiffNavigation();
  }

  function updateDiffNavigation() {
    const hasChanges = diffChanges.length > 0;
    previousChange.disabled = !hasChanges;
    nextChange.disabled = !hasChanges;
    changePosition.textContent = `${currentChangeIndex >= 0 ? currentChangeIndex + 1 : 0} / ${diffChanges.length}`;
  }

  function updateDiff() {
    updateEditor(input, primaryHighlight, lineNumbers);
    updateEditor(compareInput, compareHighlight, compareLineNumbers);
    if (!compareMode || !compareInput.value) {
      clearDiff();
      return;
    }
    const diff = window.JsonBoardDiff.lineDiff(currentPrimaryText(), compareInput.value);
    renderDiffLines(leftDiffLines, diff.leftStatus);
    renderDiffLines(rightDiffLines, diff.rightStatus);
    const added = diff.rightStatus.filter(status => status === 'added').length;
    const removed = diff.leftStatus.filter(status => status === 'removed').length;
    const modified = diff.leftStatus.filter(status => status === 'modified').length;
    addedCount.textContent = String(added);
    removedCount.textContent = String(removed);
    modifiedCount.textContent = String(modified);
    const total = added + removed + modified;
    diffMessage.textContent = total === 0 ? '文本完全一致' : `发现 ${total} 处行级差异`;
    diffChanges = diff.changes;
    currentChangeIndex = -1;
    updateDiffNavigation();
    syncDiffScroll();
  }

  function syncDiffScroll() {
    leftDiffLines.style.transform = `translateY(${-input.scrollTop}px)`;
    rightDiffLines.style.transform = `translateY(${-compareInput.scrollTop}px)`;
  }

  function markCurrentChange(change) {
    document.querySelectorAll('.diff-line.current-change').forEach(line => line.classList.remove('current-change'));
    if (!change) return;
    if (change.leftStart !== null) {
      for (let index = change.leftStart; index <= change.leftEnd; index += 1) leftDiffLines.children[index]?.classList.add('current-change');
    }
    if (change.rightStart !== null) {
      for (let index = change.rightStart; index <= change.rightEnd; index += 1) rightDiffLines.children[index]?.classList.add('current-change');
    }
  }

  function scrollEditorsToChange(change) {
    syncingScroll = true;
    const lineHeight = Number.parseFloat(getComputedStyle(input).lineHeight) || 22.4;
    const visibleHeight = Math.min(input.clientHeight, compareInput.clientHeight);
    input.scrollTop = Math.max(0, (change.leftAnchor ?? 0) * lineHeight - visibleHeight * .36);
    compareInput.scrollTop = Math.max(0, (change.rightAnchor ?? 0) * lineHeight - visibleHeight * .36);
    syncVisualScroll(input, primaryHighlight, lineNumbers);
    syncVisualScroll(compareInput, compareHighlight, compareLineNumbers);
    syncDiffScroll();
    requestAnimationFrame(() => { syncingScroll = false; });
  }

  function goToChange(direction) {
    if (!diffChanges.length) return;
    currentChangeIndex = currentChangeIndex < 0
      ? (direction > 0 ? 0 : diffChanges.length - 1)
      : (currentChangeIndex + direction + diffChanges.length) % diffChanges.length;
    const change = diffChanges[currentChangeIndex];
    markCurrentChange(change);
    updateDiffNavigation();
    scrollEditorsToChange(change);
  }

  function updateModeControls() {
    const jsonToolsDisabled = compareMode || codeMode;
    hideNullButton.disabled = jsonToolsDisabled;
    formatButton.disabled = jsonToolsDisabled;
    collapseAllButton.disabled = jsonToolsDisabled;
    expandAllButton.disabled = jsonToolsDisabled;
  }

  function setCodeMode(enabled, { persist = true, announceResult = true } = {}) {
    if (enabled && hideNullValues) {
      if (!syncCanonicalFromFiltered()) {
        announce('请先修正 JSON，再开启代码模式');
        return false;
      }
      hideNullValues = false;
      input.value = canonicalText;
      hideNullButton.classList.remove('active');
      hideNullButton.setAttribute('aria-pressed', 'false');
      hideNullButton.setAttribute('aria-label', '隐藏值为 null 的键值');
      hideNullButton.title = '隐藏 null 值';
    }
    if (enabled) expandAllFolds();
    codeMode = enabled;
    document.body.classList.toggle('code-mode', enabled);
    codeModeButton.classList.toggle('active', enabled);
    codeModeButton.setAttribute('aria-pressed', String(enabled));
    codeModeButton.setAttribute('aria-label', enabled ? '关闭代码模式' : '开启代码模式');
    codeModeButton.title = enabled ? '关闭代码模式' : '代码模式（自动识别语言）';
    languageBadge.hidden = !enabled;
    updateModeControls();
    renderDiagnostic(null);
    foldControls.replaceChildren();
    updateEditor(input, primaryHighlight, lineNumbers);
    updateEditor(compareInput, compareHighlight, compareLineNumbers);
    if (!enabled && !compareMode) {
      scheduleFoldScan();
      scheduleDiagnostics();
    }
    if (persist) scheduleSave();
    if (announceResult) announce(enabled ? '已开启代码模式，正在自动识别语言' : '已返回 JSON 模式');
    return true;
  }

  function setCompareMode(enabled, { focus = true, persist = true } = {}) {
    if (enabled) expandAllFolds();
    compareMode = enabled;
    workspace.classList.toggle('compare-mode', enabled);
    comparePane.hidden = !enabled;
    splitter.hidden = !enabled;
    compareSummary.hidden = !enabled;
    compareButton.classList.toggle('active', enabled);
    compareButton.setAttribute('aria-pressed', String(enabled));
    compareButton.setAttribute('aria-label', enabled ? '退出文本对比模式' : '进入文本对比模式');
    compareButton.title = enabled ? '退出文本对比' : '文本对比';
    updateModeControls();
    renderDiagnostic(null);
    if (enabled) {
      updateDiff();
      if (focus) requestAnimationFrame(() => compareInput.focus());
    } else {
      clearDiff();
      updateEditor(input, primaryHighlight, lineNumbers);
      if (!codeMode) {
        autoFormatCompactJson();
        scheduleFoldScan();
      }
    }
    if (persist) scheduleSave();
  }

  function toggleLineNumbers(button) {
    const visible = document.body.classList.toggle('show-lines');
    button.classList.toggle('active', visible);
    button.setAttribute('aria-pressed', String(visible));
    button.setAttribute('aria-label', visible ? '隐藏行号' : '显示行号');
    button.title = visible ? '隐藏行号' : '显示行号';
    updateEditor(input, primaryHighlight, lineNumbers);
    updateEditor(compareInput, compareHighlight, compareLineNumbers);
    scheduleSave();
  }

  function handleEditorInput(editor, highlight, numbers) {
    if (!stateRestored) userEditedBeforeRestore = true;
    if (editor === input) dismissedDiagnosticText = '';
    updateEditor(editor, highlight, numbers);
    if (editor === input) {
      if (!hideNullValues) canonicalText = currentPrimaryText();
      clearTimeout(renderTimer);
      renderTimer = setTimeout(() => {
        if (compareMode) updateDiff();
        else if (!codeMode) {
          autoFormatCompactJson();
          scheduleFoldScan();
        }
      }, 180);
    } else {
      clearTimeout(diffTimer);
      diffTimer = setTimeout(updateDiff, 100);
    }
    scheduleSave();
    if (!replacePanel.hidden && editor === activeEditor) refreshSearchHighlights();
  }

  function handleScroll(source, sourceHighlight, sourceNumbers, target, targetHighlight, targetNumbers) {
    syncVisualScroll(source, sourceHighlight, sourceNumbers);
    syncDiffScroll();
    if (!replacePanel.hidden && source === activeEditor) refreshSearchHighlights();
    if (!compareMode || syncingScroll) return;
    syncingScroll = true;
    target.scrollTop = source.scrollTop;
    target.scrollLeft = source.scrollLeft;
    syncVisualScroll(target, targetHighlight, targetNumbers);
    syncDiffScroll();
    requestAnimationFrame(() => { syncingScroll = false; });
  }

  function enableTabInsertion(editor) {
    editor.addEventListener('keydown', event => {
      if (event.key === 'Tab') {
        event.preventDefault();
        editor.setRangeText('  ', editor.selectionStart, editor.selectionEnd, 'end');
        editor.dispatchEvent(new Event('input'));
      }
      if (editor === input && !compareMode && !codeMode && (event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        void formatJson();
      }
    });
  }

  document.querySelector('.toolbar').addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    if (button.dataset.action === 'line-numbers') toggleLineNumbers(button);
    if (button.dataset.action === 'hide-null') toggleNullValues(button);
    if (button.dataset.action === 'copy') copyText();
    if (button.dataset.action === 'collapse-all') collapseAllFolds();
    if (button.dataset.action === 'expand-all') {
      expandAllFolds();
      announce('已展开所有片段');
    }
    if (button.dataset.action === 'replace') {
      if (replacePanel.hidden) openReplacePanel();
      else closeReplacePanel();
    }
    if (button.dataset.action === 'code-mode') setCodeMode(!codeMode);
    if (button.dataset.action === 'format') void formatJson();
    if (button.dataset.action === 'compare') setCompareMode(!compareMode);
  });

  foldControls.addEventListener('click', event => {
    const copyButton = event.target.closest('[data-copy-start]');
    if (copyButton) {
      void copyFragment(Number(copyButton.dataset.copyStart), Number(copyButton.dataset.copyEnd), copyButton.dataset.copyType);
      return;
    }
    const button = event.target.closest('[data-fold-line]');
    if (!button) return;
    toggleFold(Number(button.dataset.foldLine));
  });

  const expandBeforePrimaryEdit = () => expandAllFolds({ preserveSelection: true });
  input.addEventListener('beforeinput', expandBeforePrimaryEdit);
  input.addEventListener('paste', expandBeforePrimaryEdit, { capture: true });
  input.addEventListener('cut', expandBeforePrimaryEdit, { capture: true });
  input.addEventListener('keydown', event => {
    if (!foldedStarts.size) return;
    if (event.key.length === 1 || ['Backspace', 'Delete', 'Enter', 'Tab'].includes(event.key)) expandBeforePrimaryEdit();
  }, { capture: true });
  input.addEventListener('input', () => handleEditorInput(input, primaryHighlight, lineNumbers));
  compareInput.addEventListener('input', () => handleEditorInput(compareInput, compareHighlight, compareLineNumbers));
  input.addEventListener('focus', () => {
    activeEditor = input;
    replaceTarget.textContent = '当前文本';
    if (codeMode) updateLanguageBadge(input, detectCodeLanguage(input, input.value));
    if (!replacePanel.hidden) refreshSearchHighlights();
  });
  compareInput.addEventListener('focus', () => {
    activeEditor = compareInput;
    replaceTarget.textContent = '新文本';
    if (codeMode) updateLanguageBadge(compareInput, detectCodeLanguage(compareInput, compareInput.value));
    if (!replacePanel.hidden) refreshSearchHighlights();
  });
  input.addEventListener('scroll', () => handleScroll(input, primaryHighlight, lineNumbers, compareInput, compareHighlight, compareLineNumbers));
  compareInput.addEventListener('scroll', () => handleScroll(compareInput, compareHighlight, compareLineNumbers, input, primaryHighlight, lineNumbers));
  enableTabInsertion(input);
  enableTabInsertion(compareInput);
  enableBracketHover(input, primaryHighlight);
  enableBracketHover(compareInput, compareHighlight);
  previousChange.addEventListener('click', () => goToChange(-1));
  nextChange.addEventListener('click', () => goToChange(1));
  findText.addEventListener('input', () => selectMatch(1, true, false));
  findText.addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    selectMatch(event.shiftKey ? -1 : 1);
  });
  replaceText.addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    replaceSelectedMatch();
  });
  previousMatch.addEventListener('click', () => selectMatch(-1));
  nextMatch.addEventListener('click', () => selectMatch(1));
  replaceCurrent.addEventListener('click', replaceSelectedMatch);
  replaceAll.addEventListener('click', replaceEveryMatch);
  closeReplace.addEventListener('click', closeReplacePanel);
  document.addEventListener('keydown', event => {
    const shortcut = (event.ctrlKey && !event.metaKey && event.key.toLowerCase() === 'h')
      || (event.metaKey && event.altKey && event.key.toLowerCase() === 'f');
    if (shortcut) {
      event.preventDefault();
      openReplacePanel();
    }
    if (event.key === 'Escape' && !replacePanel.hidden) closeReplacePanel();
  });
  locateError.addEventListener('click', locateCurrentDiagnostic);
  closeErrorCard.addEventListener('click', () => {
    dismissedDiagnosticText = currentPrimaryText();
    errorCard.hidden = true;
  });

  splitter.addEventListener('pointerdown', event => {
    if (window.innerWidth <= 760) return;
    splitter.setPointerCapture(event.pointerId);
    splitter.classList.add('dragging');
    const move = moveEvent => {
      const percent = Math.min(72, Math.max(28, moveEvent.clientX / window.innerWidth * 100));
      document.documentElement.style.setProperty('--split', `${percent}%`);
    };
    const up = () => {
      splitter.classList.remove('dragging');
      splitter.removeEventListener('pointermove', move);
      splitter.removeEventListener('pointerup', up);
      scheduleSave();
    };
    splitter.addEventListener('pointermove', move);
    splitter.addEventListener('pointerup', up);
  });

  splitter.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const current = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--split')) || 50;
    const next = Math.min(72, Math.max(28, current + (event.key === 'ArrowRight' ? 1 : -1)));
    document.documentElement.style.setProperty('--split', `${next}%`);
    scheduleSave();
  });

  const saved = await loadState();
  if (!userEditedBeforeRestore) {
    canonicalText = typeof saved?.canonicalText === 'string'
      ? saved.canonicalText
      : typeof saved?.leftText === 'string' ? saved.leftText : '';
    hideNullValues = Boolean(saved?.hideNullValues);
    input.value = hideNullValues && typeof saved?.filteredText === 'string' && saved.filteredText
      ? saved.filteredText
      : canonicalText;
    compareInput.value = typeof saved?.rightText === 'string' ? saved.rightText : '';
  } else {
    canonicalText = input.value;
    hideNullValues = false;
  }

  if (Number.isFinite(saved?.split)) {
    document.documentElement.style.setProperty('--split', `${Math.min(72, Math.max(28, saved.split))}%`);
  }
  if (saved?.lineNumbers) {
    document.body.classList.add('show-lines');
    lineNumbersButton.classList.add('active');
    lineNumbersButton.setAttribute('aria-pressed', 'true');
    lineNumbersButton.setAttribute('aria-label', '隐藏行号');
    lineNumbersButton.title = '隐藏行号';
  }
  hideNullButton.classList.toggle('active', hideNullValues);
  hideNullButton.setAttribute('aria-pressed', String(hideNullValues));
  hideNullButton.setAttribute('aria-label', hideNullValues ? '显示值为 null 的键值' : '隐藏值为 null 的键值');
  hideNullButton.title = hideNullValues ? '显示 null 值' : '隐藏 null 值';
  if (saved?.codeMode) setCodeMode(true, { persist: false, announceResult: false });
  else updateModeControls();
  updateEditor(input, primaryHighlight, lineNumbers);
  updateEditor(compareInput, compareHighlight, compareLineNumbers);
  // 每次打开默认保持单面板；右侧文本仍会保存，用户点击“文本对比”即可继续。
  if (!codeMode && Array.isArray(saved?.foldedLines) && saved.foldedLines.length) {
    foldSourceText = input.value;
    foldRanges = findFoldRanges(foldSourceText);
    saved.foldedLines.forEach(line => foldedStarts.add(Number(line)));
    renderFoldedView({ preserveScroll: false });
  } else if (!codeMode) scheduleFoldScan();
  if (!codeMode) scheduleDiagnostics();
  stateRestored = true;
  if (userEditedBeforeRestore) saveState();
  window.addEventListener('pagehide', saveState);
  window.addEventListener('beforeunload', saveState);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveState();
  });
})();
