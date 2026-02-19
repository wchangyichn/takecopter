import type { ProjectData, SettingCard, Story, TreeNode } from '../types';

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
  updateSettings: (storyId: string, settings: SettingCard[]) => Promise<void>;
  updateTree: (storyId: string, tree: TreeNode[]) => Promise<void>;
  exportProject: () => Promise<ExportedProjectData>;
  importProject: (payload: ExportedProjectData) => Promise<void>;
  importStory: (payload: ExportedStoryData) => Promise<void>;
  openStoryFolder: (storyId: string) => Promise<void>;
  openStoryDatabase: (storyId: string) => Promise<void>;
}
