import { useCallback, useEffect, useId, useMemo, useRef, useState, type DragEvent as ReactDragEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { Button, Panel } from '../components/ui';
import type { SettingCard, SettingCustomField, SettingFieldIteration, SettingLibrary, SettingSummaryIteration, SettingTag, SettingTemplate } from '../types';
import styles from './SettingView.module.css';

const cardPalette = ['var(--coral-400)', 'var(--violet-400)', 'var(--teal-400)', 'var(--amber-400)', 'var(--rose-400)'];
const tagColorPalette = ['#f97316', '#ef4444', '#eab308', '#10b981', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];
const customFieldPresets = ['服设', '口癖', '年龄', '身份', '目标', '弱点'];
const FIELD_UNIT_WIDTH = 220;
const FIELD_UNIT_HEIGHT = 140;
const MODEL_KEY_STORAGE = 'takecopter.desktop.model-api-keys.v1';
const POLISH_PROMPTS_STORAGE = 'takecopter.desktop.polish-prompts.v1';
const DEFAULT_DEPENDENCY_STORAGE = 'takecopter.desktop.default-dependencies.v1';
const MODEL_OPTIONS = [
  { id: 'openai:gpt-4.1', label: 'OpenAI（GPT-4.1）', webUrl: 'https://chatgpt.com/' },
  { id: 'anthropic:claude-3.7-sonnet', label: 'Anthropic（Claude 3.7 Sonnet）', webUrl: 'https://claude.ai/' },
  { id: 'deepseek:deepseek-chat', label: 'DeepSeek（DeepSeek Chat）', webUrl: 'https://chat.deepseek.com/' },
  { id: 'qwen:qwen-max', label: '通义千问（Qwen Max）', webUrl: 'https://chat.qwen.ai/' },
] as const;

const RELATION_TYPE_OPTIONS = ['参考', '约束', '冲突', '触发', '揭示', '归属', '因果', '回收'];

const CARD_TYPE_OPTIONS: Array<{ type: SettingCard['type']; label: string; summary: string }> = [
  { type: 'character', label: '角色卡', summary: '创建空白角色卡，后续按故事需要自由补充。' },
  { type: 'location', label: '地点卡', summary: '创建空白地点卡，适配世界观、势力、场景等设定。' },
  { type: 'item', label: '物品卡', summary: '创建空白物品卡，适配道具、能力、资源等设定。' },
  { type: 'event', label: '事件卡', summary: '创建空白事件卡，用于推进剧情节点与转折。' },
];

type QuickCreateOption = {
  key: string;
  label: string;
  summary: string;
  type?: SettingCard['type'];
  category?: string;
  titlePrefix: string;
  useDefaultDependency?: boolean;
};

const QUICK_CREATE_OPTIONS: QuickCreateOption[] = [
  { key: 'blank', label: '空白卡', summary: '完全空白，不预设属性，不自动关联默认依赖。', titlePrefix: '空白卡', useDefaultDependency: false },
  { key: 'worldview', label: '世界观卡', summary: '空白世界观卡，仅预设分类为“世界观”，内容由你自行定义。', type: 'location', category: '世界观', titlePrefix: '世界观卡' },
  { key: 'character', label: '角色卡', summary: '创建空白角色卡，后续按故事需要自由补充。', type: 'character', category: '角色', titlePrefix: '角色卡' },
  { key: 'location', label: '地点卡', summary: '创建空白地点卡，适配世界观、势力、场景等设定。', type: 'location', category: '地点', titlePrefix: '地点卡' },
  { key: 'item', label: '物品卡', summary: '创建空白物品卡，适配道具、能力、资源等设定。', type: 'item', category: '道具', titlePrefix: '物品卡' },
  { key: 'event', label: '事件卡', summary: '创建空白事件卡，用于推进剧情节点与转折。', type: 'event', category: '事件', titlePrefix: '事件卡' },
];

const STORY_SETUP_STEPS = ['角色基础', '空间与规则', '关键事件', '关系网络', '摘要完整度'];

const DEFAULT_GUIDE_QUESTIONS = [
  '先写下你目前已经确定的一点点设定（哪怕只有一句话）。',
  '这个设定暂时最想让读者记住的特征是什么？',
  '目前你最不确定的部分是什么？可以直接写“暂未决定”。',
  '如果只补充一个细节就能更完整，你想先补哪一项？',
];

type AiModelId = (typeof MODEL_OPTIONS)[number]['id'];

type ModelApiKeyEntry = {
  apiKey: string;
  endpoint?: string;
  updatedAt: string;
};

type ModelApiKeyState = Record<string, ModelApiKeyEntry>;
type DefaultDependencyState = Record<SettingCard['type'], string[]>;

type AiFieldSuggestion = {
  name: string;
  reason: string;
  sampleValue: string;
};

type AiFieldDraft = {
  fieldId?: string;
  name: string;
  beforeValue: string;
  nextValue: string;
};

type IterationReasonType = 'manual' | 'card';

type IterationDraftState = {
  open: boolean;
  value: string;
  versionTag: string;
  reasonType: IterationReasonType;
  reasonText: string;
  reasonCardId: string;
  editingIterationId?: string;
};

type AiNormalizePatch = {
  title?: string;
  summary?: string;
  category?: string | null;
  tags?: Array<{ name: string; color: string }>;
  customFields?: Array<{ id?: string; name: string; value: string }>;
};

type NormalizeFieldKey = 'title' | 'summary' | 'category' | 'tags' | 'customFields';

type NormalizeApplySelection = Record<NormalizeFieldKey, boolean>;

type AiUndoEntry = {
  id: string;
  cardId: string;
  cardSnapshot: EditableCard;
  label: string;
  createdAt: string;
};

type AiActionKind = 'summary' | 'fields' | 'normalize' | 'field';

type AiGuideMode = 'describe' | 'summaryToFields' | 'reviewCard' | 'polish' | 'fieldsToSummary';

type RecentPolishPrompt = {
  id: string;
  name: string;
  content: string;
  pinned: boolean;
  updatedAt: string;
};

type ConfirmDialogState = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
};
interface DragState {
  id: string;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
}

interface PreviewWindowState {
  x: number;
  y: number;
  minimized: boolean;
}

interface PreviewDragState {
  id: string;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
}

interface SettingViewProps {
  cards: SettingCard[];
  onCardsChange: (cards: SettingCard[]) => void;
  globalLibrary: SettingLibrary;
  storyLibrary: SettingLibrary;
  onGlobalLibraryChange: (library: SettingLibrary) => Promise<void>;
  onStoryLibraryChange: (library: SettingLibrary) => Promise<void>;
}

type EditableCard = SettingCard & { tags: SettingTag[]; customFields: SettingCustomField[] };

function normalizeTagName(value: string): string {
  return value.trim();
}

function randomTagColor(): string {
  return tagColorPalette[Math.floor(Math.random() * tagColorPalette.length)];
}

function readModelApiKeys(): ModelApiKeyState {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(MODEL_KEY_STORAGE);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).flatMap(([modelId, value]) => {
        if (!value || typeof value !== 'object') {
          return [];
        }

        const source = value as { apiKey?: unknown; endpoint?: unknown; updatedAt?: unknown };
        if (typeof source.apiKey !== 'string' || source.apiKey.trim().length === 0) {
          return [];
        }

        return [
          [
            modelId,
            {
              apiKey: source.apiKey,
              endpoint: typeof source.endpoint === 'string' ? source.endpoint : undefined,
              updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : new Date().toISOString(),
            },
          ],
        ];
      })
    );
  } catch {
    return {};
  }
}

