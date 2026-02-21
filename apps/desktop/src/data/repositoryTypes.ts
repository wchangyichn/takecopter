import type { ProjectData, SettingCard, SettingLibrary, Story, TreeNode } from '../types';

export interface BootstrapState {
  needsSetup: boolean;
  defaultRootPath: string;
  activeRootPath: string | null;
}

export interface ExportedProjectData {
  app: 'takecopter';
  schemaVersion: number;
  exportedAt: string;
  data: ProjectData;
}

export interface ExportedStoryData {
  app: 'takecopter';
  schemaVersion: number;
  exportedAt: string;
  story: Story;
  workspace: {
    settings: SettingCard[];
    tree: TreeNode[];
    library?: SettingLibrary;
  };
}

export interface CreateStoryInput {
  title: string;
  description: string;
}

export interface ProjectDataRepository {
  getBootstrapState: () => Promise<BootstrapState>;
  pickProjectRoot: () => Promise<string | null>;
  initializeProjectRoot: (rootPath?: string) => Promise<void>;
  openProjectRoot: (rootPath: string) => Promise<void>;
  load: () => Promise<ProjectData>;
  createStory: (input: CreateStoryInput) => Promise<Story>;
  renameStory: (storyId: string, title: string) => Promise<Story>;
  deleteStory: (storyId: string) => Promise<void>;
  updateSettings: (storyId: string, settings: SettingCard[]) => Promise<void>;
  updateStoryLibrary: (storyId: string, library: SettingLibrary) => Promise<void>;
  updateGlobalLibrary: (library: SettingLibrary) => Promise<void>;
  updateTree: (storyId: string, tree: TreeNode[]) => Promise<void>;
  exportProject: () => Promise<ExportedProjectData>;
  exportStory: (storyId: string) => Promise<ExportedStoryData>;
  exportProjectToLocal: () => Promise<string>;
  exportStoryToLocal: (storyId: string) => Promise<string>;
  backupLocalDatabase: () => Promise<string>;
  importProject: (payload: ExportedProjectData) => Promise<void>;
  importStory: (payload: ExportedStoryData) => Promise<void>;
  openStoryFolder: (storyId: string) => Promise<void>;
  openStoryDatabase: (storyId: string) => Promise<void>;
}
