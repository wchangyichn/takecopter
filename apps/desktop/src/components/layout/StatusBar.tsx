import type { ViewType } from '../../types';
import styles from './StatusBar.module.css';

interface StatusBarProps {
  storyTitle?: string;
  inStoryWorkspace: boolean;
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
  onBackHome: () => void;
}

export function StatusBar({ storyTitle, inStoryWorkspace, currentView, onViewChange, onBackHome }: StatusBarProps) {
  return (
    <header className={styles.statusBar}>
      <div className={styles.left}>
        {inStoryWorkspace ? (
          <>
            <button className={styles.backButton} onClick={onBackHome}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12,19 5,12 12,5" />
              </svg>
              返回首页
            </button>
            <div className={styles.storyInfo}>
              <span className={styles.storyIcon} aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                </svg>
              </span>
              <h1 className={styles.storyTitle}>{storyTitle}</h1>
            </div>
            <div className={styles.storyTabs} role="tablist" aria-label="故事页面切换">
              <button
                role="tab"
                aria-selected={currentView === 'setting'}
                className={`${styles.storyTab} ${currentView === 'setting' ? styles.activeTab : ''}`}
                onClick={() => onViewChange('setting')}
              >
                设定页
              </button>
              <button
                role="tab"
                aria-selected={currentView === 'create'}
                className={`${styles.storyTab} ${currentView === 'create' ? styles.activeTab : ''}`}
                onClick={() => onViewChange('create')}
              >
                创作页
              </button>
            </div>
          </>
        ) : (
          <h1 className={styles.homeTitle}>故事首页</h1>
        )}
      </div>

      <div className={styles.center}>
        <div className={styles.searchBar}>
          <span className={styles.searchIcon} aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </span>
          <input type="search" placeholder="搜索故事、设定、镜头..." className={styles.searchInput} aria-label="全局搜索" />
          <kbd className={styles.searchKbd}>⌘K</kbd>
        </div>
      </div>

      <div className={styles.right}>
        <button className={styles.iconButton} aria-label="通知">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </button>
        <button className={styles.iconButton} aria-label="帮助">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </button>
        <div className={styles.avatar} aria-label="用户菜单">
          <span>创作者</span>
        </div>
      </div>
    </header>
  );
}
