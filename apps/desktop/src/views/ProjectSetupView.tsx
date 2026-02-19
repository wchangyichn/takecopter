import { Button, Card } from '../components/ui';
import styles from './ProjectSetupView.module.css';

interface ProjectSetupViewProps {
  defaultRootPath: string;
  onCreateDefault: () => void;
  onPickAndCreate: () => void;
  onPickAndOpen: () => void;
  isBusy: boolean;
}

export function ProjectSetupView({
  defaultRootPath,
  onCreateDefault,
  onPickAndCreate,
  onPickAndOpen,
  isBusy,
}: ProjectSetupViewProps) {
  return (
    <div className={styles.page}>
      <Card variant="glass" className={styles.container}>
        <header className={styles.header}>
          <h1>欢迎使用故事工台</h1>
          <p>首次启动请先创建项目目录，或导入已有项目目录。</p>
          <code className={styles.defaultPath}>{defaultRootPath}</code>
        </header>

        <div className={styles.actions}>
          <Card variant="elevated" className={styles.actionCard}>
            <h2>创建新项目</h2>
            <p>可使用推荐目录，或选择你自己的目录，系统会自动创建项目结构。</p>
            <div className={styles.row}>
              <Button size="lg" onClick={onCreateDefault} isLoading={isBusy}>
                一键创建并打开（默认路径）
              </Button>
              <Button variant="secondary" size="lg" onClick={onPickAndCreate} isLoading={isBusy}>
                选择目录并创建
              </Button>
            </div>
          </Card>

          <Card variant="outline" className={styles.actionCard}>
            <h2>导入已有项目</h2>
            <p>选择已有项目目录后会立即尝试打开。若目录不符合规范会提示并返回此引导页。</p>
            <div className={styles.row}>
              <Button variant="secondary" size="lg" onClick={onPickAndOpen} isLoading={isBusy}>
                选择目录并打开
              </Button>
            </div>
          </Card>
        </div>
      </Card>
    </div>
  );
}
