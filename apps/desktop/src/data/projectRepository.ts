import initSqlJs, { type Database } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { createDbBinaryStorage } from './dbStorage';
import type { ProjectData, SettingCard, Story, TreeNode } from '../types';
import type {
  BootstrapState,
  CreateStoryInput,
  ExportedProjectData,
  ExportedStoryData,
  ProjectDataRepository,
} from './repositoryTypes';

const DB_STORAGE_KEY = 'takecopter.desktop.sqlite.v1';
const LEGACY_STORAGE_KEY = 'takecopter.desktop.project.v1';
const PROJECT_ROOT_KEY = 'takecopter.desktop.project-root.v1';
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

type StoryDateLike = Omit<Story, 'updatedAt'> & { updatedAt: Date | string };
type ProjectDataDateLike = Omit<ProjectData, 'stories'> & { stories: StoryDateLike[] };

function clone<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeProjectData(data: ProjectDataDateLike): ProjectData {
  return {
    stories: data.stories.map((story, index) => {
      const rawUpdatedAt = story.updatedAt instanceof Date ? story.updatedAt : new Date(story.updatedAt);
      const updatedAt = Number.isNaN(rawUpdatedAt.getTime()) ? new Date() : rawUpdatedAt;

      return {
        id: typeof story.id === 'string' && story.id.trim() ? story.id : `story-${index + 1}`,
        title: typeof story.title === 'string' && story.title.trim() ? story.title : `未命名故事 ${index + 1}`,
        description: typeof story.description === 'string' ? story.description : '',
        coverColor:
          typeof story.coverColor === 'string' && story.coverColor.trim() ? story.coverColor : 'var(--coral-400)',
        updatedAt,
      };
    }),
    workspaces: data.workspaces ?? {},
  };
}

function normalizeStoryPayload(payload: ExportedStoryData): { story: Story; workspace: ProjectData['workspaces'][string] } {
  const normalized = normalizeProjectData({ stories: [payload.story], workspaces: { [payload.story.id]: payload.workspace } });
  const story = normalized.stories[0];
  const workspace = normalized.workspaces[story.id] ?? { settings: [], tree: [] };

  return {
    story,
    workspace,
  };
}

function parseLegacyData(raw: string | null): ProjectData | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as LegacyProjectData;
    if (!parsed || !Array.isArray(parsed.stories)) {
      return null;
    }

    const stories = parsed.stories
      .filter(
        (item) =>
          item &&
          typeof item.id === 'string' &&
          typeof item.title === 'string' &&
          typeof item.description === 'string' &&
          typeof item.updatedAt === 'string' &&
          typeof item.coverColor === 'string'
      )
      .map((item) => ({
        ...item,
        updatedAt: new Date(item.updatedAt),
      }));

    return {
      stories,
      workspaces: parsed.workspaces ?? {},
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
    const storyId = String(row[0]);
    try {
      output[storyId] = {
        settings: JSON.parse(String(row[1])) as SettingCard[],
        tree: JSON.parse(String(row[2])) as TreeNode[],
      };
    } catch {
      output[storyId] = {
        settings: [],
        tree: [],
      };
    }
  }

  return output;
}

function randomColor(): string {
  const palette = ['var(--coral-400)', 'var(--violet-400)', 'var(--teal-400)', 'var(--amber-400)', 'var(--rose-400)'];
  return palette[Math.floor(Math.random() * palette.length)];
}

