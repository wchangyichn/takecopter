import { invoke, isTauri } from '@tauri-apps/api/core';
import type { ProjectData, SettingCard, SettingLibrary, SettingTemplate, Story, TreeNode } from '../types';
import type {
  BootstrapState,
  CreateStoryInput,
  ExportedProjectData,
  ExportedStoryData,
  ProjectDataRepository,
} from './repositoryTypes';

interface EnsureProjectResponse {
  projectPath: string;
  data: SerializedProjectData;
}

type SerializedStory = Omit<Story, 'updatedAt'> & { updatedAt: string };
type SerializedWorkspace = {
  settings?: SettingCard[];
  tree?: TreeNode[];
  library?: unknown;
};

interface SerializedProjectData {
  stories: SerializedStory[];
  workspaces?: Record<string, SerializedWorkspace>;
  sharedLibrary?: unknown;
}

const DEFAULT_GLOBAL_CATEGORIES = ['世界观', '角色', '道具'];

function hydrateStory(story: SerializedStory): Story {
  return {
    ...story,
    updatedAt: new Date(story.updatedAt),
  };
}

function normalizeLibrary(input: unknown): SettingLibrary {
  if (!input || typeof input !== 'object') {
    return { tags: [], categories: [] };
  }

  const source = input as { tags?: unknown; categories?: unknown };
  const tags = Array.isArray(source.tags)
    ? source.tags
        .filter(
          (item): item is { name: string; color: string } =>
            Boolean(item) &&
            typeof item === 'object' &&
            'name' in item &&
            typeof item.name === 'string' &&
            item.name.trim().length > 0 &&
            'color' in item &&
            typeof item.color === 'string' &&
            item.color.trim().length > 0
        )
        .map((item) => ({ name: item.name.trim(), color: item.color.trim() }))
    : [];

  const categories = Array.isArray(source.categories)
    ? source.categories
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((item) => item.trim())
    : [];

  const templates = Array.isArray((source as { templates?: unknown }).templates)
    ? ((source as { templates?: unknown }).templates as unknown[]).flatMap((item) => {
        if (!item || typeof item !== 'object') {
          return [];
        }

        const raw = item as {
          id?: unknown;
          name?: unknown;
          preset?: unknown;
        };
        if (typeof raw.id !== 'string' || !raw.id.trim() || typeof raw.name !== 'string' || !raw.name.trim()) {
          return [];
        }
        if (!raw.preset || typeof raw.preset !== 'object') {
          return [];
        }

        const preset = raw.preset as SettingTemplate['preset'];
        return [{
          id: raw.id.trim(),
          name: raw.name.trim(),
          preset: {
            type:
              preset.type === 'character' ||
              preset.type === 'location' ||
              preset.type === 'item' ||
              preset.type === 'event'
                ? preset.type
                : 'event',
            summary: typeof preset.summary === 'string' ? preset.summary : undefined,
            content: typeof preset.content === 'string' ? preset.content : undefined,
            imageUrl: typeof preset.imageUrl === 'string' ? preset.imageUrl : undefined,
            category: typeof preset.category === 'string' ? preset.category.trim() || undefined : undefined,
            tags: Array.isArray(preset.tags)
              ? preset.tags
                  .filter(
                    (tag): tag is { name: string; color: string } =>
                      Boolean(tag) &&
                      typeof tag === 'object' &&
                      'name' in tag &&
                      typeof tag.name === 'string' &&
                      tag.name.trim().length > 0 &&
                      'color' in tag &&
                      typeof tag.color === 'string' &&
                      tag.color.trim().length > 0
                  )
                  .map((tag) => ({ name: tag.name.trim(), color: tag.color.trim() }))
              : [],
            customFields: Array.isArray(preset.customFields)
              ? preset.customFields
                  .filter((field) => Boolean(field) && typeof field.name === 'string' && field.name.trim().length > 0 && typeof field.value === 'string')
                  .map((field) => ({
                    id: typeof field.id === 'string' && field.id.trim().length > 0 ? field.id.trim() : undefined,
                    name: field.name.trim(),
                    value: field.value,
                    size: field.size === 'sm' || field.size === 'md' || field.size === 'lg' ? field.size : 'md',
                    x: typeof field.x === 'number' ? field.x : undefined,
                    y: typeof field.y === 'number' ? field.y : undefined,
                    w: typeof field.w === 'number' ? field.w : undefined,
                    h: typeof field.h === 'number' ? field.h : undefined,
                  }))
              : [],
            color: typeof preset.color === 'string' ? preset.color : undefined,
          },
        }];
      })
    : [];

  return { tags, categories, templates };
}

