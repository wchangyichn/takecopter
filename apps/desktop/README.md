# takecopter desktop

Desktop/Web 客户端工程。

完整项目说明、交互设计、架构与变更记录：

- `README.md`
- `docs/ARCHITECTURE.md`
- `CHANGELOG.md`

根目录统一平台构建脚本：

```bash
cd ../..
npm run build -- --platform web|macos|windows
```

常用命令：

```bash
npm install
npm run dev
npm run build
npm run lint
npm run tauri:build
```
