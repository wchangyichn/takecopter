import { useCallback, useState } from 'react';
import { Card, Panel, Button } from '../components/ui';
import type { TreeNode } from '../types';
import styles from './CreateView.module.css';

const typeIcons: Record<TreeNode['type'], string> = {
  ep: '集',
  scene: '场',
  shot: '镜',
  take: '拍',
};

const typeColors: Record<TreeNode['type'], string> = {
  ep: 'var(--coral-400)',
  scene: 'var(--violet-400)',
  shot: 'var(--teal-400)',
  take: 'var(--amber-400)',
};

interface CreateViewProps {
  treeData: TreeNode[];
  onTreeChange: (tree: TreeNode[]) => void;
}

function cloneTree(nodes: TreeNode[]): TreeNode[] {
  return nodes.map((node) => ({
    ...node,
    children: cloneTree(node.children),
  }));
}

function findNode(nodes: TreeNode[], id: string): TreeNode | null {
  for (const node of nodes) {
    if (node.id === id) {
      return node;
    }
    const child = findNode(node.children, id);
    if (child) {
      return child;
    }
  }
  return null;
}

function findParent(nodes: TreeNode[], id: string): TreeNode | null {
  for (const node of nodes) {
    if (node.children.some((child) => child.id === id)) {
      return node;
    }
    const childParent = findParent(node.children, id);
    if (childParent) {
      return childParent;
    }
  }
  return null;
}

function updateNode(nodes: TreeNode[], id: string, updater: (node: TreeNode) => TreeNode): TreeNode[] {
  return nodes.map((node) => {
    if (node.id === id) {
      return updater(node);
    }

    return {
      ...node,
      children: updateNode(node.children, id, updater),
    };
  });
}

function createNode(type: TreeNode['type'], index: number): TreeNode {
  const map: Record<TreeNode['type'], string> = {
    ep: '新集',
    scene: '新场景',
    shot: '新镜头',
    take: '新拍次',
  };

  const idPrefix: Record<TreeNode['type'], string> = {
    ep: 'ep',
    scene: 'sc',
    shot: 'sh',
    take: 'tk',
  };

  return {
    id: `${idPrefix[type]}-${Date.now()}-${index}`,
    type,
    title: `${map[type]} ${index}`,
    children: [],
    ...(type === 'take' ? { isSelected: false } : {}),
  };
}

function clearTakeSelection(nodes: TreeNode[]): TreeNode[] {
  return nodes.map((node) => {
    const base: TreeNode = {
      ...node,
      children: clearTakeSelection(node.children),
    };

    if (base.type === 'take') {
      return {
        ...base,
        isSelected: false,
      };
    }

    return base;
  });
}

