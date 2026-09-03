# 贡献指南

感谢你愿意改进 JSON Board。

## 本地开发

项目没有构建步骤和线上依赖，直接打开 `index.html` 即可运行。也可以启动本地服务器：

```bash
npm run serve
```

修改后请运行：

```bash
npm run verify
```

## 提交建议

- 一个提交只处理一个清晰的问题。
- 修复缺陷时同步增加回归测试。
- 不要引入必须联网才能使用的运行时依赖。
- 涉及界面变化时，请更新 `docs/images/` 中对应截图。
- 提交信息建议使用 `feat:`、`fix:`、`docs:`、`test:` 或 `refactor:` 前缀。
