use std::{
  fs,
  path::{Path, PathBuf},
  process::Command,
  sync::Mutex,
};

use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;

const CURRENT_SCHEMA_VERSION: i64 = 1;

#[derive(Default)]
pub struct ProjectState {
  project_root: Mutex<Option<PathBuf>>,
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
  pub settings: Vec<serde_json::Value>,
  pub tree: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectData {
  pub stories: Vec<Story>,
  pub workspaces: std::collections::HashMap<String, Workspace>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnsureProjectResponse {
  pub project_path: String,
  pub data: ProjectData,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapState {
  pub needs_setup: bool,
  pub default_root_path: String,
  pub active_root_path: Option<String>,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportedStoryData {
  pub app: String,
  pub schema_version: i64,
  pub exported_at: String,
  pub story: Story,
  pub workspace: Workspace,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectManifest {
  app: String,
  schema_version: i64,
  created_at: String,
  stories: Vec<Story>,
}

fn now_rfc3339() -> String {
  Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

fn default_root_path(app: &AppHandle) -> Result<PathBuf, String> {
  let app_data = app
    .path()
    .app_data_dir()
    .map_err(|error| format!("无法读取应用目录: {error}"))?;
  Ok(app_data.join("takecopter").join("projects").join("default.takecopter"))
}

fn selection_file_path(app: &AppHandle) -> Result<PathBuf, String> {
  let app_data = app
    .path()
    .app_data_dir()
    .map_err(|error| format!("无法读取应用目录: {error}"))?;
  Ok(app_data.join("takecopter").join("active_root_path.txt"))
}

fn read_selected_root(app: &AppHandle) -> Result<Option<PathBuf>, String> {
  let path = selection_file_path(app)?;
  if !path.exists() {
    return Ok(None);
  }

  let raw = fs::read_to_string(&path).map_err(|error| format!("读取项目选择记录失败: {error}"))?;
  let trimmed = raw.trim();
  if trimmed.is_empty() {
    return Ok(None);
  }

  Ok(Some(PathBuf::from(trimmed)))
}

fn write_selected_root(app: &AppHandle, root: &Path) -> Result<(), String> {
  let path = selection_file_path(app)?;
  if let Some(parent) = path.parent() {
    fs::create_dir_all(parent).map_err(|error| format!("写入项目选择记录失败: {error}"))?;
  }
  fs::write(path, root.to_string_lossy().to_string()).map_err(|error| format!("写入项目选择记录失败: {error}"))
}

fn project_manifest_path(root: &Path) -> PathBuf {
  root.join("project.json")
}

fn stories_root(root: &Path) -> PathBuf {
  root.join("stories")
}

fn story_root(root: &Path, story_id: &str) -> PathBuf {
  stories_root(root).join(story_id)
}

fn story_db_path(root: &Path, story_id: &str) -> PathBuf {
  story_root(root, story_id).join("story.db")
}

fn ensure_root_layout(root: &Path) -> Result<(), String> {
  fs::create_dir_all(stories_root(root)).map_err(|error| format!("无法创建项目目录: {error}"))?;
  fs::create_dir_all(root.join("exports")).map_err(|error| format!("无法创建项目目录: {error}"))?;

  let lock_path = root.join(".lock");
  let lock_content = format!("pid={}\nupdated_at={}\n", std::process::id(), now_rfc3339());
  fs::write(lock_path, lock_content).map_err(|error| format!("无法写入项目锁文件: {error}"))?;

  let manifest_path = project_manifest_path(root);
  if !manifest_path.exists() {
    let manifest = ProjectManifest {
      app: "takecopter".to_string(),
      schema_version: CURRENT_SCHEMA_VERSION,
      created_at: now_rfc3339(),
      stories: vec![],
    };
    let raw = serde_json::to_vec_pretty(&manifest).map_err(|error| error.to_string())?;
    fs::write(manifest_path, raw).map_err(|error| format!("无法写入项目元信息: {error}"))?;
  }

  Ok(())
}

fn read_manifest(root: &Path) -> Result<ProjectManifest, String> {
  let path = project_manifest_path(root);
  let raw = fs::read_to_string(path).map_err(|error| format!("读取项目元信息失败: {error}"))?;
  let manifest = serde_json::from_str::<ProjectManifest>(&raw).map_err(|error| format!("解析项目元信息失败: {error}"))?;
  if manifest.app != "takecopter" {
    return Err("无效的项目目录来源".to_string());
  }
  Ok(manifest)
}

fn write_manifest(root: &Path, manifest: &ProjectManifest) -> Result<(), String> {
  let raw = serde_json::to_vec_pretty(manifest).map_err(|error| error.to_string())?;
  fs::write(project_manifest_path(root), raw).map_err(|error| format!("写入项目元信息失败: {error}"))
}

fn update_story_metadata(manifest: &mut ProjectManifest, story: Story) {
  if let Some(index) = manifest.stories.iter().position(|item| item.id == story.id) {
    manifest.stories[index] = story;
  } else {
    manifest.stories.push(story);
  }
}

fn open_story_db(path: &Path) -> Result<Connection, String> {
  if let Some(parent) = path.parent() {
    fs::create_dir_all(parent).map_err(|error| format!("无法创建故事目录: {error}"))?;
    fs::create_dir_all(parent.join("assets").join("images")).map_err(|error| format!("无法创建故事目录: {error}"))?;
    fs::create_dir_all(parent.join("assets").join("videos")).map_err(|error| format!("无法创建故事目录: {error}"))?;
  }

  let conn = Connection::open(path).map_err(|error| format!("故事数据库打开失败: {error}"))?;
  conn
    .execute_batch(
      "
      CREATE TABLE IF NOT EXISTS workspace (
        id INTEGER PRIMARY KEY,
        settings_json TEXT NOT NULL,
        tree_json TEXT NOT NULL
      );
      ",
    )
    .map_err(|error| format!("初始化故事数据库失败: {error}"))?;

  Ok(conn)
}

fn read_workspace(path: &Path) -> Result<Workspace, String> {
  if !path.exists() {
    return Ok(Workspace {
      settings: vec![],
      tree: vec![],
    });
  }

  let conn = open_story_db(path)?;
  let row = conn
    .query_row("SELECT settings_json, tree_json FROM workspace WHERE id = 1", [], |row| {
      let settings_json: String = row.get(0)?;
      let tree_json: String = row.get(1)?;
      Ok((settings_json, tree_json))
    })
    .optional()
    .map_err(|error| format!("读取故事工作区失败: {error}"))?;

  if let Some((settings_json, tree_json)) = row {
    let settings = serde_json::from_str::<Vec<serde_json::Value>>(&settings_json)
      .map_err(|error| format!("解析故事设定失败: {error}"))?;
    let tree = serde_json::from_str::<Vec<serde_json::Value>>(&tree_json).map_err(|error| format!("解析故事树结构失败: {error}"))?;
    Ok(Workspace { settings, tree })
  } else {
    Ok(Workspace {
      settings: vec![],
      tree: vec![],
    })
  }
}

fn write_workspace(path: &Path, workspace: &Workspace) -> Result<(), String> {
  let conn = open_story_db(path)?;
  let settings_json = serde_json::to_string(&workspace.settings).map_err(|error| error.to_string())?;
  let tree_json = serde_json::to_string(&workspace.tree).map_err(|error| error.to_string())?;

  conn
    .execute(
      "INSERT INTO workspace (id, settings_json, tree_json) VALUES (1, ?1, ?2) ON CONFLICT(id) DO UPDATE SET settings_json = excluded.settings_json, tree_json = excluded.tree_json",
      params![settings_json, tree_json],
    )
    .map_err(|error| format!("写入故事工作区失败: {error}"))?;
  Ok(())
}

fn load_project_data(root: &Path) -> Result<ProjectData, String> {
  let mut manifest = read_manifest(root)?;
  manifest
    .stories
    .sort_by(|a, b| b.updated_at.cmp(&a.updated_at));

  let mut workspaces = std::collections::HashMap::new();
  for story in &manifest.stories {
    let workspace = read_workspace(&story_db_path(root, &story.id))?;
    workspaces.insert(story.id.clone(), workspace);
  }

  Ok(ProjectData {
    stories: manifest.stories,
    workspaces,
  })
}

fn resolve_state_root(app: &AppHandle, state: &ProjectState) -> Result<Option<PathBuf>, String> {
  if let Ok(guard) = state.project_root.lock() {
    if let Some(path) = guard.as_ref() {
      return Ok(Some(path.clone()));
    }
  }

  read_selected_root(app)
}

fn set_active_root(app: &AppHandle, state: &ProjectState, root: &Path) -> Result<(), String> {
  if let Ok(mut guard) = state.project_root.lock() {
    *guard = Some(root.to_path_buf());
  }
  write_selected_root(app, root)
}

fn require_active_root(app: &AppHandle, state: &ProjectState) -> Result<PathBuf, String> {
  resolve_state_root(app, state)?.ok_or_else(|| "请先创建项目目录或打开已有项目".to_string())
}

fn open_path_in_file_manager(path: &Path) -> Result<(), String> {
  #[cfg(target_os = "macos")]
  let mut cmd = {
    let mut c = Command::new("open");
    c.arg(path);
    c
  };

  #[cfg(target_os = "windows")]
  let mut cmd = {
    let mut c = Command::new("explorer");
    c.arg(path);
    c
  };

  #[cfg(all(unix, not(target_os = "macos")))]
  let mut cmd = {
    let mut c = Command::new("xdg-open");
    c.arg(path);
    c
  };

  cmd.status()
    .map_err(|error| format!("打开路径失败: {error}"))
    .and_then(|status| if status.success() { Ok(()) } else { Err("打开路径失败".to_string()) })
}

#[tauri::command]
pub fn get_bootstrap_state(app: AppHandle, state: State<ProjectState>) -> Result<BootstrapState, String> {
  let default_root = default_root_path(&app)?;
  let active_root = resolve_state_root(&app, &state)?;

  Ok(BootstrapState {
    needs_setup: active_root.is_none(),
    default_root_path: default_root.to_string_lossy().to_string(),
    active_root_path: active_root.map(|item| item.to_string_lossy().to_string()),
  })
}

#[tauri::command]
pub fn pick_project_root() -> Result<Option<String>, String> {
  let selected = rfd::FileDialog::new()
    .set_title("选择故事项目目录")
    .pick_folder();
  Ok(selected.map(|path| path.to_string_lossy().to_string()))
}

#[tauri::command]
pub fn initialize_project_root(app: AppHandle, state: State<ProjectState>, root_path: Option<String>) -> Result<(), String> {
  let target = if let Some(path) = root_path {
    let trimmed = path.trim();
    if trimmed.is_empty() {
      default_root_path(&app)?
    } else {
      PathBuf::from(trimmed)
    }
  } else {
    default_root_path(&app)?
  };

  ensure_root_layout(&target)?;
  set_active_root(&app, &state, &target)
}

#[tauri::command]
pub fn open_project_root(app: AppHandle, state: State<ProjectState>, root_path: String) -> Result<(), String> {
  let target = PathBuf::from(root_path.trim());
  if !target.exists() {
    return Err("项目目录不存在".to_string());
  }

  if !project_manifest_path(&target).exists() {
    return Err("未找到 project.json，请先创建项目目录或选择有效项目目录".to_string());
  }

  ensure_root_layout(&target)?;
  let _ = read_manifest(&target)?;
  set_active_root(&app, &state, &target)
}

#[tauri::command]
pub fn ensure_project(app: AppHandle, state: State<ProjectState>) -> Result<EnsureProjectResponse, String> {
  let root = require_active_root(&app, &state)?;
  ensure_root_layout(&root)?;
  let data = load_project_data(&root)?;
  Ok(EnsureProjectResponse {
    project_path: root.to_string_lossy().to_string(),
    data,
  })
}

#[tauri::command]
pub fn create_story(app: AppHandle, state: State<ProjectState>, input: CreateStoryInput) -> Result<Story, String> {
  let root = require_active_root(&app, &state)?;
  ensure_root_layout(&root)?;
  let mut manifest = read_manifest(&root)?;

  let id = Uuid::new_v4().to_string();
  let now = now_rfc3339();
  let colors = [
    "var(--coral-400)",
    "var(--violet-400)",
    "var(--teal-400)",
    "var(--amber-400)",
    "var(--rose-400)",
  ];
  let index = (Utc::now().timestamp_millis().unsigned_abs() as usize) % colors.len();
  let story = Story {
    id: id.clone(),
    title: input.title,
    description: input.description,
    updated_at: now,
    cover_color: colors[index].to_string(),
  };

  let workspace = Workspace {
    settings: vec![],
    tree: vec![],
  };
  write_workspace(&story_db_path(&root, &story.id), &workspace)?;

  update_story_metadata(&mut manifest, story.clone());
  write_manifest(&root, &manifest)?;

  Ok(story)
}

#[tauri::command]
pub fn update_settings(
  app: AppHandle,
  state: State<ProjectState>,
  story_id: String,
  settings: Vec<serde_json::Value>,
) -> Result<(), String> {
  let root = require_active_root(&app, &state)?;
  let mut manifest = read_manifest(&root)?;
  let Some(story) = manifest.stories.iter_mut().find(|item| item.id == story_id) else {
    return Err("故事不存在".to_string());
  };

  let current = read_workspace(&story_db_path(&root, &story_id))?;
  let next = Workspace {
    settings,
    tree: current.tree,
  };
  write_workspace(&story_db_path(&root, &story_id), &next)?;

  story.updated_at = now_rfc3339();
  write_manifest(&root, &manifest)
}

#[tauri::command]
pub fn update_tree(
  app: AppHandle,
  state: State<ProjectState>,
  story_id: String,
  tree: Vec<serde_json::Value>,
) -> Result<(), String> {
  let root = require_active_root(&app, &state)?;
  let mut manifest = read_manifest(&root)?;
  let Some(story) = manifest.stories.iter_mut().find(|item| item.id == story_id) else {
    return Err("故事不存在".to_string());
  };

  let current = read_workspace(&story_db_path(&root, &story_id))?;
  let next = Workspace {
    settings: current.settings,
    tree,
  };
  write_workspace(&story_db_path(&root, &story_id), &next)?;

  story.updated_at = now_rfc3339();
  write_manifest(&root, &manifest)
}

#[tauri::command]
pub fn export_project(app: AppHandle, state: State<ProjectState>) -> Result<ExportedProjectData, String> {
  let root = require_active_root(&app, &state)?;
  let data = load_project_data(&root)?;

  Ok(ExportedProjectData {
    app: "takecopter".to_string(),
    schema_version: CURRENT_SCHEMA_VERSION,
    exported_at: now_rfc3339(),
    data,
  })
}

#[tauri::command]
pub fn import_project(app: AppHandle, state: State<ProjectState>, payload: ExportedProjectData) -> Result<(), String> {
  if payload.app != "takecopter" {
    return Err("无效的项目文件来源".to_string());
  }
  if payload.schema_version > CURRENT_SCHEMA_VERSION {
    return Err("项目版本过新，请升级应用后再导入".to_string());
  }

  let root = require_active_root(&app, &state)?;
  ensure_root_layout(&root)?;

  let mut manifest = read_manifest(&root)?;
  manifest.stories = payload.data.stories.clone();
  write_manifest(&root, &manifest)?;

  for story in &payload.data.stories {
    let workspace = payload.data.workspaces.get(&story.id).cloned().unwrap_or(Workspace {
      settings: vec![],
      tree: vec![],
    });
    write_workspace(&story_db_path(&root, &story.id), &workspace)?;
  }

  Ok(())
}

#[tauri::command]
pub fn import_story(app: AppHandle, state: State<ProjectState>, payload: ExportedStoryData) -> Result<(), String> {
  if payload.app != "takecopter" {
    return Err("无效的故事文件来源".to_string());
  }
  if payload.schema_version > CURRENT_SCHEMA_VERSION {
    return Err("故事版本过新，请升级应用后再导入".to_string());
  }

  let root = require_active_root(&app, &state)?;
  ensure_root_layout(&root)?;

  let mut manifest = read_manifest(&root)?;
  update_story_metadata(&mut manifest, payload.story.clone());
  write_manifest(&root, &manifest)?;
  write_workspace(&story_db_path(&root, &payload.story.id), &payload.workspace)
}

#[tauri::command]
pub fn open_story_folder(app: AppHandle, state: State<ProjectState>, story_id: String) -> Result<(), String> {
  let root = require_active_root(&app, &state)?;
  let manifest = read_manifest(&root)?;
  if !manifest.stories.iter().any(|item| item.id == story_id) {
    return Err("故事不存在".to_string());
  }
  open_path_in_file_manager(&story_root(&root, &story_id))
}

#[tauri::command]
pub fn open_story_database(app: AppHandle, state: State<ProjectState>, story_id: String) -> Result<(), String> {
  let root = require_active_root(&app, &state)?;
  let manifest = read_manifest(&root)?;
  if !manifest.stories.iter().any(|item| item.id == story_id) {
    return Err("故事不存在".to_string());
  }
  open_path_in_file_manager(&story_db_path(&root, &story_id))
}
