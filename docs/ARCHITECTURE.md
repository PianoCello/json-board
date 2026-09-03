# 架构说明

JSON Board 是一个无构建步骤、离线优先的浏览器应用。所有运行时代码和依赖都随仓库分发，打开 `index.html` 即可使用。

## 模块

- `index.html`：应用入口和可访问性结构。
- `src/css/app.css`：视觉系统、编辑器图层和响应式布局。
- `src/js/app.js`：模式切换、编辑器状态、持久化和界面交互。
- `src/js/json-diagnostics.js`：中文 JSON 语法诊断。
- `src/js/editor-utils.js`：括号配对等编辑器算法。
- `src/js/diff-utils.js`：锚点式行级差异算法。
- `vendor/highlightjs/`：离线代码高亮运行时及其许可证。

## 编辑器图层

每个编辑面板由同一组等宽字体图层叠加：可编辑的透明 `textarea` 负责输入，语法层负责着色，搜索层和差异层负责背景标记。滚动位置由主输入层统一同步，确保行号、高亮和差异背景保持对齐。

## 数据安全

文本只保存在当前浏览器的 LocalStorage 或 IndexedDB 中，不会上传到网络。超大文本使用视口虚拟化，避免一次生成完整高亮 DOM。