function sqlText(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export class ProjectRepository implements ProjectDataRepository {
  private dbPromise: Promise<Database> | null = null;
  private readonly storage = createDbBinaryStorage(DB_STORAGE_KEY);

  async getBootstrapState(): Promise<BootstrapState> {
    const activeRootPath = window.localStorage.getItem(PROJECT_ROOT_KEY);
    return {
      needsSetup: !activeRootPath,
      defaultRootPath: 'browser://takecopter/default-project',
      activeRootPath,
    };
  }

  async initializeProjectRoot(rootPath?: string): Promise<void> {
    const nextRoot = rootPath?.trim() || 'browser://takecopter/default-project';
    window.localStorage.setItem(PROJECT_ROOT_KEY, nextRoot);
  }

  async pickProjectRoot(): Promise<string | null> {
    return null;
  }

  async openProjectRoot(rootPath: string): Promise<void> {
    const nextRoot = rootPath.trim();
    if (!nextRoot) {
      throw new Error('项目路径不能为空');
    }
    window.localStorage.setItem(PROJECT_ROOT_KEY, nextRoot);
  }

  async openStoryFolder(storyId: string): Promise<void> {
    void storyId;
    throw new Error('Web 端不支持直接打开本地文件夹，请在桌面端使用该功能');
  }

  async openStoryDatabase(storyId: string): Promise<void> {
    void storyId;
    throw new Error('Web 端不支持直接打开数据库文件，请在桌面端使用该功能');
  }

  private async getDb(): Promise<Database> {
    const bootstrap = await this.getBootstrapState();
    if (bootstrap.needsSetup) {
      throw new Error('请先创建项目目录或打开已有项目');
    }

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
    let usedFallback = false;
    let db: Database;

    if (persisted) {
      try {
        db = new SQL.Database(persisted);
      } catch {
        db = new SQL.Database();
        usedFallback = true;
      }
    } else {
      db = new SQL.Database();
    }

    this.setupSchema(db);
    const seeded = this.ensureSeedData(db);

    if (seeded || usedFallback) {
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
    if (!versionRow[0] || versionRow[0].values.length === 0) {
      db.run(`INSERT INTO meta (key, value) VALUES ('schema_version', '${CURRENT_SCHEMA_VERSION}')`);
      return;
    }

    const current = Number(versionRow[0].values[0][0]);
    if (current < CURRENT_SCHEMA_VERSION) {
      db.run(`UPDATE meta SET value='${CURRENT_SCHEMA_VERSION}' WHERE key='schema_version'`);
    }
  }

  private ensureSeedData(db: Database): boolean {
    const countResult = db.exec('SELECT COUNT(*) FROM stories');
    const count = Number(countResult[0]?.values[0]?.[0] ?? 0);
    if (count > 0) {
      return false;
    }

    const legacy = parseLegacyData(window.localStorage.getItem(LEGACY_STORAGE_KEY));
    if (!legacy) {
      return false;
    }

    this.replaceAll(db, legacy);

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
        db.exec(
          `INSERT INTO stories (id, title, description, updated_at, cover_color) VALUES (${sqlText(story.id)}, ${sqlText(story.title)}, ${sqlText(story.description)}, ${sqlText(story.updatedAt.toISOString())}, ${sqlText(story.coverColor)})`
        );
      }

      for (const story of data.stories) {
        const workspace = data.workspaces[story.id] ?? { settings: [], tree: [] };
        db.exec(
          `INSERT INTO workspaces (story_id, settings_json, tree_json) VALUES (${sqlText(story.id)}, ${sqlText(JSON.stringify(workspace.settings))}, ${sqlText(JSON.stringify(workspace.tree))})`
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

    db.exec(
      `INSERT INTO stories (id, title, description, updated_at, cover_color) VALUES (${sqlText(story.id)}, ${sqlText(story.title)}, ${sqlText(story.description)}, ${sqlText(story.updatedAt.toISOString())}, ${sqlText(story.coverColor)})`
    );
    db.exec(
      `INSERT INTO workspaces (story_id, settings_json, tree_json) VALUES (${sqlText(story.id)}, ${sqlText('[]')}, ${sqlText('[]')})`
    );

    await this.persist(db);
    return story;
  }

  async updateSettings(storyId: string, settings: SettingCard[]): Promise<void> {
    const db = await this.getDb();
    db.exec('BEGIN');
    try {
      db.exec(
        `UPDATE workspaces SET settings_json = ${sqlText(JSON.stringify(clone(settings)))} WHERE story_id = ${sqlText(storyId)}`
      );
      db.exec(`UPDATE stories SET updated_at = ${sqlText(new Date().toISOString())} WHERE id = ${sqlText(storyId)}`);
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
      db.exec(`UPDATE workspaces SET tree_json = ${sqlText(JSON.stringify(clone(tree)))} WHERE story_id = ${sqlText(storyId)}`);
      db.exec(`UPDATE stories SET updated_at = ${sqlText(new Date().toISOString())} WHERE id = ${sqlText(storyId)}`);
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
    this.replaceAll(db, normalizeProjectData(payload.data));
    await this.persist(db);
  }

  async importStory(payload: ExportedStoryData): Promise<void> {
    if (payload.app !== 'takecopter') {
      throw new Error('无效的故事文件来源');
    }

    if (payload.schemaVersion > CURRENT_SCHEMA_VERSION) {
      throw new Error('故事版本过新，请升级应用后再导入');
    }

    const db = await this.getDb();
    const { story, workspace } = normalizeStoryPayload(payload);

    db.exec('BEGIN');
    try {
      db.exec(`DELETE FROM workspaces WHERE story_id = ${sqlText(story.id)}`);
      db.exec(`DELETE FROM stories WHERE id = ${sqlText(story.id)}`);
      db.exec(
        `INSERT INTO stories (id, title, description, updated_at, cover_color) VALUES (${sqlText(story.id)}, ${sqlText(story.title)}, ${sqlText(story.description)}, ${sqlText(story.updatedAt.toISOString())}, ${sqlText(story.coverColor)})`
      );
      db.exec(
        `INSERT INTO workspaces (story_id, settings_json, tree_json) VALUES (${sqlText(story.id)}, ${sqlText(JSON.stringify(workspace.settings))}, ${sqlText(JSON.stringify(workspace.tree))})`
      );
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }

    await this.persist(db);
  }
}

export const projectRepository = new ProjectRepository();
