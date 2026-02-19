import { useRef, useState } from 'react';
import { Button, Card } from '../components/ui';
import type { Story } from '../types';
import styles from './HomeView.module.css';

interface HomeViewProps {
  stories: Story[];
  onStorySelect: (id: string) => void;
  onCreateStory: () => void;
  onExportProject: () => void;
  onImportProject: (file: File) => void;
  onOpenStoryFolder: (id: string) => void;
  onOpenStoryDatabase: (id: string) => void;
}

export function HomeView({
  stories,
  onStorySelect,
  onCreateStory,
  onExportProject,
  onImportProject,
  onOpenStoryFolder,
  onOpenStoryDatabase,
}: HomeViewProps) {
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const formatDate = (date: Date) => {
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (diff === 0) return '今天';
    if (diff === 1) return '昨天';
    if (diff < 7) return `${diff} 天前`;
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <h2>故事首页</h2>
          <p>新建故事、查看故事列表，并进入故事页面继续创作</p>
        </div>
        <Button size="lg" onClick={onCreateStory}>
          <span aria-hidden="true">+</span> 创建新故事
        </Button>
      </header>

      <div className={styles.layout}>
        <section className={styles.storiesSection} aria-label="故事列表">
          {stories.length > 0 ? (
            <div className={styles.storyGrid}>
              {stories.map((story, index) => (
                <StoryCard
                  key={story.id}
                  story={story}
                  index={index}
                  isHovered={hoveredCard === story.id}
                  onHover={setHoveredCard}
                  onSelect={onStorySelect}
                  formattedDate={formatDate(story.updatedAt)}
                  onOpenStoryFolder={onOpenStoryFolder}
                  onOpenStoryDatabase={onOpenStoryDatabase}
                />
              ))}
            </div>
          ) : (
            <Card className={styles.emptyCard}>
              <h3>还没有故事项目</h3>
              <p>从「创建新故事」开始，搭建你的设定与创作流程。</p>
              <Button onClick={onCreateStory}>立即创建</Button>
            </Card>
          )}
        </section>

        <aside className={styles.sidebar}>
          <Card variant="elevated" className={styles.quickActions}>
            <h3>快捷操作</h3>
            <div className={styles.actionList}>
              <button
                className={styles.actionItem}
                onClick={() => {
                  importInputRef.current?.click();
                }}
              >
                <span className={styles.actionIcon} style={{ background: 'var(--teal-100)', color: 'var(--teal-600)' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17,8 12,3 7,8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </span>
                <span>导入故事项目</span>
              </button>
              <button className={styles.actionItem} onClick={() => console.log('Templates')}>
                <span className={styles.actionIcon} style={{ background: 'var(--violet-100)', color: 'var(--violet-600)' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <line x1="3" y1="9" x2="21" y2="9" />
                    <line x1="9" y1="21" x2="9" y2="9" />
                  </svg>
                </span>
                <span>浏览故事模板</span>
              </button>
              <button className={styles.actionItem} onClick={onExportProject}>
                <span className={styles.actionIcon} style={{ background: 'var(--amber-100)', color: 'var(--amber-600)' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                </span>
                <span>备份全部项目</span>
              </button>
            </div>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  onImportProject(file);
                  event.currentTarget.value = '';
                }
              }}
            />
          </Card>

          <Card variant="glass" className={styles.recentPanel}>
            <h3>最近编辑</h3>
            <ul className={styles.activityList}>
              <li className={styles.activityItem}>
                <span className={styles.activityDot} style={{ background: 'var(--coral-400)' }} />
                <span className={styles.activityText}>编辑了 <strong>星港迷雾</strong></span>
                <span className={styles.activityTime}>2 小时前</span>
              </li>
              <li className={styles.activityItem}>
                <span className={styles.activityDot} style={{ background: 'var(--violet-400)' }} />
                <span className={styles.activityText}>在 <strong>回声之城</strong> 新增角色</span>
                <span className={styles.activityTime}>5 小时前</span>
              </li>
              <li className={styles.activityItem}>
                <span className={styles.activityDot} style={{ background: 'var(--teal-400)' }} />
                <span className={styles.activityText}>完成了第 3 场景</span>
                <span className={styles.activityTime}>昨天</span>
              </li>
            </ul>
          </Card>
        </aside>
      </div>
    </div>
  );
}

interface StoryCardProps {
  story: Story;
  index: number;
  isHovered: boolean;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  formattedDate: string;
  onOpenStoryFolder: (id: string) => void;
  onOpenStoryDatabase: (id: string) => void;
}

function StoryCard({
  story,
  index,
  isHovered,
  onHover,
  onSelect,
  formattedDate,
  onOpenStoryFolder,
  onOpenStoryDatabase,
}: StoryCardProps) {
  return (
    <Card
      variant="elevated"
      color={story.coverColor}
      interactive
      padding="none"
      className={styles.storyCard}
      style={{ animationDelay: `${index * 60}ms` }}
      onMouseEnter={() => onHover(story.id)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onSelect(story.id)}
    >
      <div className={styles.cardCover} style={{ background: `linear-gradient(135deg, ${story.coverColor}, ${story.coverColor}dd)` }}>
        <div className={styles.cardCoverInner}>
          <span className={styles.cardIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </span>
        </div>
      </div>
      <div className={styles.cardContent}>
        <h4 className={styles.cardTitle}>{story.title}</h4>
        <p className={styles.cardDesc}>{story.description}</p>
        <div className={styles.cardMeta}>
          <span className={styles.cardDate}>最近编辑：{formattedDate}</span>
          {isHovered && (
            <div className={styles.cardActions}>
              <button
                className={styles.cardAction}
                aria-label="打开故事文件夹"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenStoryFolder(story.id);
                }}
              >
                📁
              </button>
              <button
                className={styles.cardAction}
                aria-label="打开故事数据库"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenStoryDatabase(story.id);
                }}
              >
                🗄️
              </button>
              <button className={styles.cardAction} aria-label="进入故事页面" onClick={(e) => { e.stopPropagation(); onSelect(story.id); }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12,5 19,12 12,19" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
