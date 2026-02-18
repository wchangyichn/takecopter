use std::{
  collections::HashMap,
  fs,
  path::{Path, PathBuf},
  sync::Mutex,
};

use chrono::Utc;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;

const CURRENT_SCHEMA_VERSION: i64 = 1;

#[derive(Default)]
pub struct ProjectState {
  project_dir: Mutex<Option<PathBuf>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Story {
  pub id: String,
  pub title: String,
  pub description: String,
  pub updated_at: String,
  pub cover_color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
  pub settings: Vec<Value>,
  pub tree: Vec<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectData {
  pub stories: Vec<Story>,
  pub workspaces: HashMap<String, Workspace>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnsureProjectResponse {
  pub project_path: String,
  pub data: ProjectData,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateStoryInput {
  pub title: String,
  pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportedProjectData {
  pub app: String,
  pub schema_version: i64,
  pub exported_at: String,
  pub data: ProjectData,
}

fn resolve_project_dir(app: &AppHandle, state: &ProjectState) -> Result<PathBuf, String> {
  if let Ok(guard) = state.project_dir.lock() {
    if let Some(path) = guard.as_ref() {
      return Ok(path.clone());
    }
  }

  let app_data = app
    .path()
    .app_data_dir()
    .map_err(|error| format!("无法读取应用目录: {error}"))?;

  let project_dir = app_data.join("takecopter").join("default.takecopter");
  fs::create_dir_all(project_dir.join("assets").join("images"))
    .map_err(|error| format!("无法创建项目目录: {error}"))?;
  fs::create_dir_all(project_dir.join("assets").join("videos"))
    .map_err(|error| format!("无法创建项目目录: {error}"))?;
  fs::create_dir_all(project_dir.join("exports")).map_err(|error| format!("无法创建项目目录: {error}"))?;

  let lock_path = project_dir.join(".lock");
  let lock_content = format!(
    "pid={}\nupdated_at={}\n",
    std::process::id(),
    Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
  );
  fs::write(lock_path, lock_content).map_err(|error| format!("无法写入项目锁文件: {error}"))?;

  let metadata_path = project_dir.join("project.json");
  if !metadata_path.exists() {
    let metadata = serde_json::json!({
      "app": "takecopter",
      "schemaVersion": CURRENT_SCHEMA_VERSION,
      "createdAt": Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
    });
    fs::write(metadata_path, serde_json::to_vec_pretty(&metadata).map_err(|error| error.to_string())?)
      .map_err(|error| format!("无法写入项目元信息: {error}"))?;
  }

  if let Ok(mut guard) = state.project_dir.lock() {
    *guard = Some(project_dir.clone());
  }

  Ok(project_dir)
}

fn db_path(project_dir: &Path) -> PathBuf {
  project_dir.join("story.db")
}

fn open_db(project_dir: &Path) -> Result<Connection, String> {
  let connection = Connection::open(db_path(project_dir)).map_err(|error| format!("数据库打开失败: {error}"))?;
  initialize_schema(&connection)?;
  seed_if_empty(&connection)?;
  Ok(connection)
}

fn initialize_schema(conn: &Connection) -> Result<(), String> {
  conn.execute_batch(
    "
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
    ",
  )
  .map_err(|error| format!("初始化数据库失败: {error}"))?;

  let mut statement = conn
    .prepare("SELECT value FROM meta WHERE key='schema_version'")
    .map_err(|error| format!("读取数据库版本失败: {error}"))?;
  let mut rows = statement.query([]).map_err(|error| format!("读取数据库版本失败: {error}"))?;

  if let Some(row) = rows.next().map_err(|error| format!("读取数据库版本失败: {error}"))? {
    let version: i64 = row.get(0).map_err(|error| format!("读取数据库版本失败: {error}"))?;
    if version < CURRENT_SCHEMA_VERSION {
      conn.execute(
        "UPDATE meta SET value=?1 WHERE key='schema_version'",
        params![CURRENT_SCHEMA_VERSION.to_string()],
      )
      .map_err(|error| format!("升级数据库版本失败: {error}"))?;
    }
  } else {
    conn.execute(
      "INSERT INTO meta (key, value) VALUES ('schema_version', ?1)",
      params![CURRENT_SCHEMA_VERSION.to_string()],
    )
    .map_err(|error| format!("写入数据库版本失败: {error}"))?;
  }

  Ok(())
}

fn seed_if_empty(conn: &Connection) -> Result<(), String> {
  let total: i64 = conn
    .query_row("SELECT COUNT(*) FROM stories", [], |row| row.get(0))
    .map_err(|error| format!("读取数据库失败: {error}"))?;

  if total > 0 {
    return Ok(());
  }

  let seeds = default_project_data();
  replace_all(conn, &seeds)
}

fn default_project_data() -> ProjectData {
  let now = Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
  let stories = vec![
    Story {
      id: "seed-1".to_string(),
      title: "星港迷雾".to_string(),
      description: "一枚古代星图碎片在港口重现，引发多方势力争夺。".to_string(),
      updated_at: now.clone(),
      cover_color: "var(--coral-400)".to_string(),
    },
    Story {
      id: "seed-2".to_string(),
      title: "回声之城".to_string(),
      description: "一座会复述未来的城市，让每个选择都变得危险。".to_string(),
      updated_at: now,
      cover_color: "var(--violet-400)".to_string(),
    },
  ];

  let settings_json = serde_json::json!([
    {
      "id": "c1",
      "title": "林知夏",
      "type": "character",
      "summary": "主角，考古修复师，曾失去一段关键记忆",
      "color": "var(--coral-400)",
      "position": { "x": 200, "y": 150 },
      "relations": [{ "targetId": "c2", "type": "师徒" }]
    },
    {
      "id": "c2",
      "title": "沈舟教授",
      "type": "character",
      "summary": "文物学者，对古代航海文明有深度研究",
      "color": "var(--violet-400)",
      "position": { "x": 420, "y": 110 },
      "relations": [{ "targetId": "l1", "type": "任职于" }]
    },
    {
      "id": "l1",
      "title": "东港博物馆",
      "type": "location",
      "summary": "故事主场景，存放关键星图碎片",
      "color": "var(--teal-400)",
      "position": { "x": 360, "y": 290 },
      "relations": []
    }
  ]);

  let tree_json = serde_json::json!([
    {
      "id": "ep1",
      "type": "ep",
      "title": "第 1 集：碎片现身",
      "children": [
        {
          "id": "sc1",
          "type": "scene",
          "title": "场景 1：博物馆夜巡",
          "children": [
            {
              "id": "sh1",
              "type": "shot",
              "title": "镜头 1：大厅环摇",
              "children": [
                { "id": "t1", "type": "take", "title": "拍次 1", "children": [], "isSelected": true },
                { "id": "t2", "type": "take", "title": "拍次 2", "children": [] }
              ]
            }
          ]
        }
      ]
    }
  ]);

  let mut workspaces = HashMap::new();
  workspaces.insert(
    "seed-1".to_string(),
    Workspace {
      settings: settings_json.as_array().cloned().unwrap_or_default(),
      tree: tree_json.as_array().cloned().unwrap_or_default(),
    },
  );
  workspaces.insert(
    "seed-2".to_string(),
    Workspace {
      settings: vec![],
      tree: vec![],
    },
  );

  ProjectData { stories, workspaces }
}

fn replace_all(conn: &Connection, data: &ProjectData) -> Result<(), String> {
  conn.execute_batch("BEGIN;")
    .map_err(|error| format!("开启事务失败: {error}"))?;

  let result = (|| -> Result<(), String> {
    conn.execute("DELETE FROM workspaces", [])
      .map_err(|error| format!("清理工作区失败: {error}"))?;
    conn.execute("DELETE FROM stories", [])
      .map_err(|error| format!("清理故事失败: {error}"))?;

    for story in &data.stories {
      conn.execute(
        "INSERT INTO stories (id, title, description, updated_at, cover_color) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![story.id, story.title, story.description, story.updated_at, story.cover_color],
      )
      .map_err(|error| format!("写入故事失败: {error}"))?;
    }

    for story in &data.stories {
      let workspace = data.workspaces.get(&story.id).cloned().unwrap_or(Workspace {
        settings: vec![],
        tree: vec![],
      });
      let settings_json = serde_json::to_string(&workspace.settings).map_err(|error| error.to_string())?;
      let tree_json = serde_json::to_string(&workspace.tree).map_err(|error| error.to_string())?;

      conn.execute(
        "INSERT INTO workspaces (story_id, settings_json, tree_json) VALUES (?1, ?2, ?3)",
        params![story.id, settings_json, tree_json],
      )
      .map_err(|error| format!("写入工作区失败: {error}"))?;
    }

    Ok(())
  })();

  match result {
    Ok(()) => conn
      .execute_batch("COMMIT;")
      .map_err(|error| format!("提交事务失败: {error}")),
    Err(error) => {
      let _ = conn.execute_batch("ROLLBACK;");
      Err(error)
    }
  }
}

fn load_project_data(conn: &Connection) -> Result<ProjectData, String> {
  let mut story_stmt = conn
    .prepare("SELECT id, title, description, updated_at, cover_color FROM stories ORDER BY updated_at DESC")
    .map_err(|error| format!("读取故事失败: {error}"))?;

  let stories_iter = story_stmt
    .query_map([], |row| {
      Ok(Story {
        id: row.get(0)?,
        title: row.get(1)?,
        description: row.get(2)?,
        updated_at: row.get(3)?,
        cover_color: row.get(4)?,
      })
    })
    .map_err(|error| format!("读取故事失败: {error}"))?;

  let mut stories = Vec::new();
  for story in stories_iter {
    stories.push(story.map_err(|error| format!("读取故事失败: {error}"))?);
  }

  let mut workspace_stmt = conn
    .prepare("SELECT story_id, settings_json, tree_json FROM workspaces")
    .map_err(|error| format!("读取工作区失败: {error}"))?;

  let workspace_iter = workspace_stmt
    .query_map([], |row| {
      let story_id: String = row.get(0)?;
      let settings_json: String = row.get(1)?;
      let tree_json: String = row.get(2)?;
      Ok((story_id, settings_json, tree_json))
    })
    .map_err(|error| format!("读取工作区失败: {error}"))?;

  let mut workspaces = HashMap::new();
  for row in workspace_iter {
    let (story_id, settings_json, tree_json) = row.map_err(|error| format!("读取工作区失败: {error}"))?;
    let settings: Vec<Value> = serde_json::from_str(&settings_json).map_err(|error| format!("解析设定失败: {error}"))?;
    let tree: Vec<Value> = serde_json::from_str(&tree_json).map_err(|error| format!("解析树结构失败: {error}"))?;
    workspaces.insert(story_id, Workspace { settings, tree });
  }

  Ok(ProjectData { stories, workspaces })
}

#[tauri::command]
pub fn ensure_project(app: AppHandle, state: State<ProjectState>) -> Result<EnsureProjectResponse, String> {
  let project_dir = resolve_project_dir(&app, &state)?;
  let conn = open_db(&project_dir)?;
  let data = load_project_data(&conn)?;
  Ok(EnsureProjectResponse {
    project_path: project_dir.to_string_lossy().to_string(),
    data,
  })
}

#[tauri::command]
pub fn create_story(app: AppHandle, state: State<ProjectState>, input: CreateStoryInput) -> Result<Story, String> {
  let project_dir = resolve_project_dir(&app, &state)?;
  let conn = open_db(&project_dir)?;

  let id = Uuid::new_v4().to_string();
  let updated_at = Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
  let colors = [
    "var(--coral-400)",
    "var(--violet-400)",
    "var(--teal-400)",
    "var(--amber-400)",
    "var(--rose-400)",
  ];
  let index = (Utc::now().timestamp_millis().unsigned_abs() as usize) % colors.len();
  let cover_color = colors[index].to_string();

  let story = Story {
    id: id.clone(),
    title: input.title,
    description: input.description,
    updated_at: updated_at.clone(),
    cover_color,
  };

  conn.execute(
    "INSERT INTO stories (id, title, description, updated_at, cover_color) VALUES (?1, ?2, ?3, ?4, ?5)",
    params![story.id, story.title, story.description, story.updated_at, story.cover_color],
  )
  .map_err(|error| format!("创建故事失败: {error}"))?;

  conn.execute(
    "INSERT INTO workspaces (story_id, settings_json, tree_json) VALUES (?1, ?2, ?3)",
    params![id, "[]", "[]"],
  )
  .map_err(|error| format!("创建故事工作区失败: {error}"))?;

  Ok(story)
}

#[tauri::command]
pub fn update_settings(
  app: AppHandle,
  state: State<ProjectState>,
  story_id: String,
  settings: Vec<Value>,
) -> Result<(), String> {
  let project_dir = resolve_project_dir(&app, &state)?;
  let conn = open_db(&project_dir)?;
  let settings_json = serde_json::to_string(&settings).map_err(|error| error.to_string())?;
  let updated_at = Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true);

  conn.execute_batch("BEGIN;")
    .map_err(|error| format!("开启事务失败: {error}"))?;
  let result = (|| -> Result<(), String> {
    conn.execute(
      "UPDATE workspaces SET settings_json=?1 WHERE story_id=?2",
      params![settings_json, story_id],
    )
    .map_err(|error| format!("更新设定失败: {error}"))?;
    conn.execute(
      "UPDATE stories SET updated_at=?1 WHERE id=?2",
      params![updated_at, story_id],
    )
    .map_err(|error| format!("更新故事时间失败: {error}"))?;
    Ok(())
  })();

  match result {
    Ok(()) => conn
      .execute_batch("COMMIT;")
      .map_err(|error| format!("提交事务失败: {error}")),
    Err(error) => {
      let _ = conn.execute_batch("ROLLBACK;");
      Err(error)
    }
  }
}

#[tauri::command]
pub fn update_tree(
  app: AppHandle,
  state: State<ProjectState>,
  story_id: String,
  tree: Vec<Value>,
) -> Result<(), String> {
  let project_dir = resolve_project_dir(&app, &state)?;
  let conn = open_db(&project_dir)?;
  let tree_json = serde_json::to_string(&tree).map_err(|error| error.to_string())?;
  let updated_at = Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true);

  conn.execute_batch("BEGIN;")
    .map_err(|error| format!("开启事务失败: {error}"))?;
  let result = (|| -> Result<(), String> {
    conn.execute(
      "UPDATE workspaces SET tree_json=?1 WHERE story_id=?2",
      params![tree_json, story_id],
    )
    .map_err(|error| format!("更新创作树失败: {error}"))?;
    conn.execute(
      "UPDATE stories SET updated_at=?1 WHERE id=?2",
      params![updated_at, story_id],
    )
    .map_err(|error| format!("更新故事时间失败: {error}"))?;
    Ok(())
  })();

  match result {
    Ok(()) => conn
      .execute_batch("COMMIT;")
      .map_err(|error| format!("提交事务失败: {error}")),
    Err(error) => {
      let _ = conn.execute_batch("ROLLBACK;");
      Err(error)
    }
  }
}

#[tauri::command]
pub fn export_project(app: AppHandle, state: State<ProjectState>) -> Result<ExportedProjectData, String> {
  let project_dir = resolve_project_dir(&app, &state)?;
  let conn = open_db(&project_dir)?;
  let data = load_project_data(&conn)?;

  Ok(ExportedProjectData {
    app: "takecopter".to_string(),
    schema_version: CURRENT_SCHEMA_VERSION,
    exported_at: Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
    data,
  })
}

#[tauri::command]
pub fn import_project(
  app: AppHandle,
  state: State<ProjectState>,
  payload: ExportedProjectData,
) -> Result<(), String> {
  if payload.app != "takecopter" {
    return Err("无效的项目文件来源".to_string());
  }

  if payload.schema_version > CURRENT_SCHEMA_VERSION {
    return Err("项目版本过新，请升级应用后再导入".to_string());
  }

  let project_dir = resolve_project_dir(&app, &state)?;
  let conn = open_db(&project_dir)?;
  replace_all(&conn, &payload.data)
}