export function CreateView({ treeData, onTreeChange }: CreateViewProps) {
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => {
    const ids = new Set<string>();
    treeData.slice(0, 1).forEach((root) => {
      ids.add(root.id);
      root.children.slice(0, 1).forEach((scene) => {
        ids.add(scene.id);
      });
    });
    return ids;
  });

  const toggleExpand = (id: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const commitTree = useCallback(
    (next: TreeNode[], nextSelectedId?: string | null) => {
      onTreeChange(next);
      if (nextSelectedId === null) {
        setSelectedNode(null);
        return;
      }
      if (!nextSelectedId) {
        return;
      }
      const found = findNode(next, nextSelectedId);
      setSelectedNode(found);
    },
    [onTreeChange]
  );

  const addNodeFromSelection = () => {
    const snapshot = cloneTree(treeData);

    if (!selectedNode) {
      const nextNode = createNode('ep', snapshot.length + 1);
      commitTree([nextNode, ...snapshot], nextNode.id);
      setExpandedNodes((prev) => new Set(prev).add(nextNode.id));
      return;
    }

    const selectedId = selectedNode.id;
    const selectedType = selectedNode.type;
    const parent = findParent(snapshot, selectedId);

    if (selectedType === 'take') {
      if (!parent) {
        return;
      }
      const siblingCount = parent.children.filter((item) => item.type === 'take').length + 1;
      const nextNode = createNode('take', siblingCount);
      const next = updateNode(snapshot, parent.id, (node) => ({
        ...node,
        children: [...node.children, nextNode],
      }));
      commitTree(next, nextNode.id);
      return;
    }

    const nextTypeMap: Record<'ep' | 'scene' | 'shot', TreeNode['type']> = {
      ep: 'scene',
      scene: 'shot',
      shot: 'take',
    };

    const nextType = nextTypeMap[selectedType];
    const siblingCount = selectedNode.children.filter((item) => item.type === nextType).length + 1;
    const nextNode = createNode(nextType, siblingCount);
    const next = updateNode(snapshot, selectedId, (node) => ({
      ...node,
      children: [...node.children, nextNode],
    }));

    setExpandedNodes((prev) => new Set(prev).add(selectedId));
    commitTree(next, nextNode.id);
  };

  const handleTitleChange = (value: string) => {
    if (!selectedNode) {
      return;
    }

    const nextTitle = value.trim();
    if (!nextTitle) {
      return;
    }

    const next = updateNode(cloneTree(treeData), selectedNode.id, (node) => ({
      ...node,
      title: nextTitle,
    }));
    commitTree(next, selectedNode.id);
  };

  const selectTake = (takeId: string) => {
    if (!selectedNode || selectedNode.type !== 'shot') {
      return;
    }

    const shotId = selectedNode.id;
    const normalized = clearTakeSelection(cloneTree(treeData));
    const next = updateNode(normalized, shotId, (node) => ({
      ...node,
      children: node.children.map((child) => ({
        ...child,
        isSelected: child.id === takeId,
      })),
    }));

    commitTree(next, shotId);
  };

  const renderTree = (nodes: TreeNode[], depth = 0) => {
    return nodes.map((node, index) => {
      const isExpanded = expandedNodes.has(node.id);
      const isSelected = selectedNode?.id === node.id;
      const hasChildren = node.children.length > 0;

      return (
        <div key={node.id} style={{ animationDelay: `${index * 30}ms` }} className={styles.treeNodeWrapper}>
          <button
            className={`${styles.treeNode} ${isSelected ? styles.selected : ''}`}
            style={{ paddingLeft: `${depth * 20 + 12}px` }}
            onClick={() => setSelectedNode(node)}
            aria-expanded={hasChildren ? isExpanded : undefined}
          >
            {hasChildren && (
              <span
                className={`${styles.expandIcon} ${isExpanded ? styles.expanded : ''}`}
                onClick={(event) => {
                  event.stopPropagation();
                  toggleExpand(node.id);
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9,18 15,12 9,6" />
                </svg>
              </span>
            )}
            {!hasChildren && <span className={styles.expandPlaceholder} />}

            <span className={styles.nodeType} style={{ background: typeColors[node.type] }}>
              {typeIcons[node.type]}
            </span>
            <span className={styles.nodeTitle}>{node.title}</span>
            {node.isSelected && <span className={styles.selectedBadge}>已采用</span>}
          </button>

          {hasChildren && isExpanded && <div className={styles.treeChildren}>{renderTree(node.children, depth + 1)}</div>}
        </div>
      );
    });
  };

  return (
    <div className={styles.container}>
      <Panel side="left" width="280px" className={styles.treePanel}>
        <div className={styles.panelHeader}>
          <h3>结构树</h3>
          <Button variant="ghost" size="sm" onClick={addNodeFromSelection}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={styles.btnIcon}>
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            新增
          </Button>
        </div>

        <div className={styles.outlineHeader}>
          <h4>故事大纲</h4>
          <button className={styles.outlineEdit} aria-label="编辑大纲">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
        </div>

        <nav className={styles.treeNav} aria-label="故事层级结构">
          {renderTree(treeData)}
        </nav>
      </Panel>

      <div className={styles.editorArea}>
        {selectedNode ? (
          <div className={styles.editor}>
            <header className={styles.editorHeader}>
              <div className={styles.editorTitleRow}>
                <span className={styles.editorType} style={{ color: typeColors[selectedNode.type] }}>
                  {typeIcons[selectedNode.type]}
                </span>
                <h2 className={styles.editorTitle}>{selectedNode.title}</h2>
              </div>
              <div className={styles.editorActions}>
                <Button variant="secondary" size="sm">预览</Button>
                <Button variant="primary" size="sm">已自动保存</Button>
              </div>
            </header>

            <div className={styles.editorContent}>
              <div className={styles.editorField}>
                <label htmlFor="title-input">标题</label>
                <input
                  id="title-input"
                  type="text"
                  value={selectedNode.title}
                  className={styles.editorInput}
                  onChange={(event) => handleTitleChange(event.target.value)}
                />
              </div>

              <div className={styles.editorField}>
                <label htmlFor="desc-input">描述</label>
                <textarea id="desc-input" className={styles.editorTextarea} placeholder="补充这一节点的描述..." rows={4} />
              </div>

              <div className={styles.editorField}>
                <label>正文内容</label>
                <div className={styles.richEditor}>
                  <div className={styles.richToolbar}>
                    <button className={styles.toolbarBtn} aria-label="加粗">
                      <strong>B</strong>
                    </button>
                    <button className={styles.toolbarBtn} aria-label="斜体">
                      <em>I</em>
                    </button>
                    <button className={styles.toolbarBtn} aria-label="插入链接">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                      </svg>
                    </button>
                    <div className={styles.toolbarDivider} />
                    <button className={styles.toolbarBtn} aria-label="引用设定">
                      @
                    </button>
                  </div>
                  <textarea className={styles.richContent} placeholder="在这里写作，输入 @ 可以快速引用设定卡片..." rows={8} />
                </div>
              </div>

              {selectedNode.type === 'shot' && (
                <div className={styles.editorField}>
                  <label>拍次列表</label>
                  <div className={styles.takesList}>
                    {selectedNode.children.map((take, i) => (
                      <div key={take.id} className={`${styles.takeItem} ${take.isSelected ? styles.activeTake : ''}`}>
                        <span className={styles.takeNumber}>T{i + 1}</span>
                        <span className={styles.takeName}>{take.title}</span>
                        {take.isSelected && <span className={styles.activeTag}>已采用</span>}
                        <button className={styles.selectTake} aria-label="设为采用" onClick={() => selectTake(take.id)}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="20,6 9,17 4,12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className={styles.emptyEditor}>
            <div className={styles.emptyContent}>
              <div className={styles.emptyIcon}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <h3>请选择一个节点开始编辑</h3>
              <p>从左侧结构树选择集、场景、镜头或拍次</p>
            </div>
          </div>
        )}
      </div>

      <Panel side="right" width="300px" className={styles.referencesPanel}>
        <div className={styles.panelHeader}>
          <h3>设定引用</h3>
        </div>

        <div className={styles.referenceSection}>
          <h4>已关联设定</h4>
          <div className={styles.linkedSettings}>
            <Card variant="outline" padding="sm" className={styles.linkedCard}>
              <div className={styles.linkedCardHeader}>
                <span className={styles.linkedDot} style={{ background: 'var(--coral-400)' }} />
                <span className={styles.linkedTitle}>林知夏</span>
              </div>
              <span className={styles.linkedType}>角色</span>
            </Card>
            <Card variant="outline" padding="sm" className={styles.linkedCard}>
              <div className={styles.linkedCardHeader}>
                <span className={styles.linkedDot} style={{ background: 'var(--teal-400)' }} />
                <span className={styles.linkedTitle}>东港博物馆</span>
              </div>
              <span className={styles.linkedType}>地点</span>
            </Card>
          </div>
          <Button variant="ghost" size="sm" className={styles.addRefBtn}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            添加引用
          </Button>
        </div>

        <div className={styles.referenceSection}>
          <h4>素材</h4>
          <div className={styles.assetGrid}>
            <div className={styles.assetItem}>
              <div className={styles.assetPreview} style={{ background: 'linear-gradient(135deg, var(--amber-200), var(--amber-300))' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21,15 16,10 5,21" />
                </svg>
              </div>
              <span className={styles.assetName}>scene-01.jpg</span>
            </div>
            <div className={styles.assetItem}>
              <div className={styles.assetPreview} style={{ background: 'linear-gradient(135deg, var(--violet-200), var(--violet-300))' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="23,7 16,12 23,17 23,7" />
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                </svg>
              </div>
              <span className={styles.assetName}>take-01.mp4</span>
            </div>
            <button className={styles.addAsset}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>添加素材</span>
            </button>
          </div>
        </div>

        <div className={styles.referenceSection}>
          <h4>创作备注</h4>
          <div className={styles.noteCard}>
            <p>这一段建议增加冲突铺垫，让后续揭示更有爆发力。</p>
            <span className={styles.noteMeta}>记录于 2 月 18 日</span>
          </div>
        </div>
      </Panel>
    </div>
  );
}
