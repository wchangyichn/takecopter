import { useEffect, useState } from 'react';
import { Button, Card } from '../components/ui';
import styles from './NewStoryDialog.module.css';

interface NewStoryDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (title: string) => Promise<void>;
}

export function NewStoryDialog({ open, onClose, onConfirm }: NewStoryDialogProps) {
  const [title, setTitle] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle('');
    }
  }, [open]);

  if (!open) {
    return null;
  }

  const handleConfirm = async () => {
    const nextTitle = title.trim();
    if (!nextTitle) {
      window.alert('请输入故事名称');
      return;
    }

    try {
      setIsSubmitting(true);
      await onConfirm(nextTitle);
      onClose();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '创建故事失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.overlay} role="presentation">
      <Card
        variant="glass"
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-story-title"
      >
        <h2 id="new-story-title" className={styles.title}>创建新故事</h2>
        <p className={styles.description}>请输入故事名称后再创建，不会直接套用模板。</p>

        <label className={styles.label} htmlFor="new-story-input">故事名称</label>
        <input
          id="new-story-input"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className={styles.input}
          placeholder="例如：星港迷雾"
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
          <Button onClick={() => { void handleConfirm(); }} isLoading={isSubmitting}>创建故事</Button>
        </div>
      </Card>
    </div>
  );
}
