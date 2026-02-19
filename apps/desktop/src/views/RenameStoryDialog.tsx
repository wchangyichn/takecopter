import { useEffect, useState } from 'react';
import { Button, Card } from '../components/ui';
import styles from './RenameStoryDialog.module.css';

interface RenameStoryDialogProps {
  open: boolean;
  initialTitle: string;
  onClose: () => void;
  onConfirm: (title: string) => Promise<void>;
}

export function RenameStoryDialog({ open, initialTitle, onClose, onConfirm }: RenameStoryDialogProps) {
  const [title, setTitle] = useState(initialTitle);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(initialTitle);
    }
  }, [initialTitle, open]);

  if (!open) {
    return null;
  }

  const handleConfirm = async () => {
    const nextTitle = title.trim();
    if (!nextTitle) {
      window.alert('故事名称不能为空');
      return;
    }

    try {
      setIsSubmitting(true);
      await onConfirm(nextTitle);
      onClose();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '重命名失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.overlay} role="presentation" onClick={onClose}>
      <Card
        variant="glass"
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rename-story-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="rename-story-title" className={styles.title}>重命名故事</h2>
        <p className={styles.description}>保存后会同步更新故事目录名称。</p>

        <label className={styles.label} htmlFor="rename-story-input">故事名称</label>
        <input
          id="rename-story-input"
          value={title}
          autoFocus
          onChange={(event) => setTitle(event.target.value)}
          className={styles.input}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              void handleConfirm();
            }
            if (event.key === 'Escape') {
              onClose();
            }
          }}
        />

        <div className={styles.actions}>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>取消</Button>
          <Button onClick={() => { void handleConfirm(); }} isLoading={isSubmitting}>保存名称</Button>
        </div>
      </Card>
    </div>
  );
}
