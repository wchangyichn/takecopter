# Takecopter Engineering Architecture

## 1) Monorepo Structure

```text
takecopter/
├─ apps/
│  └─ desktop/
│     ├─ src/
│     │  ├─ views/            # Home / Setting / Create 页面
│     │  ├─ components/       # UI 与布局组件
│     │  ├─ hooks/            # 状态与业务编排
│     │  ├─ data/             # Repository 与存储适配
│     │  └─ types/            # 领域模型类型定义
│     └─ src-tauri/           # Rust 原生层（Tauri + SQLite）
├─ docs/
│  ├─ plans/
│  └─ ARCHITECTURE.md
├─ CHANGELOG.md
└─ README.md
```

## 2) Runtime Layers

1. UI Layer (`src/views`, `src/components`)
   - 负责页面编排、交互反馈、可视化表达。
2. Use-case / State Layer (`src/hooks`)
   - 负责读写流程、保存状态、操作编排与一致性。
3. Repository Layer (`src/data`)
   - 统一领域数据访问接口，屏蔽平台差异。
4. Storage Layer
   - Web: `sql.js` + IndexedDB/localStorage。
   - Desktop: Rust `rusqlite` + `story.db`。

## 3) Core Domains

- Story: 故事项目与工作区根对象。
- Setting Card: 设定卡片（固定属性 + 自定义属性 + 关系）。
- Create Tree: EP/Scene/Shot/Take 结构树。
- Library: 全局/故事级 标签、分类、模版。
- AI Assist: 引导、生成、审校、润色、导入结果确认。

## 4) Data Flow (Setting Card)

1. 用户在 UI 触发操作（编辑、拖拽、AI 建议应用）。
2. Hook 生成下一版卡片状态并做局部校验。
3. Repository 持久化到 SQLite。
4. UI 刷新并展示保存状态与结果。

AI 相关操作统一走“建议 -> 差异预览 -> 用户确认 -> 写入”，避免静默覆盖。

## 5) AI Interaction Architecture

- 模型配置：首页设置页按模型保存 API Key。
- 设定编辑页 AI 工作台：
  - 分步引导（问题可按卡片上下文动态生成）
  - 摘要/属性互生
  - 审校 patch
  - 整卡/摘要/单属性润色
  - 外部提示词与导入
- 结果导入支持 `summary` / `field` / `suggestions` / `patch`。
- 所有真正落卡修改必须用户确认。

## 6) Platform Split

- Web
  - 通过 `sql.js` 在浏览器执行 SQLite。
  - 使用本地存储承载项目数据与缓存。
- Desktop (Tauri)
  - Rust 提供文件系统、数据库与系统能力。
  - 项目目录中维护 `story.db` 与锁文件。

## 7) Quality Gates

- Frontend: `npm run lint`, `npm run build`
- Native: `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`
