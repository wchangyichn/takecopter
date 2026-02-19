import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { Button, Panel } from '../components/ui';
import type { SettingCard, SettingTag } from '../types';
import styles from './SettingView.module.css';

const typeLabels: Record<SettingCard['type'], string> = {
  character: '角色',
  location: '地点',
  item: '道具',
  event: '事件',
};

const cardPalette = ['var(--coral-400)', 'var(--violet-400)', 'var(--teal-400)', 'var(--amber-400)', 'var(--rose-400)'];
const UNCATEGORIZED_KEY = '__uncategorized__';

interface DragState {
  id: string;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
}

interface SettingViewProps {
  cards: SettingCard[];
  onCardsChange: (cards: SettingCard[]) => void;
}

type EditableCard = SettingCard & { tags: SettingTag[] };

function normalizeTagName(value: string): string {
  return value.trim();
}

function normalizeCards(cards: SettingCard[]): EditableCard[] {
  return cards.map((card) => ({
    ...card,
    tags: (card.tags ?? []).map((tag) => ({ ...tag })),
  }));
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

function cardInCategory(card: EditableCard, categoryKey: string): boolean {
  if (categoryKey === 'all') {
    return true;
  }
  if (categoryKey === UNCATEGORIZED_KEY) {
    return !card.category;
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

export function SettingView({ cards: sourceCards, onCardsChange }: SettingViewProps) {
  const [cards, setCards] = useState<EditableCard[]>(() => normalizeCards(sourceCards));
  const [selectedCardId, setSelectedCardId] = useState<string | null>(() => sourceCards[0]?.id ?? null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<string>('all');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  const [activeTagFilters, setActiveTagFilters] = useState<string[]>([]);
  const [toolbarTagSearchOpen, setToolbarTagSearchOpen] = useState(false);
  const [toolbarTagQuery, setToolbarTagQuery] = useState('');
  const [toolbarTagActiveIndex, setToolbarTagActiveIndex] = useState(0);

  const [detailTagSearchOpen, setDetailTagSearchOpen] = useState(false);
  const [detailTagQuery, setDetailTagQuery] = useState('');
  const [detailTagActiveIndex, setDetailTagActiveIndex] = useState(0);
  const [detailNewCategory, setDetailNewCategory] = useState('');

  const [isTagManagerOpen, setIsTagManagerOpen] = useState(false);
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);
  const [tagManagerName, setTagManagerName] = useState('');
  const [tagManagerColor, setTagManagerColor] = useState('#ff8a6a');
  const [categoryManagerName, setCategoryManagerName] = useState('');

  const [customTags, setCustomTags] = useState<SettingTag[]>([]);
  const [categories, setCategories] = useState<string[]>(() => uniqueCategories(normalizeCards(sourceCards)));

  const [dragState, setDragState] = useState<DragState | null>(null);
  const [draggingCategory, setDraggingCategory] = useState<string | null>(null);

  const localIdRef = useRef(0);
  const cardsRef = useRef<EditableCard[]>(cards);
  const toolbarSearchRef = useRef<HTMLDivElement | null>(null);
  const detailSearchRef = useRef<HTMLDivElement | null>(null);

  const selectedCard = useMemo(() => cards.find((item) => item.id === selectedCardId) ?? null, [cards, selectedCardId]);
  const tagOptions = useMemo(() => allTags(cards, customTags), [cards, customTags]);

  const visibleCards = useMemo(() => {
    return cards.filter((card) => cardInCategory(card, selectedFolder) && cardMatchesTags(card, activeTagFilters));
  }, [activeTagFilters, cards, selectedFolder]);

  const folderEntries = useMemo(() => {
    const all = [
      { key: 'all', label: '全部设定', count: cards.length },
      ...categories.map((category) => ({
        key: category,
        label: category,
        count: cards.filter((card) => card.category === category).length,
      })),
      {
        key: UNCATEGORIZED_KEY,
        label: '未分类',
        count: cards.filter((card) => !card.category).length,
      },
    ];

    return all.filter((item) => item.count > 0 || item.key === 'all' || item.key === UNCATEGORIZED_KEY);
  }, [cards, categories]);

  const totalByCategory = useMemo(() => {
    return folderEntries.reduce<Record<string, number>>((acc, item) => {
      acc[item.key] = item.count;
      return acc;
    }, {});
  }, [folderEntries]);

  const toolbarTagCandidates = useMemo(() => {
    const query = normalizeTagName(toolbarTagQuery).toLowerCase();
    return tagOptions.filter((tag) => !query || tag.name.toLowerCase().includes(query));
  }, [tagOptions, toolbarTagQuery]);

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

  const applyCards = (updater: (prev: EditableCard[]) => EditableCard[]) => {
    setCards((prev) => {
      const next = updater(prev);
      cardsRef.current = next;
      onCardsChange(next);
      return next;
    });
  };

  useEffect(() => {
    if (!dragState) {
      return;
    }

    const handleMove = (event: MouseEvent) => {
      const deltaX = event.clientX - dragState.startX;
      const deltaY = event.clientY - dragState.startY;

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
      onCardsChange(cardsRef.current);
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

  const handleAddCard = () => {
    const nextIndex = cards.length + 1;
    localIdRef.current += 1;
    const created: EditableCard = {
      id: `card-local-${localIdRef.current}`,
      title: `空设定 ${nextIndex}`,
      type: 'event',
      summary: '',
      content: '',
      imageUrl: undefined,
      category: undefined,
      tags: [],
      color: cardPalette[nextIndex % cardPalette.length],
      position: {
        x: 120 + (nextIndex % 5) * 56,
        y: 100 + (nextIndex % 4) * 56,
      },
      relations: [],
    };

    applyCards((prev) => [...prev, created]);
    setSelectedCardId(created.id);
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      next.add(UNCATEGORIZED_KEY);
      return next;
    });
  };

  const updateSelectedCard = (updater: (card: EditableCard) => EditableCard) => {
    if (!selectedCard) {
      return;
    }

    applyCards((prev) => prev.map((item) => (item.id === selectedCard.id ? updater(item) : item)));
  };

  const handleAssignCategory = (category: string) => {
    const normalized = category.trim();
    updateSelectedCard((card) => ({ ...card, category: normalized || undefined }));
    if (normalized && !categories.includes(normalized)) {
      setCategories((prev) => [...prev, normalized]);
    }
  };

  const handleAddCategory = () => {
    const value = categoryManagerName.trim();
    if (!value || categories.includes(value)) {
      return;
    }

    setCategories((prev) => [...prev, value]);
    setCategoryManagerName('');
  };

  const handleDeleteCategory = (name: string) => {
    setCategories((prev) => prev.filter((category) => category !== name));
    applyCards((prev) => prev.map((card) => (card.category === name ? { ...card, category: undefined } : card)));
    if (selectedFolder === name) {
      setSelectedFolder('all');
    }
  };

  const handleUploadImage = async (file: File) => {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(new Error('图片读取失败'));
      reader.readAsDataURL(file);
    });

    updateSelectedCard((card) => ({
      ...card,
      imageUrl: dataUrl,
    }));
  };

  const upsertGlobalTag = (name: string, color: string) => {
    const normalized = normalizeTagName(name);
    if (!normalized) {
      return;
    }

    setCustomTags((prev) => {
      const exists = prev.some((tag) => tag.name === normalized);
      if (exists) {
        return prev.map((tag) => (tag.name === normalized ? { ...tag, color } : tag));
      }
      return [...prev, { name: normalized, color }];
    });
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

    upsertGlobalTag(normalized, tagManagerColor);
    setTagManagerName('');
  };

  const handleSetTagColor = (name: string, color: string) => {
    upsertGlobalTag(name, color);
    applyCards((prev) =>
      prev.map((card) => ({
        ...card,
        tags: card.tags.map((tag) => (tag.name === name ? { ...tag, color } : tag)),
      }))
    );
  };

  const handleDeleteTag = (name: string) => {
    setCustomTags((prev) => prev.filter((tag) => tag.name !== name));
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

    upsertGlobalTag(normalized, tagManagerColor);
    setActiveTagFilters((prev) => (prev.includes(normalized) ? prev : [...prev, normalized]));
    setToolbarTagQuery('');
    setToolbarTagSearchOpen(false);
    setToolbarTagActiveIndex(0);
  };

  const createAndAddDetailTag = () => {
    const normalized = normalizeTagName(detailTagQuery);
    if (!normalized) {
      return;
    }

    upsertGlobalTag(normalized, tagManagerColor);
    addTagToSelected(normalized, tagManagerColor);
    setDetailTagQuery('');
    setDetailTagSearchOpen(false);
    setDetailTagActiveIndex(0);
  };

  const reorderCategories = (from: string, to: string) => {
    if (from === to) {
      return;
    }

    setCategories((prev) => {
      const fromIndex = prev.indexOf(from);
      const toIndex = prev.indexOf(to);
      if (fromIndex === -1 || toIndex === -1) {
        return prev;
      }
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
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
            <button className={styles.addButton} aria-label="新建设定卡片" onClick={handleAddCard}>
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
            <Button size="sm" variant="secondary" className={styles.toolboxActionButton} onClick={() => setToolbarTagSearchOpen((prev) => !prev)}>
              {toolbarTagSearchOpen ? '收起标签搜索' : '标签搜索'}
            </Button>
          </div>

          {toolbarTagSearchOpen && (
            <div className={styles.tagSearchWrap} ref={toolbarSearchRef}>
              <input
                className={styles.tagInput}
                value={toolbarTagQuery}
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
                {toolbarTagCandidates.map((tag, index) => (
                  <button
                    key={tag.name}
                    className={`${styles.tagSearchItem} ${index === toolbarTagActiveIndex ? styles.activeSearchItem : ''}`}
                    onMouseEnter={() => setToolbarTagActiveIndex(index)}
                    onClick={() => toggleTagFilter(tag.name)}
                  >
                    <span className={styles.tagDot} style={{ background: tag.color }} />
                    {activeTagFilters.includes(tag.name) ? '取消筛选' : '按标签筛选'}：{tag.name}
                  </button>
                ))}
                {normalizeTagName(toolbarTagQuery) && !tagOptions.some((tag) => tag.name === normalizeTagName(toolbarTagQuery)) && (
                  <button className={styles.tagCreateItem} onClick={createAndUseToolbarTag}>
                    创建并筛选标签 “{normalizeTagName(toolbarTagQuery)}”
                  </button>
                )}
              </div>
            </div>
          )}

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
          {folderEntries.map((folder) => {
            const isExpanded = expandedFolders.has(folder.key) || selectedFolder === folder.key;
            const scopedCards = cards.filter((card) => cardInCategory(card, folder.key) && cardMatchesTags(card, activeTagFilters));
            return (
              <div key={folder.key} className={styles.folderBlock}>
                <button
                  className={`${styles.folderHeader} ${selectedFolder === folder.key ? styles.folderHeaderActive : ''}`}
                  draggable={folder.key !== 'all' && folder.key !== UNCATEGORIZED_KEY}
                  onDragStart={() => {
                    if (folder.key !== 'all' && folder.key !== UNCATEGORIZED_KEY) {
                      setDraggingCategory(folder.key);
                    }
                  }}
                  onDragOver={(event) => {
                    if (!draggingCategory || draggingCategory === folder.key) {
                      return;
                    }
                    if (folder.key === 'all' || folder.key === UNCATEGORIZED_KEY) {
                      return;
                    }
                    event.preventDefault();
                  }}
                  onDrop={() => {
                    if (!draggingCategory) {
                      return;
                    }
                    if (folder.key === 'all' || folder.key === UNCATEGORIZED_KEY) {
                      return;
                    }
                    reorderCategories(draggingCategory, folder.key);
                    setDraggingCategory(null);
                  }}
                  onDragEnd={() => setDraggingCategory(null)}
                  onClick={() => {
                    setSelectedFolder(folder.key);
                    setExpandedFolders((prev) => {
                      const next = new Set(prev);
                      if (next.has(folder.key)) {
                        next.delete(folder.key);
                      } else {
                        next.add(folder.key);
                      }
                      return next;
                    });
                  }}
                >
                  <span className={styles.folderHeaderLeft}>
                    <span className={styles.folderIcon}>📂</span>
                    {folder.label}
                  </span>
                  <span className={styles.folderCount}>{folder.key === 'all' ? visibleCards.length : scopedCards.length}</span>
                </button>
                {isExpanded && (
                  <ul className={styles.folderCardList}>
                    {(folder.key === 'all' ? visibleCards : scopedCards).map((card) => (
                      <li
                        key={card.id}
                        className={`${styles.listItem} ${selectedCardId === card.id ? styles.selected : ''}`}
                        onClick={() => setSelectedCardId(card.id)}
                      >
                        <span className={styles.listItemDot} style={{ background: card.color }} />
                        <div className={styles.listItemContent}>
                          <span className={styles.listItemTitle}>{card.title}</span>
                          <span className={styles.listItemType}>
                            {card.tags.length > 0 ? card.tags.map((tag) => tag.name).join(' · ') : '无标签'}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
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
              {folderEntries.map((item) => (
                <li key={item.key} className={styles.summaryItem}>
                  <span>{item.label}</span>
                  <strong>{item.key === 'all' ? cards.length : totalByCategory[item.key] ?? 0}</strong>
                </li>
              ))}
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
                  <span className={styles.canvasCardType}>{typeLabels[card.type]}</span>
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

      {selectedCard && (
        <Panel side="right" width="440px" className={styles.detailPanel}>
          <div className={styles.detailHeader}>
            <span className={styles.detailType} style={{ color: selectedCard.color }}>
              {typeLabels[selectedCard.type]}
            </span>
            <h2 className={styles.detailTitle}>设定详情</h2>
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
            <select
              className={styles.categorySelect}
              value={selectedCard.category ?? ''}
              onChange={(event) => handleAssignCategory(event.target.value)}
            >
              <option value="">未分类</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
            <div className={styles.detailQuickCreateRow}>
              <input
                className={styles.detailInput}
                value={detailNewCategory}
                onChange={(event) => setDetailNewCategory(event.target.value)}
                placeholder="新增分类并应用到当前卡片"
              />
              <Button
                size="sm"
                variant="secondary"
                className={styles.inlineActionButton}
                onClick={() => {
                  const normalized = detailNewCategory.trim();
                  if (!normalized) {
                    return;
                  }
                  if (!categories.includes(normalized)) {
                    setCategories((prev) => [...prev, normalized]);
                  }
                  handleAssignCategory(normalized);
                  setDetailNewCategory('');
                }}
              >
                添加并应用
              </Button>
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

            <div className={styles.tagPalette}>
              <Button size="sm" variant="secondary" className={styles.inlineActionButton} onClick={() => setDetailTagSearchOpen((prev) => !prev)}>
                {detailTagSearchOpen ? '收起标签输入' : '添加标签'}
              </Button>

              {detailTagSearchOpen && (
                <div className={styles.tagSearchWrap} ref={detailSearchRef}>
                  <input
                    className={styles.detailInput}
                    value={detailTagQuery}
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
                    {detailTagCandidates.map((tag, index) => (
                      <button
                        key={tag.name}
                        className={`${styles.tagSearchItem} ${index === detailTagActiveIndex ? styles.activeSearchItem : ''}`}
                        onMouseEnter={() => setDetailTagActiveIndex(index)}
                        onClick={() => {
                          addTagToSelected(tag.name, tag.color);
                          setDetailTagQuery('');
                          setDetailTagSearchOpen(false);
                        }}
                      >
                        <span className={styles.tagDot} style={{ background: tag.color }} />
                        添加标签：{tag.name}
                      </button>
                    ))}
                    {normalizeTagName(detailTagQuery) && !tagOptions.some((tag) => tag.name === normalizeTagName(detailTagQuery)) && (
                      <button className={styles.tagCreateItem} onClick={createAndAddDetailTag}>
                        创建并添加标签 “{normalizeTagName(detailTagQuery)}”
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className={styles.detailSection}>
            <h4>摘要</h4>
            <textarea
              className={styles.detailTextarea}
              rows={3}
              value={selectedCard.summary}
              onChange={(event) => {
                const value = event.target.value;
                updateSelectedCard((card) => ({ ...card, summary: value }));
              }}
            />
          </div>

          <div className={styles.detailSection}>
            <h4>详细内容</h4>
            <textarea
              className={styles.detailTextarea}
              rows={6}
              value={selectedCard.content ?? ''}
              onChange={(event) => {
                const value = event.target.value;
                updateSelectedCard((card) => ({ ...card, content: value }));
              }}
            />
          </div>

          <div className={styles.detailSection}>
            <h4>图片素材</h4>
            <label className={styles.uploadButton}>
              上传图片
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    void handleUploadImage(file);
                    event.currentTarget.value = '';
                  }
                }}
              />
            </label>
            {selectedCard.imageUrl ? (
              <div className={styles.imagePreviewWrap}>
                <img src={selectedCard.imageUrl} alt={`${selectedCard.title} 预览`} className={styles.imagePreview} />
                <Button
                  variant="ghost"
                  size="sm"
                  className={styles.inlineActionButton}
                  onClick={() => {
                    updateSelectedCard((card) => ({ ...card, imageUrl: undefined }));
                  }}
                >
                  移除图片
                </Button>
              </div>
            ) : (
              <p className={styles.emptyState}>未上传图片</p>
            )}
          </div>

          <button className={styles.closeDetail} onClick={() => setSelectedCardId(null)} aria-label="关闭详情">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </Panel>
      )}

      {isTagManagerOpen && (
        <div className={styles.managerOverlay} role="presentation" onClick={() => setIsTagManagerOpen(false)}>
          <div className={styles.managerCard} role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className={styles.managerHeader}>
              <h3>标签管理器</h3>
            </div>
            <div className={styles.managerRow}>
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
              {tagOptions.map((tag) => (
                <div key={tag.name} className={styles.managerListItem}>
                  <span className={styles.managerTagName}>
                    <span className={styles.tagDot} style={{ background: tag.color }} />
                    {tag.name}
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
                  <span className={styles.managerTagName}>{category}</span>
                  <Button size="sm" variant="ghost" className={styles.inlineActionButton} onClick={() => handleDeleteCategory(category)}>
                    删除
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
