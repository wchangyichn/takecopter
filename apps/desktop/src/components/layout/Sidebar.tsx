import type { SaveStatus, ViewType } from '../../types';
import styles from './Sidebar.module.css';

interface SidebarProps {
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
  saveStatus: SaveStatus;
  inStoryWorkspace: boolean;
}

const workspaceItems: { id: Extract<ViewType, 'setting' | 'create'>; label: string; icon: 'setting' | 'create' }[] = [
  { id: 'setting', label: '设定页', icon: 'setting' },
  { id: 'create', label: '创作页', icon: 'create' },
];

export function Sidebar({ currentView, onViewChange, saveStatus, inStoryWorkspace }: SidebarProps) {
  return (
    <nav className={styles.sidebar} aria-label="主导航">
      <div className={styles.brand}>
        <div className={styles.logo}>
          <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="16" cy="16" r="14" fill="url(#logoGrad)" />
            <path d="M10 20L16 10L22 20H10Z" fill="white" fillOpacity="0.9" />
            <circle cx="16" cy="17" r="3" fill="white" />
            <defs>
              <linearGradient id="logoGrad" x1="2" y1="2" x2="30" y2="30">
                <stop stopColor="var(--coral-400)" />
                <stop offset="1" stopColor="var(--violet-500)" />
              </linearGradient>
            </defs>
          </svg>
        </div>
        <span className={styles.brandName}>故事工台</span>
      </div>

      <ul className={styles.navList} role="tablist" aria-label="首页导航">
        <li>
          <button
            role="tab"
            aria-selected={currentView === 'home'}
            className={`${styles.navItem} ${currentView === 'home' ? styles.active : ''}`}
            onClick={() => onViewChange('home')}
          >
            <span className={styles.navIcon} aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9,22 9,12 15,12 15,22" />
              </svg>
            </span>
            <span className={styles.navLabel}>首页</span>
            {currentView === 'home' && <span className={styles.activeIndicator} aria-hidden="true" />}
          </button>
        </li>
      </ul>

      {inStoryWorkspace && (
        <div className={styles.workspaceSection}>
          <p className={styles.sectionTitle}>故事页面</p>
          <ul className={styles.subNavList} role="tablist" aria-label="故事子页面">
            {workspaceItems.map((item, index) => (
              <li key={item.id} style={{ animationDelay: `${index * 60}ms` }}>
                <button
                  role="tab"
                  aria-selected={currentView === item.id}
                  className={`${styles.navItem} ${currentView === item.id ? styles.active : ''}`}
                  onClick={() => onViewChange(item.id)}
                >
                  <span className={styles.navIcon} aria-hidden="true">
                    {item.icon === 'setting' ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
                      </svg>
                    )}
                  </span>
                  <span className={styles.navLabel}>{item.label}</span>
                  {currentView === item.id && <span className={styles.activeIndicator} aria-hidden="true" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={styles.status}>
        <div className={`${styles.statusDot} ${styles[saveStatus]}`} aria-hidden="true" />
        <span className={styles.statusText}>
          {saveStatus === 'saved' && '已保存'}
          {saveStatus === 'saving' && '保存中...'}
          {saveStatus === 'error' && '保存失败'}
        </span>
      </div>
    </nav>
  );
}