function readDefaultDependencyState(): DefaultDependencyState {
  const empty: DefaultDependencyState = {
    character: [],
    location: [],
    item: [],
    event: [],
  };

  if (typeof window === 'undefined') {
    return empty;
  }

  try {
    const raw = window.localStorage.getItem(DEFAULT_DEPENDENCY_STORAGE);
    if (!raw) {
      return empty;
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const normalize = (value: unknown): string[] => {
      if (!Array.isArray(value)) {
        return [];
      }
      return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
    };
    return {
      character: normalize(parsed.character),
      location: normalize(parsed.location),
      item: normalize(parsed.item),
      event: normalize(parsed.event),
    };
  } catch {
    return empty;
  }
}

function sortRecentPolishPrompts(items: RecentPolishPrompt[]): RecentPolishPrompt[] {
  return [...items].sort((a, b) => {
    if (a.pinned !== b.pinned) {
      return a.pinned ? -1 : 1;
    }
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

function readRecentPolishPrompts(): RecentPolishPrompt[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(POLISH_PROMPTS_STORAGE);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    const now = new Date().toISOString();
    const fromStrings = parsed
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .map((content, index) => ({
        id: `legacy-${index}-${content.slice(0, 8)}`,
        name: `方案 ${index + 1}`,
        content,
        pinned: false,
        updatedAt: now,
      }));

    const fromObjects = parsed
      .map((item) => {
        if (!item || typeof item !== 'object') {
          return null;
        }
        const source = item as Record<string, unknown>;
        const id = typeof source.id === 'string' && source.id.trim().length > 0 ? source.id : crypto.randomUUID();
        const name = typeof source.name === 'string' && source.name.trim().length > 0 ? source.name.trim() : '未命名方案';
        const content = typeof source.content === 'string' ? source.content.trim() : '';
        const pinned = source.pinned === true;
        const updatedAt = typeof source.updatedAt === 'string' ? source.updatedAt : now;
        if (!content) {
          return null;
        }
        return { id, name, content, pinned, updatedAt };
      })
      .filter((item): item is RecentPolishPrompt => Boolean(item));

    const merged = fromObjects.length > 0 ? fromObjects : fromStrings;
    return sortRecentPolishPrompts(merged).slice(0, 8);
  } catch {
    return [];
  }
}

function extractJsonObject(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed;
  }

  const codeFence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (codeFence?.[1]) {
    return codeFence[1].trim();
  }

  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first >= 0 && last > first) {
    return trimmed.slice(first, last + 1);
  }

  return trimmed;
}

function parseAiSuggestions(value: unknown): { data: AiFieldSuggestion[]; errors: string[] } {
  if (!Array.isArray(value)) {
    return { data: [], errors: ['suggestions 必须是数组'] };
  }

  const errors: string[] = [];
  const data = value
    .map((item, index) => {
      if (!item || typeof item !== 'object') {
        errors.push(`suggestions[${index}] 不是对象`);
        return null;
      }
      const source = item as Record<string, unknown>;
      const name = typeof source.name === 'string' ? source.name.trim() : '';
      const reason = typeof source.reason === 'string' ? source.reason.trim() : '';
      const sampleValue = typeof source.sampleValue === 'string' ? source.sampleValue.trim() : '';
      if (!name) {
        errors.push(`suggestions[${index}].name 不能为空`);
        return null;
      }
      return { name, reason, sampleValue };
    })
    .filter((item): item is AiFieldSuggestion => Boolean(item));

  return { data, errors };
}

function parseAiNormalizePatch(value: unknown): { data: AiNormalizePatch | null; errors: string[] } {
  if (!value || typeof value !== 'object') {
    return { data: null, errors: ['patch 必须是对象'] };
  }

  const source = value as Record<string, unknown>;
  const errors: string[] = [];
  const patch: AiNormalizePatch = {};

  if ('title' in source) {
    if (typeof source.title !== 'string') {
      errors.push('patch.title 必须是字符串');
    } else {
      patch.title = source.title.trim();
    }
  }

  if ('summary' in source) {
    if (typeof source.summary !== 'string') {
      errors.push('patch.summary 必须是字符串');
    } else {
      patch.summary = source.summary.trim();
    }
  }

  if ('category' in source) {
    if (source.category !== null && typeof source.category !== 'string') {
      errors.push('patch.category 必须是字符串或 null');
    } else {
      patch.category = typeof source.category === 'string' ? source.category.trim() : null;
    }
  }

  if ('tags' in source) {
    if (!Array.isArray(source.tags)) {
      errors.push('patch.tags 必须是数组');
    } else {
      patch.tags = source.tags
        .map((item, index) => {
          if (!item || typeof item !== 'object') {
            errors.push(`patch.tags[${index}] 不是对象`);
            return null;
          }
          const tag = item as Record<string, unknown>;
          const name = typeof tag.name === 'string' ? tag.name.trim() : '';
          const color = typeof tag.color === 'string' ? tag.color.trim() : '#94a3b8';
          if (!name) {
            errors.push(`patch.tags[${index}].name 不能为空`);
            return null;
          }
          return { name, color };
        })
        .filter((item): item is { name: string; color: string } => Boolean(item));
    }
  }

  if ('customFields' in source) {
    if (!Array.isArray(source.customFields)) {
      errors.push('patch.customFields 必须是数组');
    } else {
      patch.customFields = source.customFields
        .map((item, index) => {
          if (!item || typeof item !== 'object') {
            errors.push(`patch.customFields[${index}] 不是对象`);
            return null;
          }
          const field = item as Record<string, unknown>;
          const name = typeof field.name === 'string' ? field.name.trim() : '';
          if (!name) {
            errors.push(`patch.customFields[${index}].name 不能为空`);
            return null;
          }
          const valueText = typeof field.value === 'string' ? field.value : '';
          const id = typeof field.id === 'string' ? field.id : undefined;
          return id ? { id, name, value: valueText } : { name, value: valueText };
        })
        .filter((item): item is { id?: string; name: string; value: string } => Boolean(item));
    }
  }

  return { data: patch, errors };
}

function parseAiFieldDraft(value: unknown): { data: { fieldId?: string; name: string; value: string } | null; errors: string[] } {
  if (!value || typeof value !== 'object') {
    return { data: null, errors: ['field 必须是对象'] };
  }

  const source = value as Record<string, unknown>;
  const name = typeof source.name === 'string' ? source.name.trim() : '';
  const valueText = typeof source.value === 'string' ? source.value : '';
  const fieldId = typeof source.fieldId === 'string' ? source.fieldId : undefined;
  const errors: string[] = [];

  if (!name) {
    errors.push('field.name 不能为空');
  }

  return { data: errors.length > 0 ? null : { fieldId, name, value: valueText }, errors };
}

function normalizeCards(cards: SettingCard[]): EditableCard[] {
  const idUsage = new Map<string, number>();

  return cards.map((card, cardIndex) => {
    const rawId = typeof card.id === 'string' && card.id.trim().length > 0 ? card.id.trim() : `card-${cardIndex + 1}`;
    const used = idUsage.get(rawId) ?? 0;
    idUsage.set(rawId, used + 1);
    const uniqueId = used === 0 ? rawId : `${rawId}__${used + 1}`;

    return {
      ...card,
      id: uniqueId,
      relations: Array.isArray(card.relations)
        ? card.relations
            .filter((relation) => relation && typeof relation.targetId === 'string' && relation.targetId.trim().length > 0)
            .map((relation) => ({
              targetId: relation.targetId,
              type: typeof relation.type === 'string' && relation.type.trim().length > 0 ? relation.type : '关联',
              sourceFieldId:
                typeof relation.sourceFieldId === 'string' && relation.sourceFieldId.trim().length > 0
                  ? relation.sourceFieldId
                  : undefined,
              targetFieldId:
                typeof relation.targetFieldId === 'string' && relation.targetFieldId.trim().length > 0
                  ? relation.targetFieldId
                  : undefined,
            }))
        : [],
      tags: (card.tags ?? []).map((tag) => ({ ...tag })),
      customFields: (card.customFields ?? []).map((field, index) => ({
        id: field.id ?? `field-${uniqueId}-${index + 1}`,
        ...field,
        iterations: Array.isArray(field.iterations)
          ? field.iterations
              .filter((item) => Boolean(item) && typeof item.id === 'string' && typeof item.value === 'string')
              .map((item) => ({
                id: item.id,
                value: item.value,
                versionTag: typeof item.versionTag === 'string' ? item.versionTag : undefined,
                reasonType: item.reasonType === 'card' ? 'card' : 'manual',
                reasonText: typeof item.reasonText === 'string' ? item.reasonText : undefined,
                reasonCardId: typeof item.reasonCardId === 'string' ? item.reasonCardId : undefined,
                createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
              }))
          : [],
        activeIterationId: typeof field.activeIterationId === 'string' ? field.activeIterationId : undefined,
        size: field.size === 'sm' || field.size === 'md' || field.size === 'lg' ? field.size : 'md',
        x: typeof field.x === 'number' ? field.x : (index % 3) * (FIELD_UNIT_WIDTH + 12),
        y: typeof field.y === 'number' ? field.y : Math.floor(index / 3) * (FIELD_UNIT_HEIGHT + 12),
        w: typeof field.w === 'number' ? field.w : 1,
        h: typeof field.h === 'number' ? field.h : 1,
      })),
      summaryIterations: Array.isArray(card.summaryIterations)
        ? card.summaryIterations
            .filter((item) => Boolean(item) && typeof item.id === 'string' && typeof item.value === 'string')
            .map((item) => ({
              id: item.id,
              value: item.value,
              versionTag: typeof item.versionTag === 'string' ? item.versionTag : undefined,
              reasonType: item.reasonType === 'card' ? 'card' : 'manual',
              reasonText: typeof item.reasonText === 'string' ? item.reasonText : undefined,
              reasonCardId: typeof item.reasonCardId === 'string' ? item.reasonCardId : undefined,
              createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
            }))
        : [],
      activeSummaryIterationId: typeof card.activeSummaryIterationId === 'string' ? card.activeSummaryIterationId : undefined,
    };
  });
}

function cloneEditableCard(card: EditableCard): EditableCard {
  return {
    ...card,
    position: { ...card.position },
    tags: card.tags.map((tag) => ({ ...tag })),
    customFields: card.customFields.map((field) => ({
      ...field,
      iterations: (field.iterations ?? []).map((iteration) => ({ ...iteration })),
    })),
    relations: card.relations.map((relation) => ({ ...relation })),
    summaryIterations: (card.summaryIterations ?? []).map((iteration) => ({ ...iteration })),
  };
}

function getDefaultNormalizeSelection(card: EditableCard, patch: AiNormalizePatch): NormalizeApplySelection {
  return {
    title: typeof patch.title === 'string' && patch.title !== card.title,
    summary: typeof patch.summary === 'string' && patch.summary !== card.summary,
    category: 'category' in patch && patch.category !== (card.category ?? null),
    tags: Array.isArray(patch.tags) && patch.tags.map((item) => item.name).join('|') !== card.tags.map((item) => item.name).join('|'),
    customFields:
      Array.isArray(patch.customFields) && patch.customFields.map((item) => item.name).join('|') !== card.customFields.map((item) => item.name).join('|'),
  };
}

function allTags(cards: EditableCard[], extraTags: SettingTag[]): SettingTag[] {
  const map = new Map<string, string>();

  extraTags.forEach((tag) => {
    const name = normalizeTagName(tag.name);
    if (name) {
      map.set(name, tag.color);
    }
  });

  cards.forEach((card) => {
    card.tags.forEach((tag) => {
      map.set(tag.name, tag.color);
    });
  });

  return Array.from(map.entries()).map(([name, color]) => ({ name, color }));
}

function uniqueCategories(cards: EditableCard[]): string[] {
  const set = new Set<string>();
  cards.forEach((card) => {
    const category = card.category?.trim();
    if (category) {
      set.add(category);
    }
  });
  return Array.from(set);
}

function cardInCategory(card: EditableCard, categoryKey: string | null): boolean {
  if (!categoryKey) {
    return true;
  }
  return card.category === categoryKey;
}

function cardMatchesTags(card: EditableCard, activeTagFilters: string[]): boolean {
  if (activeTagFilters.length === 0) {
    return true;
  }
  const names = new Set(card.tags.map((tag) => tag.name));
  return activeTagFilters.every((tag) => names.has(tag));
}

function cardCategoryLabel(card: EditableCard): string {
  return card.category?.trim() || '未分类';
}

function cardTypeLabel(type: SettingCard['type']): string {
  return CARD_TYPE_OPTIONS.find((item) => item.type === type)?.label ?? '设定卡';
}

function templateEditingKey(source: 'global' | 'story', id: string): string {
  return `${source}:${id}`;
}

export function SettingView({
  cards: sourceCards,
  onCardsChange,
  globalLibrary,
  storyLibrary,
  onGlobalLibraryChange,
  onStoryLibraryChange,
}: SettingViewProps) {
  const toolbarComboboxId = useId();

  const [cards, setCards] = useState<EditableCard[]>(() => normalizeCards(sourceCards));
  const [selectedCardId, setSelectedCardId] = useState<string | null>(() => sourceCards[0]?.id ?? null);
  const [openPreviewCardIds, setOpenPreviewCardIds] = useState<string[]>([]);
  const [previewWindowStateMap, setPreviewWindowStateMap] = useState<Record<string, PreviewWindowState>>({});
  const [previewDragState, setPreviewDragState] = useState<PreviewDragState | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const [activeTagFilters, setActiveTagFilters] = useState<string[]>([]);
  const [toolbarTagSearchOpen, setToolbarTagSearchOpen] = useState(false);
  const [toolbarTagQuery, setToolbarTagQuery] = useState('');
  const [toolbarTagActiveIndex, setToolbarTagActiveIndex] = useState(0);

  const [detailTagSearchOpen, setDetailTagSearchOpen] = useState(false);
  const [detailTagQuery, setDetailTagQuery] = useState('');
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [fieldRelationOpen, setFieldRelationOpen] = useState<Record<string, boolean>>({});
  const [fieldRelationTarget, setFieldRelationTarget] = useState<Record<string, string>>({});
  const [fieldRelationType, setFieldRelationType] = useState<Record<string, string>>({});
  const [draggingFieldId, setDraggingFieldId] = useState<string | null>(null);
  const [dragOverField, setDragOverField] = useState<{ id: string; placement: 'before' | 'after' } | null>(null);
  const [newCustomFieldName, setNewCustomFieldName] = useState('');
  const [newCardNameDraft, setNewCardNameDraft] = useState('');
  const [isTemplatePickerOpen, setIsTemplatePickerOpen] = useState(false);
  const [isDefaultDependencyOpen, setIsDefaultDependencyOpen] = useState(false);
  const [isCardRenameOpen, setIsCardRenameOpen] = useState(false);
  const [renameCardDraft, setRenameCardDraft] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>({
    open: false,
    title: '请确认操作',
    message: '',
    confirmLabel: '确认',
  });
  const [isSaveTemplateOpen, setIsSaveTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateScope, setTemplateScope] = useState<'global' | 'story'>('global');
  const [activeAiModelId, setActiveAiModelId] = useState<AiModelId>(MODEL_OPTIONS[0].id);
  const [isAiResultOpen, setIsAiResultOpen] = useState(false);
  const [isAiGuideOpen, setIsAiGuideOpen] = useState(false);
  const [isExternalAiOpen, setIsExternalAiOpen] = useState(false);
  const [aiActionKind, setAiActionKind] = useState<AiActionKind>('summary');
  const [aiGuideQuestionIndex, setAiGuideQuestionIndex] = useState(0);
  const [aiGuideQuestions, setAiGuideQuestions] = useState<string[]>(DEFAULT_GUIDE_QUESTIONS);
  const [aiGuideAnswers, setAiGuideAnswers] = useState<string[]>(DEFAULT_GUIDE_QUESTIONS.map(() => ''));
  const [aiGuideQuestionBusy, setAiGuideQuestionBusy] = useState(false);
  const [aiGuideSummaryInput] = useState('');
  const [aiGuidePolishInstruction, setAiGuidePolishInstruction] = useState('更有画面感，保留原意，语言简洁。');
  const [isPolishPromptOpen, setIsPolishPromptOpen] = useState(false);
  const [polishPromptTarget, setPolishPromptTarget] = useState('文本');
  const [polishPromptDraft, setPolishPromptDraft] = useState('');
  const [isRenamePromptOpen, setIsRenamePromptOpen] = useState(false);
  const [renamePromptId, setRenamePromptId] = useState<string | null>(null);
  const [renamePromptDraft, setRenamePromptDraft] = useState('');
  const [recentPolishPrompts, setRecentPolishPrompts] = useState<RecentPolishPrompt[]>(() => readRecentPolishPrompts());
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiSummaryDraft, setAiSummaryDraft] = useState<string>('');
  const [aiSuggestions, setAiSuggestions] = useState<AiFieldSuggestion[]>([]);
  const [aiNormalizePatch, setAiNormalizePatch] = useState<AiNormalizePatch | null>(null);
  const [aiFieldDraft, setAiFieldDraft] = useState<AiFieldDraft | null>(null);
  const [normalizeApplySelection, setNormalizeApplySelection] = useState<NormalizeApplySelection>({
    title: false,
    summary: false,
    category: false,
    tags: false,
    customFields: false,
  });
  const [selectedSuggestionNames, setSelectedSuggestionNames] = useState<string[]>([]);
  const [externalPrompt, setExternalPrompt] = useState('');
  const [externalPromptMode, setExternalPromptMode] = useState<AiGuideMode>('describe');
  const [externalResponseInput, setExternalResponseInput] = useState('');
  const [externalResponseError, setExternalResponseError] = useState<string | null>(null);
  const [externalResponseSchemaErrors, setExternalResponseSchemaErrors] = useState<string[]>([]);
  const [isAiHistoryOpen, setIsAiHistoryOpen] = useState(false);
  const [normalizeShowSelectedOnly, setNormalizeShowSelectedOnly] = useState(false);
  const [aiUndoStack, setAiUndoStack] = useState<AiUndoEntry[]>([]);

  const [isTagManagerOpen, setIsTagManagerOpen] = useState(false);
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);
  const [isTemplateManagerOpen, setIsTemplateManagerOpen] = useState(false);
  const [tagManagerName, setTagManagerName] = useState('');
  const [tagManagerColor, setTagManagerColor] = useState(() => randomTagColor());
  const [categoryManagerName, setCategoryManagerName] = useState('');
  const [managerTagScope, setManagerTagScope] = useState<'global' | 'story'>('global');
  const [managerCategoryScope, setManagerCategoryScope] = useState<'global' | 'story'>('global');
  const [editingCategoryName, setEditingCategoryName] = useState<string | null>(null);
  const [editingCategoryValue, setEditingCategoryValue] = useState('');
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editingTemplateValue, setEditingTemplateValue] = useState('');
  const [defaultDependencyType, setDefaultDependencyType] = useState<SettingCard['type']>('character');
  const [defaultDependencyMap, setDefaultDependencyMap] = useState<DefaultDependencyState>(() => readDefaultDependencyState());
  const [cardDependencyTarget, setCardDependencyTarget] = useState('');
  const [cardDependencyType, setCardDependencyType] = useState('参考');
  const [fieldIterationDrafts, setFieldIterationDrafts] = useState<Record<string, IterationDraftState>>({});
  const [summaryIterationDraft, setSummaryIterationDraft] = useState<IterationDraftState>({
    open: false,
    value: '',
    versionTag: '',
    reasonType: 'manual',
    reasonText: '',
    reasonCardId: '',
  });

  const [globalTags, setGlobalTags] = useState<SettingTag[]>(() => globalLibrary.tags ?? []);
  const [storyTags, setStoryTags] = useState<SettingTag[]>(() => storyLibrary.tags ?? []);
  const [globalCategories, setGlobalCategories] = useState<string[]>(() => globalLibrary.categories ?? []);
  const [storyCategories, setStoryCategories] = useState<string[]>(() => storyLibrary.categories ?? []);
  const [globalTemplates, setGlobalTemplates] = useState<SettingTemplate[]>(() => globalLibrary.templates ?? []);
  const [storyTemplates, setStoryTemplates] = useState<SettingTemplate[]>(() => storyLibrary.templates ?? []);

  const [dragState, setDragState] = useState<DragState | null>(null);

  const localIdRef = useRef(0);
  const templateIdRef = useRef(0);
  const cardsRef = useRef<EditableCard[]>(cards);
  const selectedCardIdRef = useRef<string | null>(selectedCardId);
  const canvasPointerRef = useRef<{ id: string; moved: boolean } | null>(null);
  const toolbarSearchRef = useRef<HTMLDivElement | null>(null);
  const detailSearchRef = useRef<HTMLDivElement | null>(null);
  const externalResponseRef = useRef<HTMLTextAreaElement | null>(null);
  const polishPromptResolverRef = useRef<((value: string | null) => void) | null>(null);
  const confirmActionRef = useRef<(() => void) | null>(null);
  const persistTimerRef = useRef<number | null>(null);

  useEffect(() => {
    selectedCardIdRef.current = selectedCardId;
  }, [selectedCardId]);

  useEffect(() => {
    setAiError(null);
  }, [activeAiModelId]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(POLISH_PROMPTS_STORAGE, JSON.stringify(recentPolishPrompts));
  }, [recentPolishPrompts]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(DEFAULT_DEPENDENCY_STORAGE, JSON.stringify(defaultDependencyMap));
  }, [defaultDependencyMap]);

  const categories = useMemo(() => {
    const set = new Set<string>([...globalCategories, ...storyCategories, ...uniqueCategories(cards)]);
    return Array.from(set);
  }, [cards, globalCategories, storyCategories]);

  const selectedCard = useMemo(() => cards.find((item) => item.id === selectedCardId) ?? null, [cards, selectedCardId]);
  const openPreviewCards = useMemo(
    () => openPreviewCardIds.map((id) => cards.find((card) => card.id === id)).filter((card): card is EditableCard => Boolean(card)),
    [cards, openPreviewCardIds]
  );
  const modelApiKeys = readModelApiKeys();
  const activeAiModelConfig = modelApiKeys[activeAiModelId];
  const isAiModelConfigured = Boolean(activeAiModelConfig?.apiKey?.trim());
  const tagOptions = useMemo(() => allTags(cards, [...globalTags, ...storyTags]), [cards, globalTags, storyTags]);
  const hasUndoForSelectedCard = useMemo(() => {
    if (!selectedCard) {
      return false;
    }
    return aiUndoStack.some((entry) => entry.cardId === selectedCard.id);
  }, [aiUndoStack, selectedCard]);
  const selectedCardUndoEntries = useMemo(() => {
    if (!selectedCard) {
      return [] as AiUndoEntry[];
    }
    return aiUndoStack.filter((entry) => entry.cardId === selectedCard.id).reverse();
  }, [aiUndoStack, selectedCard]);

  const aiModelStatusText = useMemo(() => {
    if (isAiModelConfigured) {
      return '当前模型已配置 API Key';
    }
    return '当前模型未配置 API Key，请先到首页模型设置中配置';
  }, [isAiModelConfigured]);

  const visibleCards = useMemo(() => {
    return cards.filter((card) => cardInCategory(card, selectedCategory) && cardMatchesTags(card, activeTagFilters));
  }, [activeTagFilters, cards, selectedCategory]);

  const categoryEntries = useMemo(() => {
    return categories.map((category) => ({
      key: category,
      label: category,
      count: cards.filter((card) => card.category === category).length,
    }));
  }, [cards, categories]);

  const uncategorizedCount = useMemo(() => cards.filter((card) => !card.category).length, [cards]);

  const setupProgress = useMemo(() => {
    const hasCharacter = cards.some((card) => card.type === 'character');
    const hasLocation = cards.some((card) => card.type === 'location');
    const hasEvent = cards.some((card) => card.type === 'event');
    const relationCount = cards.reduce((total, card) => total + card.relations.length, 0);
    const summaryCoverage = cards.length === 0 ? 0 : cards.filter((card) => card.summary.trim().length > 0).length / cards.length;

    const checks = [hasCharacter, hasLocation, hasEvent, relationCount >= 3, summaryCoverage >= 0.6];
    const completed = checks.filter(Boolean).length;
    return {
      checks,
      completed,
      total: checks.length,
      summaryCoverage,
      relationCount,
    };
  }, [cards]);

  const templateEntries = useMemo(() => {
    const fromGlobal = (globalTemplates ?? []).map((template) => ({ ...template, source: '全局' as const }));
    const fromStory = (storyTemplates ?? [])
      .filter((template) => !fromGlobal.some((item) => item.name === template.name))
      .map((template) => ({ ...template, source: '故事' as const }));
    return [...fromGlobal, ...fromStory];
  }, [globalTemplates, storyTemplates]);

  const templateManagerEntries = useMemo(
    () => [
      ...globalTemplates.map((template) => ({ ...template, source: 'global' as const })),
      ...storyTemplates.map((template) => ({ ...template, source: 'story' as const })),
    ],
    [globalTemplates, storyTemplates]
  );

  const defaultDependencyCandidates = useMemo(
    () => cards.map((card) => ({ id: card.id, title: card.title || '未命名设定', typeLabel: cardTypeLabel(card.type) })),
    [cards]
  );

  const totalByCategory = useMemo(() => {
    return categoryEntries.reduce<Record<string, number>>((acc, item) => {
      acc[item.key] = item.count;
      return acc;
    }, {});
  }, [categoryEntries]);

  const toolbarTagCandidates = useMemo(() => {
    const query = normalizeTagName(toolbarTagQuery).toLowerCase();
    return tagOptions.filter((tag) => !query || tag.name.toLowerCase().includes(query));
  }, [tagOptions, toolbarTagQuery]);

  const toolbarCanCreate = useMemo(
    () =>
      Boolean(normalizeTagName(toolbarTagQuery)) &&
      !tagOptions.some((tag) => tag.name === normalizeTagName(toolbarTagQuery)),
    [tagOptions, toolbarTagQuery]
  );

  const toolbarActiveDescendant = useMemo(() => {
    if (!toolbarTagSearchOpen) {
      return undefined;
    }
    if (toolbarTagCandidates.length > 0) {
      const safeIndex = Math.min(toolbarTagActiveIndex, Math.max(toolbarTagCandidates.length - 1, 0));
      return `${toolbarComboboxId}-option-${safeIndex}`;
    }
    if (toolbarCanCreate) {
      return `${toolbarComboboxId}-create`;
    }
    return undefined;
  }, [toolbarCanCreate, toolbarComboboxId, toolbarTagActiveIndex, toolbarTagCandidates.length, toolbarTagSearchOpen]);

  const tagSourceLabel = (name: string): string => {
    const inGlobal = globalTags.some((tag) => tag.name === name);
    const inStory = storyTags.some((tag) => tag.name === name);
    if (inGlobal && inStory) {
      return '全局+故事';
    }
    if (inGlobal) {
      return '全局';
    }
    if (inStory) {
      return '故事';
    }
    return '未定义';
  };

  const categorySourceLabel = (name: string): string => {
    const inGlobal = globalCategories.includes(name);
    const inStory = storyCategories.includes(name);
    if (inGlobal && inStory) {
      return '全局+故事';
    }
    if (inGlobal) {
      return '全局';
    }
    if (inStory) {
      return '故事';
    }
    return '未定义';
  };

  const aiNormalizeDiffLines = useMemo(() => {
    if (!selectedCard || !aiNormalizePatch) {
      return [] as Array<{ key: NormalizeFieldKey; field: string; before: string; after: string }>;
    }

    const lines: Array<{ key: NormalizeFieldKey; field: string; before: string; after: string }> = [];
    if (typeof aiNormalizePatch.title === 'string' && aiNormalizePatch.title !== selectedCard.title) {
      lines.push({ key: 'title', field: '名称', before: selectedCard.title || '（空）', after: aiNormalizePatch.title || '（空）' });
    }
    if (typeof aiNormalizePatch.summary === 'string' && aiNormalizePatch.summary !== selectedCard.summary) {
      lines.push({ key: 'summary', field: '摘要', before: selectedCard.summary || '（空）', after: aiNormalizePatch.summary || '（空）' });
    }
    if ('category' in aiNormalizePatch && aiNormalizePatch.category !== (selectedCard.category ?? null)) {
      lines.push({ key: 'category', field: '分类', before: selectedCard.category || '（空）', after: aiNormalizePatch.category || '（空）' });
    }
    if (Array.isArray(aiNormalizePatch.tags)) {
      const before = selectedCard.tags.map((item) => item.name).join('、') || '（空）';
      const after = aiNormalizePatch.tags.map((item) => item.name).join('、') || '（空）';
      if (before !== after) {
        lines.push({ key: 'tags', field: '标签', before, after });
      }
    }
    if (Array.isArray(aiNormalizePatch.customFields)) {
      const before = selectedCard.customFields.map((item) => item.name).join('、') || '（空）';
      const after = aiNormalizePatch.customFields.map((item) => item.name).join('、') || '（空）';
      if (before !== after) {
        lines.push({ key: 'customFields', field: '属性结构', before, after });
      }
    }
    return lines;
  }, [aiNormalizePatch, selectedCard]);

  const visibleNormalizeDiffLines = useMemo(() => {
    if (!normalizeShowSelectedOnly) {
      return aiNormalizeDiffLines;
    }
    return aiNormalizeDiffLines.filter((item) => normalizeApplySelection[item.key]);
  }, [aiNormalizeDiffLines, normalizeApplySelection, normalizeShowSelectedOnly]);

  const schedulePersistCards = useCallback((next: EditableCard[]) => {
    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current);
    }
    persistTimerRef.current = window.setTimeout(() => {
      onCardsChange(next);
      persistTimerRef.current = null;
    }, 260);
  }, [onCardsChange]);

  const applyCards = (updater: (prev: EditableCard[]) => EditableCard[]) => {
    setCards((prev) => {
      const next = updater(prev);
      cardsRef.current = next;
      schedulePersistCards(next);
      return next;
    });
  };

  useEffect(() => {
    return () => {
      if (persistTimerRef.current !== null) {
        window.clearTimeout(persistTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const previousCards = cardsRef.current;
    const previousSelectedId = selectedCardIdRef.current;
    const previousIndex = previousSelectedId ? previousCards.findIndex((card) => card.id === previousSelectedId) : -1;
    const nextCards = normalizeCards(sourceCards);
    const previousSnapshot = JSON.stringify(previousCards);
    const nextSnapshot = JSON.stringify(nextCards);

    if (previousSnapshot === nextSnapshot) {
      return;
    }

    queueMicrotask(() => {
      if (cancelled) {
        return;
      }

      setCards(nextCards);
      cardsRef.current = nextCards;

      setSelectedCardId((prev) => {
        if (prev === null) {
          return null;
        }

        if (prev && nextCards.some((card) => card.id === prev)) {
          return prev;
        }

        if (previousSelectedId && nextCards.some((card) => card.id === previousSelectedId)) {
          return previousSelectedId;
        }

        if (previousIndex >= 0 && previousIndex < nextCards.length) {
          return nextCards[previousIndex].id;
        }

        return nextCards[0]?.id ?? null;
      });

      setOpenPreviewCardIds((prev) => prev.filter((id) => nextCards.some((card) => card.id === id)));
      setPreviewWindowStateMap((prev) => {
        const aliveIds = new Set(nextCards.map((card) => card.id));
        return Object.fromEntries(Object.entries(prev).filter(([id]) => aliveIds.has(id)));
      });
    });

    return () => {
      cancelled = true;
    };
  }, [sourceCards]);

  useEffect(() => {
    if (!dragState) {
      return;
    }

    let moved = false;

    const handleMove = (event: MouseEvent) => {
      const deltaX = event.clientX - dragState.startX;
      const deltaY = event.clientY - dragState.startY;

       if (!moved && (Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1)) {
        moved = true;
        if (canvasPointerRef.current && canvasPointerRef.current.id === dragState.id) {
          canvasPointerRef.current = { ...canvasPointerRef.current, moved: true };
        }
      }

      setCards((prev) => {
        const next = prev.map((card) => {
          if (card.id !== dragState.id) {
            return card;
          }

          return {
            ...card,
            position: {
              x: Math.max(24, dragState.originX + deltaX),
              y: Math.max(24, dragState.originY + deltaY),
            },
          };
        });
        cardsRef.current = next;
        return next;
      });
    };

    const handleUp = () => {
      if (moved) {
        schedulePersistCards(cardsRef.current);
      }
      setDragState(null);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [dragState, schedulePersistCards]);

  useEffect(() => {
    if (!previewDragState) {
      return;
    }

    const handleMove = (event: MouseEvent) => {
      const deltaX = event.clientX - previewDragState.startX;
      const deltaY = event.clientY - previewDragState.startY;
      setPreviewWindowStateMap((prev) => {
        const current = prev[previewDragState.id];
        if (!current) {
          return prev;
        }
        return {
          ...prev,
          [previewDragState.id]: {
            ...current,
            x: Math.max(24, previewDragState.originX + deltaX),
            y: Math.max(24, previewDragState.originY + deltaY),
          },
        };
      });
    };

    const handleUp = () => {
      setPreviewDragState(null);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [previewDragState]);

  useEffect(() => {
    if (openPreviewCardIds.length === 0) {
      return;
    }

    const handleShortcut = (event: KeyboardEvent) => {
      const activeId = selectedCardIdRef.current ?? openPreviewCardIds[openPreviewCardIds.length - 1] ?? null;
      if (!activeId) {
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        setOpenPreviewCardIds((prev) => prev.filter((id) => id !== activeId));
        setPreviewWindowStateMap((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => id !== activeId)));
        setSelectedCardId((prev) => (prev === activeId ? null : prev));
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'm') {
        event.preventDefault();
        setPreviewWindowStateMap((prev) => {
          const current = prev[activeId];
          if (!current) {
            return prev;
          }
          return {
            ...prev,
            [activeId]: {
              ...current,
              minimized: !current.minimized,
            },
          };
        });
      }
    };

    window.addEventListener('keydown', handleShortcut);
    return () => {
      window.removeEventListener('keydown', handleShortcut);
    };
  }, [openPreviewCardIds]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      if (toolbarTagSearchOpen && toolbarSearchRef.current && !toolbarSearchRef.current.contains(target)) {
        setToolbarTagSearchOpen(false);
        setToolbarTagQuery('');
        setToolbarTagActiveIndex(0);
      }

      if (detailTagSearchOpen && detailSearchRef.current && !detailSearchRef.current.contains(target)) {
        setDetailTagSearchOpen(false);
        setDetailTagQuery('');
      }
    };

    window.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
    };
  }, [detailTagSearchOpen, toolbarTagSearchOpen]);

  const onCardMouseDown = (event: ReactMouseEvent<HTMLDivElement>, card: EditableCard) => {
    if (event.button !== 0) {
      return;
    }

    canvasPointerRef.current = { id: card.id, moved: false };
    setSelectedCardId(card.id);
    setDragState({
      id: card.id,
      startX: event.clientX,
      startY: event.clientY,
      originX: card.position.x,
      originY: card.position.y,
    });
  };

  const onCanvasCardClick = (cardId: string) => {
    if (canvasPointerRef.current?.id === cardId && canvasPointerRef.current.moved) {
      canvasPointerRef.current = null;
      return;
    }
    canvasPointerRef.current = null;
    openCardPreview(cardId);
  };

  const handleOpenTemplatePicker = () => {
    setNewCardNameDraft('');
    setIsTemplatePickerOpen(true);
  };

  const openConfirmDialog = (options: Omit<ConfirmDialogState, 'open'>, onConfirm: () => void) => {
    confirmActionRef.current = onConfirm;
    setConfirmDialog({
      open: true,
      title: options.title,
      message: options.message,
      confirmLabel: options.confirmLabel,
    });
  };

  const closeConfirmDialog = () => {
    confirmActionRef.current = null;
    setConfirmDialog((prev) => ({ ...prev, open: false }));
  };

  const handleConfirmDialog = () => {
    const action = confirmActionRef.current;
    closeConfirmDialog();
    action?.();
  };

  const handleConfirmCardRename = () => {
    const nextTitle = renameCardDraft.trim();
    if (!nextTitle || !selectedCard) {
      return;
    }
    updateSelectedCard((card) => ({ ...card, title: nextTitle }));
    setIsCardRenameOpen(false);
  };

  const handleAddCard = (
    template?: SettingTemplate,
    nameInput?: string,
    forcedType?: SettingCard['type'],
    forcedCategory?: string,
    titlePrefix?: string,
    useDefaultDependency = true
  ) => {
    const nextIndex = cards.length + 1;
    let nextId = '';
    do {
      localIdRef.current += 1;
      nextId = `card-local-${localIdRef.current}`;
    } while (cards.some((card) => card.id === nextId));
    const nextCategory = forcedCategory ?? selectedCategory ?? template?.preset.category ?? undefined;
    const nextType = forcedType ?? template?.preset.type ?? 'event';
    const defaultDependencyIds = useDefaultDependency
      ? (defaultDependencyMap[nextType] ?? []).filter((id) => cards.some((card) => card.id === id))
      : [];
    const normalizedName = nameInput?.trim();
    const created: EditableCard = {
      id: nextId,
      title: normalizedName || (template ? `${template.name} ${nextIndex}` : `${titlePrefix ?? cardTypeLabel(nextType)} ${nextIndex}`),
      type: nextType,
      summary: template?.preset.summary ?? '',
      content: template?.preset.content,
      imageUrl: template?.preset.imageUrl,
      category: nextCategory,
      tags: (template?.preset.tags ?? []).map((tag) => ({ ...tag })),
      customFields: (template?.preset.customFields ?? []).map((field) => ({ ...field })),
      color: template?.preset.color ?? cardPalette[nextIndex % cardPalette.length],
      position: {
        x: 120 + (nextIndex % 5) * 56,
        y: 100 + (nextIndex % 4) * 56,
      },
      relations: defaultDependencyIds.map((dependencyId) => ({ targetId: dependencyId, type: '参考' })),
      summaryIterations: [],
    };

    applyCards((prev) => [...prev, created]);
    if (forcedCategory) {
      setSelectedCategory(forcedCategory);
    }
    openCardPreview(created.id);
    setNewCardNameDraft('');
    setIsTemplatePickerOpen(false);
  };

  const handleSaveCardAsTemplate = () => {
    if (!selectedCard) {
      return;
    }

    const name = templateName.trim();
    if (!name) {
      return;
    }

    templateIdRef.current += 1;

    const template: SettingTemplate = {
      id: `tpl-local-${templateIdRef.current}`,
      name,
      preset: {
        type: selectedCard.type,
        summary: selectedCard.summary,
        content: selectedCard.content,
        imageUrl: selectedCard.imageUrl,
        category: selectedCard.category,
        tags: selectedCard.tags.map((tag) => ({ ...tag })),
        customFields: selectedCard.customFields.map((field) => ({ ...field })),
        color: selectedCard.color,
      },
    };

    if (templateScope === 'global') {
      const nextTemplates = [
        ...globalTemplates.filter((item) => item.name !== name),
        template,
      ];
      setGlobalTemplates(nextTemplates);
      persistGlobalLibrary(globalTags, globalCategories, nextTemplates);
    } else {
      const nextTemplates = [
        ...storyTemplates.filter((item) => item.name !== name),
        template,
      ];
      setStoryTemplates(nextTemplates);
      persistStoryLibrary(storyTags, storyCategories, nextTemplates);
    }

    setTemplateName('');
    setIsSaveTemplateOpen(false);
  };

  const handleRenameTemplate = (templateId: string, source: 'global' | 'story', nameInput: string) => {
    const nextName = nameInput.trim();
    if (!nextName) {
      return;
    }

    if (source === 'global') {
      const target = globalTemplates.find((item) => item.id === templateId);
      if (!target || target.name === nextName) {
        setEditingTemplateId(null);
        setEditingTemplateValue('');
        return;
      }
      if (globalTemplates.some((item) => item.name === nextName && item.id !== templateId)) {
        window.alert('全局模版中已存在同名模版');
        return;
      }
      const nextTemplates = globalTemplates.map((item) => (item.id === templateId ? { ...item, name: nextName } : item));
      setGlobalTemplates(nextTemplates);
      persistGlobalLibrary(globalTags, globalCategories, nextTemplates);
    } else {
      const target = storyTemplates.find((item) => item.id === templateId);
      if (!target || target.name === nextName) {
        setEditingTemplateId(null);
        setEditingTemplateValue('');
        return;
      }
      if (storyTemplates.some((item) => item.name === nextName && item.id !== templateId)) {
        window.alert('故事模版中已存在同名模版');
        return;
      }
      const nextTemplates = storyTemplates.map((item) => (item.id === templateId ? { ...item, name: nextName } : item));
      setStoryTemplates(nextTemplates);
      persistStoryLibrary(storyTags, storyCategories, nextTemplates);
    }

    setEditingTemplateId(null);
    setEditingTemplateValue('');
  };

  const handleDeleteTemplate = (templateId: string, source: 'global' | 'story') => {
    openConfirmDialog(
      {
        title: '删除模版',
        message: '确定删除该模版吗？删除后无法恢复。',
        confirmLabel: '删除',
      },
      () => {
        if (source === 'global') {
          const nextTemplates = globalTemplates.filter((item) => item.id !== templateId);
          setGlobalTemplates(nextTemplates);
          persistGlobalLibrary(globalTags, globalCategories, nextTemplates);
        } else {
          const nextTemplates = storyTemplates.filter((item) => item.id !== templateId);
          setStoryTemplates(nextTemplates);
          persistStoryLibrary(storyTags, storyCategories, nextTemplates);
        }

        if (editingTemplateId === templateEditingKey(source, templateId)) {
          setEditingTemplateId(null);
          setEditingTemplateValue('');
        }
      }
    );
  };

  const handleDeleteCardById = (cardId: string, title: string) => {
    openConfirmDialog(
      {
        title: '删除设定卡片',
        message: `确定删除设定卡片“${title || '未命名'}”？此操作不可撤销。`,
        confirmLabel: '删除',
      },
      () => {
        setIsEditorOpen(false);

        applyCards((prev) => {
          const remaining = prev
            .filter((card) => card.id !== cardId)
            .map((card) => ({
              ...card,
              relations: card.relations.filter((relation) => relation.targetId !== cardId),
            }));

          setOpenPreviewCardIds((previewIds) => previewIds.filter((id) => id !== cardId));
          setPreviewWindowStateMap((windowMap) => Object.fromEntries(Object.entries(windowMap).filter(([id]) => id !== cardId)));
          setSelectedCardId((currentSelectedId) => {
            if (currentSelectedId !== cardId) {
              return currentSelectedId;
            }
            return remaining[0]?.id ?? null;
          });
          return remaining;
        });

        setDefaultDependencyMap((prev) => ({
          character: prev.character.filter((id) => id !== cardId),
          location: prev.location.filter((id) => id !== cardId),
          item: prev.item.filter((id) => id !== cardId),
          event: prev.event.filter((id) => id !== cardId),
        }));
      }
    );
  };

  const updateSelectedCard = (updater: (card: EditableCard) => EditableCard) => {
    if (!selectedCard) {
      return;
    }

    applyCards((prev) => prev.map((item) => (item.id === selectedCard.id ? updater(item) : item)));
  };

  const persistGlobalLibrary = (nextTags: SettingTag[], nextCategories: string[], nextTemplates: SettingTemplate[]) => {
    void onGlobalLibraryChange({ tags: nextTags, categories: nextCategories, templates: nextTemplates });
  };

  const persistStoryLibrary = (nextTags: SettingTag[], nextCategories: string[], nextTemplates: SettingTemplate[]) => {
    void onStoryLibraryChange({ tags: nextTags, categories: nextCategories, templates: nextTemplates });
  };

  const handleAssignCategory = (category: string) => {
    const normalized = category.trim();
    if (!normalized || !categories.includes(normalized)) {
      return;
    }
    updateSelectedCard((card) => ({ ...card, category: normalized || undefined }));
  };

  const handleRenameCategory = (from: string, nextNameInput: string) => {
    const nextName = nextNameInput.trim();
    if (!nextName || nextName === from) {
      return;
    }
    if (categories.includes(nextName)) {
      window.alert('分类名称已存在');
      return;
    }

    if (globalCategories.includes(from)) {
      const nextCategories = globalCategories.map((item) => (item === from ? nextName : item));
      setGlobalCategories(nextCategories);
      persistGlobalLibrary(globalTags, nextCategories, globalTemplates);
    }

    if (storyCategories.includes(from)) {
      const nextCategories = storyCategories.map((item) => (item === from ? nextName : item));
      setStoryCategories(nextCategories);
      persistStoryLibrary(storyTags, nextCategories, storyTemplates);
    }

    applyCards((prev) => prev.map((card) => (card.category === from ? { ...card, category: nextName } : card)));

    if (selectedCategory === from) {
      setSelectedCategory(nextName);
    }

    setEditingCategoryName(null);
    setEditingCategoryValue('');
  };

  const handleAddCategory = () => {
    const value = categoryManagerName.trim();
    if (!value) {
      return;
    }

    if (managerCategoryScope === 'global') {
      if (globalCategories.includes(value)) {
        return;
      }
      const nextCategories = [...globalCategories, value];
      setGlobalCategories(nextCategories);
      persistGlobalLibrary(globalTags, nextCategories, globalTemplates);
    } else {
      if (storyCategories.includes(value)) {
        return;
      }
      const nextCategories = [...storyCategories, value];
      setStoryCategories(nextCategories);
      persistStoryLibrary(storyTags, nextCategories, storyTemplates);
    }

    setCategoryManagerName('');
  };

  const handleDeleteCategory = (name: string) => {
    const existsInGlobal = globalCategories.includes(name);
    const existsInStory = storyCategories.includes(name);

    if (existsInGlobal) {
      const nextCategories = globalCategories.filter((category) => category !== name);
      setGlobalCategories(nextCategories);
      persistGlobalLibrary(globalTags, nextCategories, globalTemplates);
    }

    if (existsInStory) {
      const nextCategories = storyCategories.filter((category) => category !== name);
      setStoryCategories(nextCategories);
      persistStoryLibrary(storyTags, nextCategories, storyTemplates);
    }

    applyCards((prev) => prev.map((card) => (card.category === name ? { ...card, category: undefined } : card)));
    if (selectedCategory === name) {
      setSelectedCategory(null);
    }
  };

  const handleAddCustomField = (name: string) => {
    const normalized = name.trim();
    if (!normalized || !selectedCard) {
      return;
    }

    templateIdRef.current += 1;
    const fieldId = `field-local-${templateIdRef.current}`;

    updateSelectedCard((card) => {
      if (card.customFields.some((field) => field.name === normalized)) {
        return card;
      }

      const nextIndex = card.customFields.length;

      return {
        ...card,
        customFields: [
          ...card.customFields,
          {
            id: fieldId,
            name: normalized,
            value: '',
            size: 'md',
            x: (nextIndex % 3) * (FIELD_UNIT_WIDTH + 12),
            y: Math.floor(nextIndex / 3) * (FIELD_UNIT_HEIGHT + 12),
            w: 1,
            h: 1,
          },
        ],
      };
    });
    setNewCustomFieldName('');
  };

  const handleUpdateCustomField = (index: number, nextField: Partial<SettingCustomField>) => {
    updateSelectedCard((card) => ({
      ...card,
      customFields: card.customFields.map((field, currentIndex) =>
        currentIndex === index
          ? {
              ...field,
              ...nextField,
            }
          : field
      ),
    }));
  };

  const handleDeleteCustomField = (index: number) => {
    if (!selectedCard) {
      return;
    }

    const fieldName = selectedCard.customFields[index]?.name?.trim() || `属性 ${index + 1}`;
    const deletingFieldId = selectedCard.customFields[index]?.id;
    openConfirmDialog(
      {
        title: '删除属性',
        message: `确定删除属性“${fieldName}”？该属性上的关联也会一并删除。`,
        confirmLabel: '删除',
      },
      () => {
        updateSelectedCard((card) => ({
          ...card,
          customFields: card.customFields.filter((_, currentIndex) => currentIndex !== index),
        }));

        if (!deletingFieldId) {
          return;
        }

        applyCards((prev) =>
          prev.map((card) => ({
            ...card,
            relations: card.relations.filter(
              (relation) =>
                !(
                  relation.sourceFieldId === deletingFieldId ||
                  (relation.targetId === selectedCard.id && relation.targetFieldId === deletingFieldId)
                )
            ),
          }))
        );
      }
    );
  };

  const handleDeleteRelation = (relationIndex: number) => {
    updateSelectedCard((card) => ({
      ...card,
      relations: card.relations.filter((_, index) => index !== relationIndex),
    }));
  };

  const reorderCustomFields = (fromId: string, toId: string, placement: 'before' | 'after') => {
    if (!fromId || !toId || fromId === toId) {
      return;
    }

    updateSelectedCard((card) => {
      const fromIndex = card.customFields.findIndex((field) => field.id === fromId);
      const toIndex = card.customFields.findIndex((field) => field.id === toId);
      if (fromIndex === -1 || toIndex === -1) {
        return card;
      }

      const nextFields = [...card.customFields];
      const [moved] = nextFields.splice(fromIndex, 1);
      let insertIndex = toIndex;
      if (fromIndex < toIndex) {
        insertIndex -= 1;
      }
      if (placement === 'after') {
        insertIndex += 1;
      }
      insertIndex = Math.max(0, Math.min(nextFields.length, insertIndex));
      nextFields.splice(insertIndex, 0, moved);

      return {
        ...card,
        customFields: nextFields,
      };
    });
  };

  const onFieldDragStart = (event: ReactDragEvent<HTMLDivElement>, fieldId: string) => {
    setDraggingFieldId(fieldId);
    setDragOverField({ id: fieldId, placement: 'before' });
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', fieldId);
  };

  const onFieldDrop = (event: ReactDragEvent<HTMLDivElement>, targetFieldId: string) => {
    event.preventDefault();
    const sourceFieldId = draggingFieldId ?? event.dataTransfer.getData('text/plain');
    const placement = dragOverField?.id === targetFieldId ? dragOverField.placement : 'before';
    reorderCustomFields(sourceFieldId, targetFieldId, placement);
    setDraggingFieldId(null);
    setDragOverField(null);
  };

  const onFieldDragOver = (event: ReactDragEvent<HTMLDivElement>, targetFieldId: string) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const placement: 'before' | 'after' = event.clientY - rect.top < rect.height / 2 ? 'before' : 'after';
    setDragOverField({ id: targetFieldId, placement });
  };

  const getFieldRelations = (fieldId: string) => {
    if (!selectedCard) return [];
    return selectedCard.relations
      .map((relation, index) => ({ ...relation, index }))
      .filter((relation) => relation.sourceFieldId === fieldId);
  };

  const getCardLevelRelations = (card: EditableCard) => {
    return card.relations
      .map((relation, index) => ({ ...relation, index }))
      .filter((relation) => !relation.sourceFieldId);
  };

  const handleCreateFieldRelation = (fieldId: string) => {
    const targetCardId = fieldRelationTarget[fieldId];
    const typeName = fieldRelationType[fieldId]?.trim() || '参考';
    
    if (!selectedCard || !targetCardId || targetCardId === selectedCard.id) {
      return;
    }

    const nextRelation = {
      targetId: targetCardId,
      type: typeName,
      sourceFieldId: fieldId,
    };

    updateSelectedCard((card) => {
      const exists = card.relations.some(
        (relation) =>
          relation.targetId === nextRelation.targetId &&
          relation.type === nextRelation.type &&
          relation.sourceFieldId === nextRelation.sourceFieldId
      );
      if (exists) return card;
      return {
        ...card,
        relations: [...card.relations, nextRelation],
      };
    });

    setFieldRelationTarget((prev) => ({ ...prev, [fieldId]: '' }));
    setFieldRelationType((prev) => ({ ...prev, [fieldId]: '' }));
  };

  const handleCreateCardLevelRelation = () => {
    const targetCardId = cardDependencyTarget;
    const typeName = cardDependencyType.trim() || '参考';
    if (!selectedCard || !targetCardId || targetCardId === selectedCard.id) {
      return;
    }

    updateSelectedCard((card) => {
      const exists = card.relations.some(
        (relation) => relation.targetId === targetCardId && relation.type === typeName && !relation.sourceFieldId
      );
      if (exists) {
        return card;
      }
      return {
        ...card,
        relations: [...card.relations, { targetId: targetCardId, type: typeName }],
      };
    });

    setCardDependencyTarget('');
    setCardDependencyType('参考');
  };

  const toggleDefaultDependency = (type: SettingCard['type'], targetId: string) => {
    setDefaultDependencyMap((prev) => {
      const current = prev[type] ?? [];
      const exists = current.includes(targetId);
      return {
        ...prev,
        [type]: exists ? current.filter((id) => id !== targetId) : [...current, targetId],
      };
    });
  };

  const isCardDefaultDependencyForType = (cardId: string, type: SettingCard['type']) => {
    return (defaultDependencyMap[type] ?? []).includes(cardId);
  };

  const toggleCardDefaultDependencyForType = (cardId: string, type: SettingCard['type']) => {
    toggleDefaultDependency(type, cardId);
  };

  const resolveIterationReasonLabel = (reasonType: IterationReasonType, reasonText?: string, reasonCardId?: string): string => {
    if (reasonType === 'card') {
      const target = cards.find((card) => card.id === reasonCardId);
      return target ? `关联卡片：${target.title}` : '关联卡片：未指定';
    }
    return reasonText?.trim() || '未填写原因';
  };

  const buildIterationOptionLabel = (
    createdAt: string,
    reasonType: IterationReasonType,
    reasonText?: string,
    reasonCardId?: string,
    versionTag?: string
  ): string => {
    const timeLabel = new Date(createdAt).toLocaleString('zh-CN');
    const reasonLabel = resolveIterationReasonLabel(reasonType, reasonText, reasonCardId);
    return `${versionTag?.trim() || '未标记版本'} · ${timeLabel} · ${reasonLabel}`;
  };

  const getCurrentFieldIterationMeta = (field: SettingCustomField): string | null => {
    const activeId = field.activeIterationId;
    if (!activeId) {
      return null;
    }
    const active = (field.iterations ?? []).find((item) => item.id === activeId);
    if (!active) {
      return null;
    }
    return resolveIterationReasonLabel(active.reasonType, active.reasonText, active.reasonCardId);
  };

  const getCurrentFieldIterationTag = (field: SettingCustomField): string | null => {
    const activeId = field.activeIterationId;
    if (!activeId) {
      return null;
    }
    const active = (field.iterations ?? []).find((item) => item.id === activeId);
    if (!active?.versionTag?.trim()) {
      return null;
    }
    return active.versionTag.trim();
  };

  const getCurrentSummaryIterationMeta = (card: EditableCard): string | null => {
    const activeId = card.activeSummaryIterationId;
    if (!activeId) {
      return null;
    }
    const active = (card.summaryIterations ?? []).find((item) => item.id === activeId);
    if (!active) {
      return null;
    }
    return resolveIterationReasonLabel(active.reasonType, active.reasonText, active.reasonCardId);
  };

  const getCurrentSummaryIterationTag = (card: EditableCard): string | null => {
    const activeId = card.activeSummaryIterationId;
    if (!activeId) {
      return null;
    }
    const active = (card.summaryIterations ?? []).find((item) => item.id === activeId);
    if (!active?.versionTag?.trim()) {
      return null;
    }
    return active.versionTag.trim();
  };

  const openFieldIterationDraft = (field: SettingCustomField, iteration?: SettingFieldIteration) => {
    const fieldId = field.id ?? '';
    if (!fieldId) {
      return;
    }
    setFieldIterationDrafts((prev) => ({
      ...prev,
      [fieldId]: {
        open: true,
        value: iteration?.value ?? field.value,
        versionTag: iteration?.versionTag ?? '',
        reasonType: iteration?.reasonType ?? 'manual',
        reasonText: iteration?.reasonText ?? '',
        reasonCardId: iteration?.reasonCardId ?? '',
        editingIterationId: iteration?.id,
      },
    }));
  };

  const closeFieldIterationDraft = (fieldId: string) => {
    setFieldIterationDrafts((prev) => ({
      ...prev,
      [fieldId]: {
        open: false,
        value: '',
        versionTag: '',
        reasonType: 'manual',
        reasonText: '',
        reasonCardId: '',
      },
    }));
  };

  const saveFieldIteration = (fieldIndex: number) => {
    if (!selectedCard) {
      return;
    }
    const field = selectedCard.customFields[fieldIndex];
    const fieldId = field?.id ?? '';
    if (!fieldId) {
      return;
    }
    const draft = fieldIterationDrafts[fieldId];
    if (!draft) {
      return;
    }
    const nextValue = draft.value.trim();
    const nextVersionTag = draft.versionTag.trim();
    if (!nextValue) {
      setAiError('迭代后的属性值不能为空。');
      return;
    }

    updateSelectedCard((card) => {
      const targetField = card.customFields[fieldIndex];
      if (!targetField) {
        return card;
      }
      const iterations = [...(targetField.iterations ?? [])];
      let activeIterationId = targetField.activeIterationId;

      if (draft.editingIterationId) {
        const iterationIndex = iterations.findIndex((item) => item.id === draft.editingIterationId);
        if (iterationIndex < 0) {
          return card;
        }
        iterations[iterationIndex] = {
          ...iterations[iterationIndex],
          value: nextValue,
          versionTag: nextVersionTag || undefined,
          reasonType: draft.reasonType,
          reasonText: draft.reasonType === 'manual' ? draft.reasonText.trim() : undefined,
          reasonCardId: draft.reasonType === 'card' ? draft.reasonCardId : undefined,
        };
        activeIterationId = iterations[iterationIndex].id;
      } else {
        const nextIteration: SettingFieldIteration = {
          id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `iter-${Date.now()}`,
          value: nextValue,
          versionTag: nextVersionTag || undefined,
          reasonType: draft.reasonType,
          reasonText: draft.reasonType === 'manual' ? draft.reasonText.trim() : undefined,
          reasonCardId: draft.reasonType === 'card' ? draft.reasonCardId : undefined,
          createdAt: new Date().toISOString(),
        };
        iterations.unshift(nextIteration);
        activeIterationId = nextIteration.id;
      }

      const nextFields = card.customFields.map((item, index) =>
        index === fieldIndex
          ? {
              ...item,
              value: nextValue,
              iterations,
              activeIterationId,
            }
          : item
      );

      return {
        ...card,
        customFields: nextFields,
      };
    });

    closeFieldIterationDraft(fieldId);
  };

  const setFieldIterationAsCurrent = (fieldIndex: number, iterationId: string) => {
    updateSelectedCard((card) => {
      const targetField = card.customFields[fieldIndex];
      if (!targetField) {
        return card;
      }
      const targetIteration = (targetField.iterations ?? []).find((item) => item.id === iterationId);
      if (!targetIteration) {
        return card;
      }
      const nextFields = card.customFields.map((item, index) =>
        index === fieldIndex
          ? {
              ...item,
              value: targetIteration.value,
              activeIterationId: targetIteration.id,
            }
          : item
      );
      return {
        ...card,
        customFields: nextFields,
      };
    });
  };

  const openSummaryIterationDraft = (iteration?: SettingSummaryIteration) => {
    setSummaryIterationDraft({
      open: true,
      value: iteration?.value ?? (selectedCard?.summary ?? ''),
      versionTag: iteration?.versionTag ?? '',
      reasonType: iteration?.reasonType ?? 'manual',
      reasonText: iteration?.reasonText ?? '',
      reasonCardId: iteration?.reasonCardId ?? '',
      editingIterationId: iteration?.id,
    });
  };

  const closeSummaryIterationDraft = () => {
    setSummaryIterationDraft({
      open: false,
      value: '',
      versionTag: '',
      reasonType: 'manual',
      reasonText: '',
      reasonCardId: '',
    });
  };

  const saveSummaryIteration = () => {
    if (!selectedCard) {
      return;
    }
    const nextSummary = summaryIterationDraft.value.trim();
    const nextVersionTag = summaryIterationDraft.versionTag.trim();
    if (!nextSummary) {
      setAiError('摘要迭代内容不能为空。');
      return;
    }

    updateSelectedCard((card) => {
      const iterations = [...(card.summaryIterations ?? [])];
      let activeSummaryIterationId = card.activeSummaryIterationId;
      if (summaryIterationDraft.editingIterationId) {
        const iterationIndex = iterations.findIndex((item) => item.id === summaryIterationDraft.editingIterationId);
        if (iterationIndex < 0) {
          return card;
        }
        iterations[iterationIndex] = {
          ...iterations[iterationIndex],
          value: nextSummary,
          versionTag: nextVersionTag || undefined,
          reasonType: summaryIterationDraft.reasonType,
          reasonText: summaryIterationDraft.reasonType === 'manual' ? summaryIterationDraft.reasonText.trim() : undefined,
          reasonCardId: summaryIterationDraft.reasonType === 'card' ? summaryIterationDraft.reasonCardId : undefined,
        };
        activeSummaryIterationId = iterations[iterationIndex].id;
      } else {
        const nextIteration: SettingSummaryIteration = {
          id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `summary-iter-${Date.now()}`,
          value: nextSummary,
          versionTag: nextVersionTag || undefined,
          reasonType: summaryIterationDraft.reasonType,
          reasonText: summaryIterationDraft.reasonType === 'manual' ? summaryIterationDraft.reasonText.trim() : undefined,
          reasonCardId: summaryIterationDraft.reasonType === 'card' ? summaryIterationDraft.reasonCardId : undefined,
          createdAt: new Date().toISOString(),
        };
        iterations.unshift(nextIteration);
        activeSummaryIterationId = nextIteration.id;
      }
      return {
        ...card,
        summary: nextSummary,
        summaryIterations: iterations,
        activeSummaryIterationId,
      };
    });

    closeSummaryIterationDraft();
  };

  const setSummaryIterationAsCurrent = (iterationId: string) => {
    updateSelectedCard((card) => {
      const targetIteration = (card.summaryIterations ?? []).find((item) => item.id === iterationId);
      if (!targetIteration) {
        return card;
      }
      return {
        ...card,
        summary: targetIteration.value,
        activeSummaryIterationId: targetIteration.id,
      };
    });
  };

  const toggleFieldRelation = (fieldId: string) => {
    setFieldRelationOpen((prev) => ({ ...prev, [fieldId]: !prev[fieldId] }));
  };

  const openCardPreview = (cardId: string) => {
    if (!cards.some((card) => card.id === cardId)) {
      return;
    }
    setSelectedCardId(cardId);
    setOpenPreviewCardIds((prev) => {
      if (prev.includes(cardId)) {
        return [...prev.filter((id) => id !== cardId), cardId];
      }
      return [...prev, cardId];
    });
    setPreviewWindowStateMap((prev) => {
      if (prev[cardId]) {
        return {
          ...prev,
          [cardId]: {
            ...prev[cardId],
            minimized: false,
          },
        };
      }
      const seed = Object.keys(prev).length;
      return {
        ...prev,
        [cardId]: {
          x: 92 + (seed % 8) * 28,
          y: 56 + (seed % 8) * 18,
          minimized: false,
        },
      };
    });
  };

  const closeCardPreview = (cardId: string) => {
    setOpenPreviewCardIds((prev) => prev.filter((id) => id !== cardId));
    setPreviewWindowStateMap((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => id !== cardId)));
    setSelectedCardId((prev) => (prev === cardId ? null : prev));
  };

  const focusCardPreview = (cardId: string) => {
    setSelectedCardId(cardId);
    setOpenPreviewCardIds((prev) => {
      if (!prev.includes(cardId)) {
        return prev;
      }
      return [...prev.filter((id) => id !== cardId), cardId];
    });
  };

  const togglePreviewMinimized = (cardId: string) => {
    setPreviewWindowStateMap((prev) => {
      const current = prev[cardId];
      if (!current) {
        return prev;
      }
      return {
        ...prev,
        [cardId]: {
          ...current,
          minimized: !current.minimized,
        },
      };
    });
  };

  const startPreviewDrag = (event: ReactMouseEvent<HTMLElement>, cardId: string) => {
    if (event.button !== 0) {
      return;
    }

    const windowState = previewWindowStateMap[cardId];
    if (!windowState) {
      return;
    }

    event.preventDefault();
    focusCardPreview(cardId);
    setPreviewDragState({
      id: cardId,
      startX: event.clientX,
      startY: event.clientY,
      originX: windowState.x,
      originY: windowState.y,
    });
  };

  const resolveRelationTarget = (relation: { targetId: string; targetFieldId?: string }) => {
    const targetCard = cards.find((card) => card.id === relation.targetId);
    const targetField = relation.targetFieldId
      ? targetCard?.customFields.find((item) => item.id === relation.targetFieldId)
      : null;
    return { targetCard, targetField };
  };

  const upsertTag = (name: string, color: string, scope: 'global' | 'story') => {
    const normalized = normalizeTagName(name);
    if (!normalized) {
      return;
    }

    if (scope === 'global') {
      const exists = globalTags.some((tag) => tag.name === normalized);
      const nextTags = exists
        ? globalTags.map((tag) => (tag.name === normalized ? { ...tag, color } : tag))
        : [...globalTags, { name: normalized, color }];
      setGlobalTags(nextTags);
      persistGlobalLibrary(nextTags, globalCategories, globalTemplates);
      return;
    }

    const exists = storyTags.some((tag) => tag.name === normalized);
    const nextTags = exists
      ? storyTags.map((tag) => (tag.name === normalized ? { ...tag, color } : tag))
      : [...storyTags, { name: normalized, color }];
    setStoryTags(nextTags);
    persistStoryLibrary(nextTags, storyCategories, storyTemplates);
  };

  const addTagToSelected = (name: string, color: string) => {
    const normalized = normalizeTagName(name);
    if (!normalized || !selectedCard) {
      return;
    }

    updateSelectedCard((card) => {
      const exists = card.tags.some((item) => item.name === normalized);
      if (exists) {
        return card;
      }

      return {
        ...card,
        tags: [...card.tags, { name: normalized, color }],
      };
    });
  };

  const handleCreateTag = () => {
    const normalized = normalizeTagName(tagManagerName);
    if (!normalized) {
      return;
    }

    upsertTag(normalized, tagManagerColor, managerTagScope);
    setTagManagerName('');
    setTagManagerColor(randomTagColor());
  };

  const handleSetTagColor = (name: string, color: string) => {
    if (globalTags.some((tag) => tag.name === name)) {
      upsertTag(name, color, 'global');
    }
    if (storyTags.some((tag) => tag.name === name)) {
      upsertTag(name, color, 'story');
    }

    applyCards((prev) =>
      prev.map((card) => ({
        ...card,
        tags: card.tags.map((tag) => (tag.name === name ? { ...tag, color } : tag)),
      }))
    );
  };

  const handleDeleteTag = (name: string) => {
    if (globalTags.some((tag) => tag.name === name)) {
      const nextTags = globalTags.filter((tag) => tag.name !== name);
      setGlobalTags(nextTags);
      persistGlobalLibrary(nextTags, globalCategories, globalTemplates);
    }
    if (storyTags.some((tag) => tag.name === name)) {
      const nextTags = storyTags.filter((tag) => tag.name !== name);
      setStoryTags(nextTags);
      persistStoryLibrary(nextTags, storyCategories, storyTemplates);
    }

    applyCards((prev) => prev.map((card) => ({ ...card, tags: card.tags.filter((tag) => tag.name !== name) })));
    setActiveTagFilters((prev) => prev.filter((tag) => tag !== name));
  };

  const handleRemoveTagFromSelected = (name: string) => {
    if (!selectedCard) {
      return;
    }

    updateSelectedCard((card) => ({
      ...card,
      tags: card.tags.filter((tag) => tag.name !== name),
    }));
  };

  const toggleTagFilter = (name: string) => {
    setActiveTagFilters((prev) => {
      if (prev.includes(name)) {
        return prev.filter((tag) => tag !== name);
      }
      return [...prev, name];
    });
  };

  const createAndUseToolbarTag = () => {
    const normalized = normalizeTagName(toolbarTagQuery);
    if (!normalized) {
      return;
    }

    upsertTag(normalized, tagManagerColor, 'global');
    setActiveTagFilters((prev) => (prev.includes(normalized) ? prev : [...prev, normalized]));
    setToolbarTagQuery('');
    setToolbarTagSearchOpen(false);
    setToolbarTagActiveIndex(0);
    setTagManagerColor(randomTagColor());
  };

  const createAndAddDetailTag = () => {
    const normalized = normalizeTagName(detailTagQuery);
    if (!normalized) {
      return;
    }

    upsertTag(normalized, tagManagerColor, 'global');
    addTagToSelected(normalized, tagManagerColor);
    setDetailTagQuery('');
    setDetailTagSearchOpen(false);
    setTagManagerColor(randomTagColor());
  };

  const resolveAiEndpoint = (modelId: string, customEndpoint?: string) => {
    const normalized = customEndpoint?.trim();
    if (normalized) {
      return normalized;
    }

    if (modelId.startsWith('openai:')) {
      return 'https://api.openai.com/v1/chat/completions';
    }
    if (modelId.startsWith('deepseek:')) {
      return 'https://api.deepseek.com/v1/chat/completions';
    }
    if (modelId.startsWith('qwen:')) {
      return 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
    }
    return '';
  };

  const buildAiCardPayload = (card: EditableCard) => ({
    card: {
      title: card.title,
      summary: card.summary,
      category: card.category ?? null,
      tags: card.tags.map((tag) => ({ name: tag.name, color: tag.color })),
      customFields: card.customFields.map((field) => ({ id: field.id ?? '', name: field.name, value: field.value })),
      summaryIterations: (card.summaryIterations ?? []).length,
    },
    context: {
      categoryOptions: categories,
      tagOptions,
      fieldNameHints: customFieldPresets,
      language: 'zh-CN' as const,
    },
  });

  const requestAiJson = async (systemPrompt: string, userPrompt: string) => {
    if (!activeAiModelConfig?.apiKey) {
      throw new Error('当前未配置可用模型密钥，请先在首页模型设置中配置。');
    }

    const endpoint = resolveAiEndpoint(activeAiModelId, activeAiModelConfig.endpoint);
    if (!endpoint) {
      throw new Error('当前模型缺少可用接口地址，请在模型密钥设置中配置 endpoint。');
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${activeAiModelConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: activeAiModelId.split(':')[1],
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`请求失败（${response.status}）`);
    }

    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('模型未返回内容');
    }
    return JSON.parse(extractJsonObject(content)) as { summary?: unknown; suggestions?: unknown; patch?: unknown; field?: unknown };
  };

  const syncAiGuideAnswers = (questions: string[], previousAnswers: string[]) => {
    return questions.map((_, index) => previousAnswers[index] ?? '');
  };

  const generateAiGuideQuestions = async () => {
    if (!selectedCard) {
      return;
    }

    setAiGuideQuestionBusy(true);
    setAiError(null);
    try {
      const payload = {
        category: selectedCard.category ?? '未分类',
        tags: selectedCard.tags.map((tag) => tag.name),
        fieldNames: selectedCard.customFields.map((field) => field.name),
        summary: selectedCard.summary,
      };
      const parsed = await requestAiJson(
        '你是低压力的设定引导助手。基于给定分类、标签、已有属性，生成 4 个循序渐进问题：先允许用户只写已有想法，再逐步补全缺失信息。不要要求一次写全。仅输出 JSON：{"questions":["...", "..."]}。避免默认角色视角，问题要匹配当前分类语义。',
        JSON.stringify(payload, null, 2)
      );
      const nextQuestions = Array.isArray((parsed as { questions?: unknown }).questions)
        ? ((parsed as { questions?: unknown }).questions as unknown[])
            .map((item) => (typeof item === 'string' ? item.trim() : ''))
            .filter((item) => item.length > 0)
            .slice(0, 5)
        : [];

      const finalQuestions = nextQuestions.length > 0 ? nextQuestions : DEFAULT_GUIDE_QUESTIONS;
      setAiGuideQuestions(finalQuestions);
      setAiGuideAnswers((prev) => syncAiGuideAnswers(finalQuestions, prev));
      setAiGuideQuestionIndex(0);
    } catch (error) {
      setAiGuideQuestions(DEFAULT_GUIDE_QUESTIONS);
      setAiGuideAnswers((prev) => syncAiGuideAnswers(DEFAULT_GUIDE_QUESTIONS, prev));
      setAiGuideQuestionIndex(0);
      setAiError(error instanceof Error ? `引导问题生成失败：${error.message}` : '引导问题生成失败');
    } finally {
      setAiGuideQuestionBusy(false);
    }
  };

  const handleOpenAiGuide = async () => {
    setIsAiGuideOpen(true);
    await generateAiGuideQuestions();
  };

  const requestPolishInstruction = (targetLabel: string): Promise<string | null> => {
    setPolishPromptTarget(targetLabel);
    setPolishPromptDraft(aiGuidePolishInstruction);
    setIsPolishPromptOpen(true);
    return new Promise((resolve) => {
      polishPromptResolverRef.current = resolve;
    });
  };

  const closePolishPrompt = (value: string | null) => {
    const resolver = polishPromptResolverRef.current;
    polishPromptResolverRef.current = null;
    setIsPolishPromptOpen(false);
    if (!resolver) {
      return;
    }
    resolver(value);
  };

  const confirmPolishPrompt = () => {
    const normalized = polishPromptDraft.trim();
    if (!normalized) {
      setAiError('润色方案不能为空');
      return;
    }

    setAiGuidePolishInstruction(normalized);
    setRecentPolishPrompts((prev) => {
      const existing = prev.find((item) => item.content === normalized);
      const updated: RecentPolishPrompt = existing
        ? { ...existing, updatedAt: new Date().toISOString() }
        : {
            id: crypto.randomUUID(),
            name: `方案 ${new Date().toLocaleDateString('zh-CN')}`,
            content: normalized,
            pinned: false,
            updatedAt: new Date().toISOString(),
          };
      const next = [updated, ...prev.filter((item) => item.id !== updated.id)];
      return sortRecentPolishPrompts(next).slice(0, 8);
    });
    closePolishPrompt(normalized);
  };

  const handleToggleRecentPromptPin = (id: string) => {
    setRecentPolishPrompts((prev) => {
      const next = prev.map((item) => (item.id === id ? { ...item, pinned: !item.pinned, updatedAt: new Date().toISOString() } : item));
      return sortRecentPolishPrompts(next);
    });
  };

  const handleDeleteRecentPrompt = (id: string) => {
    setRecentPolishPrompts((prev) => prev.filter((item) => item.id !== id));
  };

  const handleRenameRecentPrompt = (id: string) => {
    const target = recentPolishPrompts.find((item) => item.id === id);
    if (!target) {
      return;
    }
    setRenamePromptId(id);
    setRenamePromptDraft(target.name);
    setIsRenamePromptOpen(true);
  };

  const closeRenamePrompt = () => {
    setIsRenamePromptOpen(false);
    setRenamePromptId(null);
    setRenamePromptDraft('');
  };

  const confirmRenamePrompt = () => {
    if (!renamePromptId) {
      return;
    }
    const normalized = renamePromptDraft.trim();
    if (!normalized) {
      setAiError('方案名称不能为空');
      return;
    }
    setRecentPolishPrompts((prev) =>
      prev.map((item) => (item.id === renamePromptId ? { ...item, name: normalized, updatedAt: new Date().toISOString() } : item))
    );
    closeRenamePrompt();
  };

  const handleApplyAiSummary = () => {
    const summary = aiSummaryDraft.trim();
    if (!summary || !selectedCard) {
      return;
    }
    const snapshot = cloneEditableCard(selectedCard);
    setAiUndoStack((prev) => [
      ...prev.slice(-39),
      { id: crypto.randomUUID(), cardId: selectedCard.id, cardSnapshot: snapshot, label: '摘要整理', createdAt: new Date().toISOString() },
    ]);
    updateSelectedCard((card) => ({ ...card, summary }));
    setIsAiResultOpen(false);
  };

  const handleAddCustomFieldWithValue = (name: string, value: string) => {
    const normalized = name.trim();
    if (!normalized || !selectedCard) {
      return;
    }

    updateSelectedCard((card) => {
      const existingIndex = card.customFields.findIndex((field) => field.name === normalized);
      if (existingIndex >= 0) {
        const existingField = card.customFields[existingIndex];
        if (existingField.value.trim().length > 0) {
          return card;
        }
        return {
          ...card,
          customFields: card.customFields.map((field, index) =>
            index === existingIndex
              ? {
                  ...field,
                  value,
                }
              : field
          ),
        };
      }

      templateIdRef.current += 1;
      const fieldId = `field-local-${templateIdRef.current}`;

      const nextIndex = card.customFields.length;
      return {
        ...card,
        customFields: [
          ...card.customFields,
          {
            id: fieldId,
            name: normalized,
            value,
            size: 'md',
            x: (nextIndex % 3) * (FIELD_UNIT_WIDTH + 12),
            y: Math.floor(nextIndex / 3) * (FIELD_UNIT_HEIGHT + 12),
            w: 1,
            h: 1,
          },
        ],
      };
    });
  };

  const handleApplyAiSuggestions = () => {
    const selected = aiSuggestions.filter((item) => selectedSuggestionNames.includes(item.name));
    if (selected.length === 0 || !selectedCard) {
      return;
    }

    const snapshot = cloneEditableCard(selectedCard);
    setAiUndoStack((prev) => [
      ...prev.slice(-39),
      { id: crypto.randomUUID(), cardId: selectedCard.id, cardSnapshot: snapshot, label: '属性建议', createdAt: new Date().toISOString() },
    ]);

    selected.forEach((item) => {
      handleAddCustomFieldWithValue(item.name, item.sampleValue);
    });
    setIsAiResultOpen(false);
  };

  const handleApplyAiNormalizePatch = () => {
    if (!selectedCard || !aiNormalizePatch) {
      return;
    }

    const enabledCount = Object.values(normalizeApplySelection).filter(Boolean).length;
    if (enabledCount === 0) {
      setAiError('请至少勾选一项再应用格式整理。');
      return;
    }

    const snapshot = cloneEditableCard(selectedCard);
    setAiUndoStack((prev) => [
      ...prev.slice(-39),
      { id: crypto.randomUUID(), cardId: selectedCard.id, cardSnapshot: snapshot, label: '格式整理', createdAt: new Date().toISOString() },
    ]);

    updateSelectedCard((card) => {
      const next = { ...card };
      if (normalizeApplySelection.title && typeof aiNormalizePatch.title === 'string') {
        next.title = aiNormalizePatch.title;
      }
      if (normalizeApplySelection.summary && typeof aiNormalizePatch.summary === 'string') {
        next.summary = aiNormalizePatch.summary;
      }
      if (normalizeApplySelection.category && 'category' in aiNormalizePatch) {
        next.category = aiNormalizePatch.category ?? undefined;
      }
      if (normalizeApplySelection.tags && Array.isArray(aiNormalizePatch.tags)) {
        next.tags = aiNormalizePatch.tags.map((item) => ({ name: item.name.trim(), color: item.color || randomTagColor() }));
      }
      if (normalizeApplySelection.customFields && Array.isArray(aiNormalizePatch.customFields)) {
        next.customFields = aiNormalizePatch.customFields.map((field, index) => ({
          id:
            field.id ??
            (() => {
              templateIdRef.current += 1;
              return `field-local-${templateIdRef.current}`;
            })(),
          name: field.name.trim(),
          value: field.value,
          size: 'md',
          x: (index % 3) * (FIELD_UNIT_WIDTH + 12),
          y: Math.floor(index / 3) * (FIELD_UNIT_HEIGHT + 12),
          w: 1,
          h: 1,
        }));
      }
      return next;
    });

    setIsAiResultOpen(false);
    setAiNormalizePatch(null);
  };

  const handleApplyAiFieldDraft = () => {
    if (!selectedCard || !aiFieldDraft) {
      return;
    }

    const snapshot = cloneEditableCard(selectedCard);
    setAiUndoStack((prev) => [
      ...prev.slice(-39),
      { id: crypto.randomUUID(), cardId: selectedCard.id, cardSnapshot: snapshot, label: `属性润色:${aiFieldDraft.name}`, createdAt: new Date().toISOString() },
    ]);

    updateSelectedCard((card) => ({
      ...card,
      customFields: card.customFields.map((field) => {
        const isTarget = aiFieldDraft.fieldId ? field.id === aiFieldDraft.fieldId : field.name === aiFieldDraft.name;
        if (!isTarget) {
          return field;
        }
        return { ...field, value: aiFieldDraft.nextValue };
      }),
    }));

    setIsAiResultOpen(false);
    setAiFieldDraft(null);
  };

  const handleUndoLastAiApply = () => {
    if (!selectedCard) {
      return;
    }

    const latest = selectedCardUndoEntries[0];
    if (!latest) {
      setAiError('当前卡片没有可撤销的 AI 应用记录。');
      return;
    }

    const realIndex = aiUndoStack.findIndex((entry) => entry.id === latest.id);
    if (realIndex < 0) {
      setAiError('撤销记录不存在，可能已被清理。');
      return;
    }

    setAiUndoStack((prev) => prev.filter((entry, index) => !(entry.cardId === latest.cardId && index >= realIndex)));
    applyCards((cardsState) => cardsState.map((item) => (item.id === latest.cardId ? cloneEditableCard(latest.cardSnapshot) : item)));
  };

  const handleRestoreAiHistory = (entryId: string) => {
    const targetIndex = aiUndoStack.findIndex((entry) => entry.id === entryId);
    if (targetIndex < 0) {
      setAiError('目标历史不存在，可能已被清理。');
      return;
    }
    const target = aiUndoStack[targetIndex];
    setAiUndoStack((prev) => prev.filter((entry, index) => !(entry.cardId === target.cardId && index >= targetIndex)));
    applyCards((cardsState) => cardsState.map((item) => (item.id === target.cardId ? cloneEditableCard(target.cardSnapshot) : item)));
    setIsAiHistoryOpen(false);
  };

  const runAiGuideFlow = async (mode: AiGuideMode) => {
    if (!selectedCard) {
      return;
    }

    let polishInstruction = aiGuidePolishInstruction;
    if (mode === 'polish') {
      const input = await requestPolishInstruction('整卡');
      if (!input) {
        return;
      }
      polishInstruction = input;
    }

    setAiBusy(true);
    setAiError(null);

    try {
      const cardPayload = buildAiCardPayload(selectedCard);

      if (mode === 'describe') {
        const answers = aiGuideQuestions.map((question, index) => `${question}\n${aiGuideAnswers[index]?.trim() || '（未填写）'}`).join('\n\n');
        const parsed = await requestAiJson(
          '你是渐进式设定引导助手。根据用户当前输入生成“可先用”的摘要和少量属性建议。不要追求一次完整，只补最关键缺口。仅输出 JSON：{"summary":"...","suggestions":[{"name":"","reason":"","sampleValue":""}] }',
          `用户描述：\n${answers}\n\n卡片上下文：\n${JSON.stringify(cardPayload, null, 2)}`
        );
        const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
        const { data: suggestions, errors } = parseAiSuggestions(parsed.suggestions);
        if (!summary && suggestions.length === 0) {
          throw new Error(errors.length > 0 ? `引导结果无效：${errors.join('；')}` : '引导结果为空');
        }
        setAiNormalizePatch({
          summary: summary || selectedCard.summary,
          customFields: suggestions.map((item) => ({ name: item.name, value: item.sampleValue })),
        });
        setNormalizeApplySelection({ title: false, summary: Boolean(summary), category: false, tags: false, customFields: suggestions.length > 0 });
        setAiActionKind('normalize');
        setIsAiResultOpen(true);
        setIsAiGuideOpen(false);
        return;
      }

      if (mode === 'summaryToFields') {
        const sourceSummary = aiGuideSummaryInput.trim() || selectedCard.summary;
        if (!sourceSummary.trim()) {
          throw new Error('请先输入摘要内容');
        }
        const parsed = await requestAiJson(
          '你是人设属性扩写助手。请先参考已有属性进行补全，只有缺失维度才新增属性。仅输出 JSON：{"suggestions":[{"name":"","reason":"","sampleValue":""}] }。',
          `摘要：${sourceSummary}\n\n已有属性：${JSON.stringify(selectedCard.customFields, null, 2)}`
        );
        const { data: suggestions, errors } = parseAiSuggestions(parsed.suggestions);
        if (suggestions.length === 0) {
          throw new Error(errors.length > 0 ? `属性生成失败：${errors.join('；')}` : '未生成属性');
        }
        setAiSuggestions(suggestions);
        setSelectedSuggestionNames(suggestions.map((item) => item.name));
        setAiActionKind('fields');
        setIsAiResultOpen(true);
        setIsAiGuideOpen(false);
        return;
      }

      if (mode === 'reviewCard') {
        const parsed = await requestAiJson(
          '你是设定审校助手。根据摘要与属性给出可应用的 patch。仅输出 JSON：{"patch":{"summary?":"","customFields?":[{"name":"","value":""}]}}',
          JSON.stringify(cardPayload, null, 2)
        );
        const { data: patch, errors } = parseAiNormalizePatch(parsed.patch);
        if (!patch || errors.length > 0) {
          throw new Error(errors.length > 0 ? `审校结果无效：${errors.join('；')}` : '审校结果为空');
        }
        setAiNormalizePatch(patch);
        setNormalizeApplySelection(getDefaultNormalizeSelection(selectedCard, patch));
        setAiActionKind('normalize');
        setIsAiResultOpen(true);
        setIsAiGuideOpen(false);
        return;
      }

      if (mode === 'polish') {
        const parsed = await requestAiJson(
          '你是设定整体润色助手。仅输出 JSON：{"patch":{"summary?":"","customFields?":[{"name":"","value":""}]}}。',
          `润色要求：${polishInstruction}\n\n原始设定：${JSON.stringify(cardPayload, null, 2)}`
        );
        const { data: patch, errors } = parseAiNormalizePatch(parsed.patch);
        if (!patch || errors.length > 0) {
          throw new Error(errors.length > 0 ? `整体润色结果无效：${errors.join('；')}` : '整体润色结果为空');
        }
        setAiNormalizePatch(patch);
        setNormalizeApplySelection(getDefaultNormalizeSelection(selectedCard, patch));
        setAiActionKind('normalize');
        setIsAiResultOpen(true);
        setIsAiGuideOpen(false);
        return;
      }

      const parsed = await requestAiJson(
        '你是摘要生成助手。仅根据属性内容生成摘要。仅输出 JSON：{"summary":"..."}。',
        JSON.stringify({ customFields: selectedCard.customFields }, null, 2)
      );
      const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
      if (!summary) {
        throw new Error('基于属性生成摘要失败');
      }
      setAiSummaryDraft(summary);
      setAiActionKind('summary');
      setIsAiResultOpen(true);
      setIsAiGuideOpen(false);
    } catch (error) {
      setAiError(error instanceof Error ? error.message : 'AI 引导执行失败');
    } finally {
      setAiBusy(false);
    }
  };

  const runAiPolishSummaryInline = async () => {
    if (!selectedCard) {
      return;
    }

    const polishInstruction = await requestPolishInstruction('摘要');
    if (!polishInstruction) {
      return;
    }

    setAiBusy(true);
    setAiError(null);
    try {
      const parsed = await requestAiJson(
        '你是文本润色助手。仅输出 JSON：{"summary":"..."}。',
        `润色目标：摘要\n润色要求：${polishInstruction}\n内容：${selectedCard.summary || '（空）'}`
      );
      const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
      if (!summary) {
        throw new Error('润色摘要为空');
      }
      setAiSummaryDraft(summary);
      setAiActionKind('summary');
      setIsAiResultOpen(true);
    } catch (error) {
      setAiError(error instanceof Error ? error.message : '摘要润色失败');
    } finally {
      setAiBusy(false);
    }
  };

  const runAiPolishFieldInline = async (field: SettingCustomField) => {
    if (!selectedCard) {
      return;
    }

    const polishInstruction = await requestPolishInstruction(`属性「${field.name}」`);
    if (!polishInstruction) {
      return;
    }

    setAiBusy(true);
    setAiError(null);
    try {
      const parsed = await requestAiJson(
        '你是属性文本润色助手。仅输出 JSON：{"field":{"fieldId":"","name":"","value":""}}。',
        `润色目标：属性\n属性名：${field.name}\n原文：${field.value}\n润色要求：${polishInstruction}`
      );
      const { data: fieldData, errors } = parseAiFieldDraft(parsed.field);
      if (!fieldData || errors.length > 0) {
        throw new Error(errors.length > 0 ? `属性润色结果无效：${errors.join('；')}` : '属性润色结果为空');
      }
      setAiFieldDraft({
        fieldId: field.id,
        name: fieldData.name || field.name,
        beforeValue: field.value,
        nextValue: fieldData.value,
      });
      setAiActionKind('field');
      setIsAiResultOpen(true);
    } catch (error) {
      setAiError(error instanceof Error ? error.message : '属性润色失败');
    } finally {
      setAiBusy(false);
    }
  };

  const buildExternalPromptByMode = (mode: AiGuideMode) => {
    if (!selectedCard) {
      return '';
    }
    const payload = buildAiCardPayload(selectedCard);
    if (mode === 'describe') {
      return [
        '任务：根据描述生成摘要和属性。',
        '规则：先参考已有属性进行补全，只有缺失维度才新增。',
        '输出 JSON：{"summary":"...","suggestions":[{"name":"","reason":"","sampleValue":""}]}',
        ...aiGuideQuestions.map((question, index) => `${question}\n${aiGuideAnswers[index] || '（空）'}`),
        JSON.stringify(payload, null, 2),
      ].join('\n\n');
    }
    if (mode === 'summaryToFields') {
      return [
        '任务：根据摘要生成属性建议。',
        '规则：先参考已有属性进行补全，只有缺失维度才新增。',
        '输出 JSON：{"suggestions":[{"name":"","reason":"","sampleValue":""}]}',
        `摘要：${aiGuideSummaryInput.trim() || selectedCard.summary || '（空）'}`,
        JSON.stringify(payload, null, 2),
      ].join('\n\n');
    }
    if (mode === 'reviewCard') {
      return [
        '任务：审校并给出可应用 patch。',
        '输出 JSON：{"patch":{"summary?":"","customFields?":[{"name":"","value":""}]}}',
        JSON.stringify(payload, null, 2),
      ].join('\n\n');
    }
    if (mode === 'polish') {
      return [
        '任务：按润色方案润色整卡。',
        '输出 JSON：{"patch":{"summary?":"","customFields?":[{"name":"","value":""}]}}',
        `润色要求：${aiGuidePolishInstruction}`,
        JSON.stringify(payload, null, 2),
      ].join('\n\n');
    }
    return [
      '任务：仅通过属性生成摘要。',
      '输出 JSON：{"summary":"..."}',
      JSON.stringify({ customFields: selectedCard.customFields }, null, 2),
    ].join('\n\n');
  };

  const buildExternalPrompt = () => {
    return buildExternalPromptByMode(externalPromptMode);
  };

  const handleOpenExternalAi = async (mode: AiGuideMode = externalPromptMode) => {
    if (mode === 'polish') {
      const input = await requestPolishInstruction('整卡（外部AI提示词）');
      if (!input) {
        return;
      }
    }
    setExternalPromptMode(mode);
    const prompt = buildExternalPromptByMode(mode);
    if (!prompt) {
      return;
    }
    setExternalPrompt(prompt);
    setExternalResponseInput('');
    setExternalResponseError(null);
    setExternalResponseSchemaErrors([]);
    setIsExternalAiOpen(true);
  };

  const handleCopyExternalPrompt = async () => {
    try {
      await navigator.clipboard.writeText(externalPrompt || buildExternalPrompt());
    } catch {
      setExternalResponseError('复制失败，请手动选择文本复制。');
    }
  };

  const locateExternalSchemaError = (errorText: string) => {
    const textarea = externalResponseRef.current;
    if (!textarea) {
      return;
    }

    const token = errorText.split(' ')[0]?.trim();
    const fallbackKeys = ['suggestions', 'patch', 'summary', 'tags', 'customFields', 'name', 'reason', 'sampleValue'];
    const searchTargets = [token, ...fallbackKeys].filter(Boolean);

    const sourceText = textarea.value;
    for (const target of searchTargets) {
      const key = target.includes('.') ? target.split('.').at(-1) ?? target : target;
      const index = sourceText.indexOf(`"${key.replace(/\[\d+\]/g, '')}"`);
      if (index >= 0) {
        textarea.focus();
        textarea.setSelectionRange(index, Math.min(index + key.length + 2, sourceText.length));
        return;
      }
    }

    textarea.focus();
  };

  const handleApplyExternalResponse = () => {
    if (!externalResponseInput.trim()) {
      return;
    }

    try {
      const parsed = JSON.parse(extractJsonObject(externalResponseInput)) as { summary?: unknown; suggestions?: unknown; patch?: unknown; field?: unknown };
      const schemaErrors: string[] = [];

      if (typeof parsed.summary === 'string' && parsed.summary.trim().length > 0) {
        setAiSummaryDraft(parsed.summary.trim());
        setAiNormalizePatch(null);
        setAiActionKind('summary');
        setIsAiResultOpen(true);
        setIsExternalAiOpen(false);
        setExternalResponseSchemaErrors([]);
        return;
      }

      if (Array.isArray(parsed.suggestions)) {
        const { data: nextSuggestions, errors } = parseAiSuggestions(parsed.suggestions);
        schemaErrors.push(...errors);

        if (nextSuggestions.length === 0) {
          throw new Error(schemaErrors.length > 0 ? `JSON 校验失败：${schemaErrors.join('；')}` : '解析后没有可用建议项');
        }

        setAiSuggestions(nextSuggestions);
        setAiNormalizePatch(null);
        setSelectedSuggestionNames(nextSuggestions.map((item) => item.name));
        setAiActionKind('fields');
        setIsAiResultOpen(true);
        setIsExternalAiOpen(false);
        setExternalResponseSchemaErrors([]);
        return;
      }

      if (parsed.patch && typeof parsed.patch === 'object') {
        const { data: patch, errors } = parseAiNormalizePatch(parsed.patch);
        schemaErrors.push(...errors);
        if (!patch || schemaErrors.length > 0) {
          throw new Error(`JSON 校验失败：${schemaErrors.join('；')}`);
        }
        setAiNormalizePatch(patch);
        if (selectedCard) {
          setNormalizeApplySelection(getDefaultNormalizeSelection(selectedCard, patch));
        }
        setAiActionKind('normalize');
        setIsAiResultOpen(true);
        setIsExternalAiOpen(false);
        setExternalResponseSchemaErrors([]);
        return;
      }

      if (parsed.field && typeof parsed.field === 'object') {
        const { data: fieldData, errors } = parseAiFieldDraft(parsed.field);
        schemaErrors.push(...errors);
        if (!fieldData || schemaErrors.length > 0) {
          throw new Error(`JSON 校验失败：${schemaErrors.join('；')}`);
        }

        const matchedField = selectedCard?.customFields.find((item) => item.id === fieldData.fieldId || item.name === fieldData.name);
        setAiFieldDraft({
          fieldId: matchedField?.id,
          name: matchedField?.name ?? fieldData.name,
          beforeValue: matchedField?.value ?? '',
          nextValue: fieldData.value,
        });
        setAiActionKind('field');
        setIsAiResultOpen(true);
        setIsExternalAiOpen(false);
        setExternalResponseSchemaErrors([]);
        return;
      }

      throw new Error('未识别到 summary、suggestions、patch 或 field 字段');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'JSON 解析失败';
      setExternalResponseError(message);
      if (message.startsWith('JSON 校验失败：')) {
        const details = message.replace('JSON 校验失败：', '').split('；').filter(Boolean);
        setExternalResponseSchemaErrors(details);
      }
    }
  };

  return (
    <div className={styles.container}>
      <Panel side="left" width="340px" className={styles.listPanel}>
        <div className={styles.panelHeader}>
          <h3>设定卡片</h3>
          <div className={styles.panelActions}>
            <Button size="sm" variant="secondary" className={styles.inlineActionButton} onClick={() => setSummaryOpen((value) => !value)}>
              {summaryOpen ? '收起设定汇总' : '设定汇总'}
            </Button>
            <button className={styles.addButton} aria-label="新建设定卡片" onClick={handleOpenTemplatePicker}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          </div>
        </div>

        <div className={styles.toolbox}>
          <div className={styles.toolboxHeader}>工具栏</div>
          <div className={styles.toolboxRow}>
            <Button size="sm" variant="secondary" className={styles.toolboxActionButton} onClick={() => setIsTagManagerOpen(true)}>
              标签管理器
            </Button>
            <Button size="sm" variant="secondary" className={styles.toolboxActionButton} onClick={() => setIsCategoryManagerOpen(true)}>
              分类管理器
            </Button>
            <Button size="sm" variant="secondary" className={styles.toolboxActionButton} onClick={() => setIsTemplateManagerOpen(true)}>
              模版管理器
            </Button>
            <Button size="sm" variant="secondary" className={styles.toolboxActionButton} onClick={() => setIsDefaultDependencyOpen(true)}>
              默认依赖设置
            </Button>
            <div ref={toolbarSearchRef}>
              <Button size="sm" variant="secondary" className={styles.toolboxActionButton} onClick={() => setToolbarTagSearchOpen((prev) => !prev)}>
                {toolbarTagSearchOpen ? '收起标签搜索' : '标签搜索'}
              </Button>

              {toolbarTagSearchOpen && (
                <div className={styles.tagSearchWrap}>
                  <input
                    className={styles.tagInput}
                    value={toolbarTagQuery}
                    id={toolbarComboboxId}
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={toolbarTagSearchOpen}
                    aria-controls={`${toolbarComboboxId}-listbox`}
                    aria-activedescendant={toolbarActiveDescendant}
                    onChange={(event) => {
                      setToolbarTagQuery(event.target.value);
                      setToolbarTagActiveIndex(0);
                    }}
                    placeholder="输入标签名进行搜索"
                    autoFocus
                    onKeyDown={(event) => {
                      if (event.key === 'ArrowDown') {
                        event.preventDefault();
                        const nextIndex = Math.min(toolbarTagActiveIndex + 1, Math.max(toolbarTagCandidates.length - 1, 0));
                        setToolbarTagActiveIndex(nextIndex);
                      }

                      if (event.key === 'ArrowUp') {
                        event.preventDefault();
                        const nextIndex = Math.max(toolbarTagActiveIndex - 1, 0);
                        setToolbarTagActiveIndex(nextIndex);
                      }

                      if (event.key === 'Enter') {
                        event.preventDefault();
                        const active = toolbarTagCandidates[toolbarTagActiveIndex];
                        if (active) {
                          toggleTagFilter(active.name);
                        } else {
                          createAndUseToolbarTag();
                        }
                      }

                      if (event.key === 'Escape') {
                        setToolbarTagSearchOpen(false);
                        setToolbarTagQuery('');
                        setToolbarTagActiveIndex(0);
                      }
                    }}
                  />
                  <div className={styles.tagSearchDropdown}>
                    <div id={`${toolbarComboboxId}-listbox`} role="listbox" aria-label="全局标签搜索结果">
                    {toolbarTagCandidates.map((tag, index) => (
                      <button
                        key={tag.name}
                        id={`${toolbarComboboxId}-option-${index}`}
                        role="option"
                        aria-selected={index === toolbarTagActiveIndex}
                        className={`${styles.tagSearchItem} ${index === toolbarTagActiveIndex ? styles.activeSearchItem : ''}`}
                        onMouseEnter={() => setToolbarTagActiveIndex(index)}
                        onClick={() => toggleTagFilter(tag.name)}
                      >
                        <span className={styles.tagDot} style={{ background: tag.color }} />
                        {activeTagFilters.includes(tag.name) ? '取消筛选' : '按标签筛选'}：{tag.name}（{tagSourceLabel(tag.name)}）
                      </button>
                    ))}
                    {toolbarCanCreate && (
                      <button id={`${toolbarComboboxId}-create`} role="option" aria-selected={toolbarTagCandidates.length === 0} className={styles.tagCreateItem} onClick={createAndUseToolbarTag}>
                        创建并筛选标签 “{normalizeTagName(toolbarTagQuery)}”
                      </button>
                    )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className={styles.tagFilters}>
            {tagOptions.map((tag) => (
              <button
                key={tag.name}
                className={`${styles.tagFilter} ${activeTagFilters.includes(tag.name) ? styles.activeTagFilter : ''}`}
                onClick={() => toggleTagFilter(tag.name)}
              >
                <span className={styles.tagDot} style={{ background: tag.color }} />
                {tag.name}
              </button>
            ))}
            {activeTagFilters.length > 0 && (
              <button className={styles.tagFilter} onClick={() => setActiveTagFilters([])}>
                清空标签筛选
              </button>
            )}
          </div>

        </div>

        <div className={styles.folderTree}>
          <div className={styles.categoryFilters}>
            <button
              className={`${styles.categoryFilter} ${selectedCategory === null ? styles.activeCategory : ''}`}
              onClick={() => setSelectedCategory(null)}
            >
              全部 ({cards.length})
            </button>
            {categoryEntries.map((category) => (
              <button
                key={category.key}
                className={`${styles.categoryFilter} ${selectedCategory === category.key ? styles.activeCategory : ''}`}
                onClick={() => setSelectedCategory(category.key)}
              >
                {category.label} ({category.count})
              </button>
            ))}
          </div>

          <ul className={styles.folderCardList}>
            {visibleCards.map((card) => (
              <li
                key={card.id}
                className={`${styles.listItem} ${selectedCardId === card.id ? styles.selected : ''}`}
                onClick={() => openCardPreview(card.id)}
              >
                <span className={styles.listItemDot} style={{ background: card.color }} />
                <div className={styles.listItemContent}>
                  <span className={styles.listItemTitle}>{card.title}</span>
                  <span className={styles.listItemType}>
                    {cardTypeLabel(card.type)} · {card.category ? `${card.category} · ` : ''}
                    {card.tags.length > 0 ? card.tags.map((tag) => tag.name).join(' · ') : '无标签'}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </Panel>

      {summaryOpen && (
        <Panel side="left" width="260px" className={styles.summaryPanel}>
          <div className={styles.summaryHeader}>
            <h3>设定汇总</h3>
          </div>
          <div className={styles.summarySection}>
              <h4>分类统计</h4>
              <ul className={styles.summaryList}>
              {categoryEntries.map((item) => (
                <li key={item.key} className={styles.summaryItem}>
                  <span>{item.label}</span>
                  <strong>{totalByCategory[item.key] ?? 0}</strong>
                </li>
              ))}
              <li className={styles.summaryItem}>
                <span>未分类</span>
                <strong>{uncategorizedCount}</strong>
              </li>
              </ul>
            </div>
          <div className={styles.summarySection}>
            <h4>标签筛选</h4>
            <p className={styles.summaryHint}>
              当前已选 {activeTagFilters.length} 个标签（多标签为“且”匹配）
            </p>
          </div>
          <div className={styles.summarySection}>
            <h4>基础设定进度</h4>
            <p className={styles.summaryHint}>
              已完成 {setupProgress.completed}/{setupProgress.total} 项 · 关系 {setupProgress.relationCount} 条 · 摘要覆盖 {Math.round(setupProgress.summaryCoverage * 100)}%
            </p>
            <ul className={styles.summaryChecklist}>
              {STORY_SETUP_STEPS.map((step, index) => (
                <li key={step} className={`${styles.summaryChecklistItem} ${setupProgress.checks[index] ? styles.summaryChecklistDone : ''}`}>
                  <span>{setupProgress.checks[index] ? '✓' : '○'}</span>
                  {step}
                </li>
              ))}
            </ul>
          </div>
        </Panel>
      )}

      <div className={styles.canvasArea}>
        <div className={styles.canvas}>
          <svg className={styles.connections} aria-hidden="true">
            {visibleCards.flatMap((card) =>
              card.relations.map((relation) => {
                const target = visibleCards.find((item) => item.id === relation.targetId);
                if (!target) {
                  return null;
                }

                return (
                  <line
                    key={`${card.id}-${relation.targetId}`}
                    x1={card.position.x + 60}
                    y1={card.position.y + 40}
                    x2={target.position.x + 60}
                    y2={target.position.y + 40}
                    stroke="var(--slate-300)"
                    strokeWidth="2"
                    strokeDasharray="4 4"
                    className={styles.connectionLine}
                  />
                );
              })
            )}
          </svg>

          {visibleCards.map((card, index) => (
            <div
              key={card.id}
              className={`${styles.canvasCard} ${dragState?.id === card.id ? styles.dragging : ''} ${selectedCardId === card.id ? styles.selected : ''}`}
              style={{
                left: card.position.x,
                top: card.position.y,
                animationDelay: `${index * 80}ms`,
              }}
              onClick={() => onCanvasCardClick(card.id)}
              onMouseDown={(event) => onCardMouseDown(event, card)}
            >
                <div className={styles.canvasCardInner} style={{ borderColor: card.color }}>
                  <div className={styles.canvasCardHeader} style={{ background: card.color }}>
                    <span className={styles.canvasCardType}>{cardTypeLabel(card.type)}</span>
                  </div>
                  <div className={styles.canvasCardBody}>
                    <span className={styles.canvasCardTitle}>{card.title}</span>
                  </div>
                </div>
            </div>
          ))}
        </div>

      <div className={styles.canvasHint}>提示：按住卡片即可拖动并调整位置。</div>
      </div>

      {confirmDialog.open && (
        <div className={`${styles.managerOverlay} ${styles.confirmOverlay}`} role="presentation" onClick={closeConfirmDialog}>
          <div className={styles.managerCard} role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className={styles.managerHeader}>
              <h3>{confirmDialog.title}</h3>
            </div>
            <p className={styles.aiHint}>{confirmDialog.message}</p>
            <div className={styles.managerActionsRow}>
              <Button size="sm" variant="ghost" className={styles.inlineActionButton} onClick={closeConfirmDialog}>
                取消
              </Button>
              <Button size="sm" variant="secondary" className={styles.inlineActionButton} onClick={handleConfirmDialog}>
                {confirmDialog.confirmLabel}
              </Button>
            </div>
          </div>
        </div>
      )}

      {isTemplatePickerOpen && (
        <div className={styles.managerOverlay} role="presentation" onClick={() => setIsTemplatePickerOpen(false)}>
          <div className={styles.managerCard} role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className={styles.managerHeader}>
              <h3>创建设定卡</h3>
            </div>
            <div className={styles.managerRow}>
              <input
                className={styles.tagInput}
                value={newCardNameDraft}
                onChange={(event) => setNewCardNameDraft(event.target.value)}
                placeholder="输入卡片名称（可选）"
                autoFocus
              />
            </div>
            <div className={styles.detailSection}>
              <h4>按类型创建</h4>
            </div>
            <div className={styles.quickTypeGrid}>
              {QUICK_CREATE_OPTIONS.map((item) => (
                <button
                  key={item.key}
                  className={styles.quickTypeButton}
                  onClick={() => handleAddCard(undefined, newCardNameDraft, item.type, item.category, item.titlePrefix, item.useDefaultDependency ?? true)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className={styles.managerList}>
              <div className={styles.detailSection}>
                <h4>按模板创建（用户模板）</h4>
                <p className={styles.aiHint}>模板用于复用结构，包含类型、分类与字段信息。</p>
              </div>
              {templateEntries.length > 0 ? (
                templateEntries.map((template) => (
                  <button key={template.id} className={styles.templatePickItem} onClick={() => handleAddCard(template, newCardNameDraft)}>
                    <div className={styles.templatePickMain}>
                      <span className={styles.managerTagName}>{template.name}</span>
                      <span className={styles.templatePickMeta}>
                        {cardTypeLabel(template.preset.type)}
                        {template.preset.category ? ` · ${template.preset.category}` : ''}
                        {template.preset.customFields?.length ? ` · ${template.preset.customFields.length} 个字段` : ' · 无预设字段'}
                      </span>
                      {template.preset.summary ? <span className={styles.templatePickSummary}>{template.preset.summary}</span> : null}
                    </div>
                    <span className={styles.templatePickMeta}>{template.source}模版</span>
                  </button>
                ))
              ) : (
                <p className={styles.emptyState}>暂无用户模板。</p>
              )}
            </div>
          </div>
        </div>
      )}

      {isSaveTemplateOpen && selectedCard && (
        <div className={styles.managerOverlay} role="presentation" onClick={() => setIsSaveTemplateOpen(false)}>
          <div className={styles.managerCard} role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className={styles.managerHeader}>
              <h3>保存为模版</h3>
            </div>
            <div className={styles.managerRow}>
              <input
                className={styles.tagInput}
                value={templateName}
                onChange={(event) => setTemplateName(event.target.value)}
                placeholder="输入模版名称"
                autoFocus
              />
              <select
                className={styles.categorySelect}
                value={templateScope}
                onChange={(event) => setTemplateScope(event.target.value as 'global' | 'story')}
              >
                <option value="global">保存到全局模版</option>
                <option value="story">保存到当前故事模版</option>
              </select>
              <Button size="sm" variant="secondary" className={styles.inlineActionButton} onClick={handleSaveCardAsTemplate}>
                保存
              </Button>
            </div>
          </div>
        </div>
      )}

      {isCardRenameOpen && selectedCard && (
        <div className={styles.managerOverlay} role="presentation" onClick={() => setIsCardRenameOpen(false)}>
          <div className={styles.managerCard} role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className={styles.managerHeader}>
              <h3>重命名卡片</h3>
            </div>
            <div className={styles.managerRow}>
              <input
                className={styles.tagInput}
                value={renameCardDraft}
                onChange={(event) => setRenameCardDraft(event.target.value)}
                placeholder="输入卡片名称"
                autoFocus
              />
            </div>
            <div className={styles.managerActionsRow}>
              <Button size="sm" variant="ghost" className={styles.inlineActionButton} onClick={() => setIsCardRenameOpen(false)}>
                取消
              </Button>
              <Button size="sm" variant="secondary" className={styles.inlineActionButton} onClick={handleConfirmCardRename}>
                确认
              </Button>
            </div>
          </div>
        </div>
      )}

      {openPreviewCards.length > 0 && (
        <div className={styles.previewOverlay} aria-hidden="true">
          {openPreviewCards.map((previewCard, index) => {
            const windowState = previewWindowStateMap[previewCard.id] ?? {
              x: 92 + (index % 8) * 28,
              y: 56 + (index % 8) * 18,
              minimized: false,
            };
            const minimized = windowState.minimized;
            return (
              <section
                key={previewCard.id}
                className={`${styles.previewDialog} ${minimized ? styles.previewDialogMinimized : ''}`}
                style={{
                  '--preview-accent': previewCard.color,
                  top: `${windowState.y}px`,
                  left: `${windowState.x}px`,
                  zIndex: 200 + index,
                } as React.CSSProperties}
                role="dialog"
                aria-modal="false"
                aria-label={`设定卡片预览：${previewCard.title || '未命名设定'}`}
                onMouseDown={() => focusCardPreview(previewCard.id)}
              >
                <header className={styles.previewWindowHeader} onMouseDown={(event) => startPreviewDrag(event, previewCard.id)}>
                  <div className={styles.previewWindowIdentity}>
                    <span className={styles.previewWindowDot} style={{ background: previewCard.color }} />
                    <span className={styles.previewWindowTitle}>{previewCard.title || '未命名设定'}</span>
                  </div>
                  <div className={styles.previewWindowActions}>
                    <button
                      className={styles.previewWindowButton}
                      onMouseDown={(event) => event.stopPropagation()}
                      onClick={() => togglePreviewMinimized(previewCard.id)}
                      aria-label={minimized ? '展开预览窗口' : '收起预览窗口'}
                    >
                      {minimized ? '▢' : '—'}
                    </button>
                    <button
                      className={styles.previewWindowButton}
                      onMouseDown={(event) => event.stopPropagation()}
                      onClick={() => closeCardPreview(previewCard.id)}
                      aria-label="关闭预览窗口"
                    >
                      ✕
                    </button>
                  </div>
                </header>

                {!minimized && (
                  <>
                    <div className={styles.previewHero}>
                      <div>
                        <span className={styles.detailType}>{cardTypeLabel(previewCard.type)} · {cardCategoryLabel(previewCard)}</span>
                        <h2 className={styles.detailTitle}>{previewCard.title || '未命名设定'}</h2>
                        <p className={styles.previewSubtitle}>高保真预览窗口，可同时打开多个卡片。</p>
                        <p className={styles.previewShortcutHint}>快捷键：Esc 关闭当前窗口，Ctrl/Cmd + M 最小化当前窗口</p>
                      </div>
                      <div className={styles.previewActions}>
                        <Button
                          size="sm"
                          variant="secondary"
                          className={styles.inlineActionButton}
                          onClick={() => {
                            setSelectedCardId(previewCard.id);
                            setIsEditorOpen(true);
                          }}
                        >
                          进入设定编辑页
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          className={styles.inlineActionButton}
                          onClick={() => {
                            setSelectedCardId(previewCard.id);
                            setTemplateName(previewCard.title || '新模版');
                            setTemplateScope('global');
                            setIsSaveTemplateOpen(true);
                          }}
                        >
                          保存为模版
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className={styles.inlineActionButton}
                          onClick={() => {
                            setSelectedCardId(previewCard.id);
                            setRenameCardDraft(previewCard.title || '');
                            setIsCardRenameOpen(true);
                          }}
                        >
                          重命名
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className={styles.detailDeleteCardButton}
                          onClick={() => {
                            handleDeleteCardById(previewCard.id, previewCard.title);
                          }}
                        >
                          删除卡片
                        </Button>
                      </div>
                    </div>

                    <div className={styles.detailSection}>
                      <h4>摘要</h4>
                      <p>{previewCard.summary?.trim() || '暂无摘要，进入编辑页后可补充。'}</p>
                    </div>

                    <div className={styles.detailSection}>
                      <h4>标签</h4>
                      <div className={styles.cardTags}>
                        {previewCard.tags.length > 0 ? (
                          previewCard.tags.map((tag) => (
                            <span key={tag.name} className={styles.previewTagChip}>
                              <span className={styles.tagDot} style={{ background: tag.color }} />
                              {tag.name}
                            </span>
                          ))
                        ) : (
                          <p className={styles.emptyState}>无标签</p>
                        )}
                      </div>
                    </div>

                    <div className={styles.detailSection}>
                      <h4>依赖关系</h4>
                      <div className={styles.previewRelationList}>
                        {getCardLevelRelations(previewCard).length > 0 ? (
                          getCardLevelRelations(previewCard).map((relation) => {
                            const { targetCard, targetField } = resolveRelationTarget(relation);
                            if (!targetCard) {
                              return null;
                            }
                            return (
                              <button
                                key={`preview-card-level-${previewCard.id}-${relation.index}`}
                                className={styles.previewRelationButton}
                                onClick={() => openCardPreview(targetCard.id)}
                              >
                                {relation.type} · {targetCard.title}
                                {targetField ? ` / ${targetField.name}` : ''}
                              </button>
                            );
                          })
                        ) : (
                          <p className={styles.emptyState}>暂无依赖关系</p>
                        )}
                      </div>
                    </div>

                    <div className={styles.detailSection}>
                      <h4>属性预览</h4>
                      <div className={styles.previewFieldList}>
                        {previewCard.customFields.length > 0 ? (
                          previewCard.customFields.map((field, fieldIndex) => {
                            const fieldId = field.id ?? `preview-field-${fieldIndex}`;
                            const relations = previewCard.relations
                              .map((relation, relationIndex) => ({ ...relation, index: relationIndex }))
                              .filter((relation) => relation.sourceFieldId === fieldId);
                            return (
                              <article key={fieldId} className={styles.previewFieldCard}>
                                <header className={styles.previewFieldHeader}>
                                  <span>{field.name || `属性 ${fieldIndex + 1}`}</span>
                                  <span className={styles.previewFieldCount}>关联 {relations.length}</span>
                                </header>
                                <p className={styles.previewFieldValue}>{field.value?.trim() || '暂无内容'}</p>
                                {relations.length > 0 && (
                                  <div className={styles.previewRelationList}>
                                    {relations.map((relation) => {
                                      const { targetCard, targetField } = resolveRelationTarget(relation);
                                      if (!targetCard) {
                                        return null;
                                      }
                                      return (
                                        <button
                                          key={`preview-relation-${fieldId}-${relation.index}`}
                                          className={styles.previewRelationButton}
                                          onClick={() => openCardPreview(targetCard.id)}
                                        >
                                          {relation.type} · {targetCard.title}
                                          {targetField ? ` / ${targetField.name}` : ''}
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </article>
                            );
                          })
                        ) : (
                          <p className={styles.emptyState}>还没有自定义属性</p>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </section>
            );
          })}
        </div>
      )}

      {selectedCard && isEditorOpen && (
        <div className={styles.editorOverlay} role="presentation" onClick={() => setIsEditorOpen(false)}>
          <section className={styles.editorPage} role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <header className={styles.editorHeader}>
              <div>
                <p className={styles.editorEyebrow}>设定编辑页面</p>
                <h3 className={styles.editorTitle}>{selectedCard.title || '未命名设定'}</h3>
              </div>
              <button className={styles.closeDetail} onClick={() => setIsEditorOpen(false)} aria-label="关闭设定编辑页">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </header>

            <div className={styles.editorGrid}>
              <div className={styles.fixedMetaCard}>
                <div className={styles.aiWorkbench}>
                  <div className={styles.aiWorkbenchHeader}>
                    <h4>AI工作台</h4>
                    <p>引导、生成、润色、审校与外部辅助都集中在这里。</p>
                  </div>

                  <div className={styles.aiActionRow}>
                    <select
                      className={styles.aiModelSelect}
                      value={activeAiModelId}
                      onChange={(event) => setActiveAiModelId(event.target.value as AiModelId)}
                    >
                      {MODEL_OPTIONS.map((model) => (
                        <option key={model.id} value={model.id}>
                        {model.label}
                      </option>
                    ))}
                  </select>
                  <span className={`${styles.aiModelStatus} ${isAiModelConfigured ? styles.aiModelReady : styles.aiModelMissing}`}>
                    {aiModelStatusText}
                  </span>
                  </div>

                  <div className={styles.aiActionRow}>
                    <Button size="sm" variant="secondary" className={styles.inlineActionButton} onClick={() => void handleOpenAiGuide()}>
                      分步设定引导
                    </Button>
                    <Button size="sm" variant="secondary" className={styles.inlineActionButton} onClick={() => runAiGuideFlow('summaryToFields')} disabled={aiBusy}>
                      摘要生成属性
                    </Button>
                    <Button size="sm" variant="secondary" className={styles.inlineActionButton} onClick={() => runAiGuideFlow('reviewCard')} disabled={aiBusy}>
                      审校并建议更新
                    </Button>
                    <Button size="sm" variant="secondary" className={styles.inlineActionButton} onClick={() => runAiGuideFlow('fieldsToSummary')} disabled={aiBusy}>
                      属性生成摘要
                    </Button>
                    <Button size="sm" variant="secondary" className={styles.inlineActionButton} onClick={() => runAiGuideFlow('polish')} disabled={aiBusy}>
                      整卡润色
                    </Button>
                    <Button size="sm" variant="ghost" className={styles.inlineActionButton} onClick={() => void handleOpenExternalAi('reviewCard')}>
                      外部AI辅助
                    </Button>
                    <Button size="sm" variant="ghost" className={styles.inlineActionButton} onClick={handleUndoLastAiApply} disabled={!hasUndoForSelectedCard}>
                      撤销上次AI应用
                    </Button>
                    <Button size="sm" variant="ghost" className={styles.inlineActionButton} onClick={() => setIsAiHistoryOpen(true)} disabled={!hasUndoForSelectedCard}>
                      AI历史（{selectedCardUndoEntries.length}）
                    </Button>
                  </div>
                </div>
                {aiError && <p className={styles.aiErrorText}>{aiError}</p>}

                <div className={styles.fixedMetaTopRow}>
                  <div className={styles.fixedMetaField}>
                    <span className={styles.fixedMetaLabel}>名称</span>
                    <input
                      className={`${styles.detailInput} ${styles.fixedNameInput}`}
                      value={selectedCard.title}
                      onChange={(event) => {
                        const value = event.target.value;
                        updateSelectedCard((card) => ({ ...card, title: value }));
                      }}
                      placeholder="输入设定名称"
                    />
                  </div>

                  <div className={styles.fixedMetaField}>
                    <span className={styles.fixedMetaLabel}>分类</span>
                    <select
                      className={`${styles.categorySelect} ${styles.fixedCategorySelect}`}
                      value={selectedCard.category ?? ''}
                      onChange={(event) => handleAssignCategory(event.target.value)}
                    >
                      <option value="" disabled>
                        请选择分类
                      </option>
                      {categories.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className={styles.fixedMetaField}>
                  <div className={styles.fixedTagHeader}>
                    <span className={styles.fixedMetaLabel}>摘要</span>
                    {getCurrentSummaryIterationTag(selectedCard) ? (
                      <span className={styles.iterationVersionTag}>{getCurrentSummaryIterationTag(selectedCard)}</span>
                    ) : null}
                    {getCurrentSummaryIterationMeta(selectedCard) ? (
                      <span className={styles.currentIterationBadge}>当前来源：{getCurrentSummaryIterationMeta(selectedCard)}</span>
                    ) : null}
                    <div className={styles.aiGuideHeaderRow}>
                      <Button size="sm" variant="secondary" className={styles.inlineActionButton} onClick={() => openSummaryIterationDraft()}>
                        摘要迭代
                      </Button>
                      <Button size="sm" variant="secondary" className={styles.inlineActionButton} onClick={runAiPolishSummaryInline} disabled={aiBusy}>
                        润色摘要
                      </Button>
                      <Button size="sm" variant="ghost" className={styles.inlineActionButton} onClick={() => void handleOpenExternalAi('polish')}>
                        外部润色提示词
                      </Button>
                    </div>
                  </div>
                  <textarea
                    className={`${styles.detailTextarea} ${styles.fixedSummaryTextarea}`}
                    rows={2}
                    value={selectedCard.summary ?? ''}
                    onChange={(event) => {
                      const value = event.target.value;
                      updateSelectedCard((card) => ({ ...card, summary: value }));
                    }}
                    placeholder="输入设定摘要"
                  />

                  {summaryIterationDraft.open && (
                    <div className={styles.iterationEditor}>
                      <textarea
                        className={styles.detailTextarea}
                        rows={3}
                        value={summaryIterationDraft.value}
                        onChange={(event) => setSummaryIterationDraft((prev) => ({ ...prev, value: event.target.value }))}
                        placeholder="输入迭代后的摘要"
                      />
                      <input
                        className={styles.detailInput}
                        value={summaryIterationDraft.versionTag}
                        onChange={(event) => setSummaryIterationDraft((prev) => ({ ...prev, versionTag: event.target.value }))}
                        placeholder="版本标签，例如：v1 / v2 / 终稿"
                      />
                      <div className={styles.fieldRelationAdd}>
                        <select
                          className={styles.relationSelect}
                          value={summaryIterationDraft.reasonType}
                          onChange={(event) =>
                            setSummaryIterationDraft((prev) => ({
                              ...prev,
                              reasonType: event.target.value === 'card' ? 'card' : 'manual',
                            }))
                          }
                        >
                          <option value="manual">手动填写原因</option>
                          <option value="card">选择关联卡作为原因</option>
                        </select>
                        {summaryIterationDraft.reasonType === 'card' ? (
                          <select
                            className={styles.relationSelect}
                            value={summaryIterationDraft.reasonCardId}
                            onChange={(event) => setSummaryIterationDraft((prev) => ({ ...prev, reasonCardId: event.target.value }))}
                          >
                            <option value="">选择原因卡片</option>
                            {cards
                              .filter((card) => card.id !== selectedCard.id)
                              .map((card) => (
                                <option key={`summary-reason-${card.id}`} value={card.id}>
                                  {card.title}
                                </option>
                              ))}
                          </select>
                        ) : (
                          <input
                            className={styles.detailInput}
                            value={summaryIterationDraft.reasonText}
                            onChange={(event) => setSummaryIterationDraft((prev) => ({ ...prev, reasonText: event.target.value }))}
                            placeholder="例如：主角失去同伴后价值观转变"
                          />
                        )}
                      </div>
                      <div className={styles.managerActionsRow}>
                        <Button size="sm" variant="ghost" className={styles.inlineActionButton} onClick={closeSummaryIterationDraft}>
                          取消
                        </Button>
                        <Button size="sm" variant="secondary" className={styles.inlineActionButton} onClick={saveSummaryIteration}>
                          保存摘要迭代
                        </Button>
                      </div>
                    </div>
                  )}

                  {(selectedCard.summaryIterations ?? []).length > 0 && (
                    <div className={styles.iterationSwitcherRow}>
                      <span className={styles.iterationSwitcherLabel}>当前摘要版本</span>
                      <select
                        className={styles.iterationSwitcherSelect}
                        value={selectedCard.activeSummaryIterationId ?? ''}
                        onChange={(event) => {
                          if (event.target.value) {
                            setSummaryIterationAsCurrent(event.target.value);
                          }
                        }}
                      >
                        {(selectedCard.summaryIterations ?? []).map((iteration) => (
                          <option key={`summary-switch-${iteration.id}`} value={iteration.id}>
                            {buildIterationOptionLabel(iteration.createdAt, iteration.reasonType, iteration.reasonText, iteration.reasonCardId, iteration.versionTag)}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className={styles.iterationList}>
                    {(selectedCard.summaryIterations ?? []).map((iteration) => (
                      <div key={iteration.id} className={styles.iterationItem}>
                        {iteration.versionTag ? <span className={`${styles.iterationVersionTag} ${styles.iterationVersionTagCorner}`}>{iteration.versionTag}</span> : null}
                        <p className={styles.templatePickMeta}>{new Date(iteration.createdAt).toLocaleString('zh-CN')}</p>
                        <p className={styles.iterationValue} title={iteration.value}>{iteration.value}</p>
                        <p className={styles.templatePickMeta}>原因：{resolveIterationReasonLabel(iteration.reasonType, iteration.reasonText, iteration.reasonCardId)}</p>
                        <div className={styles.managerActionsRow}>
                          <Button
                            size="sm"
                            variant="secondary"
                            className={styles.inlineActionButton}
                            onClick={() => setSummaryIterationAsCurrent(iteration.id)}
                            disabled={selectedCard.activeSummaryIterationId === iteration.id}
                          >
                            {selectedCard.activeSummaryIterationId === iteration.id ? '当前版本' : '设为当前'}
                          </Button>
                          <Button size="sm" variant="ghost" className={styles.inlineActionButton} onClick={() => openSummaryIterationDraft(iteration)}>
                            修改原因
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className={styles.fixedMetaField}>
                  <div className={styles.fixedTagHeader}>
                    <span className={styles.fixedMetaLabel}>标签</span>
                    <div className={styles.tagPalette} ref={detailSearchRef}>
                      <Button size="sm" variant="secondary" className={styles.inlineActionButton} onClick={() => setDetailTagSearchOpen((prev) => !prev)}>
                        {detailTagSearchOpen ? '收起标签输入' : '添加标签'}
                      </Button>

                      {detailTagSearchOpen && (
                        <div className={styles.tagSearchWrap}>
                          <input
                            className={styles.detailInput}
                            value={detailTagQuery}
                            placeholder="搜索标签或输入后创建"
                            autoFocus
                            onChange={(event) => {
                              setDetailTagQuery(event.target.value);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault();
                                createAndAddDetailTag();
                              }

                              if (event.key === 'Escape') {
                                setDetailTagSearchOpen(false);
                                setDetailTagQuery('');
                              }
                            }}
                          />
                          <div className={styles.tagSearchDropdown}>
                            <button className={styles.tagCreateItem} onClick={createAndAddDetailTag} disabled={!normalizeTagName(detailTagQuery)}>
                              添加标签 “{normalizeTagName(detailTagQuery) || '请输入标签'}”
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className={styles.cardTags}>
                    {selectedCard.tags.length > 0 ? (
                      selectedCard.tags.map((tag) => (
                        <button key={tag.name} className={styles.tagChip} onClick={() => handleRemoveTagFromSelected(tag.name)}>
                          <span className={styles.tagDot} style={{ background: tag.color }} />
                          {tag.name}
                          <span className={styles.tagRemove}>×</span>
                        </button>
                      ))
                    ) : (
                      <p className={styles.emptyState}>无标签</p>
                    )}
                  </div>
                </div>

                <div className={styles.fixedMetaField}>
                  <span className={styles.fixedMetaLabel}>卡片依赖关系</span>
                  <div className={styles.cardLevelRelationList}>
                    {getCardLevelRelations(selectedCard).length > 0 ? (
                      getCardLevelRelations(selectedCard).map((relation) => {
                        const { targetCard, targetField } = resolveRelationTarget(relation);
                        return (
                          <div key={`card-level-${relation.index}`} className={styles.fieldRelationItem}>
                            <span className={styles.relationType}>{relation.type}</span>
                            <button
                              className={styles.relationTargetLink}
                              onClick={() => {
                                if (targetCard) {
                                  openCardPreview(targetCard.id);
                                }
                              }}
                            >
                              {targetCard?.title ?? '未知卡片'}
                              {targetField ? ` / ${targetField.name}` : ''}
                            </button>
                            <button className={styles.removeRelationBtn} onClick={() => handleDeleteRelation(relation.index)} title="删除依赖">
                              ×
                            </button>
                          </div>
                        );
                      })
                    ) : (
                      <p className={styles.emptyState}>暂无卡片级依赖</p>
                    )}
                  </div>
                  <div className={styles.fieldRelationAdd}>
                    <select
                      className={styles.relationSelect}
                      value={cardDependencyTarget}
                      onChange={(event) => setCardDependencyTarget(event.target.value)}
                    >
                      <option value="">选择依赖卡</option>
                      {cards
                        .filter((card) => card.id !== selectedCard.id)
                        .map((card) => (
                          <option key={card.id} value={card.id}>
                            {card.title}
                          </option>
                        ))}
                    </select>
                    <select
                      className={styles.relationSelect}
                      value={cardDependencyType}
                      onChange={(event) => setCardDependencyType(event.target.value)}
                    >
                      {RELATION_TYPE_OPTIONS.map((relationType) => (
                        <option key={relationType} value={relationType}>
                          {relationType}
                        </option>
                      ))}
                    </select>
                    <button className={styles.addRelationBtn} onClick={handleCreateCardLevelRelation} disabled={!cardDependencyTarget}>
                      +
                    </button>
                  </div>
                </div>

                <div className={styles.fixedMetaField}>
                  <span className={styles.fixedMetaLabel}>将当前卡片设为默认依赖卡</span>
                  <p className={styles.aiHint}>勾选后，创建对应类型的新卡片会自动关联当前卡片（例如：世界观卡 → 新角色卡 / 新物品卡）。</p>
                  <div className={styles.categoryFilters}>
                    {CARD_TYPE_OPTIONS.map((option) => {
                      const checked = isCardDefaultDependencyForType(selectedCard.id, option.type);
                      return (
                        <label key={`default-source-${selectedCard.id}-${option.type}`} className={styles.categoryFilter}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleCardDefaultDependencyForType(selectedCard.id, option.type)}
                          />
                          {option.label}
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className={styles.detailSection}>
                <h4>自定义属性</h4>
                <p>属性按顺序展示，可在整页内拖动重排。</p>
                <div className={styles.customFieldCreateRow}>
                  <input
                    className={styles.detailInput}
                    value={newCustomFieldName}
                    onChange={(event) => setNewCustomFieldName(event.target.value)}
                    placeholder="例如：服设、口癖、习惯动作"
                  />
                  <Button size="sm" variant="secondary" className={styles.inlineActionButton} onClick={() => handleAddCustomField(newCustomFieldName)}>
                    添加属性
                  </Button>
                </div>

              </div>
            </div>

            <div className={styles.fieldBoardHint}>提示：属性按顺序排列，可拖动卡片调整顺序。</div>
            <div className={styles.editorFieldList}>
              {selectedCard.customFields.length > 0 ? (
                selectedCard.customFields.map((field, index) => {
                  const fieldId = field.id ?? `field-editor-${index}`;
                  const fieldRelations = getFieldRelations(fieldId);
                  const isRelationOpen = fieldRelationOpen[fieldId] ?? false;
                  const targetCardId = fieldRelationTarget[fieldId] ?? '';
                   
                  return (
                    <div
                      key={fieldId}
                      className={`${styles.customFieldCard} ${draggingFieldId === fieldId ? styles.draggingField : ''} ${dragOverField?.id === fieldId ? (dragOverField.placement === 'before' ? styles.dropIndicatorBefore : styles.dropIndicatorAfter) : ''}`}
                      draggable
                      onDragStart={(event) => onFieldDragStart(event, fieldId)}
                      onDragEnter={(event) => onFieldDragOver(event, fieldId)}
                      onDragOver={(event) => onFieldDragOver(event, fieldId)}
                      onDrop={(event) => onFieldDrop(event, fieldId)}
                      onDragEnd={() => {
                        setDraggingFieldId(null);
                        setDragOverField(null);
                      }}
                    >
                      <div className={styles.customFieldHeaderSimple}>
                        <span className={styles.fieldOrderHandle}>⋮⋮</span>
                        <input
                          className={styles.fieldNameInput}
                          value={field.name}
                          onChange={(event) => handleUpdateCustomField(index, { name: event.target.value })}
                          placeholder="属性名"
                        />
                        {getCurrentFieldIterationTag(field) ? (
                          <span className={styles.iterationVersionTag}>{getCurrentFieldIterationTag(field)}</span>
                        ) : null}
                        {getCurrentFieldIterationMeta(field) ? (
                          <span className={styles.currentIterationBadge}>当前来源：{getCurrentFieldIterationMeta(field)}</span>
                        ) : null}
                        <div className={styles.fieldInlineActions}>
                          <button className={styles.deleteFieldBtn} onClick={() => openFieldIterationDraft(field)}>
                            迭代
                          </button>
                          <button className={styles.deleteFieldBtn} onClick={() => runAiPolishFieldInline(field)}>
                            润色
                          </button>
                          <button className={styles.deleteFieldBtn} onClick={() => handleDeleteCustomField(index)}>
                            删除
                          </button>
                        </div>
                      </div>
                      <textarea
                        className={styles.fieldValueTextarea}
                        rows={4}
                        value={field.value}
                        onChange={(event) => handleUpdateCustomField(index, { value: event.target.value })}
                        placeholder="属性值"
                      />

                      {(field.iterations ?? []).length > 0 && (
                        <div className={styles.iterationSwitcherRow}>
                          <span className={styles.iterationSwitcherLabel}>当前属性版本</span>
                          <select
                            className={styles.iterationSwitcherSelect}
                            value={field.activeIterationId ?? ''}
                            onChange={(event) => {
                              if (event.target.value) {
                                setFieldIterationAsCurrent(index, event.target.value);
                              }
                            }}
                          >
                            {(field.iterations ?? []).map((iteration) => (
                              <option key={`field-switch-${fieldId}-${iteration.id}`} value={iteration.id}>
                                {buildIterationOptionLabel(iteration.createdAt, iteration.reasonType, iteration.reasonText, iteration.reasonCardId, iteration.versionTag)}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {(field.iterations ?? []).length > 0 && (
                        <div className={styles.iterationList}>
                          {(field.iterations ?? []).map((iteration) => (
                            <div key={iteration.id} className={styles.iterationItem}>
                              {iteration.versionTag ? <span className={`${styles.iterationVersionTag} ${styles.iterationVersionTagCorner}`}>{iteration.versionTag}</span> : null}
                              <p className={styles.templatePickMeta}>{new Date(iteration.createdAt).toLocaleString('zh-CN')}</p>
                              <p className={styles.iterationValue} title={iteration.value}>{iteration.value}</p>
                              <p className={styles.templatePickMeta}>原因：{resolveIterationReasonLabel(iteration.reasonType, iteration.reasonText, iteration.reasonCardId)}</p>
                              <div className={styles.managerActionsRow}>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className={styles.inlineActionButton}
                                  onClick={() => setFieldIterationAsCurrent(index, iteration.id)}
                                  disabled={field.activeIterationId === iteration.id}
                                >
                                  {field.activeIterationId === iteration.id ? '当前版本' : '设为当前'}
                                </Button>
                                <Button size="sm" variant="ghost" className={styles.inlineActionButton} onClick={() => openFieldIterationDraft(field, iteration)}>
                                  修改原因
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {(fieldIterationDrafts[fieldId]?.open ?? false) && (
                        <div className={styles.iterationEditor}>
                          <textarea
                            className={styles.detailTextarea}
                            rows={3}
                            value={fieldIterationDrafts[fieldId]?.value ?? field.value}
                            onChange={(event) =>
                              setFieldIterationDrafts((prev) => ({
                                ...prev,
                                [fieldId]: {
                                  ...(prev[fieldId] ?? {
                                    open: true,
                                    value: field.value,
                                    versionTag: '',
                                    reasonType: 'manual',
                                    reasonText: '',
                                    reasonCardId: '',
                                  }),
                                  value: event.target.value,
                                },
                              }))
                            }
                            placeholder="输入该属性的新版本内容"
                          />
                          <input
                            className={styles.detailInput}
                            value={fieldIterationDrafts[fieldId]?.versionTag ?? ''}
                            onChange={(event) =>
                              setFieldIterationDrafts((prev) => ({
                                ...prev,
                                [fieldId]: {
                                  ...(prev[fieldId] ?? {
                                    open: true,
                                    value: field.value,
                                    versionTag: '',
                                    reasonType: 'manual',
                                    reasonText: '',
                                    reasonCardId: '',
                                  }),
                                  versionTag: event.target.value,
                                },
                              }))
                            }
                            placeholder="版本标签，例如：v1 / v2 / 终稿"
                          />
                          <div className={styles.fieldRelationAdd}>
                            <select
                              className={styles.relationSelect}
                              value={fieldIterationDrafts[fieldId]?.reasonType ?? 'manual'}
                              onChange={(event) =>
                                setFieldIterationDrafts((prev) => ({
                                  ...prev,
                                  [fieldId]: {
                                    ...(prev[fieldId] ?? {
                                      open: true,
                                      value: field.value,
                                      versionTag: '',
                                      reasonType: 'manual',
                                      reasonText: '',
                                      reasonCardId: '',
                                    }),
                                    reasonType: event.target.value === 'card' ? 'card' : 'manual',
                                  },
                                }))
                              }
                            >
                              <option value="manual">手动填写原因</option>
                              <option value="card">选择关联卡作为原因</option>
                            </select>
                            {(fieldIterationDrafts[fieldId]?.reasonType ?? 'manual') === 'card' ? (
                              <select
                                className={styles.relationSelect}
                                value={fieldIterationDrafts[fieldId]?.reasonCardId ?? ''}
                                onChange={(event) =>
                                  setFieldIterationDrafts((prev) => ({
                                    ...prev,
                                    [fieldId]: {
                                      ...(prev[fieldId] ?? {
                                        open: true,
                                        value: field.value,
                                        versionTag: '',
                                        reasonType: 'card',
                                        reasonText: '',
                                        reasonCardId: '',
                                      }),
                                      reasonCardId: event.target.value,
                                    },
                                  }))
                                }
                              >
                                <option value="">选择原因卡片</option>
                                {cards
                                  .filter((card) => card.id !== selectedCard.id)
                                  .map((card) => (
                                    <option key={`field-reason-${fieldId}-${card.id}`} value={card.id}>
                                      {card.title}
                                    </option>
                                  ))}
                              </select>
                            ) : (
                              <input
                                className={styles.detailInput}
                                value={fieldIterationDrafts[fieldId]?.reasonText ?? ''}
                                onChange={(event) =>
                                  setFieldIterationDrafts((prev) => ({
                                    ...prev,
                                    [fieldId]: {
                                      ...(prev[fieldId] ?? {
                                        open: true,
                                        value: field.value,
                                        versionTag: '',
                                        reasonType: 'manual',
                                        reasonText: '',
                                        reasonCardId: '',
                                      }),
                                      reasonText: event.target.value,
                                    },
                                  }))
                                }
                                placeholder="填写迭代原因"
                              />
                            )}
                          </div>
                          <div className={styles.managerActionsRow}>
                            <Button size="sm" variant="ghost" className={styles.inlineActionButton} onClick={() => closeFieldIterationDraft(fieldId)}>
                              取消
                            </Button>
                            <Button size="sm" variant="secondary" className={styles.inlineActionButton} onClick={() => saveFieldIteration(index)}>
                              保存属性迭代
                            </Button>
                          </div>
                        </div>
                      )}
                       
                      <div className={styles.fieldRelationSection}>
                        <button
                          className={styles.fieldRelationToggle}
                          onClick={() => toggleFieldRelation(fieldId)}
                        >
                          <span className={styles.relationIcon}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12">
                              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                            </svg>
                          </span>
                          {fieldRelations.length}
                        </button>
                        
                        {isRelationOpen && (
                          <div className={styles.fieldRelationPanel}>
                            {fieldRelations.length > 0 && (
                              <ul className={styles.fieldRelationList}>
                                {fieldRelations.map((relation) => {
                                  const { targetCard, targetField } = resolveRelationTarget(relation);
                                  return (
                                    <li key={`editor-rel-${relation.index}`} className={styles.fieldRelationItem}>
                                      <span className={styles.relationType}>{relation.type}</span>
                                      <button
                                        className={styles.relationTargetLink}
                                        onClick={() => {
                                          if (targetCard) {
                                            openCardPreview(targetCard.id);
                                          }
                                        }}
                                      >
                                        {targetCard?.title ?? '未知'}
                                        {targetField ? ` / ${targetField.name}` : ''}
                                      </button>
                                      <button 
                                        className={styles.removeRelationBtn}
                                        onClick={() => handleDeleteRelation(relation.index)}
                                        title="删除关联"
                                      >
                                        ×
                                      </button>
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                            <div className={styles.fieldRelationAdd}>
                              <select
                                className={styles.relationSelect}
                                value={targetCardId}
                                onChange={(event) => {
                                  const value = event.target.value;
                                  setFieldRelationTarget((prev) => ({ ...prev, [fieldId]: value }));
                                }}
                              >
                                <option value="">卡片...</option>
                                {cards
                                  .filter((card) => card.id !== selectedCard.id)
                                  .map((card) => (
                                    <option key={card.id} value={card.id}>{card.title}</option>
                                  ))}
                              </select>
                              <select
                                className={styles.relationSelect}
                                value={fieldRelationType[fieldId] ?? ''}
                                onChange={(event) => setFieldRelationType((prev) => ({ ...prev, [fieldId]: event.target.value }))}
                              >
                                <option value="">关系类型</option>
                                {RELATION_TYPE_OPTIONS.map((relationType) => (
                                  <option key={relationType} value={relationType}>
                                    {relationType}
                                  </option>
                                ))}
                              </select>
                              <button 
                                className={styles.addRelationBtn}
                                onClick={() => handleCreateFieldRelation(fieldId)}
                                disabled={!fieldRelationTarget[fieldId]}
                              >
                                +
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className={styles.emptyState}>还没有自定义属性</p>
              )}
            </div>

          </section>
        </div>
      )}

      {isAiResultOpen && (
        <div className={styles.managerOverlay} role="presentation" onClick={() => setIsAiResultOpen(false)}>
          <div className={styles.managerCard} role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className={styles.managerHeader}>
              <h3>
                {aiActionKind === 'summary'
                  ? 'AI 摘要建议'
                  : aiActionKind === 'fields'
                    ? 'AI 属性建议'
                    : aiActionKind === 'field'
                      ? 'AI 属性润色建议'
                      : 'AI 格式整理建议'}
              </h3>
            </div>

            {aiActionKind === 'summary' ? (
              <div className={styles.aiResultBody}>
                <p className={styles.aiHint}>请确认摘要草稿后再应用。</p>
                <div className={styles.aiDiffPair}>
                  <div className={styles.aiDiffItem}>
                    <span className={styles.aiDiffLabel}>当前摘要</span>
                    <p>{selectedCard?.summary?.trim() || '（空）'}</p>
                  </div>
                  <div className={styles.aiDiffItem}>
                    <span className={styles.aiDiffLabel}>AI 建议</span>
                    <p>{aiSummaryDraft.trim() || '（空）'}</p>
                  </div>
                </div>
                <textarea
                  className={styles.detailTextarea}
                  rows={6}
                  value={aiSummaryDraft}
                  onChange={(event) => setAiSummaryDraft(event.target.value)}
                />
                <div className={styles.managerActionsRow}>
                  <Button size="sm" variant="ghost" className={styles.inlineActionButton} onClick={() => setIsAiResultOpen(false)}>
                    取消
                  </Button>
                  <Button size="sm" variant="secondary" className={styles.inlineActionButton} onClick={handleApplyAiSummary}>
                    应用摘要
                  </Button>
                </div>
              </div>
            ) : aiActionKind === 'fields' ? (
              <div className={styles.aiResultBody}>
                <p className={styles.aiHint}>勾选需要添加的属性，应用后会写入属性列表。</p>
                <div className={styles.aiSuggestionList}>
                  {aiSuggestions.map((item) => {
                    const checked = selectedSuggestionNames.includes(item.name);
                    return (
                      <label key={item.name} className={styles.aiSuggestionItem}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            const nextChecked = event.target.checked;
                            setSelectedSuggestionNames((prev) => {
                              if (nextChecked) {
                                return prev.includes(item.name) ? prev : [...prev, item.name];
                              }
                              return prev.filter((name) => name !== item.name);
                            });
                          }}
                        />
                        <div>
                          <p className={styles.aiSuggestionTitle}>{item.name}</p>
                          <p className={styles.aiSuggestionReason}>{item.reason || '无说明'}</p>
                          <p className={styles.aiSuggestionSample}>示例：{item.sampleValue || '（空）'}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
                <div className={styles.managerActionsRow}>
                  <Button size="sm" variant="ghost" className={styles.inlineActionButton} onClick={() => setIsAiResultOpen(false)}>
                    取消
                  </Button>
                  <Button size="sm" variant="secondary" className={styles.inlineActionButton} onClick={handleApplyAiSuggestions}>
                    添加所选属性
                  </Button>
                </div>
              </div>
            ) : aiActionKind === 'normalize' ? (
              <div className={styles.aiResultBody}>
                <p className={styles.aiHint}>以下为 AI 计划调整项，确认后将一次性应用到固定属性与属性结构。</p>
                {aiNormalizeDiffLines.length > 0 ? (
                  <label className={styles.aiFilterToggle}>
                    <input
                      type="checkbox"
                      checked={normalizeShowSelectedOnly}
                      onChange={(event) => setNormalizeShowSelectedOnly(event.target.checked)}
                    />
                    仅显示已勾选项
                  </label>
                ) : null}
                {visibleNormalizeDiffLines.length > 0 ? (
                  <div className={styles.aiNormalizeDiffList}>
                    {visibleNormalizeDiffLines.map((item) => (
                      <div key={item.field} className={styles.aiNormalizeDiffItem}>
                        <label className={styles.aiNormalizeHeaderRow}>
                          <input
                            type="checkbox"
                            checked={normalizeApplySelection[item.key]}
                            onChange={(event) => {
                              const checked = event.target.checked;
                              setNormalizeApplySelection((prev) => ({ ...prev, [item.key]: checked }));
                            }}
                          />
                          <span className={styles.aiDiffLabel}>{item.field}</span>
                        </label>
                        <p className={styles.aiNormalizeBefore}>当前：{item.before}</p>
                        <p className={styles.aiNormalizeAfter}>建议：{item.after}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={styles.aiHint}>AI 返回了 patch，但与当前内容无明显差异。</p>
                )}
                <div className={styles.managerActionsRow}>
                  <Button size="sm" variant="ghost" className={styles.inlineActionButton} onClick={() => setIsAiResultOpen(false)}>
                    取消
                  </Button>
                  <Button size="sm" variant="secondary" className={styles.inlineActionButton} onClick={handleApplyAiNormalizePatch}>
                    应用格式整理
                  </Button>
                </div>
              </div>
            ) : (
              <div className={styles.aiResultBody}>
                <p className={styles.aiHint}>确认后将替换该属性内容。</p>
                <div className={styles.aiDiffPair}>
                  <div className={styles.aiDiffItem}>
                    <span className={styles.aiDiffLabel}>原属性值</span>
                    <p>{aiFieldDraft?.beforeValue || '（空）'}</p>
                  </div>
                  <div className={styles.aiDiffItem}>
                    <span className={styles.aiDiffLabel}>AI 建议值</span>
                    <p>{aiFieldDraft?.nextValue || '（空）'}</p>
                  </div>
                </div>
                <div className={styles.managerActionsRow}>
                  <Button size="sm" variant="ghost" className={styles.inlineActionButton} onClick={() => setIsAiResultOpen(false)}>
                    取消
                  </Button>
                  <Button size="sm" variant="secondary" className={styles.inlineActionButton} onClick={handleApplyAiFieldDraft}>
                    应用属性润色
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {isAiGuideOpen && selectedCard && (
        <div className={styles.managerOverlay} role="presentation" onClick={() => setIsAiGuideOpen(false)}>
          <div className={styles.managerCard} role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className={styles.managerHeader}>
              <h3>内置AI引导</h3>
            </div>
            <div className={styles.aiResultBody}>
              <p className={styles.aiHint}>轻量分步引导：先写已有想法，再逐步补齐。可以留空，不必一次写完整。</p>
              <div className={styles.aiGuideHeaderRow}>
                <p className={styles.aiGuideStepTitle}>问题 {aiGuideQuestionIndex + 1}/{aiGuideQuestions.length}：{aiGuideQuestions[aiGuideQuestionIndex] ?? '请先生成引导问题'}</p>
                <Button size="sm" variant="ghost" className={styles.inlineActionButton} onClick={() => void generateAiGuideQuestions()} disabled={aiGuideQuestionBusy}>
                  {aiGuideQuestionBusy ? '生成中...' : '刷新AI问题'}
                </Button>
              </div>
              <textarea
                className={styles.detailTextarea}
                rows={4}
                value={aiGuideAnswers[aiGuideQuestionIndex]}
                onChange={(event) => {
                  const value = event.target.value;
                  setAiGuideAnswers((prev) => prev.map((item, index) => (index === aiGuideQuestionIndex ? value : item)));
                }}
              />
              <div className={styles.managerActionsRow}>
                <Button
                  size="sm"
                  variant="ghost"
                  className={styles.inlineActionButton}
                  onClick={() => setAiGuideQuestionIndex((prev) => Math.max(0, prev - 1))}
                  disabled={aiGuideQuestionIndex === 0}
                >
                  上一步
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className={styles.inlineActionButton}
                  onClick={() => setAiGuideQuestionIndex((prev) => Math.min(aiGuideQuestions.length - 1, prev + 1))}
                    disabled={aiGuideQuestionIndex === aiGuideQuestions.length - 1}
                  >
                    下一步
                  </Button>
                </div>
              </div>

            <div className={styles.managerActionsRow}>
              <Button size="sm" variant="ghost" className={styles.inlineActionButton} onClick={() => void handleOpenExternalAi('describe')}>
                使用外部AI辅助
              </Button>
              <Button size="sm" variant="ghost" className={styles.inlineActionButton} onClick={() => setIsAiGuideOpen(false)}>
                关闭
              </Button>
              <Button size="sm" variant="secondary" className={styles.inlineActionButton} onClick={() => runAiGuideFlow('describe')} disabled={aiBusy}>
                {aiBusy ? '执行中...' : '执行引导'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {isPolishPromptOpen && (
        <div className={styles.managerOverlay} role="presentation" onClick={() => closePolishPrompt(null)}>
          <div className={styles.managerCard} role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className={styles.managerHeader}>
              <h3>{polishPromptTarget}润色方案</h3>
            </div>
            <p className={styles.aiHint}>可多行输入。确认后会记住最近方案，方便下次复用。</p>

            {recentPolishPrompts.length > 0 && (
              <div className={styles.polishRecentList}>
                {recentPolishPrompts.map((promptItem) => (
                  <div key={promptItem.id} className={styles.polishRecentItem}>
                    <button className={styles.polishRecentApply} onClick={() => setPolishPromptDraft(promptItem.content)}>
                      <span className={styles.polishRecentName}>{promptItem.name}</span>
                      <span className={styles.polishRecentContent}>{promptItem.content}</span>
                    </button>
                    <div className={styles.polishRecentActions}>
                      <button className={styles.polishRecentActionBtn} onClick={() => handleToggleRecentPromptPin(promptItem.id)}>
                        {promptItem.pinned ? '取消置顶' : '置顶'}
                      </button>
                      <button className={styles.polishRecentActionBtn} onClick={() => handleRenameRecentPrompt(promptItem.id)}>
                        重命名
                      </button>
                      <button className={styles.polishRecentActionBtn} onClick={() => handleDeleteRecentPrompt(promptItem.id)}>
                        删除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <textarea
              className={styles.detailTextarea}
              rows={6}
              value={polishPromptDraft}
              onChange={(event) => setPolishPromptDraft(event.target.value)}
              placeholder="例如：更有画面感，保留原意，语言简洁"
              autoFocus
            />

            <div className={styles.managerActionsRow}>
              <Button size="sm" variant="ghost" className={styles.inlineActionButton} onClick={() => closePolishPrompt(null)}>
                取消
              </Button>
              <Button size="sm" variant="secondary" className={styles.inlineActionButton} onClick={confirmPolishPrompt}>
                确认并继续
              </Button>
            </div>
          </div>
        </div>
      )}

      {isRenamePromptOpen && (
        <div className={styles.managerOverlay} role="presentation" onClick={closeRenamePrompt}>
          <div className={styles.managerCard} role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className={styles.managerHeader}>
              <h3>重命名润色方案</h3>
            </div>
            <p className={styles.aiHint}>输入新的方案名称，便于快速识别和复用。</p>
            <input
              className={styles.detailInput}
              value={renamePromptDraft}
              onChange={(event) => setRenamePromptDraft(event.target.value)}
              placeholder="例如：文学化风格"
              autoFocus
            />
            <div className={styles.managerActionsRow}>
              <Button size="sm" variant="ghost" className={styles.inlineActionButton} onClick={closeRenamePrompt}>
                取消
              </Button>
              <Button size="sm" variant="secondary" className={styles.inlineActionButton} onClick={confirmRenamePrompt}>
                确认
              </Button>
            </div>
          </div>
        </div>
      )}

      {isExternalAiOpen && (
        <div className={styles.managerOverlay} role="presentation" onClick={() => setIsExternalAiOpen(false)}>
          <div className={styles.managerCard} role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className={styles.managerHeader}>
              <h3>外部AI辅助</h3>
            </div>
            <p className={styles.aiHint}>复制提示词到外部模型网页，拿回 JSON 后粘贴到下方应用。</p>
            <div className={styles.aiGuideHeaderRow}>
              <Button
                size="sm"
                variant={externalPromptMode === 'describe' ? 'secondary' : 'ghost'}
                className={styles.inlineActionButton}
                onClick={() => {
                  setExternalPromptMode('describe');
                  setExternalPrompt(buildExternalPromptByMode('describe'));
                }}
              >
                描述到摘要+属性
              </Button>
              <Button
                size="sm"
                variant={externalPromptMode === 'summaryToFields' ? 'secondary' : 'ghost'}
                className={styles.inlineActionButton}
                onClick={() => {
                  setExternalPromptMode('summaryToFields');
                  setExternalPrompt(buildExternalPromptByMode('summaryToFields'));
                }}
              >
                摘要到属性
              </Button>
              <Button
                size="sm"
                variant={externalPromptMode === 'reviewCard' ? 'secondary' : 'ghost'}
                className={styles.inlineActionButton}
                onClick={() => {
                  setExternalPromptMode('reviewCard');
                  setExternalPrompt(buildExternalPromptByMode('reviewCard'));
                }}
              >
                审校到patch
              </Button>
              <Button
                size="sm"
                variant={externalPromptMode === 'polish' ? 'secondary' : 'ghost'}
                className={styles.inlineActionButton}
                onClick={() => {
                  setExternalPromptMode('polish');
                  setExternalPrompt(buildExternalPromptByMode('polish'));
                }}
              >
                整卡润色
              </Button>
              <Button
                size="sm"
                variant={externalPromptMode === 'fieldsToSummary' ? 'secondary' : 'ghost'}
                className={styles.inlineActionButton}
                onClick={() => {
                  setExternalPromptMode('fieldsToSummary');
                  setExternalPrompt(buildExternalPromptByMode('fieldsToSummary'));
                }}
              >
                属性到摘要
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className={styles.inlineActionButton}
                onClick={() => setExternalPrompt(buildExternalPromptByMode(externalPromptMode))}
              >
                刷新提示词
              </Button>
            </div>
            <div className={styles.externalAiActions}>
              <Button size="sm" variant="secondary" className={styles.inlineActionButton} onClick={handleCopyExternalPrompt}>
                复制提示词
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className={styles.inlineActionButton}
                onClick={() => {
                  const matched = MODEL_OPTIONS.find((item) => item.id === activeAiModelId);
                  window.open(matched?.webUrl ?? 'https://chatgpt.com/', '_blank', 'noopener,noreferrer');
                }}
              >
                打开模型网页
              </Button>
            </div>

            <textarea className={styles.detailTextarea} rows={8} value={externalPrompt} onChange={(event) => setExternalPrompt(event.target.value)} />
            <textarea
              ref={externalResponseRef}
              className={styles.detailTextarea}
              rows={8}
              value={externalResponseInput}
              onChange={(event) => {
                setExternalResponseInput(event.target.value);
                setExternalResponseError(null);
                setExternalResponseSchemaErrors([]);
              }}
              placeholder="粘贴外部AI返回的 JSON"
            />
            {externalResponseError && <p className={styles.aiErrorText}>{externalResponseError}</p>}
            {externalResponseSchemaErrors.length > 0 && (
              <ul className={styles.schemaErrorList}>
                {externalResponseSchemaErrors.map((item) => (
                  <li key={item} className={styles.schemaErrorItem}>
                    <button className={styles.schemaErrorButton} onClick={() => locateExternalSchemaError(item)}>
                      {item}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className={styles.managerActionsRow}>
              <Button size="sm" variant="ghost" className={styles.inlineActionButton} onClick={() => setIsExternalAiOpen(false)}>
                关闭
              </Button>
              <Button size="sm" variant="secondary" className={styles.inlineActionButton} onClick={handleApplyExternalResponse}>
                解析并预览应用
              </Button>
            </div>
          </div>
        </div>
      )}

      {isAiHistoryOpen && selectedCard && (
        <div className={styles.managerOverlay} role="presentation" onClick={() => setIsAiHistoryOpen(false)}>
          <div className={styles.managerCard} role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className={styles.managerHeader}>
              <h3>AI 应用历史</h3>
            </div>
            <p className={styles.aiHint}>选择任意历史节点恢复。恢复后会清除该节点之后的同卡历史。</p>
            <div className={styles.aiHistoryList}>
              {selectedCardUndoEntries.length > 0 ? (
                selectedCardUndoEntries.map((entry) => (
                  <div key={entry.id} className={styles.aiHistoryItem}>
                    <div>
                      <p className={styles.aiHistoryTitle}>{entry.label}</p>
                      <p className={styles.aiHistoryTime}>{new Date(entry.createdAt).toLocaleString('zh-CN')}</p>
                    </div>
                    <Button size="sm" variant="secondary" className={styles.inlineActionButton} onClick={() => handleRestoreAiHistory(entry.id)}>
                      恢复到此步
                    </Button>
                  </div>
                ))
              ) : (
                <p className={styles.emptyState}>暂无可用历史。</p>
              )}
            </div>
            <div className={styles.managerActionsRow}>
              <Button size="sm" variant="ghost" className={styles.inlineActionButton} onClick={() => setIsAiHistoryOpen(false)}>
                关闭
              </Button>
            </div>
          </div>
        </div>
      )}

      {isDefaultDependencyOpen && (
        <div className={styles.managerOverlay} role="presentation" onClick={() => setIsDefaultDependencyOpen(false)}>
          <div className={styles.managerCard} role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className={styles.managerHeader}>
              <h3>默认依赖设置</h3>
            </div>
            <p className={styles.aiHint}>这里可按“新卡类型”批量设置默认依赖卡。你也可以在单卡编辑页把某张卡直接设为默认依赖来源。</p>
            <div className={styles.categoryFilters}>
              {CARD_TYPE_OPTIONS.map((option) => (
                <button
                  key={`dep-type-${option.type}`}
                  className={`${styles.categoryFilter} ${defaultDependencyType === option.type ? styles.activeCategory : ''}`}
                  onClick={() => setDefaultDependencyType(option.type)}
                >
                  {option.label}（{(defaultDependencyMap[option.type] ?? []).length}）
                </button>
              ))}
            </div>
            <div className={styles.managerActionsRow}>
              <Button
                size="sm"
                variant="ghost"
                className={styles.inlineActionButton}
                onClick={() =>
                  setDefaultDependencyMap((prev) => ({
                    ...prev,
                    [defaultDependencyType]: [],
                  }))
                }
              >
                清空当前类型默认依赖
              </Button>
            </div>
            <div className={styles.managerList}>
              {defaultDependencyCandidates.length > 0 ? (
                defaultDependencyCandidates.map((candidate) => {
                  const checked = (defaultDependencyMap[defaultDependencyType] ?? []).includes(candidate.id);
                  return (
                    <label key={`dep-candidate-${candidate.id}`} className={styles.managerListItem}>
                      <span className={styles.managerTagName}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleDefaultDependency(defaultDependencyType, candidate.id)}
                        />
                        {candidate.title}
                      </span>
                      <span className={styles.templatePickMeta}>{candidate.typeLabel}</span>
                    </label>
                  );
                })
              ) : (
                <p className={styles.emptyState}>当前还没有可设置的依赖卡。</p>
              )}
            </div>
          </div>
        </div>
      )}

      {isTagManagerOpen && (
        <div className={styles.managerOverlay} role="presentation" onClick={() => setIsTagManagerOpen(false)}>
          <div className={styles.managerCard} role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className={styles.managerHeader}>
              <h3>标签管理器</h3>
            </div>
            <div className={styles.managerRow}>
              <select
                className={styles.categorySelect}
                value={managerTagScope}
                onChange={(event) => setManagerTagScope(event.target.value as 'global' | 'story')}
              >
                <option value="global">保存到全局标签</option>
                <option value="story">保存到当前故事标签</option>
              </select>
              <input
                className={styles.tagInput}
                value={tagManagerName}
                onChange={(event) => setTagManagerName(event.target.value)}
                placeholder="新增标签名"
              />
              <input
                className={styles.colorInput}
                type="color"
                value={tagManagerColor}
                onChange={(event) => setTagManagerColor(event.target.value)}
              />
              <Button size="sm" variant="secondary" className={styles.inlineActionButton} onClick={handleCreateTag}>
                保存标签
              </Button>
            </div>
            <div className={styles.managerList}>
              {[...globalTags, ...storyTags.filter((tag) => !globalTags.some((globalTag) => globalTag.name === tag.name))].map((tag) => (
                <div key={tag.name} className={styles.managerListItem}>
                  <span className={styles.managerTagName}>
                    <span className={styles.tagDot} style={{ background: tag.color }} />
                    {tag.name}（{tagSourceLabel(tag.name)}）
                  </span>
                  <div className={styles.managerActions}>
                    <input
                      className={styles.colorInput}
                      type="color"
                      value={tag.color}
                      onChange={(event) => handleSetTagColor(tag.name, event.target.value)}
                    />
                    <Button size="sm" variant="ghost" className={styles.inlineActionButton} onClick={() => handleDeleteTag(tag.name)}>
                      删除
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {isCategoryManagerOpen && (
        <div className={styles.managerOverlay} role="presentation" onClick={() => setIsCategoryManagerOpen(false)}>
          <div className={styles.managerCard} role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className={styles.managerHeader}>
              <h3>分类管理器</h3>
            </div>
            <div className={styles.managerRow}>
              <select
                className={styles.categorySelect}
                value={managerCategoryScope}
                onChange={(event) => setManagerCategoryScope(event.target.value as 'global' | 'story')}
              >
                <option value="global">保存到全局分类</option>
                <option value="story">保存到当前故事分类</option>
              </select>
              <input
                className={styles.tagInput}
                value={categoryManagerName}
                onChange={(event) => setCategoryManagerName(event.target.value)}
                placeholder="新增分类名"
              />
              <Button size="sm" variant="secondary" className={styles.inlineActionButton} onClick={handleAddCategory}>
                保存分类
              </Button>
            </div>
            <div className={styles.managerList}>
              {categories.map((category) => (
                <div key={category} className={styles.managerListItem}>
                  {editingCategoryName === category ? (
                    <div className={styles.managerInlineEditor}>
                      <input
                        className={styles.tagInput}
                        value={editingCategoryValue}
                        onChange={(event) => setEditingCategoryValue(event.target.value)}
                        placeholder="输入分类名称"
                        autoFocus
                      />
                      <div className={styles.managerActions}>
                        <Button
                          size="sm"
                          variant="secondary"
                          className={styles.inlineActionButton}
                          onClick={() => handleRenameCategory(category, editingCategoryValue)}
                        >
                          保存
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className={styles.inlineActionButton}
                          onClick={() => {
                            setEditingCategoryName(null);
                            setEditingCategoryValue('');
                          }}
                        >
                          取消
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <span className={styles.managerTagName}>{category}（{categorySourceLabel(category)}）</span>
                  )}
                  {editingCategoryName !== category && (
                    <div className={styles.managerActions}>
                      <Button
                        size="sm"
                        variant="ghost"
                        className={styles.inlineActionButton}
                        onClick={() => {
                          setEditingCategoryName(category);
                          setEditingCategoryValue(category);
                        }}
                      >
                        重命名
                      </Button>
                      <Button size="sm" variant="ghost" className={styles.inlineActionButton} onClick={() => handleDeleteCategory(category)}>
                        删除
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {isTemplateManagerOpen && (
        <div className={styles.managerOverlay} role="presentation" onClick={() => setIsTemplateManagerOpen(false)}>
          <div className={styles.managerCard} role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className={styles.managerHeader}>
              <h3>模版管理器</h3>
            </div>
            <div className={styles.managerList}>
              {templateManagerEntries.length > 0 ? (
                templateManagerEntries.map((template) => {
                  const editKey = templateEditingKey(template.source, template.id);
                  return (
                    <div key={editKey} className={styles.managerListItem}>
                      {editingTemplateId === editKey ? (
                        <div className={styles.managerInlineEditor}>
                          <input
                            className={styles.tagInput}
                            value={editingTemplateValue}
                            onChange={(event) => setEditingTemplateValue(event.target.value)}
                            placeholder="输入模版名称"
                            autoFocus
                          />
                          <div className={styles.managerActions}>
                            <Button
                              size="sm"
                              variant="secondary"
                              className={styles.inlineActionButton}
                              onClick={() => handleRenameTemplate(template.id, template.source, editingTemplateValue)}
                            >
                              保存
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className={styles.inlineActionButton}
                              onClick={() => {
                                setEditingTemplateId(null);
                                setEditingTemplateValue('');
                              }}
                            >
                              取消
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <span className={styles.managerTagName}>
                          {template.name}（{template.source === 'global' ? '全局' : '故事'}）
                        </span>
                      )}

                      {editingTemplateId !== editKey && (
                        <div className={styles.managerActions}>
                          <Button
                            size="sm"
                            variant="ghost"
                            className={styles.inlineActionButton}
                            onClick={() => {
                              setEditingTemplateId(editKey);
                              setEditingTemplateValue(template.name);
                            }}
                          >
                            重命名
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className={styles.inlineActionButton}
                            onClick={() => handleDeleteTemplate(template.id, template.source)}
                          >
                            删除
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <p className={styles.emptyState}>暂无模版。你可以在卡片详情里保存模版。</p>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
