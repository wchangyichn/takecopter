import { useEffect, useMemo, useState } from 'react';
import { Button, Card } from '../components/ui';
import styles from './DeleteStoryDialog.module.css';

interface DeleteStoryDialogProps {
  open: boolean;
  storyTitle: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

const DELETE_KEYWORD = 'DELETE';

export function DeleteStoryDialog({ open, storyTitle, onClose, onConfirm }: DeleteStoryDialogProps) {
  const [confirmTitle, setConfirmTitle] = useState('');
  const [confirmKeyword, setConfirmKeyword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setConfirmTitle('');
      setConfirmKeyword('');
      setIsSubmitting(false);
    }
  }, [open]);

  const canDelete = useMemo(() => {
    return confirmTitle.trim() === storyTitle.trim() && confirmKeyword.trim().toUpperCase() === DELETE_KEYWORD;
  }, [confirmKeyword, confirmTitle, storyTitle]);

  if (!open) {
    return null;
  }

  const handleConfirm = async () => {
    if (!canDelete) {
      window.alert('请完成二次确认后再删除');
      return;
    }

    try {
      setIsSubmitting(true);
      await onConfirm();
      onClose();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '删除故事失败');
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
        aria-labelledby="delete-story-title"
      >
        <h2 id="delete-story-title" className={styles.title}>删除故事</h2>
        <p className={styles.description}>此操作不可恢复。请完成两步确认以继续删除。</p>

        <label className={styles.label} htmlFor="delete-story-name-input">
          第一步：输入故事名称 <strong>{storyTitle}</strong>
        </label>
        <input
          id="delete-story-name-input"
          value={confirmTitle}
          onChange={(event) => setConfirmTitle(event.target.value)}
          className={styles.input}
          placeholder="完整输入故事名称"
        />

        <label className={styles.label} htmlFor="delete-story-keyword-input">
          第二步：输入确认词 <strong>{DELETE_KEYWORD}</strong>
        </label>
        <input
          id="delete-story-keyword-input"
          value={confirmKeyword}
          onChange={(event) => setConfirmKeyword(event.target.value)}
          className={styles.input}
          placeholder={`输入 ${DELETE_KEYWORD}`}
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
          <Button variant="danger" onClick={() => { void handleConfirm(); }} isLoading={isSubmitting} disabled={!canDelete}>确认删除</Button>
        </div>
      </Card>
    </div>
  );
}
