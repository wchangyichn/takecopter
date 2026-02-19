import styles from './StatusBar.module.css';

interface StatusBarProps {
  storyTitle?: string;
  inStoryWorkspace: boolean;
  onRenameStory?: () => void;
}

export function StatusBar({ storyTitle, inStoryWorkspace, onRenameStory }: StatusBarProps) {
  const title = inStoryWorkspace ? storyTitle || '未命名故事' : '故事首页';

  return (
    <header className={styles.statusBar}>
      {inStoryWorkspace ? (
        <button className={styles.centeredTitleButton} onClick={onRenameStory} aria-label="修改故事名称">
          <span className={styles.centeredTitle}>{title}</span>
        </button>
      ) : (
        <h1 className={styles.centeredTitle}>{title}</h1>
      )}
    </header>
  );
}
