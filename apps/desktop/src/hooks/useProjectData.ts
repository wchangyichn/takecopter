import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { projectRepository } from '../data/projectRepository';
import { tauriRepository, isTauriRuntime } from '../data/tauriRepository';
import type { ProjectData, SaveStatus, SettingCard, SettingLibrary, Story, TreeNode } from '../types';
import type { BootstrapState, ExportedProjectData, ExportedStoryData, ProjectDataRepository } from '../data/repositoryTypes';

interface UseProjectDataResult {
  stories: Story[];
  getWorkspaceCards: (storyId: string | null) => SettingCard[];
  getWorkspaceTree: (storyId: string | null) => TreeNode[];
  getWorkspaceLibrary: (storyId: string | null) => SettingLibrary;
  getGlobalLibrary: () => SettingLibrary;
  createStory: (title: string) => Promise<string>;
  renameStory: (storyId: string, title: string) => Promise<void>;
  deleteStory: (storyId: string) => Promise<void>;
  saveSettingCards: (storyId: string, cards: SettingCard[]) => Promise<void>;
  saveStoryLibrary: (storyId: string, library: SettingLibrary) => Promise<void>;
  saveGlobalLibrary: (library: SettingLibrary) => Promise<void>;
  saveTreeData: (storyId: string, tree: TreeNode[]) => Promise<void>;
  exportProjectFile: () => Promise<void>;
  exportStoryFile: (storyId: string) => Promise<void>;
  backupLocalDatabase: () => Promise<void>;
  importProjectFile: (file: File) => Promise<void>;
  openStoryFolder: (storyId: string) => Promise<void>;
  openStoryDatabase: (storyId: string) => Promise<void>;
  setupState: BootstrapState | null;
  pickProjectPath: () => Promise<string | null>;
  setupProjectWithDefaultPath: () => Promise<void>;
  setupProjectAtPath: (path: string) => Promise<void>;
  openProjectAtPath: (path: string) => Promise<void>;
  saveStatus: SaveStatus;
  isReady: boolean;
  bootError: string | null;
}

const DEFAULT_GLOBAL_CATEGORIES = ['世界观', '角色', '道具'];

function withDefaultGlobalCategories(library: SettingLibrary): SettingLibrary {
  const merged = Array.from(new Set([...DEFAULT_GLOBAL_CATEGORIES, ...(library.categories ?? [])]));
  return {
    tags: library.tags ?? [],
    categories: merged,
    templates: library.templates ?? [],
  };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error && typeof error === 'object') {
    if ('message' in error && typeof error.message === 'string') {
      return error.message;
    }

    try {
      return JSON.stringify(error);
    } catch {
      return '未知错误';
    }
  }

  return '未知错误';
}

