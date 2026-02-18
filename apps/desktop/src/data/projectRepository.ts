import initSqlJs, { type Database } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { mockSettingCards, mockStories, mockTreeData } from './mockData';
import { createDbBinaryStorage } from './dbStorage';
import type { ProjectData, SettingCard, Story, TreeNode } from '../types';
import type { CreateStoryInput, ExportedProjectData, ProjectDataRepository } from './repositoryTypes';

const DB_STORAGE_KEY = 'takecopter.desktop.sqlite.v1';
const LEGACY_STORAGE_KEY = 'takecopter.desktop.project.v1';
const CURRENT_SCHEMA_VERSION = 1;

interface LegacySerializedStory {
  id: string;
  title: string;
  description: string;
  updatedAt: string;
  coverColor: string;
}

interface LegacyProjectData {
  stories: LegacySerializedStory[];
  workspaces: ProjectData['workspaces'];
}

function clone<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

function defaultWorkspace() {
  return {
    settings: clone(mockSettingCards),
    tree: clone(mockTreeData),
  };
}

function defaultProjectData(): ProjectData {
  const workspaces: ProjectData['workspaces'] = {};

  for (const story of mockStories) {
    workspaces[story.id] = defaultWorkspace();
  }

  return {
    stories: clone(mockStories),
    workspaces,
  };
}

function parseLegacyData(raw: string | null): ProjectData | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as LegacyProjectData;
    return {
      stories: parsed.stories.map((item) => ({
        ...item,
        updatedAt: new Date(item.updatedAt),
      })),
      workspaces: parsed.workspaces,
    };
  } catch {
    return null;
  }
}

function rowsToStories(db: Database): Story[] {
  const result = db.exec('SELECT id, title, description, updated_at, cover_color FROM stories ORDER BY updated_at DESC');
  if (!result[0]) {
    return [];
  }

  return result[0].values.map((row) => ({
    id: String(row[0]),
    title: String(row[1]),
    description: String(row[2]),
    updatedAt: new Date(String(row[3])),
    coverColor: String(row[4]),
  }));
}

function rowsToWorkspaces(db: Database): ProjectData['workspaces'] {
  const result = db.exec('SELECT story_id, settings_json, tree_json FROM workspaces');
  const output: ProjectData['workspaces'] = {};

  if (!result[0]) {
    return output;
  }

  for (const row of result[0].values) {
    output[String(row[0])] = {
      settings: JSON.parse(String(row[1])) as SettingCard[],
      tree: JSON.parse(String(row[2])) as TreeNode[],
    };
  }

  return output;
}

function randomColor(): string {
  const palette = ['var(--coral-400)', 'var(--violet-400)', 'var(--teal-400)', 'var(--amber-400)', 'var(--rose-400)'];
  return palette[Math.floor(Math.random() * palette.length)];
}

export class ProjectRepository implements ProjectDataRepository {
  private dbPromise: Promise<Database> | null = null;
  private readonly storage = createDbBinaryStorage(DB_STORAGE_KEY);

  private async getDb(): Promise<Database> {
    if (!this.dbPromise) {
      this.dbPromise = this.initializeDb();
    }
    return this.dbPromise;
  }

  private async initializeDb(): Promise<Database> {
    const SQL = await initSqlJs({
      locateFile: () => wasmUrl,
    });

    const persisted = await this.storage.load();
    const db = persisted ? new SQL.Database(persisted) : new SQL.Database();

    this.setupSchema(db);
    const seeded = this.ensureSeedData(db);

    if (seeded) {
      await this.persist(db);
    }

    return db;
  }

