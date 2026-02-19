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
  onRenameStory?: () => void;
}

export function AppShell({
  children,
  currentView,
  onViewChange,
  saveStatus,
  inStoryWorkspace,
  storyTitle,
  onRenameStory,
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
          onRenameStory={onRenameStory}
        />
        <main className={styles.content} role="main">
          {children}
        </main>
      </div>
    </div>
  );
}