export function useProjectData(): UseProjectDataResult {
  const repository: ProjectDataRepository = isTauriRuntime() ? tauriRepository : projectRepository;
  const [projectData, setProjectData] = useState<ProjectData>({ stories: [], workspaces: {} });
  const [setupState, setSetupState] = useState<BootstrapState | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [isReady, setIsReady] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const mutationQueueRef = useRef<Promise<void>>(Promise.resolve());

  const fetchSetupState = useCallback(async () => {
    const next = await repository.getBootstrapState();
    setSetupState(next);
    return next;
  }, [repository]);

  useEffect(() => {
    let isCancelled = false;

    const bootstrap = async () => {
      try {
        const state = await fetchSetupState();
        if (state.needsSetup) {
          if (!isCancelled) {
            setProjectData({ stories: [], workspaces: {} });
            setBootError(null);
          }
          return;
        }

        const loaded = await repository.load();
        if (isCancelled) {
          return;
        }
        setProjectData(loaded);
        setBootError(null);
      } catch (error) {
        if (isCancelled) {
          return;
        }
        const details = getErrorMessage(error);
        console.error('项目启动加载失败', error);
        setBootError(`本地数据加载失败：${details}`);
      } finally {
        if (!isCancelled) {
          setIsReady(true);
        }
      }
    };

    void bootstrap();

    return () => {
      isCancelled = true;
    };
  }, [fetchSetupState, repository]);

  const reload = useCallback(async () => {
    const latest = await repository.load();
    setProjectData(latest);
  }, [repository]);

  const runMutation = useCallback(async (action: () => Promise<void>) => {
    const scheduled = mutationQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        setSaveStatus('saving');
        try {
          await action();
          await reload();
          setSaveStatus('saved');
        } catch {
          setSaveStatus('error');
          throw new Error('保存失败');
        }
      });

    mutationQueueRef.current = scheduled.then(
      () => undefined,
      () => undefined
    );

    await scheduled;
  }, [reload]);

  const createStory = useCallback(
    async (title: string) => {
      const nextTitle = title.trim();
      if (!nextTitle) {
        throw new Error('故事名称不能为空');
      }
      let createdId = '';

      await runMutation(async () => {
        const created = await repository.createStory({
          title: nextTitle,
          description: '在这里开始搭建设定与创作结构。',
        });
        createdId = created.id;
      });

      return createdId;
    },
    [repository, runMutation]
  );

  const renameStory = useCallback(
    async (storyId: string, title: string) => {
      await runMutation(async () => {
        await repository.renameStory(storyId, title);
      });
    },
    [repository, runMutation]
  );

  const deleteStory = useCallback(
    async (storyId: string) => {
      await runMutation(async () => {
        await repository.deleteStory(storyId);
      });
    },
    [repository, runMutation]
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

  const saveStoryLibrary = useCallback(
    async (storyId: string, library: SettingLibrary) => {
      await runMutation(async () => {
        await repository.updateStoryLibrary(storyId, library);
      });
    },
    [repository, runMutation]
  );

  const saveGlobalLibrary = useCallback(
    async (library: SettingLibrary) => {
      await runMutation(async () => {
        await repository.updateGlobalLibrary(library);
      });
    },
    [repository, runMutation]
  );

  const exportProjectFile = useCallback(async () => {
    if (isTauriRuntime()) {
      const folder = await repository.exportProjectToLocal();
      window.alert(`已导出项目并打开目录：${folder}`);
      return;
    }

    const payload = await repository.exportProject();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `takecopter-project-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [repository]);

  const exportStoryFile = useCallback(
    async (storyId: string) => {
      if (isTauriRuntime()) {
        const folder = await repository.exportStoryToLocal(storyId);
        window.alert(`已导出故事并打开目录：${folder}`);
        return;
      }

      const payload = await repository.exportStory(storyId);
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `takecopter-story-${payload.story.id}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    },
    [repository]
  );

  const backupLocalDatabase = useCallback(async () => {
    const folder = await repository.backupLocalDatabase();
    window.alert(`备份完成，已打开目录：${folder}`);
  }, [repository]);

  const importProjectFile = useCallback(
    async (file: File) => {
      const content = await file.text();
      const parsed = JSON.parse(content) as ExportedProjectData | ExportedStoryData;
      await runMutation(async () => {
        if ('data' in parsed) {
          await repository.importProject(parsed);
        } else {
          await repository.importStory(parsed);
        }
      });
    },
    [repository, runMutation]
  );

  const setupProjectWithDefaultPath = useCallback(async () => {
    await repository.initializeProjectRoot();
    await fetchSetupState();
    const loaded = await repository.load();
    setProjectData(loaded);
    setBootError(null);
  }, [fetchSetupState, repository]);

  const setupProjectAtPath = useCallback(
    async (path: string) => {
      await repository.initializeProjectRoot(path);
      await fetchSetupState();
      const loaded = await repository.load();
      setProjectData(loaded);
      setBootError(null);
    },
    [fetchSetupState, repository]
  );

  const openProjectAtPath = useCallback(
    async (path: string) => {
      await repository.openProjectRoot(path);
      await fetchSetupState();
      const loaded = await repository.load();
      setProjectData(loaded);
      setBootError(null);
    },
    [fetchSetupState, repository]
  );

  const pickProjectPath = useCallback(async () => {
    return repository.pickProjectRoot();
  }, [repository]);

  const openStoryFolder = useCallback(
    async (storyId: string) => {
      await repository.openStoryFolder(storyId);
    },
    [repository]
  );

  const openStoryDatabase = useCallback(
    async (storyId: string) => {
      await repository.openStoryDatabase(storyId);
    },
    [repository]
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

  const getWorkspaceLibrary = useCallback(
    (storyId: string | null) => {
      if (!storyId) {
        return { tags: [], categories: [] };
      }
      return projectData.workspaces[storyId]?.library ?? { tags: [], categories: [] };
    },
    [projectData.workspaces]
  );

  const getGlobalLibrary = useCallback(() => {
    return withDefaultGlobalCategories(projectData.sharedLibrary ?? { tags: [], categories: [] });
  }, [projectData.sharedLibrary]);

  return {
    stories: projectData.stories,
    getWorkspaceCards,
    getWorkspaceTree,
    getWorkspaceLibrary,
    getGlobalLibrary,
    createStory,
    renameStory,
    deleteStory,
    saveSettingCards,
    saveStoryLibrary,
    saveGlobalLibrary,
    saveTreeData,
    exportProjectFile,
    exportStoryFile,
    backupLocalDatabase,
    importProjectFile,
    openStoryFolder,
    openStoryDatabase,
    setupState,
    pickProjectPath,
    setupProjectWithDefaultPath,
    setupProjectAtPath,
    openProjectAtPath,
    saveStatus,
    isReady,
    bootError,
  };
}
