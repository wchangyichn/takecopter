import { invoke, isTauri } from '@tauri-apps/api/core';
import type { ProjectData, SettingCard, Story, TreeNode } from '../types';
import type { CreateStoryInput, ExportedProjectData, ProjectDataRepository } from './repositoryTypes';

interface EnsureProjectResponse {
  projectPath: string;
  data: SerializedProjectData;
}

type SerializedStory = Omit<Story, 'updatedAt'> & { updatedAt: string };
type SerializedProjectData = Omit<ProjectData, 'stories'> & { stories: SerializedStory[] };

function hydrateStory(story: SerializedStory): Story {
  return {
    ...story,
    updatedAt: new Date(story.updatedAt),
  };
}

function hydrateProjectData(data: SerializedProjectData): ProjectData {
  return {
    stories: data.stories.map(hydrateStory),
    workspaces: data.workspaces,
  };
}

function isTauriRuntime(): boolean {
  if (typeof window === 'undefined') {
    return isTauri();
  }

  return isTauri() || '__TAURI_INTERNALS__' in window;
}

function formatUnknownError(error: unknown): string {
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

class TauriRepository implements ProjectDataRepository {
  async load(): Promise<ProjectData> {
    try {
      const response = await invoke<EnsureProjectResponse>('ensure_project');
      return hydrateProjectData(response.data);
    } catch (error) {
      throw new Error(formatUnknownError(error));
    }
  }

  async createStory(input: CreateStoryInput): Promise<Story> {
    const story = await invoke<SerializedStory>('create_story', { input });
    return hydrateStory(story);
  }

  async updateSettings(storyId: string, settings: SettingCard[]): Promise<void> {
    await invoke('update_settings', { storyId, settings });
  }

  async updateTree(storyId: string, tree: TreeNode[]): Promise<void> {
    await invoke('update_tree', { storyId, tree });
  }

  async exportProject(): Promise<ExportedProjectData> {
    return invoke<ExportedProjectData>('export_project');
  }

  async importProject(payload: ExportedProjectData): Promise<void> {
    await invoke('import_project', { payload });
  }
}

export const tauriRepository = new TauriRepository();
export { isTauriRuntime };
