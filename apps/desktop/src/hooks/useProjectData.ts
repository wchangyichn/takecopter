import { useCallback, useEffect, useMemo, useState } from 'react';
import { projectRepository } from '../data/projectRepository';
import { tauriRepository, isTauriRuntime } from '../data/tauriRepository';
import type { ProjectData, SaveStatus, SettingCard, Story, TreeNode } from '../types';
import type { ExportedProjectData, ProjectDataRepository } from '../data/repositoryTypes';

interface UseProjectDataResult {
  stories: Story[];
  getWorkspaceCards: (storyId: string | null) => SettingCard[];
  getWorkspaceTree: (storyId: string | null) => TreeNode[];
  createStory: (title?: string) => Promise<string>;
  saveSettingCards: (storyId: string, cards: SettingCard[]) => Promise<void>;
  saveTreeData: (storyId: string, tree: TreeNode[]) => Promise<void>;
  exportProjectFile: () => Promise<void>;
  importProjectFile: (file: File) => Promise<void>;
  saveStatus: SaveStatus;
  isReady: boolean;
}

const storySuffix = ['晨雾', '夜航', '折光', '回潮', '暗线', '远火', '风眼'];

export function useProjectData(): UseProjectDataResult {
  const repository: ProjectDataRepository = isTauriRuntime() ? tauriRepository : projectRepository;
  const [projectData, setProjectData] = useState<ProjectData>({ stories: [], workspaces: {} });
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    const bootstrap = async () => {
      const loaded = await repository.load();
      if (isCancelled) {
        return;
      }
      setProjectData(loaded);
      setIsReady(true);
    };

    void bootstrap();

    return () => {
      isCancelled = true;
    };
  }, [repository]);

  const reload = useCallback(async () => {
    const latest = await repository.load();
    setProjectData(latest);
  }, [repository]);

  const runMutation = useCallback(async (action: () => Promise<void>) => {
    setSaveStatus('saving');
    try {
      await action();
      await reload();
      setSaveStatus('saved');
    } catch {
      setSaveStatus('error');
      throw new Error('保存失败');
    }
  }, [reload]);

  const createStory = useCallback(
    async (title?: string) => {
      const count = projectData.stories.length + 1;
      const fallback = `新故事 ${count} · ${storySuffix[count % storySuffix.length]}`;
      let createdId = '';

      await runMutation(async () => {
        const created = await repository.createStory({
          title: title && title.trim() ? title : fallback,
          description: '在这里开始搭建设定与创作结构。',
        });
        createdId = created.id;
      });

      return createdId;
    },
    [projectData.stories.length, repository, runMutation]
  );

  const saveSettingCards = useCallback(
    async (storyId: string, cards: SettingCard[]) => {
      await runMutation(async () => {
        await repository.updateSettings(storyId, cards);
      });
    },
    [repository, runMutation]
  );

  const saveTreeData = useCallback(
    async (storyId: string, tree: TreeNode[]) => {
      await runMutation(async () => {
        await repository.updateTree(storyId, tree);
      });
    },
    [repository, runMutation]
  );

  const exportProjectFile = useCallback(async () => {
    const payload = await repository.exportProject();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `takecopter-project-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [repository]);

  const importProjectFile = useCallback(
    async (file: File) => {
      const content = await file.text();
      const parsed = JSON.parse(content) as ExportedProjectData;
      await runMutation(async () => {
        await repository.importProject(parsed);
      });
    },
    [repository, runMutation]
  );

  const workspaceCardsMap = useMemo(() => {
    const map: Record<string, SettingCard[]> = {};
    Object.entries(projectData.workspaces).forEach(([storyId, workspace]) => {
      map[storyId] = workspace.settings;
    });
    return map;
  }, [projectData.workspaces]);

  const workspaceTreeMap = useMemo(() => {
    const map: Record<string, TreeNode[]> = {};
    Object.entries(projectData.workspaces).forEach(([storyId, workspace]) => {
      map[storyId] = workspace.tree;
    });
    return map;
  }, [projectData.workspaces]);

  const getWorkspaceCards = useCallback(
    (storyId: string | null) => {
      if (!storyId) {
        return [];
      }
      return workspaceCardsMap[storyId] ?? [];
    },
    [workspaceCardsMap]
  );

  const getWorkspaceTree = useCallback(
    (storyId: string | null) => {
      if (!storyId) {
        return [];
      }
      return workspaceTreeMap[storyId] ?? [];
    },
    [workspaceTreeMap]
  );

  return {
    stories: projectData.stories,
    getWorkspaceCards,
    getWorkspaceTree,
    createStory,
    saveSettingCards,
    saveTreeData,
    exportProjectFile,
    importProjectFile,
    saveStatus,
    isReady,
  };
}
