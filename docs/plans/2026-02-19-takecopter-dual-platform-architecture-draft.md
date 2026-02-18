# takecopter 双端技术架构草案（Desktop + Flutter Mobile）

## 1. 文档定位
- 日期：2026-02-19
- 目标：在不牺牲 Desktop 创作效率的前提下，支持 Mobile 跨端浏览与轻编辑
- 范围：V1（可交付）+ V1.5（可演进）

---

## 2. 关键决策

### 2.1 端技术选型
- Desktop：`Tauri + React + TypeScript + Vite`
- Mobile：`Flutter + Riverpod + go_router + Drift(SQLite)`

### 2.2 架构原则
1. **本地优先**：所有核心数据默认本地落盘，不依赖云端
2. **契约优先**：共享目录结构、SQLite schema、状态语义与字段命名
3. **能力分层**：Desktop 负责重交互创作；Mobile 负责浏览与轻编辑
4. **可迁移**：单项目目录可直接迁移，损坏时有重链接路径
5. **可替换 UI 技术栈**：业务规则不绑定具体前端框架，预留 React Native 能力

---

## 3. 总体架构

```text
┌──────────────────────────────────────────────────────┐
│                .takecopter Project Folder            │
│                                                      │
│  story.db (SQLite) + assets/ + project.json + lock  │
└──────────────────────────────────────────────────────┘
            ▲                              ▲
            │                              │
   Desktop App (Tauri+React)       Mobile App (Flutter)
            │                              │
            └────── Shared Data Contract ──┘
                   (schema + naming + states)
```

说明：
- 双端共享“数据契约”，不共享 UI 层实现。
- 业务扩展先加在契约层，再由各端按能力实现。

---

## 4. 项目目录与文件规范（共享）

```text
<story-name>.takecopter/
├─ project.json
├─ story.db
├─ assets/
│  ├─ images/
│  ├─ videos/
│  └─ thumbs/
├─ exports/
└─ .lock
```

### 4.1 `project.json`（建议字段）
- `project_id`, `title`, `description`
- `schema_version`（用于迁移）
- `created_at`, `updated_at`
- `last_opened_by`（desktop/mobile）

### 4.2 素材规则
- 导入素材默认复制到 `assets/`，数据库仅存相对路径
- 删除引用与删除文件分离，危险操作二次确认
- 缺失素材统一走重链接流程（保留原文件名与 hash 校验）

---

## 5. 共享数据模型（SQLite）

## 5.1 核心实体
- `stories`
- `setting_cards`
- `setting_relations`
- `episodes`
- `scenes`
- `shots`
- `takes`
- `asset_files`
- `node_setting_refs`（EP/Scene/Shot/Take 对设定卡引用）

## 5.2 关键字段约定
- 所有主键：`id TEXT`（UUID/ULID）
- 排序字段：`order_no INTEGER`
- 软删除：`deleted_at INTEGER NULL`
- 审计字段：`created_at`, `updated_at`

## 5.3 索引建议
- `setting_cards(type, updated_at)`
- `setting_relations(from_id, to_id)`
- `scenes(episode_id, order_no)`
- `shots(scene_id, order_no)`
- `takes(shot_id, created_at)`
- `node_setting_refs(setting_card_id)`

## 5.4 全文搜索
- Desktop 必选：SQLite FTS5（卡片标题/正文、Scene/Shot 文本）
- Mobile V1：优先普通 LIKE + 前缀索引；V1.5 再补 FTS5

---

## 6. 双端功能边界（V1 / V1.5）

## 6.1 Desktop（V1 必做）
- 首页：项目创建、列表、搜索、迁移入口
- 设定页：画布节点、连线关系、详情编辑、素材关联
- 创作页：EP/Scene/Shot/Take 全链路编辑、排序、selected_take
- 引用：`@` 搜索引用 + 反查
- 迁移：项目校验、缺失素材重链接向导

## 6.2 Mobile（V1 减法）
- 浏览：故事、设定卡、层级树、素材预览
- 轻编辑：标题、摘要、短文本、标签
- 查看引用关系与 selected_take 结果
- 不支持：画布复杂编辑、批量重排、高级关系维护

## 6.3 Mobile（V1.5 可扩）
- Scene/Shot 更完整文本编辑
- 基础关系维护（非画布）
- 离线导入包与快速校验增强

---

## 7. 应用层接口契约（为未来 RN 预留）

建议将业务逻辑抽象为 usecase/repository 接口，而不是散落在页面组件中。

## 7.1 Repository 接口示例
```ts
interface StoryRepository {
  createStory(input: CreateStoryInput): Promise<Story>;
  listStories(query: ListStoriesQuery): Promise<StorySummary[]>;
  getStory(storyId: string): Promise<StoryDetail>;
}

interface SettingRepository {
  createCard(input: CreateSettingCardInput): Promise<SettingCard>;
  updateCard(input: UpdateSettingCardInput): Promise<void>;
  linkRelation(input: LinkSettingRelationInput): Promise<void>;
  listReferences(settingCardId: string): Promise<NodeReference[]>;
}
```

## 7.2 保存状态契约（全端一致）
- `Saved`：本次变更已完成持久化
- `Saving`：有待提交变更
- `Error`：持久化失败，可重试

约束：UI 不得先于落盘显示成功。

---

## 8. 数据一致性与迁移策略

## 8.1 写入策略
- 关键操作（创建节点、排序、selected_take 切换）使用事务
- 自动保存 600ms 防抖，离开关键页面强制 flush

## 8.2 项目锁
- Desktop 持有 `.lock`，防并发写损坏
- Mobile 以只读/轻写模式打开时做锁检测，冲突时降级只读

## 8.3 迁移与升级
- 通过 `schema_version` 管理迁移脚本
- 每次升级执行：版本检查 -> 素材快速校验 -> 缺失重链接

---

## 9. 工程结构建议

```text
repo/
├─ apps/
│  ├─ desktop/         # Tauri + React
│  └─ mobile/          # Flutter
├─ contracts/
│  ├─ schema/          # SQL schema, migration spec
│  ├─ api/             # DTO & state contract
│  └─ docs/
└─ docs/plans/
```

说明：
- 通过 `contracts/` 保证未来引入 React Native 只需替换 UI 层与平台适配层。

---

## 10. 里程碑建议

## M1（Desktop Core）
- 完成 schema + 首页 + 设定页 + 创作页核心闭环

## M2（迁移与稳定性）
- 项目锁、重链接向导、错误状态与恢复路径

## M3（Mobile V1）
- Flutter 浏览与轻编辑闭环，打通共享契约

## M4（扩展准备）
- 契约稳定化，评估 RN 增量接入可行性

---

## 11. 风险与对策
- 风险：双端实现节奏不一致 -> 对策：以 `contracts/` 为唯一事实源
- 风险：素材路径在不同端差异 -> 对策：统一相对路径 + 平台适配层
- 风险：早期过度追求端能力一致 -> 对策：严格执行 Mobile 减法策略
- 风险：复杂交互在移动端体验劣化 -> 对策：移动端先提供查看与轻编辑，不强上画布编辑

---

## 12. 本草案结论
- 当前最佳落地路线：**Desktop 用 React/Tauri 保证重交互生产力，Mobile 用 Flutter 实现跨端覆盖**。
- 架构关键点：**共享数据契约而非共享 UI 框架**。
- 扩展方向：后续可按团队资源与业务优先级增量接入 React Native，而无需推翻现有数据层。
