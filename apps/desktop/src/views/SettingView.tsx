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

const typeOrder: SettingCard['type'][] = ['character', 'location', 'item', 'event'];
const cardPalette = ['var(--coral-400)', 'var(--violet-400)', 'var(--teal-400)', 'var(--amber-400)', 'var(--rose-400)'];

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

function normalizeCards(cards: SettingCard[]): EditableCard[] {
  return cards.map((card) => ({
    ...card,
    tags: (card.tags ?? []).map((tag) => ({ ...tag })),
  }));
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

function allTags(cards: EditableCard[], extraTags: SettingTag[] = []): SettingTag[] {
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

function normalizeTagName(value: string): string {
  return value.trim();
}

export function SettingView({ cards: sourceCards, onCardsChange }: SettingViewProps) {
  const [cards, setCards] = useState<EditableCard[]>(() => normalizeCards(sourceCards));
  const [selectedCardId, setSelectedCardId] = useState<string | null>(() => sourceCards[0]?.id ?? null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<SettingCard['type'] | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [tagManagerName, setTagManagerName] = useState('');
  const [tagManagerColor, setTagManagerColor] = useState('#ff8a6a');
  const [detailNewCategory, setDetailNewCategory] = useState('');
  const [tagSearchQuery, setTagSearchQuery] = useState('');
  const [tagSearchOpen, setTagSearchOpen] = useState(false);
  const [isTagManagerOpen, setIsTagManagerOpen] = useState(false);
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);
  const [categoryManagerName, setCategoryManagerName] = useState('');
  const [customTags, setCustomTags] = useState<SettingTag[]>([]);
  const [categories, setCategories] = useState<string[]>(() => uniqueCategories(normalizeCards(sourceCards)));
  const [dragState, setDragState] = useState<DragState | null>(null);
  const localIdRef = useRef(0);
  const cardsRef = useRef<EditableCard[]>(cards);

  const selectedCard = useMemo(() => cards.find((item) => item.id === selectedCardId) ?? null, [cards, selectedCardId]);
  const tagOptions = useMemo(() => allTags(cards, customTags), [cards, customTags]);

  const totalByType = useMemo(() => {
    return typeOrder.reduce<Record<SettingCard['type'], number>>((acc, type) => {
      acc[type] = cards.filter((item) => item.type === type).length;
      return acc;
    }, { character: 0, location: 0, item: 0, event: 0 });
  }, [cards]);

  const totalByCategory = useMemo(() => {
    return categories.reduce<Record<string, number>>((acc, category) => {
      acc[category] = cards.filter((item) => item.category === category).length;
      return acc;
    }, {});
  }, [cards, categories]);

  const filteredCards = useMemo(() => {
    return cards.filter((item) => {
      const matchType = typeFilter === 'all' || item.type === typeFilter;
      const matchCategory = categoryFilter === 'all' || item.category === categoryFilter;
      const matchTag = tagFilter === 'all' || item.tags.some((tag) => tag.name === tagFilter);
      return matchType && matchCategory && matchTag;
    });
  }, [cards, categoryFilter, tagFilter, typeFilter]);

  const tagSearchCandidates = useMemo(() => {
    const query = normalizeTagName(tagSearchQuery).toLowerCase();
    const selectedNames = new Set((selectedCard?.tags ?? []).map((tag) => tag.name));
    return tagOptions.filter((tag) => {
      if (selectedNames.has(tag.name)) {
        return false;
      }
      if (!query) {
        return true;
      }
      return tag.name.toLowerCase().includes(query);
    });
  }, [selectedCard?.tags, tagOptions, tagSearchQuery]);

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
  };

  const updateSelectedCard = (updater: (card: EditableCard) => EditableCard) => {
    if (!selectedCard) {
      return;
    }

    applyCards((prev) => prev.map((item) => (item.id === selectedCard.id ? updater(item) : item)));
  };

  const handleAssignCategory = (category: string) => {
    if (!selectedCard) {
      return;
    }

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

  const handleCreateTag = () => {
    const normalized = normalizeTagName(tagManagerName);
    if (!normalized) {
      return;
    }

    upsertGlobalTag(normalized, tagManagerColor);

    setTagManagerName('');
  };

  const handleRemoveTag = (name: string) => {
    if (!selectedCard) {
      return;
    }

    updateSelectedCard((card) => ({
      ...card,
      tags: card.tags.filter((tag) => tag.name !== name),
    }));
  };

  const handleSetTagColor = (name: string, color: string) => {
    setCustomTags((prev) => {
      const exists = prev.some((tag) => tag.name === name);
      if (!exists) {
        return [...prev, { name, color }];
      }
      return prev.map((tag) => (tag.name === name ? { ...tag, color } : tag));
    });

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
    if (tagFilter === name) {
      setTagFilter('all');
    }
  };

  const handleDeleteCategory = (name: string) => {
    setCategories((prev) => prev.filter((category) => category !== name));
    applyCards((prev) => prev.map((card) => (card.category === name ? { ...card, category: undefined } : card)));
    if (categoryFilter === name) {
      setCategoryFilter('all');
    }
  };

  const handleCreateAndAddTagFromSearch = () => {
    const normalized = normalizeTagName(tagSearchQuery);
    if (!normalized) {
      return;
    }
    upsertGlobalTag(normalized, tagManagerColor);
    addTagToSelected(normalized, tagManagerColor);
    setTagSearchQuery('');
    setTagSearchOpen(false);
  };

  return (
    <div className={styles.container}>
      <Panel side="left" width="320px" className={styles.listPanel}>
        <div className={styles.panelHeader}>
          <h3>设定卡片</h3>
          <div className={styles.panelActions}>
            <Button size="sm" variant="secondary" onClick={() => setSummaryOpen((value) => !value)}>
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
            <Button size="sm" variant="secondary" onClick={() => setIsTagManagerOpen(true)}>
              标签管理器
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setIsCategoryManagerOpen(true)}>
              分类管理器
            </Button>
          </div>
          <div className={styles.tagFilters}>
            <button
              className={`${styles.tagFilter} ${tagFilter === 'all' ? styles.activeTagFilter : ''}`}
              onClick={() => setTagFilter('all')}
            >
              全部标签
            </button>
            {tagOptions.map((tag) => (
              <button
                key={tag.name}
                className={`${styles.tagFilter} ${tagFilter === tag.name ? styles.activeTagFilter : ''}`}
                onClick={() => setTagFilter(tag.name)}
              >
                <span className={styles.tagDot} style={{ background: tag.color }} />
                {tag.name}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.filterTabs} role="tablist" aria-label="按类型筛选">
          {(['all', 'character', 'location', 'item', 'event'] as const).map((item) => (
            <button
              key={item}
              role="tab"
              aria-selected={typeFilter === item}
              className={`${styles.filterTab} ${typeFilter === item ? styles.active : ''}`}
              onClick={() => setTypeFilter(item)}
            >
              {item === 'all' ? '全部' : typeLabels[item]}
            </button>
          ))}
        </div>

        <ul className={styles.cardList}>
          {filteredCards.map((card, index) => (
            <li
              key={card.id}
              style={{ animationDelay: `${index * 40}ms` }}
              className={`${styles.listItem} ${selectedCardId === card.id ? styles.selected : ''}`}
              onClick={() => setSelectedCardId(card.id)}
            >
              <span className={styles.listItemDot} style={{ background: card.color }} />
              <div className={styles.listItemContent}>
                <span className={styles.listItemTitle}>{card.title}</span>
                <span className={styles.listItemType}>
                  {typeLabels[card.type]}
                  {card.category ? ` · ${card.category}` : ''}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      {summaryOpen && (
        <Panel side="left" width="250px" className={styles.summaryPanel}>
          <div className={styles.summaryHeader}>
            <h3>设定汇总</h3>
          </div>
          <div className={styles.summarySection}>
            <h4>类型统计</h4>
            <ul className={styles.summaryList}>
              {typeOrder.map((type) => (
                <li key={type} className={styles.summaryItem}>
                  <span>{typeLabels[type]}</span>
                  <strong>{totalByType[type]}</strong>
                </li>
              ))}
            </ul>
          </div>
          <div className={styles.summarySection}>
            <h4>分类筛选</h4>
            <div className={styles.categoryFilters}>
              <button
                className={`${styles.categoryFilter} ${categoryFilter === 'all' ? styles.activeCategory : ''}`}
                onClick={() => setCategoryFilter('all')}
              >
                全部
              </button>
              {categories.map((category) => (
                <button
                  key={category}
                  className={`${styles.categoryFilter} ${categoryFilter === category ? styles.activeCategory : ''}`}
                  onClick={() => setCategoryFilter(category)}
                >
                  {category} ({totalByCategory[category] ?? 0})
                </button>
              ))}
            </div>
            <div className={styles.categoryCreator}>
              <Button size="sm" variant="secondary" onClick={() => setIsCategoryManagerOpen(true)}>
                打开分类管理器
              </Button>
            </div>
          </div>
        </Panel>
      )}

      <div className={styles.canvasArea}>
        <div className={styles.canvas}>
          <svg className={styles.connections} aria-hidden="true">
            {cards.flatMap((card) =>
              card.relations.map((relation) => {
                const target = cards.find((item) => item.id === relation.targetId);
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

          {cards.map((card, index) => (
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

        <div className={styles.canvasControls}>
          <button className={styles.canvasControl} aria-label="放大画布">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
              <line x1="11" y1="8" x2="11" y2="14" />
              <line x1="8" y1="11" x2="14" y2="11" />
            </svg>
          </button>
          <button className={styles.canvasControl} aria-label="缩小画布">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
              <line x1="8" y1="11" x2="14" y2="11" />
            </svg>
          </button>
          <button className={styles.canvasControl} aria-label="适配画布">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
            </svg>
          </button>
        </div>
      </div>

      {selectedCard && (
        <Panel side="right" width="420px" className={styles.detailPanel}>
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
                  <button key={tag.name} className={styles.tagChip} onClick={() => handleRemoveTag(tag.name)}>
                    <span className={styles.tagDot} style={{ background: tag.color }} />
                    {tag.name}
                    <span className={styles.tagRemove}>×</span>
                  </button>
                ))
              ) : (
                <p className={styles.emptyState}>无标签</p>
              )}
            </div>
            {tagOptions.length > 0 && (
              <div className={styles.tagPalette}>
                <div className={styles.tagSearchWrap}>
                  <input
                    className={styles.detailInput}
                    value={tagSearchQuery}
                    placeholder="搜索标签或输入后创建"
                    onFocus={() => setTagSearchOpen(true)}
                    onChange={(event) => {
                      setTagSearchQuery(event.target.value);
                      setTagSearchOpen(true);
                    }}
                  />
                  {tagSearchOpen && (
                    <div className={styles.tagSearchDropdown}>
                      {tagSearchCandidates.map((tag) => (
                        <button
                          key={tag.name}
                          className={styles.tagSearchItem}
                          onClick={() => {
                            addTagToSelected(tag.name, tag.color);
                            setTagSearchQuery('');
                            setTagSearchOpen(false);
                          }}
                        >
                          <span className={styles.tagDot} style={{ background: tag.color }} />
                          {tag.name}
                        </button>
                      ))}
                      {normalizeTagName(tagSearchQuery) && !tagOptions.some((tag) => tag.name === normalizeTagName(tagSearchQuery)) && (
                        <button className={styles.tagCreateItem} onClick={handleCreateAndAddTagFromSearch}>
                          创建并添加标签 “{normalizeTagName(tagSearchQuery)}”
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
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
              <Button size="sm" variant="secondary" onClick={handleCreateTag}>
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
                    <Button size="sm" variant="ghost" onClick={() => handleDeleteTag(tag.name)}>
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
              <Button size="sm" variant="secondary" onClick={handleAddCategory}>
                保存分类
              </Button>
            </div>
            <div className={styles.managerList}>
              {categories.map((category) => (
                <div key={category} className={styles.managerListItem}>
                  <span className={styles.managerTagName}>{category}</span>
                  <Button size="sm" variant="ghost" onClick={() => handleDeleteCategory(category)}>
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
