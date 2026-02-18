import type { ProjectData, SettingCard, Story, TreeNode } from '../types';

export interface ExportedProjectData {
  app: 'takecopter';
  schemaVersion: number;
  exportedAt: string;
  data: ProjectData;
}

export interface CreateStoryInput {
  title: string;
  description: string;
}

export interface ProjectDataRepository {
  load: () => Promise<ProjectData>;
  createStory: (input: CreateStoryInput) => Promise<Story>;
  updateSettings: (storyId: string, settings: SettingCard[]) => Promise<void>;
  updateTree: (storyId: string, tree: TreeNode[]) => Promise<void>;
  exportProject: () => Promise<ExportedProjectData>;
  importProject: (payload: ExportedProjectData) => Promise<void>;
}
