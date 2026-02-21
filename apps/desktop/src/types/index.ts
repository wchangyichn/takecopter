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
  content?: string;
  imageUrl?: string;
  category?: string;
  tags?: SettingTag[];
  customFields?: SettingCustomField[];
  color: string;
  position: { x: number; y: number };
  relations: {
    targetId: string;
    type: string;
    sourceFieldId?: string;
    targetFieldId?: string;
  }[];
  summaryIterations?: SettingSummaryIteration[];
  activeSummaryIterationId?: string;
  cardIterations?: SettingCardIteration[];
  activeCardIterationId?: string;
  initialSnapshot?: {
    title: string;
    summary: string;
    category?: string;
    tags: SettingTag[];
    customFields: SettingCustomField[];
    relations?: {
      targetId: string;
      type: string;
      sourceFieldId?: string;
      targetFieldId?: string;
    }[];
  };
}

export interface SettingCardIteration {
  id: string;
  parentIterationId?: string;
  snapshot: {
    title: string;
    summary: string;
    category?: string;
    tags: SettingTag[];
    customFields: SettingCustomField[];
    relations?: {
      targetId: string;
      type: string;
      sourceFieldId?: string;
      targetFieldId?: string;
    }[];
  };
  versionTag?: string;
  reasonType: 'manual' | 'card';
  reasonText?: string;
  reasonCardId?: string;
  createdAt: string;
}

export interface SettingSummaryIteration {
  id: string;
  value: string;
  versionTag?: string;
  reasonType: 'manual' | 'card';
  reasonText?: string;
  reasonCardId?: string;
  createdAt: string;
}

export interface SettingCustomField {
  id?: string;
  name: string;
  value: string;
  size?: 'sm' | 'md' | 'lg';
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  iterations?: SettingFieldIteration[];
  activeIterationId?: string;
  initialValue?: string;
}

export interface SettingFieldIteration {
  id: string;
  value: string;
  versionTag?: string;
  reasonType: 'manual' | 'card';
  reasonText?: string;
  reasonCardId?: string;
  createdAt: string;
}

export interface SettingTemplate {
  id: string;
  name: string;
  preset: {
    type: SettingCard['type'];
    summary?: string;
    content?: string;
    imageUrl?: string;
    category?: string;
    tags?: SettingTag[];
    customFields?: SettingCustomField[];
    color?: string;
  };
}

export interface SettingTag {
  name: string;
  color: string;
}

export interface SettingLibrary {
  tags: SettingTag[];
  categories: string[];
  templates?: SettingTemplate[];
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
  library?: SettingLibrary;
}

export interface ProjectData {
  stories: Story[];
  workspaces: Record<string, StoryWorkspace>;
  sharedLibrary?: SettingLibrary;
}

export type SaveStatus = 'saved' | 'saving' | 'error';
