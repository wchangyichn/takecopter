import { useEffect, useId, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { Button, Panel } from '../components/ui';
import type { SettingCard, SettingCustomField, SettingLibrary, SettingTag, SettingTemplate } from '../types';
import styles from './SettingView.module.css';

const cardPalette = ['var(--coral-400)', 'var(--violet-400)', 'var(--teal-400)', 'var(--amber-400)', 'var(--rose-400)'];
const tagColorPalette = ['#f97316', '#ef4444', '#eab308', '#10b981', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];
const customFieldPresets = ['服设', '口癖', '年龄', '身份', '目标', '弱点'];
const FIELD_UNIT_WIDTH = 220;
const FIELD_UNIT_HEIGHT = 140;

interface DragState {
  id: string;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
}

interface FieldDragState {
  fieldId: string;
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
      tags: (card.tags ?? []).map((tag) => ({ ...tag })),
      customFields: (card.customFields ?? []).map((field, index) => ({
        id: field.id ?? `field-${uniqueId}-${index + 1}`,
        ...field,
        size: field.size === 'sm' || field.size === 'md' || field.size === 'lg' ? field.size : 'md',
        x: typeof field.x === 'number' ? field.x : (index % 3) * (FIELD_UNIT_WIDTH + 12),
        y: typeof field.y === 'number' ? field.y : Math.floor(index / 3) * (FIELD_UNIT_HEIGHT + 12),
        w: typeof field.w === 'number' ? field.w : 1,
        h: typeof field.h === 'number' ? field.h : 1,
      })),
    };
  });
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

function templateEditingKey(source: 'global' | 'story', id: string): string {
  return `${source}:${id}`;
}

