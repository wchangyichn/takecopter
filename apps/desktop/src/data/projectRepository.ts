import initSqlJs, { type Database } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { createDbBinaryStorage } from './dbStorage';
import type { ProjectData, SettingCard, SettingLibrary, SettingTemplate, Story, TreeNode } from '../types';
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
const DEFAULT_GLOBAL_CATEGORIES = ['世界观', '角色', '道具'];
const EMPTY_LIBRARY: SettingLibrary = { tags: [], categories: [], templates: [] };

function withDefaultGlobalCategories(library: SettingLibrary): SettingLibrary {
  return {
    tags: library.tags,
    categories: Array.from(new Set([...DEFAULT_GLOBAL_CATEGORIES, ...library.categories])),
    templates: library.templates ?? [],
  };
}

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

function normalizeLibrary(input: unknown): SettingLibrary {
  if (!input || typeof input !== 'object') {
    return { ...EMPTY_LIBRARY };
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
    ? source.categories.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
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
    sharedLibrary: normalizeLibrary((data as ProjectData).sharedLibrary),
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
  const result = db.exec('SELECT story_id, settings_json, tree_json, library_json FROM workspaces');
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
        library: normalizeLibrary(row[3] ? JSON.parse(String(row[3])) : EMPTY_LIBRARY),
      };
    } catch {
      output[storyId] = {
        settings: [],
        tree: [],
        library: { ...EMPTY_LIBRARY },
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
        library_json TEXT NOT NULL DEFAULT '{"tags":[],"categories":[]}',
        FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE
      );
    `);

    try {
      db.exec(`
        ALTER TABLE workspaces
        ADD COLUMN library_json TEXT NOT NULL DEFAULT '{"tags":[],"categories":[]}';
      `);
    } catch (error) {
      if (!(error instanceof Error) || !/duplicate column name/i.test(error.message)) {
        throw error;
      }
    }

    db.exec(`
      UPDATE workspaces
      SET library_json='{"tags":[],"categories":[]}'
      WHERE library_json IS NULL OR TRIM(library_json)='';
    `);

    const versionRow = db.exec("SELECT value FROM meta WHERE key='schema_version'");
    if (!versionRow[0] || versionRow[0].values.length === 0) {
      db.run(`INSERT INTO meta (key, value) VALUES ('schema_version', '${CURRENT_SCHEMA_VERSION}')`);
    } else {
      const current = Number(versionRow[0].values[0][0]);
      if (current < CURRENT_SCHEMA_VERSION) {
        db.run(`UPDATE meta SET value='${CURRENT_SCHEMA_VERSION}' WHERE key='schema_version'`);
      }
    }

    const libraryMeta = db.exec("SELECT value FROM meta WHERE key='global_library_json'");
    if (!libraryMeta[0] || libraryMeta[0].values.length === 0) {
      db.run(
        `INSERT INTO meta (key, value) VALUES ('global_library_json', ${sqlText(
          JSON.stringify(withDefaultGlobalCategories({ tags: [], categories: [] }))
        )})`
      );
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
        const workspace = data.workspaces[story.id] ?? { settings: [], tree: [], library: { ...EMPTY_LIBRARY } };
        db.exec(
          `INSERT INTO workspaces (story_id, settings_json, tree_json, library_json) VALUES (${sqlText(story.id)}, ${sqlText(JSON.stringify(workspace.settings))}, ${sqlText(JSON.stringify(workspace.tree))}, ${sqlText(JSON.stringify(normalizeLibrary(workspace.library)))})`
        );
      }

      db.exec(
        `INSERT OR REPLACE INTO meta (key, value) VALUES ('global_library_json', ${sqlText(JSON.stringify(normalizeLibrary(data.sharedLibrary)))})`
      );

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
    const globalLibraryResult = db.exec("SELECT value FROM meta WHERE key='global_library_json' LIMIT 1");
    const sharedLibraryRaw = globalLibraryResult[0]?.values[0]?.[0];

    return {
      stories: rowsToStories(db),
      workspaces: rowsToWorkspaces(db),
      sharedLibrary: withDefaultGlobalCategories(normalizeLibrary(sharedLibraryRaw ? JSON.parse(String(sharedLibraryRaw)) : EMPTY_LIBRARY)),
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
      `INSERT INTO workspaces (story_id, settings_json, tree_json, library_json) VALUES (${sqlText(story.id)}, ${sqlText('[]')}, ${sqlText('[]')}, ${sqlText('{"tags":[],"categories":[]}')})`
    );

    await this.persist(db);
    return story;
  }

  async renameStory(storyId: string, title: string): Promise<Story> {
    const db = await this.getDb();
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      throw new Error('故事名称不能为空');
    }

    const result = db.exec(`SELECT id, title, description, updated_at, cover_color FROM stories WHERE id = ${sqlText(storyId)} LIMIT 1`);
    const row = result[0]?.values[0];
    if (!row) {
      throw new Error('故事不存在');
    }

    const updatedAt = new Date();
    db.exec(
      `UPDATE stories SET title = ${sqlText(cleanTitle)}, updated_at = ${sqlText(updatedAt.toISOString())} WHERE id = ${sqlText(storyId)}`
    );
    await this.persist(db);

    return {
      id: String(row[0]),
      title: cleanTitle,
      description: String(row[2]),
      coverColor: String(row[4]),
      updatedAt,
    };
  }

  async deleteStory(storyId: string): Promise<void> {
    const db = await this.getDb();
    db.exec('BEGIN');
    try {
      db.exec(`DELETE FROM workspaces WHERE story_id = ${sqlText(storyId)}`);
      db.exec(`DELETE FROM stories WHERE id = ${sqlText(storyId)}`);
      db.exec('COMMIT');
      await this.persist(db);
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
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

  async updateStoryLibrary(storyId: string, library: SettingLibrary): Promise<void> {
    const db = await this.getDb();
    db.exec('BEGIN');
    try {
      db.exec(
        `UPDATE workspaces SET library_json = ${sqlText(JSON.stringify(normalizeLibrary(library)))} WHERE story_id = ${sqlText(storyId)}`
      );
      db.exec('COMMIT');
      await this.persist(db);
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  async updateGlobalLibrary(library: SettingLibrary): Promise<void> {
    const db = await this.getDb();
    db.exec(
      `INSERT OR REPLACE INTO meta (key, value) VALUES ('global_library_json', ${sqlText(JSON.stringify(normalizeLibrary(library)))})`
    );
    await this.persist(db);
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

  async exportStory(storyId: string): Promise<ExportedStoryData> {
    const data = await this.load();
    const story = data.stories.find((item) => item.id === storyId);
    if (!story) {
      throw new Error('故事不存在');
    }

    return {
      app: 'takecopter',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      story,
      workspace: data.workspaces[story.id] ?? { settings: [], tree: [], library: { ...EMPTY_LIBRARY } },
    };
  }

  async exportProjectToLocal(): Promise<string> {
    throw new Error('Web 端不支持本地导出目录，请在桌面端使用该功能');
  }

  async exportStoryToLocal(storyId: string): Promise<string> {
    void storyId;
    throw new Error('Web 端不支持本地导出目录，请在桌面端使用该功能');
  }

  async backupLocalDatabase(): Promise<string> {
    throw new Error('Web 端不支持本地数据库备份，请在桌面端使用该功能');
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
        `INSERT INTO workspaces (story_id, settings_json, tree_json, library_json) VALUES (${sqlText(story.id)}, ${sqlText(JSON.stringify(workspace.settings))}, ${sqlText(JSON.stringify(workspace.tree))}, ${sqlText(JSON.stringify(normalizeLibrary(workspace.library)))})`
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
