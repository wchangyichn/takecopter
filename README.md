# takecopter

本地优先的故事创作工作台，聚焦「设定管理 + 结构化创作 + 素材关联 + 项目迁移」。

当前仓库已完成 Desktop/Web 主线工程：
- 首页（故事入口）
- 故事页（设定/创作子页）
- 本地 SQLite 数据层
- 项目导入/导出（可迁移）
- Tauri 原生构建（macOS 已验证）

---

## 1. 核心功能

### 首页 Home（最外层入口）
- 创建新故事
- 浏览故事列表（按最近更新时间）
- 快捷操作（导入项目、导出备份）
- 进入故事工作区

### 故事页 Story Workspace

#### 设定页 Setting
- 设定卡片可视化展示
- 设定卡片拖拽定位（位置持久化）
- 关系连线展示
- 详情面板编辑（摘要、关系、标签）

#### 创作页 Create
- 结构树（EP > Scene > Shot > Take）
- 节点新增、标题编辑
- Shot 下选择采用 Take
- 结构变更持久化

### 可迁移能力
- 导出项目为 JSON 文件（含 schemaVersion）
- 导入项目并校验版本兼容性
- 支持旧版本地数据自动迁移

---

## 2. 关键交互设计

- 信息架构：`首页 -> 故事页（设定/创作）`
- 全局保存状态：`Saved / Saving / Error`
- 设定卡片拖拽：按住卡片拖动，松开后写入本地数据库
- 创作节点编辑：输入即更新当前节点并持久化
- Shot 选中 Take：单一采用状态，写入结构树

---

## 3. 工程架构

```text
takecopter/
├─ apps/
│  └─ desktop/
│     ├─ src/                    # React UI + hooks + repositories
│     │  ├─ views/               # Home / Setting / Create
│     │  ├─ components/          # layout + ui 组件
│     │  ├─ hooks/               # app state / project data
│     │  └─ data/                # 仓储层与存储适配层
│     └─ src-tauri/              # Tauri Rust 原生层
├─ docs/plans/                   # 产品与架构计划文档
└─ README.md
```

### 分层说明

1. **UI 层（React）**
   - 页面与组件渲染、交互动效、中文文案
2. **状态/用例层（Hooks）**
   - 统一读取/写入流程、保存状态管理
3. **仓储层（Repository）**
   - 运行时自动切换：Web 仓储 / Tauri 原生仓储
4. **存储层（SQLite）**
   - Web: `sql.js`（WASM）
   - Desktop Native: `rusqlite` + `story.db`

---

## 4. 技术选型

### 前端
- React 19 + TypeScript
- Vite 7
- CSS Modules + 自定义设计 Token

### 数据层
- SQLite（统一数据模型）
- Web 端：`sql.js`
- 存储适配：IndexedDB 优先，localStorage 兜底

### 桌面原生
- Tauri 2
- Rust + rusqlite

### 迁移协议
- `ExportedProjectData`：
  - `app`: 固定 `takecopter`
  - `schemaVersion`
  - `exportedAt`
  - `data`（stories + workspaces）

---

## 5. 分平台实现与构建流程

## 5.1 Web（当前可用）

### 技术实现
- React + Vite
- SQLite via `sql.js`
- 浏览器存储：IndexedDB / localStorage

### 构建流程
```bash
cd apps/desktop
npm install
npm run dev
```

生产构建：
```bash
cd apps/desktop
npm run build
```

---

## 5.2 macOS Desktop（当前可用，已验证）

### 技术实现
- Tauri 壳层 + Rust 命令
- 真实项目目录与数据库文件：
  - `<app_data_dir>/takecopter/default.takecopter/story.db`
  - `<app_data_dir>/takecopter/default.takecopter/.lock`

### 构建流程
```bash
cd apps/desktop
npm install
npm run tauri:build
```

构建产物：
- `apps/desktop/src-tauri/target/release/bundle/macos/takecopter.app`
- `apps/desktop/src-tauri/target/release/bundle/dmg/takecopter_0.1.0_aarch64.dmg`

---

## 5.3 Windows Desktop（可用，需在 Windows 环境构建）

### 技术实现
- 同 macOS：Tauri + Rust + SQLite

### 构建流程（Windows 主机）
```powershell
cd apps/desktop
npm install
npm run tauri:build
```

预期产物：`.msi` 或 `.exe`（取决于环境与打包目标）

---

## 5.4 Android / iOS（架构已预留，待实现）

### 当前状态
- 当前仓库未完成移动端客户端实现。
- 已具备可复用的数据契约与项目导入导出格式，可直接对接 Flutter 或 React Native。

### 推荐落地路径
1. 新建 `apps/mobile`（Flutter 或 RN）
2. 复用项目导入导出协议（`schemaVersion`）
3. 先做浏览/轻编辑，再扩展复杂编辑

---

## 6. 开发与验证命令

### 根目录统一构建脚本（按平台产物）

```bash
# 只构建 Web 产物
npm run build -- --platform web

# 构建 macOS 桌面产物（.app/.dmg）
npm run build -- --platform macos

# 构建 Windows 桌面产物（需 Windows 环境）
npm run build -- --platform windows

# 一次触发多平台
npm run build -- --platform web,macos

# 尝试 all（移动端未实现时可加跳过参数）
npm run build -- --platform all --allow-missing-mobile
```

```bash
cd apps/desktop
npm run lint
npm run build
```

Tauri Rust 检查（需 Rust 环境）：
```bash
cd apps/desktop
cargo check --manifest-path src-tauri/Cargo.toml
```

---

## 7. 已知边界

- 当前默认使用单项目目录（`default.takecopter`）
- 多项目并行管理、项目选择器、冲突锁提示仍可继续增强
- 移动端客户端尚未在本仓库落地

---

## 8. 相关文档

- 产品原型：`docs/plans/2026-02-19-takecopter-v1-product-prototype.md`
- 双端架构草案：`docs/plans/2026-02-19-takecopter-dual-platform-architecture-draft.md`
- 实施计划：`docs/plans/2026-02-19-takecopter-implementation-plan.md`