function fieldSize(size: SettingCustomField['size']): 'sm' | 'md' | 'lg' {
  return size === 'sm' || size === 'md' || size === 'lg' ? size : 'md';
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
  const detailComboboxId = useId();

  const [cards, setCards] = useState<EditableCard[]>(() => normalizeCards(sourceCards));
  const [selectedCardId, setSelectedCardId] = useState<string | null>(() => sourceCards[0]?.id ?? null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const [activeTagFilters, setActiveTagFilters] = useState<string[]>([]);
  const [toolbarTagSearchOpen, setToolbarTagSearchOpen] = useState(false);
  const [toolbarTagQuery, setToolbarTagQuery] = useState('');
  const [toolbarTagActiveIndex, setToolbarTagActiveIndex] = useState(0);

  const [detailTagSearchOpen, setDetailTagSearchOpen] = useState(false);
  const [detailTagQuery, setDetailTagQuery] = useState('');
  const [detailTagActiveIndex, setDetailTagActiveIndex] = useState(0);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [newCustomFieldName, setNewCustomFieldName] = useState('');
  const [isTemplatePickerOpen, setIsTemplatePickerOpen] = useState(false);
  const [isSaveTemplateOpen, setIsSaveTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateScope, setTemplateScope] = useState<'global' | 'story'>('global');

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

  const [globalTags, setGlobalTags] = useState<SettingTag[]>(() => globalLibrary.tags ?? []);
  const [storyTags, setStoryTags] = useState<SettingTag[]>(() => storyLibrary.tags ?? []);
  const [globalCategories, setGlobalCategories] = useState<string[]>(() => globalLibrary.categories ?? []);
  const [storyCategories, setStoryCategories] = useState<string[]>(() => storyLibrary.categories ?? []);
  const [globalTemplates, setGlobalTemplates] = useState<SettingTemplate[]>(() => globalLibrary.templates ?? []);
  const [storyTemplates, setStoryTemplates] = useState<SettingTemplate[]>(() => storyLibrary.templates ?? []);

  const [dragState, setDragState] = useState<DragState | null>(null);
  const [fieldDragState, setFieldDragState] = useState<FieldDragState | null>(null);

  const localIdRef = useRef(0);
  const templateIdRef = useRef(0);
  const cardsRef = useRef<EditableCard[]>(cards);
  const selectedCardIdRef = useRef<string | null>(selectedCardId);
  const fieldBoardRef = useRef<HTMLDivElement | null>(null);
  const toolbarSearchRef = useRef<HTMLDivElement | null>(null);
  const detailSearchRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    selectedCardIdRef.current = selectedCardId;
  }, [selectedCardId]);

  const categories = useMemo(() => {
    const set = new Set<string>([...globalCategories, ...storyCategories, ...uniqueCategories(cards)]);
    return Array.from(set);
  }, [cards, globalCategories, storyCategories]);

  const selectedCard = useMemo(() => cards.find((item) => item.id === selectedCardId) ?? null, [cards, selectedCardId]);
  const tagOptions = useMemo(() => allTags(cards, [...globalTags, ...storyTags]), [cards, globalTags, storyTags]);

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

  const detailTagCandidates = useMemo(() => {
    const query = normalizeTagName(detailTagQuery).toLowerCase();
    const selectedNames = new Set((selectedCard?.tags ?? []).map((tag) => tag.name));
    return tagOptions.filter((tag) => {
      if (selectedNames.has(tag.name)) {
        return false;
      }
      return !query || tag.name.toLowerCase().includes(query);
    });
  }, [detailTagQuery, selectedCard?.tags, tagOptions]);

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

  const detailCanCreate = useMemo(
    () =>
      Boolean(normalizeTagName(detailTagQuery)) &&
      !tagOptions.some((tag) => tag.name === normalizeTagName(detailTagQuery)),
    [detailTagQuery, tagOptions]
  );

  const detailActiveDescendant = useMemo(() => {
    if (!detailTagSearchOpen) {
      return undefined;
    }
    if (detailTagCandidates.length > 0) {
      const safeIndex = Math.min(detailTagActiveIndex, Math.max(detailTagCandidates.length - 1, 0));
      return `${detailComboboxId}-option-${safeIndex}`;
    }
    if (detailCanCreate) {
      return `${detailComboboxId}-create`;
    }
    return undefined;
  }, [detailCanCreate, detailComboboxId, detailTagActiveIndex, detailTagCandidates.length, detailTagSearchOpen]);

  const applyCards = (updater: (prev: EditableCard[]) => EditableCard[]) => {
    setCards((prev) => {
      const next = updater(prev);
      cardsRef.current = next;
      onCardsChange(next);
      return next;
    });
  };

  useEffect(() => {
    let cancelled = false;
    const previousCards = cardsRef.current;
    const previousSelectedId = selectedCardIdRef.current;
    const previousIndex = previousSelectedId ? previousCards.findIndex((card) => card.id === previousSelectedId) : -1;
    const nextCards = normalizeCards(sourceCards);

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
        onCardsChange(cardsRef.current);
      }
      setDragState(null);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [dragState, onCardsChange]);

  useEffect(() => {
    if (!fieldDragState || !selectedCard) {
      return;
    }

    const handleMove = (event: MouseEvent) => {
      const deltaX = event.clientX - fieldDragState.startX;
      const deltaY = event.clientY - fieldDragState.startY;

      setCards((prev) => {
        const next = prev.map((card) => {
          if (card.id !== selectedCard.id) {
            return card;
          }

          return {
            ...card,
            customFields: card.customFields.map((field) => {
              if (field.id !== fieldDragState.fieldId) {
                return field;
              }

              return {
                ...field,
                x: Math.max(0, fieldDragState.originX + deltaX),
                y: Math.max(0, fieldDragState.originY + deltaY),
              };
            }),
          };
        });
        cardsRef.current = next;
        return next;
      });
    };

    const handleUp = () => {
      setFieldDragState(null);
      setCards((prev) => {
        const next = prev.map((card) => {
          if (card.id !== selectedCard.id) {
            return card;
          }

          const sorted = [...card.customFields].sort((a, b) => {
            const yDiff = (a.y ?? 0) - (b.y ?? 0);
            if (Math.abs(yDiff) > 16) {
              return yDiff;
            }
            return (a.x ?? 0) - (b.x ?? 0);
          });

          return {
            ...card,
            customFields: sorted,
          };
        });
        cardsRef.current = next;
        onCardsChange(next);
        return next;
      });
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [fieldDragState, onCardsChange, selectedCard]);

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
        setDetailTagActiveIndex(0);
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

    setSelectedCardId(card.id);
    setDragState({
      id: card.id,
      startX: event.clientX,
      startY: event.clientY,
      originX: card.position.x,
      originY: card.position.y,
    });
  };

  const onFieldMouseDown = (event: ReactMouseEvent<HTMLDivElement>, field: SettingCustomField) => {
    if (event.button !== 0) {
      return;
    }
    event.stopPropagation();

    if (!field.id) {
      return;
    }

    setFieldDragState({
      fieldId: field.id,
      startX: event.clientX,
      startY: event.clientY,
      originX: field.x ?? 0,
      originY: field.y ?? 0,
    });
  };

  const handleAddCard = (template?: SettingTemplate) => {
    const nextIndex = cards.length + 1;
    let nextId = '';
    do {
      localIdRef.current += 1;
      nextId = `card-local-${localIdRef.current}`;
    } while (cards.some((card) => card.id === nextId));
    const nextCategory = selectedCategory ?? template?.preset.category ?? undefined;
    const created: EditableCard = {
      id: nextId,
      title: template ? `${template.name} ${nextIndex}` : `空设定 ${nextIndex}`,
      type: template?.preset.type ?? 'event',
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
      relations: [],
    };

    applyCards((prev) => [...prev, created]);
    setSelectedCardId(created.id);
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
    if (!window.confirm('确定删除该模版吗？')) {
      return;
    }

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
  };

  const handleDeleteSelectedCard = () => {
    if (!selectedCard) {
      return;
    }

    if (!window.confirm(`确定删除设定卡片“${selectedCard.title || '未命名'}”？此操作不可撤销。`)) {
      return;
    }

    setIsEditorOpen(false);

    const deletingId = selectedCard.id;
    applyCards((prev) => {
      const remaining = prev
        .filter((card) => card.id !== deletingId)
        .map((card) => ({
          ...card,
          relations: card.relations.filter((relation) => relation.targetId !== deletingId),
        }));

      setSelectedCardId(remaining[0]?.id ?? null);
      return remaining;
    });
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
    updateSelectedCard((card) => ({
      ...card,
      customFields: card.customFields.filter((_, currentIndex) => currentIndex !== index),
    }));
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
    setDetailTagActiveIndex(0);
    setTagManagerColor(randomTagColor());
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
            <button className={styles.addButton} aria-label="新建设定卡片" onClick={() => setIsTemplatePickerOpen(true)}>
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
                onClick={() => setSelectedCardId(card.id)}
              >
                <span className={styles.listItemDot} style={{ background: card.color }} />
                <div className={styles.listItemContent}>
                  <span className={styles.listItemTitle}>{card.title}</span>
                  <span className={styles.listItemType}>
                    {card.category ? `${card.category} · ` : ''}
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
              onClick={() => setSelectedCardId(card.id)}
              onMouseDown={(event) => onCardMouseDown(event, card)}
            >
              <div className={styles.canvasCardInner} style={{ borderColor: card.color }}>
                <div className={styles.canvasCardHeader} style={{ background: card.color }}>
                  <span className={styles.canvasCardType}>{cardCategoryLabel(card)}</span>
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

      {isTemplatePickerOpen && (
        <div className={styles.managerOverlay} role="presentation" onClick={() => setIsTemplatePickerOpen(false)}>
          <div className={styles.managerCard} role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className={styles.managerHeader}>
              <h3>选择卡片模版</h3>
            </div>
            <div className={styles.managerList}>
              <button className={styles.templatePickItem} onClick={() => handleAddCard()}>
                <span className={styles.managerTagName}>空白卡片</span>
                <span className={styles.templatePickMeta}>不预设属性</span>
              </button>
              {templateEntries.map((template) => (
                <button key={template.id} className={styles.templatePickItem} onClick={() => handleAddCard(template)}>
                  <span className={styles.managerTagName}>{template.name}</span>
                  <span className={styles.templatePickMeta}>{template.source}模版</span>
                </button>
              ))}
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

      {selectedCard && (
        <Panel side="right" width="440px" className={styles.detailPanel}>
          <div className={styles.detailHeader}>
            <span className={styles.detailType} style={{ color: selectedCard.color }}>
              {cardCategoryLabel(selectedCard)}
            </span>
            <h2 className={styles.detailTitle}>设定详情</h2>
            <Button size="sm" variant="secondary" className={styles.inlineActionButton} onClick={() => setIsEditorOpen(true)}>
              展开设定编辑页
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className={styles.inlineActionButton}
              onClick={() => {
                setTemplateName(selectedCard.title || '新模版');
                setTemplateScope('global');
                setIsSaveTemplateOpen(true);
              }}
            >
              保存为模版
            </Button>
            <Button size="sm" variant="ghost" className={styles.detailDeleteCardButton} onClick={handleDeleteSelectedCard}>
              删除卡片
            </Button>
          </div>

          <div className={styles.detailSection}>
            <h4>名称</h4>
            <input
              className={styles.detailInput}
              value={selectedCard.title}
              onChange={(event) => {
                const value = event.target.value;
                updateSelectedCard((card) => ({ ...card, title: value }));
              }}
            />
          </div>

          <div className={styles.detailSection}>
            <h4>卡片分类</h4>
            <div className={styles.detailCategoryRow}>
              <select
                className={styles.categorySelect}
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

          <div className={styles.detailSection}>
            <h4>标签</h4>
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

            <div className={styles.tagPalette} ref={detailSearchRef}>
              <Button size="sm" variant="secondary" className={styles.inlineActionButton} onClick={() => setDetailTagSearchOpen((prev) => !prev)}>
                {detailTagSearchOpen ? '收起标签输入' : '添加标签'}
              </Button>

              {detailTagSearchOpen && (
                <div className={styles.tagSearchWrap}>
                  <input
                    className={styles.detailInput}
                    value={detailTagQuery}
                    id={detailComboboxId}
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={detailTagSearchOpen}
                    aria-controls={`${detailComboboxId}-listbox`}
                    aria-activedescendant={detailActiveDescendant}
                    placeholder="搜索标签或输入后创建"
                    autoFocus
                    onChange={(event) => {
                      setDetailTagQuery(event.target.value);
                      setDetailTagActiveIndex(0);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'ArrowDown') {
                        event.preventDefault();
                        const nextIndex = Math.min(detailTagActiveIndex + 1, Math.max(detailTagCandidates.length - 1, 0));
                        setDetailTagActiveIndex(nextIndex);
                      }

                      if (event.key === 'ArrowUp') {
                        event.preventDefault();
                        const nextIndex = Math.max(detailTagActiveIndex - 1, 0);
                        setDetailTagActiveIndex(nextIndex);
                      }

                      if (event.key === 'Enter') {
                        event.preventDefault();
                        const active = detailTagCandidates[detailTagActiveIndex];
                        if (active) {
                          addTagToSelected(active.name, active.color);
                          setDetailTagQuery('');
                          setDetailTagSearchOpen(false);
                        } else {
                          createAndAddDetailTag();
                        }
                      }

                      if (event.key === 'Escape') {
                        setDetailTagSearchOpen(false);
                        setDetailTagQuery('');
                        setDetailTagActiveIndex(0);
                      }
                    }}
                  />
                  <div className={styles.tagSearchDropdown}>
                    <div id={`${detailComboboxId}-listbox`} role="listbox" aria-label="卡片标签搜索结果">
                    {detailTagCandidates.map((tag, index) => (
                      <button
                        key={tag.name}
                        id={`${detailComboboxId}-option-${index}`}
                        role="option"
                        aria-selected={index === detailTagActiveIndex}
                        className={`${styles.tagSearchItem} ${index === detailTagActiveIndex ? styles.activeSearchItem : ''}`}
                        onMouseEnter={() => setDetailTagActiveIndex(index)}
                        onClick={() => {
                          addTagToSelected(tag.name, tag.color);
                          setDetailTagQuery('');
                          setDetailTagSearchOpen(false);
                        }}
                      >
                        <span className={styles.tagDot} style={{ background: tag.color }} />
                        添加标签：{tag.name}（{tagSourceLabel(tag.name)}）
                      </button>
                    ))}
                    {detailCanCreate && (
                      <button id={`${detailComboboxId}-create`} role="option" aria-selected={detailTagCandidates.length === 0} className={styles.tagCreateItem} onClick={createAndAddDetailTag}>
                        创建并添加标签 “{normalizeTagName(detailTagQuery)}”
                      </button>
                    )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className={styles.detailSection}>
            <h4>自定义属性</h4>
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

            <div className={styles.customFieldPresetRow}>
              {customFieldPresets.map((preset) => (
                <button key={preset} className={styles.customFieldPreset} onClick={() => handleAddCustomField(preset)}>
                  + {preset}
                </button>
              ))}
            </div>

            <div className={styles.customFieldList}>
              {selectedCard.customFields.length > 0 ? (
                selectedCard.customFields.map((field, index) => (
                  <div key={`${field.name}-${index}`} className={`${styles.customFieldItem} ${styles[`fieldSize${fieldSize(field.size)}`]}`}>
                    <input
                      className={styles.detailInput}
                      value={field.name}
                      onChange={(event) => handleUpdateCustomField(index, { name: event.target.value })}
                      placeholder="属性名"
                    />
                    <div className={styles.customFieldSizeRow}>
                      <span className={styles.customFieldSizeLabel}>大小</span>
                      {(['sm', 'md', 'lg'] as const).map((sizeOption) => (
                        <button
                          key={sizeOption}
                          className={`${styles.customFieldSizeButton} ${fieldSize(field.size) === sizeOption ? styles.customFieldSizeButtonActive : ''}`}
                          onClick={() => handleUpdateCustomField(index, { size: sizeOption })}
                        >
                          {sizeOption.toUpperCase()}
                        </button>
                      ))}
                    </div>
                    <textarea
                      className={styles.detailTextarea}
                      rows={3}
                      value={field.value}
                      onChange={(event) => handleUpdateCustomField(index, { value: event.target.value })}
                      placeholder="属性值"
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      className={styles.inlineActionButton}
                      onClick={() => handleDeleteCustomField(index)}
                    >
                      删除属性
                    </Button>
                  </div>
                ))
              ) : (
                <p className={styles.emptyState}>还没有自定义属性</p>
              )}
            </div>

            <Button size="sm" variant="secondary" className={styles.inlineActionButton} onClick={() => setIsEditorOpen(true)}>
              展开大屏编辑
            </Button>
          </div>

          <button className={styles.closeDetail} onClick={() => setSelectedCardId(null)} aria-label="关闭详情">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </Panel>
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
              <div className={styles.detailSection}>
                <h4>名称</h4>
                <input
                  className={styles.detailInput}
                  value={selectedCard.title}
                  onChange={(event) => {
                    const value = event.target.value;
                    updateSelectedCard((card) => ({ ...card, title: value }));
                  }}
                />
              </div>

              <div className={styles.detailSection}>
                <h4>自定义属性</h4>
                <p>属性卡在整个设定编辑页里自由排版与拖拽，支持宽高双向延展。</p>
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

                <div className={styles.customFieldPresetRow}>
                  {customFieldPresets.map((preset) => (
                    <button key={preset} className={styles.customFieldPreset} onClick={() => handleAddCustomField(preset)}>
                      + {preset}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className={styles.fieldBoardHint}>提示：拖动属性卡标题可移动位置，使用 +/-W、+/-H 调整宽高跨度。</div>
            <div className={styles.fieldBoardFullPage} ref={fieldBoardRef}>
              {selectedCard.customFields.length > 0 ? (
                selectedCard.customFields.map((field, index) => {
                  const spanW = Math.max(1, Math.min(4, field.w ?? 1));
                  const spanH = Math.max(1, Math.min(4, field.h ?? 1));
                  return (
                    <div
                      key={field.id ?? `${field.name}-${index}`}
                      className={`${styles.customFieldItem} ${styles.fieldBoardItem} ${fieldDragState?.fieldId === field.id ? styles.draggingField : ''}`}
                      style={{
                        left: field.x ?? 0,
                        top: field.y ?? 0,
                        width: spanW * FIELD_UNIT_WIDTH,
                        minHeight: spanH * FIELD_UNIT_HEIGHT,
                      }}
                    >
                      <div className={styles.fieldCardHead} onMouseDown={(event) => onFieldMouseDown(event, field)}>
                        <span className={styles.fieldCardHandle}>拖动</span>
                        <div className={styles.managerActions}>
                          <button className={styles.customFieldSizeButton} onMouseDown={(event) => event.stopPropagation()} onClick={() => handleUpdateCustomField(index, { w: Math.max(1, spanW - 1) })}>-W</button>
                          <button className={styles.customFieldSizeButton} onMouseDown={(event) => event.stopPropagation()} onClick={() => handleUpdateCustomField(index, { w: Math.min(4, spanW + 1) })}>+W</button>
                          <button className={styles.customFieldSizeButton} onMouseDown={(event) => event.stopPropagation()} onClick={() => handleUpdateCustomField(index, { h: Math.max(1, spanH - 1) })}>-H</button>
                          <button className={styles.customFieldSizeButton} onMouseDown={(event) => event.stopPropagation()} onClick={() => handleUpdateCustomField(index, { h: Math.min(4, spanH + 1) })}>+H</button>
                        </div>
                      </div>
                      <input
                        className={styles.detailInput}
                        value={field.name}
                        onChange={(event) => handleUpdateCustomField(index, { name: event.target.value })}
                        placeholder="属性名"
                      />
                      <textarea
                        className={styles.detailTextarea}
                        rows={Math.max(3, spanH * 2)}
                        value={field.value}
                        onChange={(event) => handleUpdateCustomField(index, { value: event.target.value })}
                        placeholder="属性值"
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        className={styles.inlineActionButton}
                        onClick={() => handleDeleteCustomField(index)}
                      >
                        删除属性
                      </Button>
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
