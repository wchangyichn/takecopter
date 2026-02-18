import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { Panel } from '../components/ui';
import type { SettingCard } from '../types';
import styles from './SettingView.module.css';

const typeLabels: Record<SettingCard['type'], string> = {
  character: '角色',
  location: '地点',
  item: '道具',
  event: '事件',
};

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

export function SettingView({ cards: sourceCards, onCardsChange }: SettingViewProps) {
  const [cards, setCards] = useState<SettingCard[]>(() => sourceCards.map((item) => ({ ...item })));
  const [selectedCardId, setSelectedCardId] = useState<string | null>(() => sourceCards[0]?.id ?? null);
  const [filter, setFilter] = useState<SettingCard['type'] | 'all'>('all');
  const [dragState, setDragState] = useState<DragState | null>(null);
  const cardsRef = useRef<SettingCard[]>(cards);

  useEffect(() => {
    cardsRef.current = cards;
  }, [cards]);

  const selectedCard = useMemo(
    () => cards.find((item) => item.id === selectedCardId) ?? null,
    [cards, selectedCardId]
  );

  const filteredCards = useMemo(
    () => (filter === 'all' ? cards : cards.filter((item) => item.type === filter)),
    [cards, filter]
  );

  useEffect(() => {
    if (!dragState) {
      return;
    }

    const handleMove = (event: MouseEvent) => {
      const deltaX = event.clientX - dragState.startX;
      const deltaY = event.clientY - dragState.startY;

      setCards((prev) =>
        prev.map((card) => {
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
        })
      );
    };

    const handleUp = () => {
      if (dragState) {
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

  const onCardMouseDown = (event: ReactMouseEvent<HTMLDivElement>, card: SettingCard) => {
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

  return (
    <div className={styles.container}>
      <Panel side="left" width="280px" className={styles.listPanel}>
        <div className={styles.panelHeader}>
          <h3>设定卡片</h3>
          <button className={styles.addButton} aria-label="新建设定卡片">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>

        <div className={styles.filterTabs} role="tablist" aria-label="按类型筛选">
          {(['all', 'character', 'location', 'item', 'event'] as const).map((item) => (
            <button
              key={item}
              role="tab"
              aria-selected={filter === item}
              className={`${styles.filterTab} ${filter === item ? styles.active : ''}`}
              onClick={() => setFilter(item)}
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
                <span className={styles.listItemType}>{typeLabels[card.type]}</span>
              </div>
            </li>
          ))}
        </ul>
      </Panel>

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
        <Panel side="right" width="340px" className={styles.detailPanel}>
          <div className={styles.detailHeader}>
            <span className={styles.detailType} style={{ color: selectedCard.color }}>
              {typeLabels[selectedCard.type]}
            </span>
            <h2 className={styles.detailTitle}>{selectedCard.title}</h2>
          </div>

          <div className={styles.detailSection}>
            <h4>摘要</h4>
            <p>{selectedCard.summary}</p>
          </div>

          <div className={styles.detailSection}>
            <h4>关联关系（{selectedCard.relations.length}）</h4>
            {selectedCard.relations.length > 0 ? (
              <ul className={styles.relationList}>
                {selectedCard.relations.map((relation) => {
                  const target = cards.find((item) => item.id === relation.targetId);
                  return target ? (
                    <li key={relation.targetId} className={styles.relationItem}>
                      <span className={styles.relationType}>{relation.type}</span>
                      <span className={styles.relationTarget}>{target.title}</span>
                    </li>
                  ) : null;
                })}
              </ul>
            ) : (
              <p className={styles.emptyState}>暂无关系</p>
            )}
          </div>

          <div className={styles.detailSection}>
            <h4>标签</h4>
            <div className={styles.tagList}>
              <span className={styles.tag}>主线</span>
              <span className={styles.tag}>关键设定</span>
            </div>
          </div>

          <button className={styles.closeDetail} onClick={() => setSelectedCardId(null)} aria-label="关闭详情">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </Panel>
      )}
    </div>
  );
}