function withDefaultGlobalCategories(library: SettingLibrary): SettingLibrary {
  return {
    tags: library.tags,
    categories: Array.from(new Set([...DEFAULT_GLOBAL_CATEGORIES, ...library.categories])),
    templates: library.templates ?? [],
  };
}

function hydrateProjectData(data: SerializedProjectData): ProjectData {
  return {
    stories: data.stories.map(hydrateStory),
    workspaces: Object.fromEntries(
      Object.entries(data.workspaces ?? {}).map(([storyId, workspace]) => [
        storyId,
        {
          settings: workspace.settings ?? [],
          tree: workspace.tree ?? [],
          library: normalizeLibrary(workspace.library),
        },
      ])
    ),
    sharedLibrary: withDefaultGlobalCategories(normalizeLibrary(data.sharedLibrary)),
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
  async getBootstrapState(): Promise<BootstrapState> {
    return invoke<BootstrapState>('get_bootstrap_state');
  }

  async pickProjectRoot(): Promise<string | null> {
    return invoke<string | null>('pick_project_root');
  }

  async initializeProjectRoot(rootPath?: string): Promise<void> {
    await invoke('initialize_project_root', { rootPath });
  }

  async openProjectRoot(rootPath: string): Promise<void> {
    await invoke('open_project_root', { rootPath });
  }

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

  async renameStory(storyId: string, title: string): Promise<Story> {
    const story = await invoke<SerializedStory>('rename_story', { storyId, title });
    return hydrateStory(story);
  }

  async updateSettings(storyId: string, settings: SettingCard[]): Promise<void> {
    await invoke('update_settings', { storyId, settings });
  }

  async updateStoryLibrary(storyId: string, library: SettingLibrary): Promise<void> {
    await invoke('update_story_library', { storyId, library });
  }

  async updateGlobalLibrary(library: SettingLibrary): Promise<void> {
    await invoke('update_global_library', { library });
  }

  async updateTree(storyId: string, tree: TreeNode[]): Promise<void> {
    await invoke('update_tree', { storyId, tree });
  }

  async exportProject(): Promise<ExportedProjectData> {
    return invoke<ExportedProjectData>('export_project');
  }

  async exportStory(storyId: string): Promise<ExportedStoryData> {
    return invoke<ExportedStoryData>('export_story', { storyId });
  }

  async exportProjectToLocal(): Promise<string> {
    return invoke<string>('export_project_to_local');
  }

  async exportStoryToLocal(storyId: string): Promise<string> {
    return invoke<string>('export_story_to_local', { storyId });
  }

  async backupLocalDatabase(): Promise<string> {
    return invoke<string>('backup_local_database');
  }

  async importProject(payload: ExportedProjectData): Promise<void> {
    await invoke('import_project', { payload });
  }

  async importStory(payload: ExportedStoryData): Promise<void> {
    await invoke('import_story', { payload });
  }

  async openStoryFolder(storyId: string): Promise<void> {
    await invoke('open_story_folder', { storyId });
  }

  async openStoryDatabase(storyId: string): Promise<void> {
    await invoke('open_story_database', { storyId });
  }
}

export const tauriRepository = new TauriRepository();
export { isTauriRuntime };
