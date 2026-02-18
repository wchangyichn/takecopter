import { invoke } from '@tauri-apps/api/core';
import type { ProjectData, SettingCard, Story, TreeNode } from '../types';
import type { CreateStoryInput, ExportedProjectData, ProjectDataRepository } from './repositoryTypes';

interface EnsureProjectResponse {
  projectPath: string;
  data: ProjectData;
}

function isTauriRuntime(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return '__TAURI_INTERNALS__' in window;
}

class TauriRepository implements ProjectDataRepository {
  async load(): Promise<ProjectData> {
    const response = await invoke<EnsureProjectResponse>('ensure_project');
    return response.data;
  }

  async createStory(input: CreateStoryInput): Promise<Story> {
    return invoke<Story>('create_story', { input });
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
