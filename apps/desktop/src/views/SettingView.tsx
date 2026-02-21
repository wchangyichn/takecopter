import { useCallback, useEffect, useId, useMemo, useRef, useState, type DragEvent as ReactDragEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { Button, Panel } from '../components/ui';
import type { SettingCard, SettingCardIteration, SettingCustomField, SettingFieldIteration, SettingLibrary, SettingTag, SettingTemplate } from '../types';
import styles from './SettingView.module.css';

const cardPalette = ['var(--coral-400)', 'var(--violet-400)', 'var(--teal-400)', 'var(--amber-400)', 'var(--rose-400)'];
const tagColorPalette = ['#f97316', '#ef4444', '#eab308', '#10b981', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];
const customFieldPresets = ['服设', '口癖', '年龄', '身份', '目标', '弱点'];
const FIELD_UNIT_WIDTH = 220;
const FIELD_UNIT_HEIGHT = 140;
const MODEL_KEY_STORAGE = 'takecopter.desktop.model-api-keys.v1';
const POLISH_PROMPTS_STORAGE = 'takecopter.desktop.polish-prompts.v1';

const AI_CHANNEL_STORAGE = 'takecopter.desktop.ai-channel.v1';
const AI_MODEL_STORAGE = 'takecopter.desktop.active-ai-model.v1';
const MODEL_OPTIONS = [
  { id: 'openai:gpt-4.1', label: 'OpenAI（GPT-4.1）', webUrl: 'https://chatgpt.com/' },
  { id: 'anthropic:claude-3.7-sonnet', label: 'Anthropic（Claude 3.7 Sonnet）', webUrl: 'https://claude.ai/' },
  { id: 'deepseek:deepseek-chat', label: 'DeepSeek（DeepSeek Chat）', webUrl: 'https://chat.deepseek.com/' },
  { id: 'qwen:qwen-max', label: '通义千问（Qwen Max）', webUrl: 'https://chat.qwen.ai/' },
] as const;
const ORIGIN_ITERATION_ID = '__origin__';

const RELATION_TYPE_OPTIONS = ['参考', '约束', '冲突', '触发', '揭示', '归属', '因果', '回收'];
const ORIGIN_CARD_ITERATION_ID = '__origin_card__';

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
};

const QUICK_CREATE_OPTIONS: QuickCreateOption[] = [
  { key: 'blank', label: '空白卡', summary: '完全空白，不预设属性。' },
  { key: 'worldview', label: '世界观卡', summary: '空白世界观卡，仅预设分类为"世界观"，内容由你自行定义。', type: 'location', category: '世界观' },
  { key: 'character', label: '角色卡', summary: '创建空白角色卡，后续按故事需要自由补充。', type: 'character', category: '角色' },
  { key: 'location', label: '地点卡', summary: '创建空白地点卡，适配世界观、势力、场景等设定。', type: 'location', category: '地点' },
  { key: 'item', label: '物品卡', summary: '创建空白物品卡，适配道具、能力、资源等设定。', type: 'item', category: '道具' },
  { key: 'event', label: '事件卡', summary: '创建空白事件卡，用于推进剧情节点与转折。', type: 'event', category: '事件' },
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
type AiChannel = 'internal' | 'external';

type AiGuideMode = 'describe' | 'summaryToFields' | 'reviewCard' | 'polish' | 'fieldsToSummary' | 'fieldPolish';

type ExternalAiPayload = {
  taskType?: string;
  cardId?: string;
  result?: unknown;
  summary?: unknown;
  suggestions?: unknown;
  patch?: unknown;
  field?: unknown;
};

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

interface PreviewFieldDialogState {
  cardId: string;
  fieldId: string;
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
        initialValue: typeof field.initialValue === 'string' ? field.initialValue : field.value,
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
      cardIterations: Array.isArray(card.cardIterations)
        ? card.cardIterations
            .filter((item) => Boolean(item) && typeof item.id === 'string' && item.snapshot && typeof item.snapshot === 'object')
            .map((item) => ({
              id: item.id,
              parentIterationId: typeof item.parentIterationId === 'string' ? item.parentIterationId : undefined,
              snapshot: {
                title: typeof item.snapshot.title === 'string' ? item.snapshot.title : card.title,
                summary: typeof item.snapshot.summary === 'string' ? item.snapshot.summary : card.summary,
                category: typeof item.snapshot.category === 'string' ? item.snapshot.category : undefined,
                tags: Array.isArray(item.snapshot.tags)
                  ? item.snapshot.tags
                      .filter((tag) => Boolean(tag) && typeof tag.name === 'string')
                      .map((tag) => ({ name: tag.name, color: typeof tag.color === 'string' ? tag.color : randomTagColor() }))
                  : (card.tags ?? []).map((tag) => ({ ...tag })),
                customFields: Array.isArray(item.snapshot.customFields)
                  ? item.snapshot.customFields.map((field, index) => ({
                      id: field.id ?? `field-${uniqueId}-iter-${index + 1}`,
                      name: field.name,
                      value: field.value,
                      size: field.size,
                      x: field.x,
                      y: field.y,
                      w: field.w,
                      h: field.h,
                      iterations: Array.isArray(field.iterations) ? field.iterations.map((iter) => ({ ...iter })) : [],
                      activeIterationId: field.activeIterationId,
                      initialValue: typeof field.initialValue === 'string' ? field.initialValue : field.value,
                    }))
                  : (card.customFields ?? []).map((field) => ({ ...field, iterations: field.iterations?.map((iter) => ({ ...iter })), initialValue: field.initialValue ?? field.value })),
                relations: Array.isArray(item.snapshot.relations)
                  ? item.snapshot.relations
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
                  : (card.relations ?? []).map((relation) => ({ ...relation })),
              },
              versionTag: typeof item.versionTag === 'string' ? item.versionTag : undefined,
              reasonType: item.reasonType === 'card' ? 'card' : 'manual',
              reasonText: typeof item.reasonText === 'string' ? item.reasonText : undefined,
              reasonCardId: typeof item.reasonCardId === 'string' ? item.reasonCardId : undefined,
              createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
            }))
        : [],
      activeCardIterationId: typeof card.activeCardIterationId === 'string' ? card.activeCardIterationId : undefined,
      initialSnapshot:
        card.initialSnapshot && typeof card.initialSnapshot === 'object'
          ? {
              title: typeof card.initialSnapshot.title === 'string' ? card.initialSnapshot.title : card.title,
              summary: typeof card.initialSnapshot.summary === 'string' ? card.initialSnapshot.summary : card.summary,
              category: typeof card.initialSnapshot.category === 'string' ? card.initialSnapshot.category : card.category,
              tags: Array.isArray(card.initialSnapshot.tags)
                ? card.initialSnapshot.tags.map((tag) => ({ name: tag.name, color: tag.color }))
                : (card.tags ?? []).map((tag) => ({ ...tag })),
              customFields: Array.isArray(card.initialSnapshot.customFields)
                ? card.initialSnapshot.customFields.map((field, index) => ({
                    id: field.id ?? `field-${uniqueId}-initial-${index + 1}`,
                    name: field.name,
                    value: field.value,
                    size: field.size,
                    x: field.x,
                    y: field.y,
                    w: field.w,
                    h: field.h,
                    iterations: Array.isArray(field.iterations) ? field.iterations.map((iter) => ({ ...iter })) : [],
                    activeIterationId: field.activeIterationId,
                    initialValue: typeof field.initialValue === 'string' ? field.initialValue : field.value,
                  }))
                : (card.customFields ?? []).map((field) => ({ ...field, iterations: field.iterations?.map((iter) => ({ ...iter })), initialValue: field.initialValue ?? field.value })),
              relations: Array.isArray(card.initialSnapshot.relations)
                ? card.initialSnapshot.relations.map((relation) => ({ ...relation }))
                : (card.relations ?? []).map((relation) => ({ ...relation })),
            }
          : {
              title: card.title,
              summary: card.summary,
              category: card.category,
              tags: (card.tags ?? []).map((tag) => ({ ...tag })),
              customFields: (card.customFields ?? []).map((field, index) => ({
                id: field.id ?? `field-${uniqueId}-initial-fallback-${index + 1}`,
                name: field.name,
                value: field.value,
                size: field.size,
                x: field.x,
                y: field.y,
                w: field.w,
                h: field.h,
                iterations: Array.isArray(field.iterations) ? field.iterations.map((iter) => ({ ...iter })) : [],
                activeIterationId: field.activeIterationId,
                initialValue: typeof field.initialValue === 'string' ? field.initialValue : field.value,
              })),
              relations: (card.relations ?? []).map((relation) => ({ ...relation })),
            },
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
    cardIterations: (card.cardIterations ?? []).map((iteration) => ({
      ...iteration,
      snapshot: {
        ...iteration.snapshot,
        tags: iteration.snapshot.tags.map((tag) => ({ ...tag })),
        customFields: iteration.snapshot.customFields.map((field) => ({ ...field, iterations: field.iterations?.map((iter) => ({ ...iter })) })),
        relations: (iteration.snapshot.relations ?? []).map((relation) => ({ ...relation })),
      },
    })),
    initialSnapshot: card.initialSnapshot
      ? {
          ...card.initialSnapshot,
          tags: card.initialSnapshot.tags.map((tag) => ({ ...tag })),
          customFields: card.initialSnapshot.customFields.map((field) => ({
            ...field,
            iterations: field.iterations?.map((iteration) => ({ ...iteration })),
          })),
          relations: (card.initialSnapshot.relations ?? []).map((relation) => ({ ...relation })),
        }
      : undefined,
  };
}

