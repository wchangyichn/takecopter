import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card } from '../components/ui';
import type { Story } from '../types';
import styles from './HomeView.module.css';

const MODEL_KEY_STORAGE = 'takecopter.desktop.model-api-keys.v1';
const MODEL_OPTIONS = [
  { id: 'openai:gpt-4.1', label: 'OpenAI GPT-4.1' },
  { id: 'anthropic:claude-3.7-sonnet', label: 'Anthropic Claude 3.7 Sonnet' },
  { id: 'deepseek:deepseek-chat', label: 'DeepSeek Chat' },
  { id: 'qwen:qwen-max', label: 'Qwen Max' },
] as const;

type ModelApiKeyEntry = {
  apiKey: string;
  endpoint?: string;
  updatedAt: string;
};

type ModelApiKeyState = Record<string, ModelApiKeyEntry>;

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

        return [[modelId, { apiKey: source.apiKey, endpoint: typeof source.endpoint === 'string' ? source.endpoint : undefined, updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : new Date().toISOString() }]];
      })
    );
  } catch {
    return {};
  }
}

function maskApiKey(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '未配置';
  }
  if (trimmed.length <= 8) {
    return `${trimmed.slice(0, 2)}***`;
  }
  return `${trimmed.slice(0, 4)}***${trimmed.slice(-4)}`;
}

interface HomeViewProps {
  stories: Story[];
  onStorySelect: (id: string) => void;
  onCreateStory: () => void;
  onExportProject: () => void;
  onBackupLocalDatabase: () => void;
  onRelinkLocalDatabase: () => void;
  onImportProject: (file: File) => void;
  onOpenStoryFolder: (id: string) => void;
  onOpenStoryDatabase: (id: string) => void;
  onExportStory: (id: string) => void;
  onRenameStory: (id: string) => void;
}

