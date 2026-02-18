export type ViewType = 'home' | 'setting' | 'create';

export interface Story {
  id: string;
  title: string;
  description: string;
  updatedAt: Date;
  coverColor: string;
}

export interface SettingCard {
  id: string;
  title: string;
  type: 'character' | 'location' | 'item' | 'event';
  summary: string;
  color: string;
  position: { x: number; y: number };
  relations: { targetId: string; type: string }[];
}

export interface TreeNode {
  id: string;
  type: 'ep' | 'scene' | 'shot' | 'take';
  title: string;
  children: TreeNode[];
  isSelected?: boolean;
}

export interface StoryWorkspace {
  settings: SettingCard[];
  tree: TreeNode[];
}

export interface ProjectData {
  stories: Story[];
  workspaces: Record<string, StoryWorkspace>;
}

export type SaveStatus = 'saved' | 'saving' | 'error';
