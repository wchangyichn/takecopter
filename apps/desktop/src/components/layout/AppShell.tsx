import type { ReactNode } from 'react';
import type { ViewType, SaveStatus } from '../../types';
import { Sidebar } from './Sidebar';
import { StatusBar } from './StatusBar';
import styles from './AppShell.module.css';

interface AppShellProps {
  children: ReactNode;
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
  saveStatus: SaveStatus;
  inStoryWorkspace: boolean;
  storyTitle?: string;
  onBackHome: () => void;
}

export function AppShell({
  children,
  currentView,
  onViewChange,
  saveStatus,
  inStoryWorkspace,
  storyTitle,
  onBackHome,
}: AppShellProps) {
  return (
    <div className={styles.shell}>
      <Sidebar
        currentView={currentView}
        onViewChange={onViewChange}
        saveStatus={saveStatus}
        inStoryWorkspace={inStoryWorkspace}
      />
      <div className={styles.main}>
        <StatusBar
          storyTitle={storyTitle}
          inStoryWorkspace={inStoryWorkspace}
          currentView={currentView}
          onViewChange={onViewChange}
          onBackHome={onBackHome}
        />
        <main className={styles.content} role="main">
          {children}
        </main>
      </div>
    </div>
  );
}