export function HomeView({
  stories,
  onStorySelect,
  onCreateStory,
  onExportProject,
  onBackupLocalDatabase,
  onRelinkLocalDatabase,
  onImportProject,
  onOpenStoryFolder,
  onOpenStoryDatabase,
  onExportStory,
  onRenameStory,
}: HomeViewProps) {
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const [isModelKeyManagerOpen, setIsModelKeyManagerOpen] = useState(false);
  const [modelApiKeys, setModelApiKeys] = useState<ModelApiKeyState>(() => readModelApiKeys());
  const [activeModelId, setActiveModelId] = useState<string>(MODEL_OPTIONS[0].id);
  const [draftApiKey, setDraftApiKey] = useState('');
  const [draftEndpoint, setDraftEndpoint] = useState('');
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const configuredModelCount = useMemo(
    () => Object.values(modelApiKeys).filter((entry) => entry.apiKey.trim().length > 0).length,
    [modelApiKeys]
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(MODEL_KEY_STORAGE, JSON.stringify(modelApiKeys));
  }, [modelApiKeys]);

  const openModelKeyManager = () => {
    const entry = modelApiKeys[activeModelId];
    setDraftApiKey(entry?.apiKey ?? '');
    setDraftEndpoint(entry?.endpoint ?? '');
    setIsModelKeyManagerOpen(true);
  };

  const handleSwitchModelForKey = (modelId: string) => {
    setActiveModelId(modelId);
    const entry = modelApiKeys[modelId];
    setDraftApiKey(entry?.apiKey ?? '');
    setDraftEndpoint(entry?.endpoint ?? '');
  };

  const handleSaveModelKey = () => {
    const apiKey = draftApiKey.trim();
    if (!apiKey) {
      return;
    }

    setModelApiKeys((prev) => ({
      ...prev,
      [activeModelId]: {
        apiKey,
        endpoint: draftEndpoint.trim() || undefined,
        updatedAt: new Date().toISOString(),
      },
    }));
  };

  const handleDeleteModelKey = () => {
    setModelApiKeys((prev) => {
      if (!(activeModelId in prev)) {
        return prev;
      }
      const next = { ...prev };
      delete next[activeModelId];
      return next;
    });
    setDraftApiKey('');
    setDraftEndpoint('');
  };

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
                  onExportStory={onExportStory}
                  onRenameStory={onRenameStory}
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
                <span>导入故事/项目文件</span>
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
              <button className={styles.actionItem} onClick={onBackupLocalDatabase}>
                <span className={styles.actionIcon} style={{ background: 'var(--rose-100)', color: 'var(--rose-600)' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <path d="M7 10l5 5 5-5" />
                    <path d="M12 15V3" />
                  </svg>
                </span>
                <span>备份本机数据库</span>
              </button>
              <button className={styles.actionItem} onClick={onRelinkLocalDatabase}>
                <span className={styles.actionIcon} style={{ background: 'var(--slate-200)', color: 'var(--slate-700)' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 4v6h6" />
                    <path d="M20 20v-6h-6" />
                    <path d="M5.64 15A9 9 0 0 0 20 12.36M4 11.64A9 9 0 0 1 18.36 9" />
                  </svg>
                </span>
                <span>重新链接本地数据库</span>
              </button>
              <button className={styles.actionItem} onClick={openModelKeyManager}>
                <span className={styles.actionIcon} style={{ background: 'var(--violet-100)', color: 'var(--violet-600)' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 15v2m0-10v2m5 3h2M5 12H3m14.95 4.95 1.41 1.41M5.64 5.64 4.22 4.22m13.73-0.01-1.41 1.41M5.64 18.36l-1.42 1.42" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </span>
                <span>模型密钥设置</span>
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

      {isModelKeyManagerOpen && (
        <div className={styles.modalOverlay} role="presentation" onClick={() => setIsModelKeyManagerOpen(false)}>
          <div className={styles.modalCard} role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <h3>模型密钥设置</h3>
            <p className={styles.modalHint}>密钥需手动输入，仅保存在当前设备。不同模型可同时保存，方便切换。</p>
            <p className={styles.modalMeta}>已配置模型：{configuredModelCount}/{MODEL_OPTIONS.length}</p>
            <div className={styles.modalRow}>
              <select className={styles.modalInput} value={activeModelId} onChange={(event) => handleSwitchModelForKey(event.target.value)}>
                {MODEL_OPTIONS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
              <input className={styles.modalInput} value={draftApiKey} onChange={(event) => setDraftApiKey(event.target.value)} placeholder="请输入 API Key" />
              <input className={styles.modalInput} value={draftEndpoint} onChange={(event) => setDraftEndpoint(event.target.value)} placeholder="可选：自定义 Endpoint" />
              <div className={styles.modalActions}>
                <Button size="sm" variant="secondary" onClick={handleSaveModelKey}>保存密钥</Button>
                <Button size="sm" variant="ghost" onClick={handleDeleteModelKey}>删除当前密钥</Button>
              </div>
            </div>
            <div className={styles.modelList}>
              {MODEL_OPTIONS.map((item) => {
                const entry = modelApiKeys[item.id];
                return (
                  <div key={item.id} className={styles.modelItem}>
                    <span>{item.label}</span>
                    <span>{entry ? maskApiKey(entry.apiKey) : '未配置'}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
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
  onExportStory: (id: string) => void;
  onRenameStory: (id: string) => void;
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
  onExportStory,
  onRenameStory,
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
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
                </svg>
              </button>
              <button
                className={styles.cardAction}
                aria-label="导出单个故事"
                onClick={(e) => {
                  e.stopPropagation();
                  onExportStory(story.id);
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 3v12" />
                  <path d="M7 10l5 5 5-5" />
                  <path d="M5 21h14" />
                </svg>
              </button>
              <button
                className={styles.cardAction}
                aria-label="重命名故事"
                onClick={(e) => {
                  e.stopPropagation();
                  onRenameStory(story.id);
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                </svg>
              </button>
              <button
                className={styles.cardAction}
                aria-label="打开故事数据库"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenStoryDatabase(story.id);
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="8" rx="1" />
                  <rect x="3" y="13" width="18" height="8" rx="1" />
                  <line x1="8" y1="7" x2="8.01" y2="7" />
                  <line x1="8" y1="17" x2="8.01" y2="17" />
                </svg>
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