  private setupSchema(db: Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS stories (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        cover_color TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS workspaces (
        story_id TEXT PRIMARY KEY,
        settings_json TEXT NOT NULL,
        tree_json TEXT NOT NULL,
        FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE
      );
    `);

    const versionRow = db.exec("SELECT value FROM meta WHERE key='schema_version'");
    if (!versionRow[0]) {
      db.run("INSERT INTO meta (key, value) VALUES ('schema_version', ?)", [String(CURRENT_SCHEMA_VERSION)]);
      return;
    }

    const current = Number(versionRow[0].values[0][0]);
    if (current < CURRENT_SCHEMA_VERSION) {
      db.run("UPDATE meta SET value = ? WHERE key='schema_version'", [String(CURRENT_SCHEMA_VERSION)]);
    }
  }

  private ensureSeedData(db: Database): boolean {
    const countResult = db.exec('SELECT COUNT(*) FROM stories');
    const count = Number(countResult[0]?.values[0]?.[0] ?? 0);
    if (count > 0) {
      return false;
    }

    const legacy = parseLegacyData(window.localStorage.getItem(LEGACY_STORAGE_KEY));
    const source = legacy ?? defaultProjectData();
    this.replaceAll(db, source);

    if (legacy) {
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    }

    return true;
  }

  private replaceAll(db: Database, data: ProjectData): void {
    db.exec('BEGIN');
    try {
      db.exec('DELETE FROM workspaces;');
      db.exec('DELETE FROM stories;');

      for (const story of data.stories) {
        db.run(
          'INSERT INTO stories (id, title, description, updated_at, cover_color) VALUES (?, ?, ?, ?, ?)',
          [story.id, story.title, story.description, story.updatedAt.toISOString(), story.coverColor]
        );
      }

      for (const story of data.stories) {
        const workspace = data.workspaces[story.id] ?? { settings: [], tree: [] };
        db.run(
          'INSERT INTO workspaces (story_id, settings_json, tree_json) VALUES (?, ?, ?)',
          [story.id, JSON.stringify(workspace.settings), JSON.stringify(workspace.tree)]
        );
      }

      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  private async persist(db: Database): Promise<void> {
    await this.storage.save(db.export());
  }

  async load(): Promise<ProjectData> {
    const db = await this.getDb();
    return {
      stories: rowsToStories(db),
      workspaces: rowsToWorkspaces(db),
    };
  }

  async createStory(input: CreateStoryInput): Promise<Story> {
    const db = await this.getDb();
    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now());
    const story: Story = {
      id,
      title: input.title,
      description: input.description,
      updatedAt: new Date(),
      coverColor: randomColor(),
    };

    db.run(
      'INSERT INTO stories (id, title, description, updated_at, cover_color) VALUES (?, ?, ?, ?, ?)',
      [story.id, story.title, story.description, story.updatedAt.toISOString(), story.coverColor]
    );
    db.run('INSERT INTO workspaces (story_id, settings_json, tree_json) VALUES (?, ?, ?)', [story.id, '[]', '[]']);

    await this.persist(db);
    return story;
  }

  async updateSettings(storyId: string, settings: SettingCard[]): Promise<void> {
    const db = await this.getDb();
    db.exec('BEGIN');
    try {
      db.run('UPDATE workspaces SET settings_json = ? WHERE story_id = ?', [JSON.stringify(clone(settings)), storyId]);
      db.run('UPDATE stories SET updated_at = ? WHERE id = ?', [new Date().toISOString(), storyId]);
      db.exec('COMMIT');
      await this.persist(db);
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  async updateTree(storyId: string, tree: TreeNode[]): Promise<void> {
    const db = await this.getDb();
    db.exec('BEGIN');
    try {
      db.run('UPDATE workspaces SET tree_json = ? WHERE story_id = ?', [JSON.stringify(clone(tree)), storyId]);
      db.run('UPDATE stories SET updated_at = ? WHERE id = ?', [new Date().toISOString(), storyId]);
      db.exec('COMMIT');
      await this.persist(db);
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  async exportProject(): Promise<ExportedProjectData> {
    const data = await this.load();
    return {
      app: 'takecopter',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      data,
    };
  }

  async importProject(payload: ExportedProjectData): Promise<void> {
    if (payload.app !== 'takecopter') {
      throw new Error('无效的项目文件来源');
    }

    if (payload.schemaVersion > CURRENT_SCHEMA_VERSION) {
      throw new Error('项目版本过新，请升级应用后再导入');
    }

    const db = await this.getDb();
    this.replaceAll(db, payload.data);
    await this.persist(db);
  }
}

export const projectRepository = new ProjectRepository();