function buildCardIterationSnapshot(card: EditableCard): SettingCardIteration['snapshot'] {
  return {
    title: card.title,
    summary: card.summary,
    category: card.category,
    tags: card.tags.map((tag) => ({ ...tag })),
    customFields: card.customFields.map((field) => ({
      ...field,
      iterations: (field.iterations ?? []).map((iteration) => ({ ...iteration })),
    })),
    relations: card.relations.map((relation) => ({ ...relation })),
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
  const [previewFieldDialog, setPreviewFieldDialog] = useState<PreviewFieldDialogState | null>(null);
  const [previewDragState, setPreviewDragState] = useState<PreviewDragState | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const [activeTagFilters, setActiveTagFilters] = useState<string[]>([]);
  const [toolbarTagSearchOpen, setToolbarTagSearchOpen] = useState(false);
  const [toolbarTagQuery, setToolbarTagQuery] = useState('');
  const [toolbarTagActiveIndex, setToolbarTagActiveIndex] = useState(0);

  const [isDetailTagModalOpen, setIsDetailTagModalOpen] = useState(false);
  const [detailTagDraft, setDetailTagDraft] = useState('');
  const [detailTagColorDraft, setDetailTagColorDraft] = useState(() => randomTagColor());
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [fieldRelationOpen, setFieldRelationOpen] = useState<Record<string, boolean>>({});
  const [fieldRelationTarget, setFieldRelationTarget] = useState<Record<string, string>>({});
  const [fieldRelationType, setFieldRelationType] = useState<Record<string, string>>({});
  const [draggingFieldId, setDraggingFieldId] = useState<string | null>(null);
  const [dragOverField, setDragOverField] = useState<{ id: string; placement: 'before' | 'after' } | null>(null);
  const [isDependencyEditorOpen, setIsDependencyEditorOpen] = useState(false);
  const [newCardNameDraft, setNewCardNameDraft] = useState('');
  const [isTemplatePickerOpen, setIsTemplatePickerOpen] = useState(false);
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
  const [activeAiModelId, setActiveAiModelId] = useState<AiModelId>(() => {
    if (typeof window === 'undefined') {
      return MODEL_OPTIONS[0].id;
    }
    const saved = window.localStorage.getItem(AI_MODEL_STORAGE);
    const matched = MODEL_OPTIONS.find((item) => item.id === saved);
    return matched?.id ?? MODEL_OPTIONS[0].id;
  });
  const [preferredAiChannel, setPreferredAiChannel] = useState<AiChannel>(() => {
    if (typeof window === 'undefined') {
      return 'internal';
    }
    const saved = window.localStorage.getItem(AI_CHANNEL_STORAGE);
    return saved === 'external' ? 'external' : 'internal';
  });
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
  const [externalFieldTarget, setExternalFieldTarget] = useState<{ fieldId?: string; name: string; value: string } | null>(null);
  const [externalResponseInput, setExternalResponseInput] = useState('');
  const [externalResponseError, setExternalResponseError] = useState<string | null>(null);
  const [externalResponseSchemaErrors, setExternalResponseSchemaErrors] = useState<string[]>([]);
  const [aiContextNotice, setAiContextNotice] = useState<string | null>(null);
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
  const [cardDependencyTarget, setCardDependencyTarget] = useState('');
  const [cardDependencyType, setCardDependencyType] = useState('参考');
  const [fieldIterationDrafts, setFieldIterationDrafts] = useState<Record<string, IterationDraftState>>({});
  const [activeFieldIterationDraftFieldId, setActiveFieldIterationDraftFieldId] = useState<string | null>(null);
  const [fieldIterationHistoryFieldId, setFieldIterationHistoryFieldId] = useState<string | null>(null);
  const [editingFieldIterationFieldId, setEditingFieldIterationFieldId] = useState<string | null>(null);
  const [editingFieldIterationId, setEditingFieldIterationId] = useState<string | null>(null);
  const [editingFieldIterationVersionTag, setEditingFieldIterationVersionTag] = useState('');
  const [editingFieldIterationReasonType, setEditingFieldIterationReasonType] = useState<IterationReasonType>('manual');
  const [editingFieldIterationReasonText, setEditingFieldIterationReasonText] = useState('');
  const [editingFieldIterationReasonCardId, setEditingFieldIterationReasonCardId] = useState('');
  const [isCardIterationHistoryOpen, setIsCardIterationHistoryOpen] = useState(false);
  const [isCardSwitchAnimating, setIsCardSwitchAnimating] = useState(false);
  const [cardIterationDraft, setCardIterationDraft] = useState<Omit<IterationDraftState, 'value'>>({
    open: false,
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
  const [isCustomFieldEditorOpen, setIsCustomFieldEditorOpen] = useState(true);
  const [customFieldDrafts, setCustomFieldDrafts] = useState<SettingCustomField[]>([]);
  const [pendingCustomFieldId, setPendingCustomFieldId] = useState<string | null>(null);

  const [dragState, setDragState] = useState<DragState | null>(null);

  const localIdRef = useRef(0);
  const templateIdRef = useRef(0);
  const cardsRef = useRef<EditableCard[]>(cards);
  const selectedCardIdRef = useRef<string | null>(selectedCardId);
  const canvasPointerRef = useRef<{ id: string; moved: boolean } | null>(null);
  const toolbarSearchRef = useRef<HTMLDivElement | null>(null);
  const externalResponseRef = useRef<HTMLTextAreaElement | null>(null);
  const polishPromptResolverRef = useRef<((value: string | null) => void) | null>(null);
  const confirmActionRef = useRef<(() => void) | null>(null);
  const persistTimerRef = useRef<number | null>(null);
  const customFieldDraftCardIdRef = useRef<string | null>(null);

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
    window.localStorage.setItem(AI_CHANNEL_STORAGE, preferredAiChannel);
  }, [preferredAiChannel]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(AI_MODEL_STORAGE, activeAiModelId);
  }, [activeAiModelId]);

  const categories = useMemo(() => {
    const set = new Set<string>([...globalCategories, ...storyCategories, ...uniqueCategories(cards)]);
    return Array.from(set);
  }, [cards, globalCategories, storyCategories]);

  const selectedCard = useMemo(() => cards.find((item) => item.id === selectedCardId) ?? null, [cards, selectedCardId]);

  const selectedPreviewField = useMemo(() => {
    if (!previewFieldDialog) {
      return null;
    }
    const card = cards.find((item) => item.id === previewFieldDialog.cardId);
    if (!card) {
      return null;
    }
    const field = card.customFields.find((item) => (item.id ?? '') === previewFieldDialog.fieldId);
    if (!field) {
      return null;
    }
    return { card, field };
  }, [cards, previewFieldDialog]);

  useEffect(() => {
    if (!previewFieldDialog) {
      return;
    }
    if (!selectedPreviewField) {
      setPreviewFieldDialog(null);
    }
  }, [previewFieldDialog, selectedPreviewField]);

  useEffect(() => {
    if (!selectedCard) {
      setCustomFieldDrafts([]);
      setIsCustomFieldEditorOpen(true);
      setPendingCustomFieldId(null);
      customFieldDraftCardIdRef.current = null;
      return;
    }
    const normalized = selectedCard.customFields.map((field) => ({ ...field, iterations: field.iterations?.map((iter) => ({ ...iter })) }));

    if (customFieldDraftCardIdRef.current !== selectedCard.id) {
      customFieldDraftCardIdRef.current = selectedCard.id;
      setCustomFieldDrafts(normalized);
      setIsCustomFieldEditorOpen(true);
      setPendingCustomFieldId(null);
      return;
    }

    if (pendingCustomFieldId) {
      return;
    }

    setCustomFieldDrafts(normalized);
  }, [pendingCustomFieldId, selectedCard]);

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

  const detailTagCandidates = useMemo(() => {
    if (!selectedCard) {
      return [] as SettingTag[];
    }
    const query = normalizeTagName(detailTagDraft).toLowerCase();
    return tagOptions
      .filter((tag) => !selectedCard.tags.some((item) => item.name === tag.name))
      .filter((tag) => !query || tag.name.toLowerCase().includes(query));
  }, [detailTagDraft, selectedCard, tagOptions]);

  const detailTagCanCreate = useMemo(() => {
    const normalized = normalizeTagName(detailTagDraft);
    return Boolean(normalized) && !tagOptions.some((tag) => tag.name === normalized);
  }, [detailTagDraft, tagOptions]);

  const currentCardIterationTag = useMemo(() => {
    if (!selectedCard) {
      return '原始';
    }
    const active = (selectedCard.cardIterations ?? []).find((item) => item.id === selectedCard.activeCardIterationId);
    if (!active) {
      return '原始';
    }
    const next = active.versionTag?.trim();
    return next && next.length > 0 ? next : '原始';
  }, [selectedCard]);

  const selectedFieldIterationTarget = useMemo(() => {
    if (!selectedCard || !fieldIterationHistoryFieldId) {
      return null;
    }
    return selectedCard.customFields.find((field) => (field.id ?? '') === fieldIterationHistoryFieldId) ?? null;
  }, [fieldIterationHistoryFieldId, selectedCard]);

  const selectedFieldDraftTarget = useMemo(() => {
    if (!selectedCard || !activeFieldIterationDraftFieldId) {
      return null;
    }
    return selectedCard.customFields.find((field) => (field.id ?? '') === activeFieldIterationDraftFieldId) ?? null;
  }, [activeFieldIterationDraftFieldId, selectedCard]);

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

    };

    window.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
    };
  }, [toolbarTagSearchOpen]);

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
  ) => {
    const nextIndex = cards.length + 1;
    let nextId = '';
    do {
      localIdRef.current += 1;
      nextId = `card-local-${localIdRef.current}`;
    } while (cards.some((card) => card.id === nextId));
    const nextCategory = forcedCategory ?? selectedCategory ?? template?.preset.category ?? undefined;
    const nextType = forcedType ?? template?.preset.type ?? 'event';
    const normalizedName = nameInput?.trim();
    const initialFields = (template?.preset.customFields ?? []).map((field) => ({ ...field, initialValue: field.initialValue ?? field.value }));
    const defaultTitle = normalizedName || (template ? `${template.name} ${nextIndex}` : `设定 ${nextIndex}`);
    const created: EditableCard = {
      id: nextId,
      title: defaultTitle,
      type: nextType,
      summary: template?.preset.summary ?? '',
      content: template?.preset.content,
      imageUrl: template?.preset.imageUrl,
      category: nextCategory,
      tags: (template?.preset.tags ?? []).map((tag) => ({ ...tag })),
      customFields: initialFields,
      color: template?.preset.color ?? cardPalette[nextIndex % cardPalette.length],
      position: {
        x: 120 + (nextIndex % 5) * 56,
        y: 100 + (nextIndex % 4) * 56,
      },
      relations: [],
      summaryIterations: [],
      initialSnapshot: {
        title: defaultTitle,
        summary: template?.preset.summary ?? '',
        category: nextCategory,
        tags: (template?.preset.tags ?? []).map((tag) => ({ ...tag })),
        customFields: initialFields.map((field) => ({ ...field, iterations: field.iterations?.map((iteration) => ({ ...iteration })) })),
        relations: [],
      },
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
      }
    );
  };

  const updateSelectedCard = (updater: (card: EditableCard) => EditableCard) => {
    if (!selectedCard) {
      return;
    }

    applyCards((prev) =>
      prev.map((item) => {
        if (item.id !== selectedCard.id) {
          return item;
        }

        const next = updater(item);
        if (!next.activeCardIterationId) {
          return next;
        }

        const nextSnapshot = buildCardIterationSnapshot(next);
        return {
          ...next,
          cardIterations: (next.cardIterations ?? []).map((iteration) =>
            iteration.id === next.activeCardIterationId
              ? {
                  ...iteration,
                  snapshot: nextSnapshot,
                }
              : iteration
          ),
        };
      })
    );
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

  const syncCustomFieldDraftsToSelected = (drafts: SettingCustomField[], pendingId: string | null) => {
    updateSelectedCard((card) => ({
      ...card,
      customFields: drafts
        .filter((field) => field.id !== pendingId)
        .map((field) => ({
          ...field,
          name: field.name.trim(),
        })),
    }));
  };

  const handleAddCustomField = () => {
    if (!selectedCard) {
      return;
    }

    if (pendingCustomFieldId) {
      return;
    }

    templateIdRef.current += 1;
    const fieldId = `field-local-${templateIdRef.current}`;

    setCustomFieldDrafts((prev) => {
      const nextIndex = prev.length;
      return [
        {
          id: fieldId,
          name: `设定 ${nextIndex + 1}`,
          value: '',
          size: 'md',
          x: 0,
          y: 0,
          w: 1,
          h: 1,
        },
        ...prev,
      ];
    });
    setIsCustomFieldEditorOpen(true);
    setPendingCustomFieldId(fieldId);
  };

  const handleUpdateCustomField = (index: number, nextField: Partial<SettingCustomField>) => {
    setCustomFieldDrafts((prev) => {
      const nextDrafts = prev.map((field, currentIndex) =>
        currentIndex === index
          ? {
              ...field,
              ...nextField,
            }
          : field
      );
      syncCustomFieldDraftsToSelected(nextDrafts, pendingCustomFieldId);
      return nextDrafts;
    });
  };

  const handleConfirmPendingCustomField = () => {
    if (!selectedCard || !pendingCustomFieldId) {
      return;
    }

    const pendingField = customFieldDrafts.find((field) => field.id === pendingCustomFieldId);
    const pendingName = pendingField?.name.trim() ?? '';
    if (!pendingName) {
      window.alert('设定名称不能为空');
      return;
    }

    const nextDrafts = customFieldDrafts.map((field) =>
      field.id === pendingCustomFieldId
        ? {
            ...field,
            name: pendingName,
          }
        : field
    );
    setPendingCustomFieldId(null);
    setCustomFieldDrafts(nextDrafts);
    updateSelectedCard((card) => ({
      ...card,
      customFields: nextDrafts.map((field) => ({
        ...field,
        name: field.name.trim(),
      })),
    }));
  };

  const handleCancelPendingCustomField = () => {
    if (!pendingCustomFieldId) {
      return;
    }
    const nextDrafts = customFieldDrafts.filter((field) => field.id !== pendingCustomFieldId);
    setCustomFieldDrafts(nextDrafts);
    setPendingCustomFieldId(null);
    syncCustomFieldDraftsToSelected(nextDrafts, null);
  };

  const handleDeleteCustomField = (index: number) => {
    if (!selectedCard) {
      return;
    }

    const fieldName = customFieldDrafts[index]?.name?.trim() || `设定 ${index + 1}`;
    const deletingFieldId = customFieldDrafts[index]?.id;
    openConfirmDialog(
      {
        title: '删除设定',
        message: `确定删除设定“${fieldName}”？该设定上的关联也会一并删除。`,
        confirmLabel: '删除',
      },
      () => {
        const nextDrafts = customFieldDrafts.filter((_, currentIndex) => currentIndex !== index);
        setCustomFieldDrafts(nextDrafts);
        if (deletingFieldId && deletingFieldId === pendingCustomFieldId) {
          setPendingCustomFieldId(null);
        }
        syncCustomFieldDraftsToSelected(nextDrafts, deletingFieldId && deletingFieldId === pendingCustomFieldId ? null : pendingCustomFieldId);

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

    setCustomFieldDrafts((prev) => {
      const fromIndex = prev.findIndex((field) => field.id === fromId);
      const toIndex = prev.findIndex((field) => field.id === toId);
      if (fromIndex === -1 || toIndex === -1) {
        return prev;
      }

      const nextFields = [...prev];
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

      syncCustomFieldDraftsToSelected(nextFields, pendingCustomFieldId);
      return nextFields;
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

  const resolveIterationReasonLabel = (reasonType: IterationReasonType, reasonText?: string, reasonCardId?: string): string => {
    if (reasonType === 'card') {
      const target = cards.find((card) => card.id === reasonCardId);
      return target ? `关联卡片：${target.title}` : '关联卡片：未指定';
    }
    return reasonText?.trim() || '未填写原因';
  };

  const buildFieldIterationPathLabel = (field: SettingCustomField, targetIterationId: string): string => {
    const ordered = [...(field.iterations ?? [])].reverse();
    const index = ordered.findIndex((item) => item.id === targetIterationId);
    if (index < 0) {
      return '原始内容';
    }
    const labels = ['原始内容', ...ordered.slice(0, index + 1).map((item) => item.versionTag?.trim() || '未命名迭代')];
    return labels.join(' -> ');
  };

  const diffFieldIterationValue = (field: SettingCustomField, targetIterationId: string): { added: string[]; removed: string[] } => {
    const ordered = [...(field.iterations ?? [])].reverse();
    const index = ordered.findIndex((item) => item.id === targetIterationId);
    if (index < 0) {
      return { added: [], removed: [] };
    }

    const prevValue = index === 0 ? field.value : ordered[index - 1]?.value ?? '';
    const nextValue = ordered[index]?.value ?? '';
    const prevLines = prevValue.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
    const nextLines = nextValue.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
    const prevSet = new Set(prevLines);
    const nextSet = new Set(nextLines);

    return {
      added: nextLines.filter((line) => !prevSet.has(line)).slice(0, 3),
      removed: prevLines.filter((line) => !nextSet.has(line)).slice(0, 3),
    };
  };

  const buildFieldIterationDiffPreview = (field: SettingCustomField, targetIterationId: string) => {
    const ordered = [...(field.iterations ?? [])].reverse();
    const index = ordered.findIndex((item) => item.id === targetIterationId);
    if (index < 0) {
      return {
        rows: [] as Array<{ before: string; after: string; state: 'same' | 'changed' | 'added' | 'removed' }>,
      };
    }
    const beforeLines = (index === 0 ? field.value : ordered[index - 1]?.value ?? '').split('\n').slice(0, 5);
    const afterLines = (ordered[index]?.value ?? '').split('\n').slice(0, 5);
    const maxLen = Math.max(beforeLines.length, afterLines.length);
    const rows = Array.from({ length: maxLen }).map((_, rowIndex) => {
      const before = beforeLines[rowIndex] ?? '';
      const after = afterLines[rowIndex] ?? '';
      if (!before && after) {
        return { before, after, state: 'added' as const };
      }
      if (before && !after) {
        return { before, after, state: 'removed' as const };
      }
      if (before !== after) {
        return { before, after, state: 'changed' as const };
      }
      return { before, after, state: 'same' as const };
    });
    return { rows };
  };

  const buildCardIterationPathLabel = (targetIterationId: string): string => {
    const iterationMap = new Map((selectedCard?.cardIterations ?? []).map((item) => [item.id, item]));
    const labels: string[] = [];
    let cursor = iterationMap.get(targetIterationId);
    while (cursor) {
      labels.push(resolveCardIterationTag(cursor));
      cursor = cursor.parentIterationId ? iterationMap.get(cursor.parentIterationId) : undefined;
    }
    return ['原始', ...labels.reverse()].join(' -> ');
  };

  const resolveCardIterationTag = (iteration: SettingCardIteration): string => {
    const next = iteration.versionTag?.trim();
    return next && next.length > 0 ? next : '原始';
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

  const openFieldIterationDraft = (field: SettingCustomField, iteration?: SettingFieldIteration) => {
    const fieldId = field.id ?? '';
    if (!fieldId) {
      return;
    }
    setActiveFieldIterationDraftFieldId(fieldId);
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
    if (activeFieldIterationDraftFieldId === fieldId) {
      setActiveFieldIterationDraftFieldId(null);
    }
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
              initialValue: item.initialValue ?? item.value,
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
      if (iterationId === ORIGIN_ITERATION_ID) {
        const nextFields = card.customFields.map((item, index) =>
          index === fieldIndex
            ? {
                ...item,
                value: item.initialValue ?? item.value,
                activeIterationId: undefined,
              }
            : item
        );
        return {
          ...card,
          customFields: nextFields,
        };
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

  const setFieldIterationAsCurrentByFieldId = (fieldId: string, iterationId: string) => {
    if (!selectedCard) {
      return;
    }
    const fieldIndex = selectedCard.customFields.findIndex((field) => (field.id ?? '') === fieldId);
    if (fieldIndex < 0) {
      return;
    }
    setFieldIterationAsCurrent(fieldIndex, iterationId);
  };

  const saveFieldIterationByFieldId = (fieldId: string) => {
    if (!selectedCard) {
      return;
    }
    const fieldIndex = selectedCard.customFields.findIndex((field) => (field.id ?? '') === fieldId);
    if (fieldIndex < 0) {
      return;
    }
    saveFieldIteration(fieldIndex);
  };

  const startEditFieldIterationMeta = (fieldId: string, iteration: SettingFieldIteration) => {
    setEditingFieldIterationFieldId(fieldId);
    setEditingFieldIterationId(iteration.id);
    setEditingFieldIterationVersionTag(iteration.versionTag ?? '');
    setEditingFieldIterationReasonType(iteration.reasonType);
    setEditingFieldIterationReasonText(iteration.reasonText ?? '');
    setEditingFieldIterationReasonCardId(iteration.reasonCardId ?? '');
  };

  const cancelEditFieldIterationMeta = () => {
    setEditingFieldIterationFieldId(null);
    setEditingFieldIterationId(null);
    setEditingFieldIterationVersionTag('');
    setEditingFieldIterationReasonType('manual');
    setEditingFieldIterationReasonText('');
    setEditingFieldIterationReasonCardId('');
  };

  const saveFieldIterationMeta = () => {
    if (!selectedCard || !editingFieldIterationFieldId || !editingFieldIterationId) {
      return;
    }

    updateSelectedCard((card) => ({
      ...card,
      customFields: card.customFields.map((field) => {
        if ((field.id ?? '') !== editingFieldIterationFieldId) {
          return field;
        }
        return {
          ...field,
          iterations: (field.iterations ?? []).map((iteration) =>
            iteration.id === editingFieldIterationId
              ? {
                  ...iteration,
                  versionTag: editingFieldIterationVersionTag.trim() || undefined,
                  reasonType: editingFieldIterationReasonType,
                  reasonText: editingFieldIterationReasonType === 'manual' ? editingFieldIterationReasonText.trim() : undefined,
                  reasonCardId: editingFieldIterationReasonType === 'card' ? editingFieldIterationReasonCardId : undefined,
                }
              : iteration
          ),
        };
      }),
    }));

    cancelEditFieldIterationMeta();
  };

  const openCardIterationDraft = (iteration?: SettingCardIteration) => {
    setCardIterationDraft({
      open: true,
      versionTag: iteration?.versionTag ?? '',
      reasonType: iteration?.reasonType ?? 'manual',
      reasonText: iteration?.reasonText ?? '',
      reasonCardId: iteration?.reasonCardId ?? '',
      editingIterationId: iteration?.id,
    });
  };

  const closeCardIterationDraft = () => {
    setCardIterationDraft({
      open: false,
      versionTag: '',
      reasonType: 'manual',
      reasonText: '',
      reasonCardId: '',
    });
  };

  const saveCardIteration = () => {
    if (!selectedCard) {
      return;
    }

    const snapshot = buildCardIterationSnapshot(selectedCard);

    const nextVersionTag = cardIterationDraft.versionTag.trim();
    const reasonText = cardIterationDraft.reasonText.trim();

    if (cardIterationDraft.editingIterationId) {
      updateSelectedCard((card) => ({
        ...card,
        cardIterations: (card.cardIterations ?? []).map((iteration) =>
          iteration.id === cardIterationDraft.editingIterationId
            ? {
                ...iteration,
                versionTag: nextVersionTag || undefined,
                reasonType: cardIterationDraft.reasonType,
                reasonText: cardIterationDraft.reasonType === 'manual' ? reasonText : undefined,
                reasonCardId: cardIterationDraft.reasonType === 'card' ? cardIterationDraft.reasonCardId : undefined,
              }
            : iteration
        ),
      }));
    } else {
      const hasExistingIterations = (selectedCard.cardIterations ?? []).length > 0;
      const nextIteration: SettingCardIteration = {
        id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `card-iter-${Date.now()}`,
        parentIterationId: selectedCard.activeCardIterationId,
        snapshot,
        versionTag: nextVersionTag || (hasExistingIterations ? undefined : '原始'),
        reasonType: cardIterationDraft.reasonType,
        reasonText: cardIterationDraft.reasonType === 'manual' ? reasonText : undefined,
        reasonCardId: cardIterationDraft.reasonType === 'card' ? cardIterationDraft.reasonCardId : undefined,
        createdAt: new Date().toISOString(),
      };

      updateSelectedCard((card) => ({
        ...card,
        cardIterations: [nextIteration, ...(card.cardIterations ?? [])],
        activeCardIterationId: nextIteration.id,
      }));
    }

    closeCardIterationDraft();
    setIsCardIterationHistoryOpen(true);
  };

  const setCardIterationAsCurrent = (iterationId: string) => {
    setIsCardSwitchAnimating(true);
    updateSelectedCard((card) => {
      if (iterationId === ORIGIN_CARD_ITERATION_ID) {
        const origin = card.initialSnapshot;
        if (!origin) {
          return card;
        }
        return {
          ...card,
          title: origin.title,
          summary: origin.summary,
          category: origin.category,
          tags: origin.tags.map((tag) => ({ ...tag })),
          customFields: origin.customFields.map((field) => ({ ...field, iterations: field.iterations?.map((iter) => ({ ...iter })) })),
          relations: (origin.relations ?? []).map((relation) => ({ ...relation })),
          activeCardIterationId: undefined,
        };
      }
      const target = (card.cardIterations ?? []).find((item) => item.id === iterationId);
      if (!target) {
        return card;
      }
      return {
        ...card,
        title: target.snapshot.title,
        summary: target.snapshot.summary,
        category: target.snapshot.category,
        tags: target.snapshot.tags.map((tag) => ({ ...tag })),
        customFields: target.snapshot.customFields.map((field) => ({ ...field, iterations: field.iterations?.map((iter) => ({ ...iter })) })),
        relations: (target.snapshot.relations ?? []).map((relation) => ({ ...relation })),
        activeCardIterationId: target.id,
      };
    });
    window.setTimeout(() => setIsCardSwitchAnimating(false), 320);
  };

  const runAiActionByPreferredChannel = (mode: AiGuideMode, runInternal: () => void, fieldTarget?: { fieldId?: string; name: string; value: string }) => {
    if (preferredAiChannel === 'external') {
      void handleOpenExternalAi(mode, fieldTarget);
      return;
    }
    runInternal();
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

  const openDetailTagModal = () => {
    setDetailTagDraft('');
    setDetailTagColorDraft(randomTagColor());
    setIsDetailTagModalOpen(true);
  };

  const closeDetailTagModal = () => {
    setIsDetailTagModalOpen(false);
    setDetailTagDraft('');
    setDetailTagColorDraft(randomTagColor());
  };

  const createAndAddDetailTag = () => {
    const normalized = normalizeTagName(detailTagDraft);
    if (!normalized) {
      return;
    }

    upsertTag(normalized, detailTagColorDraft, 'global');
    addTagToSelected(normalized, detailTagColorDraft);
    closeDetailTagModal();
  };

  const addExistingDetailTag = (name: string, color: string) => {
    addTagToSelected(name, color);
    closeDetailTagModal();
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

  const buildAiCardPayload = (card: EditableCard) => {
    const priorityOrder = { strong: 0, sameType: 1, weak: 2 } as const;
    const relationPriority = (relationType: string, targetType: SettingCard['type']) => {
      if (['约束', '因果', '冲突', '触发', '揭示'].includes(relationType)) {
        return 'strong' as const;
      }
      if (targetType === card.type) {
        return 'sameType' as const;
      }
      return 'weak' as const;
    };

    const dependencyMap = new Map<
      string,
      {
        relationTypes: Set<string>;
        target: EditableCard;
        priority: 'strong' | 'sameType' | 'weak';
      }
    >();

    for (const relation of card.relations) {
      const target = cards.find((item) => item.id === relation.targetId);
      if (!target || target.id === card.id) {
        continue;
      }

      const nextPriority = relationPriority(relation.type, target.type);
      const existing = dependencyMap.get(target.id);
      if (!existing) {
        dependencyMap.set(target.id, {
          relationTypes: new Set([relation.type]),
          target,
          priority: nextPriority,
        });
        continue;
      }

      existing.relationTypes.add(relation.type);
      if (priorityOrder[nextPriority] < priorityOrder[existing.priority]) {
        existing.priority = nextPriority;
      }
    }

    const dependencyCaps: Record<'strong' | 'sameType' | 'weak', number> = {
      strong: 6,
      sameType: 4,
      weak: 2,
    };
    const usedCount: Record<'strong' | 'sameType' | 'weak', number> = {
      strong: 0,
      sameType: 0,
      weak: 0,
    };

    const dependencies = Array.from(dependencyMap.values())
      .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])
      .filter((item) => {
        const cap = dependencyCaps[item.priority];
        if (usedCount[item.priority] >= cap) {
          return false;
        }
        usedCount[item.priority] += 1;
        return true;
      })
      .map((item) => ({
        cardId: item.target.id,
        title: item.target.title,
        summary: item.target.summary,
        cardType: item.target.type,
        relationTypes: Array.from(item.relationTypes),
        priority: item.priority,
        keyFields: item.target.customFields
          .filter((field) => field.name.trim().length > 0 || field.value.trim().length > 0)
          .slice(0, 4)
          .map((field) => ({ name: field.name, value: field.value })),
      }));

    const trimmedDependenciesCount = dependencyMap.size - dependencies.length;
    const contextNotice =
      trimmedDependenciesCount > 0 ? `依赖上下文已裁剪 ${trimmedDependenciesCount} 项（优先保留：强依赖 > 同类型依赖 > 弱依赖）` : null;
    setAiContextNotice(contextNotice);

    return {
      card: {
        id: card.id,
        type: card.type,
        title: card.title,
        summary: card.summary,
        category: card.category ?? null,
        tags: card.tags.map((tag) => ({ name: tag.name, color: tag.color })),
        customFields: card.customFields.map((field) => ({ id: field.id ?? '', name: field.name, value: field.value })),
      },
      context: {
        categoryOptions: categories,
        tagOptions,
        fieldNameHints: customFieldPresets,
        dependencies,
        trimmedDependenciesCount,
        glossary: ['角色动机一致', '世界观规则一致', '事件因果闭环', '关系约束不冲突'],
        styleGuide: ['表达具体', '避免空泛套话', '优先增量修改', '保留既有设定语气'],
        language: 'zh-CN' as const,
      },
    };
  };

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

    const nameCounter = new Map<string, number>();
    for (const item of selected) {
      const normalized = item.name.trim();
      nameCounter.set(normalized, (nameCounter.get(normalized) ?? 0) + 1);
    }
    const conflictNames = Array.from(nameCounter.entries())
      .filter(([, count]) => count > 1)
      .map(([name]) => name);
    if (conflictNames.length > 0) {
      setAiError(`存在冲突建议（同名属性重复）：${conflictNames.join('、')}。请仅保留一个后再批量应用。`);
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

  const buildExternalPromptByMode = (
    mode: AiGuideMode,
    options?: {
      polishInstruction?: string;
      fieldTarget?: { fieldId?: string; name: string; value: string } | null;
    }
  ) => {
    if (!selectedCard) {
      return '';
    }
    const polishInstruction = options?.polishInstruction ?? aiGuidePolishInstruction;
    const targetField = options?.fieldTarget ?? externalFieldTarget;
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
        `润色要求：${polishInstruction}`,
        JSON.stringify(payload, null, 2),
      ].join('\n\n');
    }
    if (mode === 'fieldPolish') {
      if (!targetField) {
        return '';
      }
      return [
        '任务：按润色方案润色单个属性。',
        '输出 JSON：{"field":{"fieldId?":"","name":"","value":""}}',
        `润色要求：${polishInstruction}`,
        JSON.stringify(
          {
            cardId: selectedCard.id,
            field: {
              fieldId: targetField.fieldId,
              name: targetField.name,
              value: targetField.value,
            },
            context: payload.context,
          },
          null,
          2
        ),
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

  const handleOpenExternalAi = async (
    mode: AiGuideMode = externalPromptMode,
    fieldTarget?: { fieldId?: string; name: string; value: string }
  ) => {
    let polishInstructionOverride: string | undefined;
    if (mode === 'polish' || mode === 'fieldPolish') {
      const input = await requestPolishInstruction(mode === 'fieldPolish' ? '设定（外部AI提示词）' : '整卡（外部AI提示词）');
      if (!input) {
        return;
      }
      polishInstructionOverride = input;
    }
    if (mode === 'fieldPolish') {
      if (!fieldTarget) {
        setAiError('请先指定需要外部润色的设定。');
        return;
      }
      setExternalFieldTarget(fieldTarget);
    } else {
      setExternalFieldTarget(null);
    }
    setExternalPromptMode(mode);
    const prompt = buildExternalPromptByMode(mode, {
      polishInstruction: polishInstructionOverride,
      fieldTarget: mode === 'fieldPolish' ? fieldTarget : null,
    });
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

  const normalizeExternalPayload = (value: unknown): { taskType?: string; cardId?: string; result: Record<string, unknown> } => {
    if (!value || typeof value !== 'object') {
      throw new Error('请粘贴外部 AI 返回的 JSON 对象结果');
    }
    const source = value as ExternalAiPayload;
    const resultSource = source.result && typeof source.result === 'object' ? (source.result as Record<string, unknown>) : (source as Record<string, unknown>);

    return {
      taskType: typeof source.taskType === 'string' ? source.taskType : undefined,
      cardId: typeof source.cardId === 'string' ? source.cardId : undefined,
      result: resultSource,
    };
  };

  const handleApplyExternalResponse = () => {
    if (!externalResponseInput.trim()) {
      return;
    }

    try {
      const parsedRaw = JSON.parse(extractJsonObject(externalResponseInput)) as unknown;
      const normalized = normalizeExternalPayload(parsedRaw);
      const parsed = normalized.result as { summary?: unknown; suggestions?: unknown; patch?: unknown; field?: unknown };
      const schemaErrors: string[] = [];

      if (normalized.cardId && selectedCard && normalized.cardId !== selectedCard.id) {
        throw new Error(`外部 AI 返回结果的 cardId 不匹配（当前：${selectedCard.id}，响应：${normalized.cardId}）`);
      }

      if (typeof parsed.summary === 'string' && parsed.summary.trim().length > 0) {
        setAiSummaryDraft(parsed.summary.trim());
        setAiNormalizePatch(null);
        setAiActionKind('summary');
        setIsAiResultOpen(true);
        setIsExternalAiOpen(false);
        setExternalResponseSchemaErrors([]);
        setExternalResponseError(null);
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
        setExternalResponseError(null);
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
        setExternalResponseError(null);
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
        setExternalResponseError(null);
        return;
      }

      throw new Error(
        normalized.taskType
          ? `外部 AI 结果未识别到与 taskType=${normalized.taskType} 匹配的字段（summary/suggestions/patch/field）`
          : '外部 AI 结果未识别到 summary、suggestions、patch 或 field 字段'
      );
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
                  onClick={() => handleAddCard(undefined, newCardNameDraft, item.type, item.category)}
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
                        <input
                          className={styles.previewTitleInput}
                          value={previewCard.title ?? ''}
                          onMouseDown={(event) => event.stopPropagation()}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => {
                            const value = event.target.value;
                            applyCards((prev) =>
                              prev.map((item) => {
                                if (item.id !== previewCard.id) {
                                  return item;
                                }
                                const next = { ...item, title: value };
                                if (!next.activeCardIterationId) {
                                  return next;
                                }
                                const nextSnapshot = buildCardIterationSnapshot(next);
                                return {
                                  ...next,
                                  cardIterations: (next.cardIterations ?? []).map((iteration) =>
                                    iteration.id === next.activeCardIterationId
                                      ? {
                                          ...iteration,
                                          snapshot: nextSnapshot,
                                        }
                                      : iteration
                                  ),
                                };
                              })
                            );
                          }}
                          placeholder="点击输入设定名称"
                          aria-label="设定名称"
                        />
                        <p className={styles.previewSubtitle}>高保真预览窗口，可同时打开多个卡片。</p>
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
                            return (
                              <button
                                key={fieldId}
                                type="button"
                                className={styles.previewFieldCard}
                                onClick={() => {
                                  setPreviewFieldDialog({
                                    cardId: previewCard.id,
                                    fieldId,
                                  });
                                }}
                              >
                                <span className={styles.previewFieldHeader}>{field.name || `设定 ${fieldIndex + 1}`}</span>
                              </button>
                            );
                          })
                        ) : (
                          <p className={styles.emptyState}>还没有自定义属性</p>
                        )}
                      </div>
                    </div>

                    <div className={styles.previewDangerActions}>
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
                  </>
                )}
              </section>
            );
          })}
        </div>
      )}

      {selectedPreviewField && (
        <div className={`${styles.managerOverlay} ${styles.topMostOverlay}`} role="presentation" onClick={() => setPreviewFieldDialog(null)}>
          <div
            className={`${styles.managerCard} ${styles.previewFieldDialogCard}`}
            role="dialog"
            aria-modal="true"
            aria-label={`设定详情预览：${selectedPreviewField.field.name || '未命名设定'}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.managerHeader}>
              <h3>{selectedPreviewField.field.name || '未命名设定'}</h3>
            </div>
            <p className={styles.previewFieldDialogMeta}>来自卡片：{selectedPreviewField.card.title || '未命名设定'}</p>
            <div className={styles.previewFieldDialogBody}>
              <p>{selectedPreviewField.field.value?.trim() || '暂无内容'}</p>
            </div>
            <div className={styles.managerActionsRow}>
              <Button size="sm" variant="ghost" className={styles.inlineActionButton} onClick={() => setPreviewFieldDialog(null)}>
                关闭
              </Button>
            </div>
          </div>
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

            <div className={`${styles.editorGrid} ${isCardSwitchAnimating ? styles.cardSwitching : ''}`}>
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
                    <div className={styles.aiChannelSwitchInline}>
                      <span className={styles.aiChannelSwitchLabel}>默认渠道</span>
                      <div className={styles.aiChannelSwitchGroup}>
                        <button
                          type="button"
                          className={preferredAiChannel === 'internal' ? styles.aiChannelSwitchActive : styles.aiChannelSwitchButton}
                          onClick={() => setPreferredAiChannel('internal')}
                        >
                          内置 AI
                        </button>
                        <button
                          type="button"
                          className={preferredAiChannel === 'external' ? styles.aiChannelSwitchActive : styles.aiChannelSwitchButton}
                          onClick={() => setPreferredAiChannel('external')}
                        >
                          外部 AI
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className={styles.aiActionRow}>
                    <div className={styles.aiActionGroup}>
                      <Button size="sm" variant="secondary" className={styles.inlineActionButton} onClick={() => void handleOpenAiGuide()}>
                        辅助建卡
                      </Button>
                    </div>
                    <div className={styles.aiActionGroup}>
                      <Button
                        size="sm"
                        variant="secondary"
                        className={styles.inlineActionButton}
                        onClick={() => runAiActionByPreferredChannel('summaryToFields', () => void runAiGuideFlow('summaryToFields'))}
                        disabled={aiBusy}
                      >
                        摘要生成设定
                      </Button>
                    </div>
                    <div className={styles.aiActionGroup}>
                      <Button
                        size="sm"
                        variant="secondary"
                        className={styles.inlineActionButton}
                        onClick={() => runAiActionByPreferredChannel('reviewCard', () => void runAiGuideFlow('reviewCard'))}
                        disabled={aiBusy}
                      >
                        审校并建议更新
                      </Button>
                    </div>
                    <div className={styles.aiActionGroup}>
                      <Button
                        size="sm"
                        variant="secondary"
                        className={styles.inlineActionButton}
                        onClick={() => runAiActionByPreferredChannel('fieldsToSummary', () => void runAiGuideFlow('fieldsToSummary'))}
                        disabled={aiBusy}
                      >
                        设定生成摘要
                      </Button>
                    </div>
                    <div className={styles.aiActionGroup}>
                      <Button
                        size="sm"
                        variant="secondary"
                        className={styles.inlineActionButton}
                        onClick={() => runAiActionByPreferredChannel('polish', () => void runAiGuideFlow('polish'))}
                        disabled={aiBusy}
                      >
                        整卡润色
                      </Button>
                    </div>
                    <Button size="sm" variant="ghost" className={styles.inlineActionButton} onClick={handleUndoLastAiApply} disabled={!hasUndoForSelectedCard}>
                      撤销上次AI应用
                    </Button>
                    <Button size="sm" variant="ghost" className={styles.inlineActionButton} onClick={() => setIsAiHistoryOpen(true)} disabled={!hasUndoForSelectedCard}>
                      AI历史（{selectedCardUndoEntries.length}）
                    </Button>
                  </div>
                </div>
                {aiError && <p className={styles.aiErrorText}>{aiError}</p>}
                {aiContextNotice && <p className={styles.aiHint}>{aiContextNotice}</p>}

                <div className={styles.cardIterationEntryRow}>
                  <Button size="sm" variant="ghost" className={styles.inlineActionButton} onClick={() => setIsCardIterationHistoryOpen(true)}>
                    当前迭代：{currentCardIterationTag} · 查看整卡迭代（{(selectedCard.cardIterations ?? []).length}）
                  </Button>
                </div>

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
                    <div className={styles.nameTagRow}>
                      <button type="button" className={styles.addTagIconButton} onClick={openDetailTagModal} aria-label="添加标签">
                        +
                      </button>
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

                <div className={`${styles.fixedMetaField} ${styles.summarySection}`}>
                  <div className={styles.fixedTagHeader}>
                    <span className={styles.fixedMetaLabel}>摘要</span>
                    <div className={styles.aiGuideHeaderRow}>
                      <Button size="sm" variant="secondary" className={styles.inlineActionButton} onClick={runAiPolishSummaryInline} disabled={aiBusy}>
                        润色摘要
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
                  <p className={styles.aiHint}>摘要随整卡迭代数据源切换，不单独维护摘要迭代历史。</p>
                </div>

                <div className={`${styles.fixedMetaField} ${styles.dependencySection}`}>
                  <span className={styles.fixedMetaLabel}>卡片依赖关系</span>
                  <div className={styles.dependencyTagRow}>
                    <button type="button" className={styles.addDependencyIconButton} onClick={() => setIsDependencyEditorOpen(true)} aria-label="添加依赖">
                      +
                    </button>
                    {getCardLevelRelations(selectedCard).length > 0 ? (
                      getCardLevelRelations(selectedCard).map((relation) => {
                        const { targetCard, targetField } = resolveRelationTarget(relation);
                        return (
                          <button
                            type="button"
                            key={`card-level-${relation.index}`}
                            className={styles.dependencyTag}
                            onClick={() => {
                              if (targetCard) {
                                openCardPreview(targetCard.id);
                              }
                            }}
                          >
                            <span className={styles.relationType}>{relation.type}</span>
                            <span>{targetCard?.title ?? '未知卡片'}</span>
                            {targetField ? <span> / {targetField.name}</span> : null}
                          </button>
                        );
                      })
                    ) : (
                      <p className={styles.emptyState}>无依赖</p>
                    )}
                  </div>
                </div>

              </div>

              <div className={styles.detailSection}>
                <h4>自定义设定</h4>
                <p>设定按顺序展示，可在整页内拖动重排。</p>
                <div className={styles.customFieldCreateRow}>
                  <Button size="sm" variant="secondary" className={styles.inlineActionButton} onClick={handleAddCustomField}>
                    添加设定
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className={styles.inlineActionButton}
                    onClick={() => setIsCustomFieldEditorOpen((prev) => !prev)}
                  >
                    {isCustomFieldEditorOpen ? '收起设定' : '展开设定'}
                  </Button>
                </div>

              </div>
            </div>

            <div className={styles.fieldBoardHint}>提示：设定按顺序排列，可拖动卡片调整顺序。</div>
            <div className={styles.editorFieldList}>
              {isCustomFieldEditorOpen && customFieldDrafts.length > 0 ? (
                customFieldDrafts.map((field, index) => {
                  const fieldId = field.id ?? `field-editor-${index}`;
                  const fieldRelations = getFieldRelations(fieldId);
                  const isRelationOpen = fieldRelationOpen[fieldId] ?? false;
                  const targetCardId = fieldRelationTarget[fieldId] ?? '';
                   
                  return (
                    <div
                      key={fieldId}
                      className={`${styles.customFieldCard} ${field.id === pendingCustomFieldId ? styles.pendingFieldCard : ''} ${draggingFieldId === fieldId ? styles.draggingField : ''} ${dragOverField?.id === fieldId ? (dragOverField.placement === 'before' ? styles.dropIndicatorBefore : styles.dropIndicatorAfter) : ''}`}
                      draggable={field.id !== pendingCustomFieldId}
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
                          onBlur={(event) => {
                            const value = event.target.value.trim();
                            if (!value) {
                              handleUpdateCustomField(index, { name: `设定 ${index + 1}` });
                            }
                          }}
                          placeholder="设定名"
                        />
                        {getCurrentFieldIterationTag(field) ? (
                          <span className={styles.iterationVersionTag}>{getCurrentFieldIterationTag(field)}</span>
                        ) : null}
                        {getCurrentFieldIterationMeta(field) ? (
                          <span className={styles.currentIterationBadge}>当前来源：{getCurrentFieldIterationMeta(field)}</span>
                        ) : null}
                        {field.id === pendingCustomFieldId ? <span className={styles.pendingFieldBadge}>新建中</span> : null}
                        <div className={styles.fieldInlineActions}>
                          {field.id === pendingCustomFieldId ? (
                            <>
                              <button className={styles.deleteFieldBtn} onClick={handleConfirmPendingCustomField}>
                                添加
                              </button>
                              <button className={styles.deleteFieldBtn} onClick={handleCancelPendingCustomField}>
                                取消
                              </button>
                            </>
                          ) : (
                            <>
                              <button className={styles.deleteFieldBtn} onClick={() => openFieldIterationDraft(field)}>
                                迭代
                              </button>
                              <button className={styles.deleteFieldBtn} onClick={() => setFieldIterationHistoryFieldId(fieldId)}>
                                历史
                              </button>
                              <button
                                className={styles.deleteFieldBtn}
                                onClick={() =>
                                  runAiActionByPreferredChannel(
                                    'fieldPolish',
                                    () => {
                                      void runAiPolishFieldInline(field);
                                    },
                                    {
                                      fieldId: field.id,
                                      name: field.name,
                                      value: field.value,
                                    }
                                  )
                                }
                              >
                                润色
                              </button>
                              <button className={styles.deleteFieldBtn} onClick={() => handleDeleteCustomField(index)}>
                                删除
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                      <textarea
                        className={styles.fieldValueTextarea}
                        rows={4}
                        value={field.value}
                        onChange={(event) => handleUpdateCustomField(index, { value: event.target.value })}
                        placeholder="设定内容"
                      />


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
              ) : isCustomFieldEditorOpen ? (
                <p className={styles.emptyState}>还没有自定义设定</p>
              ) : (
                <p className={styles.emptyState}>设定编辑已关闭，点击“展开设定”查看与修改。</p>
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
              <h3>辅助建卡</h3>
            </div>
            <div className={styles.aiResultBody}>
              <p className={styles.aiHint}>轻量分步引导：先写已有想法，再逐步补齐。可以留空，不必一次写完整。</p>
              <div className={styles.aiChannelSwitchRow}>
                <span className={styles.aiChannelSwitchLabel}>默认渠道</span>
                <div className={styles.aiChannelSwitchGroup}>
                  <button
                    type="button"
                    className={preferredAiChannel === 'internal' ? styles.aiChannelSwitchActive : styles.aiChannelSwitchButton}
                    onClick={() => setPreferredAiChannel('internal')}
                  >
                    内置 AI
                  </button>
                  <button
                    type="button"
                    className={preferredAiChannel === 'external' ? styles.aiChannelSwitchActive : styles.aiChannelSwitchButton}
                    onClick={() => setPreferredAiChannel('external')}
                  >
                    外部 AI
                  </button>
                </div>
              </div>
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
                打开外部 AI 中转
              </Button>
              <Button size="sm" variant="ghost" className={styles.inlineActionButton} onClick={() => setIsAiGuideOpen(false)}>
                关闭
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className={styles.inlineActionButton}
                onClick={() => runAiActionByPreferredChannel('describe', () => void runAiGuideFlow('describe'))}
                disabled={aiBusy}
              >
                {aiBusy ? '执行中...' : preferredAiChannel === 'external' ? '外部 AI 中转生成' : '内置 AI 一键生成'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {cardIterationDraft.open && selectedCard && (
        <div className={`${styles.managerOverlay} ${styles.topMostOverlay}`} role="presentation" onClick={closeCardIterationDraft}>
          <div className={styles.managerCard} role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className={styles.managerHeader}>
              <h3>创建整卡迭代</h3>
            </div>
            <p className={styles.aiHint}>将当前卡片快照保存为新版本，方便后续对比与回滚。</p>
            <div className={styles.iterationDraftSection}>
              <label className={styles.iterationDraftLabel}>版本标签（可选）</label>
              <input
                className={styles.detailInput}
                value={cardIterationDraft.versionTag}
                onChange={(event) => setCardIterationDraft((prev) => ({ ...prev, versionTag: event.target.value }))}
                placeholder="例如：v2-剧情强化"
              />
              <label className={styles.iterationDraftLabel}>迭代原因</label>
              <select
                className={styles.categorySelect}
                value={cardIterationDraft.reasonType}
                onChange={(event) =>
                  setCardIterationDraft((prev) => ({
                    ...prev,
                    reasonType: event.target.value as IterationReasonType,
                    reasonCardId: event.target.value === 'card' ? prev.reasonCardId : '',
                    reasonText: event.target.value === 'manual' ? prev.reasonText : '',
                  }))
                }
              >
                <option value="manual">手动填写</option>
                <option value="card">关联卡片</option>
              </select>
              {cardIterationDraft.reasonType === 'manual' ? (
                <textarea
                  className={styles.detailTextarea}
                  rows={3}
                  value={cardIterationDraft.reasonText}
                  onChange={(event) => setCardIterationDraft((prev) => ({ ...prev, reasonText: event.target.value }))}
                  placeholder="记录本次整卡迭代的目标或触发点"
                />
              ) : (
                <select
                  className={styles.categorySelect}
                  value={cardIterationDraft.reasonCardId}
                  onChange={(event) => setCardIterationDraft((prev) => ({ ...prev, reasonCardId: event.target.value }))}
                >
                  <option value="">请选择关联卡片</option>
                  {cards
                    .filter((card) => card.id !== selectedCard.id)
                    .map((card) => (
                      <option key={`card-iteration-reason-${card.id}`} value={card.id}>
                        {card.title}
                      </option>
                    ))}
                </select>
              )}
            </div>
            <div className={styles.managerActionsRow}>
              <Button size="sm" variant="ghost" className={styles.inlineActionButton} onClick={closeCardIterationDraft}>
                取消
              </Button>
              <Button size="sm" variant="secondary" className={styles.inlineActionButton} onClick={saveCardIteration}>
                保存整卡迭代
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
            <div className={styles.polishChannelNotice}>
              <div>
                <p className={styles.polishChannelTitle}>当前润色渠道：{preferredAiChannel === 'external' ? '外部 AI 中转' : '内置 AI 一键'}</p>
                <p className={styles.aiHint}>可在这里直接切换。确认后将按当前渠道继续执行润色。</p>
              </div>
              <div className={styles.aiChannelSwitchGroup}>
                <button
                  type="button"
                  className={preferredAiChannel === 'internal' ? styles.aiChannelSwitchActive : styles.aiChannelSwitchButton}
                  onClick={() => setPreferredAiChannel('internal')}
                >
                  内置 AI
                </button>
                <button
                  type="button"
                  className={preferredAiChannel === 'external' ? styles.aiChannelSwitchActive : styles.aiChannelSwitchButton}
                  onClick={() => setPreferredAiChannel('external')}
                >
                  外部 AI
                </button>
              </div>
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
              <h3>外部 AI 中转工作台</h3>
            </div>
            <p className={styles.aiHint}>流程：先复制提示词给外部 AI -&gt; 再把外部 AI 的 JSON 结果粘贴回来，系统会生成与内置 AI 一键相同的预览与应用流程。</p>
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
                描述到摘要+设定
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
                摘要到设定
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
                variant={externalPromptMode === 'fieldPolish' ? 'secondary' : 'ghost'}
                className={styles.inlineActionButton}
                disabled={!externalFieldTarget}
                onClick={() => {
                  setExternalPromptMode('fieldPolish');
                  setExternalPrompt(buildExternalPromptByMode('fieldPolish'));
                }}
              >
                设定润色
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
                设定到摘要
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className={styles.inlineActionButton}
                onClick={() => setExternalPrompt(buildExternalPromptByMode(externalPromptMode))}
              >
                重新生成提示词
              </Button>
            </div>
            <div className={styles.externalAiActions}>
              <Button size="sm" variant="secondary" className={styles.inlineActionButton} onClick={handleCopyExternalPrompt}>
                复制给外部 AI
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
                打开外部 AI 网页
              </Button>
            </div>
            {externalPromptMode === 'fieldPolish' && externalFieldTarget ? (
              <p className={styles.aiHint}>当前设定目标：{externalFieldTarget.name}</p>
            ) : null}
            {aiContextNotice ? <p className={styles.aiHint}>{aiContextNotice}</p> : null}

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
              placeholder="粘贴外部 AI 返回的 JSON 结果"
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
                解析结果并进入应用预览
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

      {isDependencyEditorOpen && selectedCard && (
        <div className={styles.managerOverlay} role="presentation" onClick={() => setIsDependencyEditorOpen(false)}>
          <div className={styles.managerCard} role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className={styles.managerHeader}>
              <h3>编辑依赖</h3>
            </div>
            <div className={styles.cardLevelRelationList}>
              {getCardLevelRelations(selectedCard).length > 0 ? (
                getCardLevelRelations(selectedCard).map((relation) => {
                  const { targetCard, targetField } = resolveRelationTarget(relation);
                  return (
                    <div key={`card-level-editor-${relation.index}`} className={styles.fieldRelationItem}>
                      <span className={styles.relationType}>{relation.type}</span>
                      <button
                        className={styles.relationTargetLink}
                        onClick={() => {
                          if (targetCard) {
                            openCardPreview(targetCard.id);
                            setIsDependencyEditorOpen(false);
                          }
                        }}
                      >
                        {targetCard?.title ?? '未知卡片'}
                        {targetField ? ` / ${targetField.name}` : ''}
                      </button>
                      <button type="button" className={styles.removeRelationBtn} onClick={() => handleDeleteRelation(relation.index)} title="删除依赖">
                        ×
                      </button>
                    </div>
                  );
                })
              ) : (
                <p className={styles.emptyState}>暂无依赖</p>
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
              <button type="button" className={styles.addRelationBtn} onClick={handleCreateCardLevelRelation} disabled={!cardDependencyTarget}>
                +
              </button>
            </div>
            <div className={styles.managerActionsRow}>
              <Button size="sm" variant="ghost" className={styles.inlineActionButton} onClick={() => setIsDependencyEditorOpen(false)}>
                关闭
              </Button>
            </div>
          </div>
        </div>
      )}

      {isDetailTagModalOpen && selectedCard && (
        <div className={styles.managerOverlay} role="presentation" onClick={closeDetailTagModal}>
          <div className={styles.managerCard} role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className={styles.managerHeader}>
              <h3>添加标签</h3>
            </div>
            <div className={styles.managerRow}>
              <input
                className={styles.tagInput}
                value={detailTagDraft}
                onChange={(event) => setDetailTagDraft(event.target.value)}
                placeholder="输入标签名"
                autoFocus
              />
              <input
                className={styles.colorInput}
                type="color"
                value={detailTagColorDraft}
                onChange={(event) => setDetailTagColorDraft(event.target.value)}
              />
              <Button
                size="sm"
                variant="secondary"
                className={styles.inlineActionButton}
                onClick={createAndAddDetailTag}
                disabled={!normalizeTagName(detailTagDraft)}
              >
                {detailTagCanCreate ? '创建并添加' : '添加'}
              </Button>
            </div>
            <div className={styles.managerList}>
              {detailTagCandidates.length > 0 ? (
                detailTagCandidates.map((tag) => (
                  <button key={`detail-tag-candidate-${tag.name}`} className={styles.tagPaletteItem} onClick={() => addExistingDetailTag(tag.name, tag.color)}>
                    <span className={styles.tagDot} style={{ background: tag.color }} />
                    <span>{tag.name}</span>
                    <span className={styles.templatePickMeta}>{tagSourceLabel(tag.name)}</span>
                  </button>
                ))
              ) : (
                <p className={styles.emptyState}>没有可选标签，可直接创建新标签。</p>
              )}
            </div>
            <div className={styles.managerActionsRow}>
              <Button size="sm" variant="ghost" className={styles.inlineActionButton} onClick={closeDetailTagModal}>
                关闭
              </Button>
            </div>
          </div>
        </div>
      )}

      {activeFieldIterationDraftFieldId && selectedCard && selectedFieldDraftTarget && (
        <div className={`${styles.managerOverlay} ${styles.topMostOverlay}`} role="presentation" onClick={() => closeFieldIterationDraft(activeFieldIterationDraftFieldId)}>
          <div className={styles.managerCard} role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className={styles.managerHeader}>
              <h3>设定迭代编辑 · {selectedFieldDraftTarget.name || '未命名设定'}</h3>
            </div>
            <div className={styles.iterationEditor}>
              <textarea
                className={styles.detailTextarea}
                rows={4}
                value={fieldIterationDrafts[activeFieldIterationDraftFieldId]?.value ?? selectedFieldDraftTarget.value}
                onChange={(event) =>
                  setFieldIterationDrafts((prev) => ({
                    ...prev,
                    [activeFieldIterationDraftFieldId]: {
                      ...(prev[activeFieldIterationDraftFieldId] ?? {
                        open: true,
                        value: selectedFieldDraftTarget.value,
                        versionTag: '',
                        reasonType: 'manual',
                        reasonText: '',
                        reasonCardId: '',
                      }),
                      value: event.target.value,
                    },
                  }))
                }
                placeholder="输入该设定的新版本内容"
              />
              <input
                className={styles.detailInput}
                value={fieldIterationDrafts[activeFieldIterationDraftFieldId]?.versionTag ?? ''}
                onChange={(event) =>
                  setFieldIterationDrafts((prev) => ({
                    ...prev,
                    [activeFieldIterationDraftFieldId]: {
                      ...(prev[activeFieldIterationDraftFieldId] ?? {
                        open: true,
                        value: selectedFieldDraftTarget.value,
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
                  value={fieldIterationDrafts[activeFieldIterationDraftFieldId]?.reasonType ?? 'manual'}
                  onChange={(event) =>
                    setFieldIterationDrafts((prev) => ({
                      ...prev,
                      [activeFieldIterationDraftFieldId]: {
                        ...(prev[activeFieldIterationDraftFieldId] ?? {
                          open: true,
                          value: selectedFieldDraftTarget.value,
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
                {(fieldIterationDrafts[activeFieldIterationDraftFieldId]?.reasonType ?? 'manual') === 'card' ? (
                  <select
                    className={styles.relationSelect}
                    value={fieldIterationDrafts[activeFieldIterationDraftFieldId]?.reasonCardId ?? ''}
                    onChange={(event) =>
                      setFieldIterationDrafts((prev) => ({
                        ...prev,
                        [activeFieldIterationDraftFieldId]: {
                          ...(prev[activeFieldIterationDraftFieldId] ?? {
                            open: true,
                            value: selectedFieldDraftTarget.value,
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
                        <option key={`field-modal-reason-${activeFieldIterationDraftFieldId}-${card.id}`} value={card.id}>
                          {card.title}
                        </option>
                      ))}
                  </select>
                ) : (
                  <input
                    className={styles.detailInput}
                    value={fieldIterationDrafts[activeFieldIterationDraftFieldId]?.reasonText ?? ''}
                    onChange={(event) =>
                      setFieldIterationDrafts((prev) => ({
                        ...prev,
                        [activeFieldIterationDraftFieldId]: {
                          ...(prev[activeFieldIterationDraftFieldId] ?? {
                            open: true,
                            value: selectedFieldDraftTarget.value,
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
                <Button size="sm" variant="ghost" className={styles.inlineActionButton} onClick={() => closeFieldIterationDraft(activeFieldIterationDraftFieldId)}>
                  取消
                </Button>
                <Button size="sm" variant="secondary" className={styles.inlineActionButton} onClick={() => saveFieldIterationByFieldId(activeFieldIterationDraftFieldId)}>
                  保存设定迭代
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {fieldIterationHistoryFieldId && selectedCard && selectedFieldIterationTarget && (
        <div className={styles.managerOverlay} role="presentation" onClick={() => setFieldIterationHistoryFieldId(null)}>
          <div className={styles.managerCard} role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className={styles.managerHeader}>
              <h3>设定迭代历史 · {selectedFieldIterationTarget.name || '未命名设定'}</h3>
            </div>
            <p className={styles.aiHint}>从当前版本创建迭代，可直接切换当前版本，并修改原因或重命名。</p>
            <div className={styles.managerActionsRow}>
              <Button size="sm" variant="secondary" className={styles.inlineActionButton} onClick={() => openFieldIterationDraft(selectedFieldIterationTarget)}>
                创建设定迭代
              </Button>
            </div>
            <div className={styles.cardEvolutionTimeline}>
              <button
                type="button"
                className={`${styles.cardEvolutionNode} ${!selectedFieldIterationTarget.activeIterationId ? styles.cardEvolutionNodeActive : ''}`}
                onClick={() => setFieldIterationAsCurrentByFieldId(fieldIterationHistoryFieldId, ORIGIN_ITERATION_ID)}
              >
                原始
              </button>
              {[...(selectedFieldIterationTarget.iterations ?? [])].reverse().map((iteration) => (
                <button
                  key={`field-timeline-${iteration.id}`}
                  type="button"
                  className={`${styles.cardEvolutionNode} ${selectedFieldIterationTarget.activeIterationId === iteration.id ? styles.cardEvolutionNodeActive : ''}`}
                  onClick={() => setFieldIterationAsCurrentByFieldId(fieldIterationHistoryFieldId, iteration.id)}
                  title={buildFieldIterationPathLabel(selectedFieldIterationTarget, iteration.id)}
                >
                  {iteration.versionTag?.trim() || '未命名迭代'}
                </button>
              ))}
            </div>
            <div className={styles.iterationList}>
              {(selectedFieldIterationTarget.iterations ?? []).length > 0 ? (
                (selectedFieldIterationTarget.iterations ?? []).map((iteration) => {
                  const diff = diffFieldIterationValue(selectedFieldIterationTarget, iteration.id);
                  const preview = buildFieldIterationDiffPreview(selectedFieldIterationTarget, iteration.id);
                  const isEditing = editingFieldIterationFieldId === fieldIterationHistoryFieldId && editingFieldIterationId === iteration.id;
                  return (
                    <div key={`field-iter-modal-${iteration.id}`} className={styles.iterationItem}>
                      <p className={styles.templatePickMeta}>{new Date(iteration.createdAt).toLocaleString('zh-CN')}</p>
                      <p className={styles.aiHint}>迭代路径：{buildFieldIterationPathLabel(selectedFieldIterationTarget, iteration.id)}</p>
                      {isEditing ? (
                        <div className={styles.iterationDraftSection}>
                          <div className={styles.cardIterationRenameRow}>
                            <input
                              className={styles.detailInput}
                              value={editingFieldIterationVersionTag}
                              onChange={(event) => setEditingFieldIterationVersionTag(event.target.value)}
                              placeholder="迭代标签"
                            />
                            <Button size="sm" variant="secondary" className={styles.inlineActionButton} onClick={saveFieldIterationMeta}>
                              保存
                            </Button>
                            <Button size="sm" variant="ghost" className={styles.inlineActionButton} onClick={cancelEditFieldIterationMeta}>
                              取消
                            </Button>
                          </div>
                          <div className={styles.fieldRelationAdd}>
                            <select
                              className={styles.relationSelect}
                              value={editingFieldIterationReasonType}
                              onChange={(event) => setEditingFieldIterationReasonType(event.target.value === 'card' ? 'card' : 'manual')}
                            >
                              <option value="manual">手动填写原因</option>
                              <option value="card">选择关联卡作为原因</option>
                            </select>
                            {editingFieldIterationReasonType === 'card' ? (
                              <select
                                className={styles.relationSelect}
                                value={editingFieldIterationReasonCardId}
                                onChange={(event) => setEditingFieldIterationReasonCardId(event.target.value)}
                              >
                                <option value="">选择原因卡片</option>
                                {cards
                                  .filter((card) => card.id !== selectedCard.id)
                                  .map((card) => (
                                    <option key={`field-iter-reason-${card.id}`} value={card.id}>
                                      {card.title}
                                    </option>
                                  ))}
                              </select>
                            ) : (
                              <input
                                className={styles.detailInput}
                                value={editingFieldIterationReasonText}
                                onChange={(event) => setEditingFieldIterationReasonText(event.target.value)}
                                placeholder="填写迭代原因"
                              />
                            )}
                          </div>
                        </div>
                      ) : (
                        <>
                          <span className={`${styles.iterationVersionTag} ${styles.iterationVersionTagCorner}`}>{iteration.versionTag?.trim() || '未命名迭代'}</span>
                          <div className={styles.fieldDiffPanel}>
                            <div className={styles.fieldDiffColumn}>
                              <span className={styles.fieldDiffTitle}>上一版本</span>
                              {preview.rows.length > 0 ? (
                                preview.rows.map((row, lineIndex) => (
                                  <p key={`field-modal-prev-${iteration.id}-${lineIndex}`} className={row.state === 'removed' || row.state === 'changed' ? styles.fieldDiffLineRemoved : styles.fieldDiffLineMuted}>
                                    {row.before || '（空）'}
                                  </p>
                                ))
                              ) : (
                                <p className={styles.fieldDiffLineMuted}>（空）</p>
                              )}
                            </div>
                            <div className={styles.fieldDiffColumn}>
                              <span className={styles.fieldDiffTitle}>本版本</span>
                              {preview.rows.length > 0 ? (
                                preview.rows.map((row, lineIndex) => (
                                  <p
                                    key={`field-modal-next-${iteration.id}-${lineIndex}`}
                                    className={
                                      row.state === 'added'
                                        ? styles.fieldDiffLineAdded
                                        : row.state === 'changed'
                                          ? styles.fieldDiffLineChanged
                                          : styles.fieldDiffLineMuted
                                    }
                                  >
                                    {row.after || '（空）'}
                                  </p>
                                ))
                              ) : (
                                <p className={styles.fieldDiffLineMuted}>（空）</p>
                              )}
                            </div>
                          </div>
                          <div className={styles.cardIterationPreviewGrid}>
                            {diff.added.length > 0 ? <p><strong>+新增：</strong>{diff.added.join('；')}</p> : null}
                            {diff.removed.length > 0 ? <p><strong>-移除：</strong>{diff.removed.join('；')}</p> : null}
                            {diff.added.length === 0 && diff.removed.length === 0 ? <p><strong>Diff：</strong>与上一版无文本差异</p> : null}
                          </div>
                          <span className={`${styles.tagChip} ${styles.iterationReasonChip}`} title={resolveIterationReasonLabel(iteration.reasonType, iteration.reasonText, iteration.reasonCardId)}>
                            {resolveIterationReasonLabel(iteration.reasonType, iteration.reasonText, iteration.reasonCardId)}
                          </span>
                          <div className={styles.managerActionsRow}>
                            <Button
                              size="sm"
                              variant="secondary"
                              className={styles.inlineActionButton}
                              onClick={() => setFieldIterationAsCurrentByFieldId(fieldIterationHistoryFieldId, iteration.id)}
                              disabled={selectedFieldIterationTarget.activeIterationId === iteration.id}
                            >
                              {selectedFieldIterationTarget.activeIterationId === iteration.id ? '当前版本' : '设为当前'}
                            </Button>
                            <Button size="sm" variant="ghost" className={styles.inlineActionButton} onClick={() => startEditFieldIterationMeta(fieldIterationHistoryFieldId, iteration)}>
                              修改原因
                            </Button>
                            <Button size="sm" variant="ghost" className={styles.inlineActionButton} onClick={() => startEditFieldIterationMeta(fieldIterationHistoryFieldId, iteration)}>
                              重命名
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })
              ) : (
                <p className={styles.emptyState}>暂无设定迭代，当前默认为“原始”。</p>
              )}
            </div>
            <div className={styles.managerActionsRow}>
              <Button size="sm" variant="ghost" className={styles.inlineActionButton} onClick={() => setFieldIterationHistoryFieldId(null)}>
                关闭
              </Button>
            </div>
          </div>
        </div>
      )}

      {isCardIterationHistoryOpen && selectedCard && (
        <div className={styles.managerOverlay} role="presentation" onClick={() => setIsCardIterationHistoryOpen(false)}>
          <div className={styles.managerCard} role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className={styles.managerHeader}>
              <h3>整卡迭代历史</h3>
            </div>
            <p className={styles.aiHint}>查看当前迭代与历史快照，可重命名并切换当前版本。</p>
            <div className={styles.managerActionsRow}>
              <Button size="sm" variant="secondary" className={styles.inlineActionButton} onClick={() => openCardIterationDraft()}>
                从当前版本创建迭代
              </Button>
            </div>
            {(selectedCard.cardIterations ?? []).length > 0 && (
              <div className={styles.cardEvolutionTimeline}>
                <button
                  type="button"
                  className={`${styles.cardEvolutionNode} ${!selectedCard.activeCardIterationId ? styles.cardEvolutionNodeActive : ''}`}
                  onClick={() => setCardIterationAsCurrent(ORIGIN_CARD_ITERATION_ID)}
                  title="原始底稿"
                >
                  原始
                </button>
                {[...(selectedCard.cardIterations ?? [])].reverse().map((iteration) => (
                  <button
                    key={`timeline-${iteration.id}`}
                    type="button"
                    className={`${styles.cardEvolutionNode} ${selectedCard.activeCardIterationId === iteration.id ? styles.cardEvolutionNodeActive : ''}`}
                    onClick={() => setCardIterationAsCurrent(iteration.id)}
                    title={buildCardIterationPathLabel(iteration.id)}
                  >
                    {resolveCardIterationTag(iteration)}
                  </button>
                ))}
              </div>
            )}
            <div className={styles.iterationList}>
              {(selectedCard.cardIterations ?? []).length > 0 ? (
                (() => {
                  const entries = [
                    {
                      id: ORIGIN_CARD_ITERATION_ID,
                      createdAt: '原始底稿',
                      path: '进化路径：原始',
                      tag: '原始',
                      reason: '初始底稿',
                      snapshot: selectedCard.initialSnapshot,
                      rawIteration: null as SettingCardIteration | null,
                    },
                    ...(selectedCard.cardIterations ?? []).map((iteration) => ({
                      id: iteration.id,
                      createdAt: new Date(iteration.createdAt).toLocaleString('zh-CN'),
                      path: `进化路径：${buildCardIterationPathLabel(iteration.id)}`,
                      tag: resolveCardIterationTag(iteration),
                      reason: resolveIterationReasonLabel(iteration.reasonType, iteration.reasonText, iteration.reasonCardId),
                      snapshot: iteration.snapshot,
                      rawIteration: iteration,
                    })),
                  ];
                  const selectedEntry = entries.find((entry) => entry.id === (selectedCard.activeCardIterationId ?? ORIGIN_CARD_ITERATION_ID));
                  if (!selectedEntry?.snapshot) {
                    return null;
                  }
                  const iteration = selectedEntry.rawIteration;
                  return (
                    <div key={selectedEntry.id} className={`${styles.iterationItem} ${styles.cardIterationItem}`}>
                      <p className={styles.templatePickMeta}>{selectedEntry.createdAt}</p>
                      <p className={styles.aiHint}>{selectedEntry.path}</p>
                      <span className={`${styles.iterationVersionTag} ${styles.iterationVersionTagCorner}`}>{selectedEntry.tag}</span>
                      <div className={styles.cardIterationPreviewGrid}>
                        <p><strong>名称：</strong>{selectedEntry.snapshot.title || '（空）'}</p>
                        <p><strong>分类：</strong>{selectedEntry.snapshot.category || '（空）'}</p>
                        <p><strong>摘要：</strong>{selectedEntry.snapshot.summary || '（空）'}</p>
                        {selectedEntry.snapshot.customFields.length > 0 ? (
                          selectedEntry.snapshot.customFields.map((field) => (
                            <p key={`iter-preview-${selectedEntry.id}-${field.id ?? field.name}`}><strong>{field.name || '未命名设定'}：</strong>{field.value || '（空）'}</p>
                          ))
                        ) : (
                          <p><strong>设定：</strong>无设定</p>
                        )}
                      </div>
                      {iteration ? (
                        <button
                          type="button"
                          className={`${styles.tagChip} ${styles.iterationReasonChip} ${styles.iterationReasonButton}`}
                          title={selectedEntry.reason}
                          onClick={() => openCardIterationDraft(iteration)}
                        >
                          {selectedEntry.reason}
                        </button>
                      ) : (
                        <span className={`${styles.tagChip} ${styles.iterationReasonChip}`}>初始底稿</span>
                      )}
                    </div>
                  );
                })()
              ) : (
                <p className={styles.emptyState}>暂无整卡迭代，当前默认为“原始”。</p>
              )}
            </div>
            <div className={styles.managerActionsRow}>
              <Button size="sm" variant="ghost" className={styles.inlineActionButton} onClick={() => setIsCardIterationHistoryOpen(false)}>
                关闭
              </Button>
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
