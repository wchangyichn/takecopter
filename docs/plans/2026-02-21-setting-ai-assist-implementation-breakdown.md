# 设定卡 AI 辅助开发任务拆解（内部/外部双通道）

## 1. 目标与范围

- 目标：在 `SettingView` 中为每个 AI 操作提供 `内部AI辅助` 与 `外部AI辅助` 双通道，且两者在“校验-预览-确认-落卡”流程上完全等价。
- 范围：引导提问、属性补全、摘要生成/重写、审校建议、润色、外部导入、版本对比。
- 约束：所有建议默认不自动落卡，必须支持单条确认与批量确认。

## 2. 实施原则

- 一致性优先：内部/外部仅输入来源不同，后续处理链路统一。
- 低打断优先：默认快模型，操作一键可达；重操作（精修、批量应用）需明确反馈。
- 可追溯优先：每次 AI 应用记录来源、模型、时间、操作摘要，支持撤销。
- UI 规范：涉及 UI 的实现与评审必须使用 `ui-ux-pro-max` 技能核对一致性。

## 3. 模块设计与文件落点

### 3.1 当前主文件

- `apps/desktop/src/views/SettingView.tsx`
- `apps/desktop/src/views/SettingView.module.css`
- `apps/desktop/src/types/index.ts`
- `apps/desktop/src/hooks/useProjectData.ts`

### 3.2 推荐拆分（增量，不强制一次完成）

- `apps/desktop/src/views/setting-ai/useAiAssist.ts`
  - 统一管理 AI 状态机（idle/running/review/applying/error）
- `apps/desktop/src/views/setting-ai/promptBuilder.ts`
  - 组装内部请求与外部导出提示词
- `apps/desktop/src/views/setting-ai/schema.ts`
  - 外部导入 payload 校验、修复流程入口
- `apps/desktop/src/views/setting-ai/patchApply.ts`
  - 统一建议应用与撤销逻辑

## 4. 数据契约

### 4.1 统一任务类型

```ts
type AiTaskType = 'guide' | 'suggestions' | 'summary' | 'patch' | 'polish' | 'diff';
```

### 4.2 统一输入上下文

```ts
interface AiCardContext {
  cardId: string;
  cardType: string;
  title: string;
  summary: string;
  customFields: Array<{ name: string; value: string }>;
  dependencies: Array<{
    relationType: string;
    cardId: string;
    title: string;
    summary: string;
    keyFields: Array<{ name: string; value: string }>;
    priority: 'strong' | 'sameType' | 'weak';
  }>;
  glossary?: string[];
  styleGuide?: string[];
}
```

### 4.3 外部导入结构

```ts
interface ExternalAiPayload {
  taskType: AiTaskType;
  cardId: string;
  result: unknown;
  meta?: {
    promptVersion?: string;
    modelHint?: string;
    generatedAt?: string;
  };
}
```

### 4.4 统一建议项

```ts
interface AiSuggestionItem {
  id: string;
  fieldPath: string;
  beforeValue: string;
  afterValue: string;
  reason?: string;
  selected: boolean;
  conflictGroup?: string;
}
```

## 5. 统一流程（内部/外部同构）

1. 生成任务上下文（包含依赖卡片）。
2. 获取结果：
   - 内部：调用模型接口。
   - 外部：导出提示词，等待用户导入结构化结果。
3. schema 校验与标准化。
4. 生成建议列表（diff + 冲突分组）。
5. 用户确认：单条、全选、批量应用。
6. 应用 patch 并记录审计日志。
7. 支持一次撤销。

## 6. 依赖上下文注入与裁剪

- 最小注入字段：标题、摘要、关键属性、关联类型。
- token 超限裁剪顺序：`strong > sameType > weak`。
- 裁剪后在 UI 提示“已裁剪依赖上下文，可能影响一致性”。

## 7. UI 任务拆解

### 7.1 每个按钮的双入口

- 在每个 AI 操作按钮旁提供：
  - `内部AI辅助`
  - `外部AI辅助`

### 7.2 建议面板

- 展示字段级 diff（before/after）。
- 支持：`仅本条`、`全选`、`批量应用`、`取消`。
- 冲突建议同组互斥选择。

### 7.3 外部导入交互

- 一键复制提示词/导出文件。
- 导入 JSON 后立即校验并给出错误定位。
- 校验成功后进入同一建议面板。

## 8. 开发阶段与任务清单

### 阶段 A：契约与基础设施

- [ ] 定义 `AiTaskType` 与统一 payload。
- [ ] 实现外部导入 schema 校验。
- [ ] 实现建议项标准结构与冲突分组。

### 阶段 B：双通道打通

- [ ] 为每个 AI 操作补充内部/外部双入口。
- [ ] 接通提示词导出与结构化导入。
- [ ] 打通内部/外部共用的 review/apply 链路。

### 阶段 C：一致性增强

- [ ] 注入依赖上下文并实现裁剪策略。
- [ ] 启用术语表与文风约束。
- [ ] 落地双层模型策略（快草稿/强精修）。

### 阶段 D：体验与可回退

- [ ] 完善批量确认与冲突提示。
- [ ] 增加应用日志与一键撤销。
- [ ] 完成 UI 一致性检查（`ui-ux-pro-max`）。

## 9. 验收标准

- 每个 AI 功能点均可在内部/外部路径触发并完成同构落卡。
- 外部导入成功后结果与内部路径在建议面板表现一致。
- 未确认前不会写入卡片内容。
- 批量确认可用，冲突组行为正确。
- 依赖上下文注入生效，且裁剪提示明确可见。

## 10. 风险与缓解

- 风险：依赖上下文过长导致延迟高。
  - 缓解：优先级裁剪 + 摘要化。
- 风险：外部导入 JSON 格式不稳定。
  - 缓解：严格 schema + 错误定位 + 修复导入。
- 风险：批量应用误操作。
  - 缓解：应用前确认弹层 + 一次撤销。

## 11. 新增体验需求（2026-02-21 补充）

- 工程重新打开时，记住并恢复用户上次 AI 渠道选择（内置/外部）。
- 将“分步设定引导”文案升级为“辅助建卡”，并把外部辅助入口合并到展开页面中。
- 其他 AI 功能的外部入口需与内置入口做视觉并排融合，避免割裂感。
- 增加整卡迭代能力：整卡快照、版本标签、迭代原因、历史抽屉与快速回滚。
