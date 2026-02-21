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
pub struct SettingTag {
    pub name: String,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingCustomField {
    pub name: String,
    pub value: String,
    #[serde(default)]
    pub size: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingTemplatePreset {
    pub r#type: String,
    #[serde(default)]
    pub summary: Option<String>,
    #[serde(default)]
    pub content: Option<String>,
    #[serde(default)]
    pub image_url: Option<String>,
    #[serde(default)]
    pub category: Option<String>,
    #[serde(default)]
    pub tags: Vec<SettingTag>,
    #[serde(default)]
    pub custom_fields: Vec<SettingCustomField>,
    #[serde(default)]
    pub color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingTemplate {
    pub id: String,
    pub name: String,
    pub preset: SettingTemplatePreset,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingLibrary {
    #[serde(default)]
    pub tags: Vec<SettingTag>,
    #[serde(default)]
    pub categories: Vec<String>,
    #[serde(default)]
    pub templates: Vec<SettingTemplate>,
}

fn default_library() -> SettingLibrary {
    SettingLibrary {
        tags: vec![],
        categories: vec!["世界观".to_string(), "角色".to_string(), "道具".to_string()],
        templates: vec![],
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub settings: Vec<serde_json::Value>,
    pub tree: Vec<serde_json::Value>,
    #[serde(default = "default_library")]
    pub library: SettingLibrary,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectData {
    pub stories: Vec<Story>,
    pub workspaces: std::collections::HashMap<String, Workspace>,
    #[serde(default = "default_library")]
    pub shared_library: SettingLibrary,
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
    #[serde(default = "default_library")]
    shared_library: SettingLibrary,
    stories: Vec<StoryManifestEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoryManifestEntry {
    story: Story,
    folder_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyProjectManifest {
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
    Ok(app_data
        .join("takecopter")
        .join("projects")
        .join("default.takecopter"))
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

    let raw =
        fs::read_to_string(&path).map_err(|error| format!("读取项目选择记录失败: {error}"))?;
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
    fs::write(path, root.to_string_lossy().to_string())
        .map_err(|error| format!("写入项目选择记录失败: {error}"))
}

fn project_manifest_path(root: &Path) -> PathBuf {
    root.join("project.json")
}

fn stories_root(root: &Path) -> PathBuf {
    root.join("stories")
}

fn slugify_story_title(title: &str) -> String {
    let mut slug = String::new();
    let mut last_dash = false;

    for ch in title.chars() {
        if ch.is_ascii_alphanumeric() {
            slug.push(ch.to_ascii_lowercase());
            last_dash = false;
        } else if !last_dash {
            slug.push('-');
            last_dash = true;
        }
    }

    let slug = slug.trim_matches('-').to_string();
    if slug.is_empty() {
        "story".to_string()
    } else {
        slug
    }
}

fn make_story_folder_name(title: &str, story_id: &str) -> String {
    let short_id = story_id.chars().take(8).collect::<String>();
    format!("{}-{}", slugify_story_title(title), short_id)
}

fn story_root(root: &Path, folder_name: &str) -> PathBuf {
    stories_root(root).join(folder_name)
}

fn story_db_path(root: &Path, folder_name: &str) -> PathBuf {
    story_root(root, folder_name).join("story.db")
}

fn ensure_root_layout(root: &Path) -> Result<(), String> {
    fs::create_dir_all(stories_root(root)).map_err(|error| format!("无法创建项目目录: {error}"))?;
    fs::create_dir_all(root.join("exports"))
        .map_err(|error| format!("无法创建项目目录: {error}"))?;

    let lock_path = root.join(".lock");
    let lock_content = format!("pid={}\nupdated_at={}\n", std::process::id(), now_rfc3339());
    fs::write(lock_path, lock_content).map_err(|error| format!("无法写入项目锁文件: {error}"))?;

    let manifest_path = project_manifest_path(root);
    if !manifest_path.exists() {
        let manifest = ProjectManifest {
            app: "takecopter".to_string(),
            schema_version: CURRENT_SCHEMA_VERSION,
            created_at: now_rfc3339(),
            shared_library: default_library(),
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
    let manifest = match serde_json::from_str::<ProjectManifest>(&raw) {
        Ok(current) => current,
        Err(_) => {
            let legacy = serde_json::from_str::<LegacyProjectManifest>(&raw)
                .map_err(|error| format!("解析项目元信息失败: {error}"))?;
            ProjectManifest {
                app: legacy.app,
                schema_version: legacy.schema_version,
                created_at: legacy.created_at,
                shared_library: default_library(),
                stories: legacy
                    .stories
                    .into_iter()
                    .map(|story| StoryManifestEntry {
                        folder_name: make_story_folder_name(&story.title, &story.id),
                        story,
                    })
                    .collect(),
            }
        }
    };
    if manifest.app != "takecopter" {
        return Err("无效的项目目录来源".to_string());
    }
    Ok(manifest)
}

fn write_manifest(root: &Path, manifest: &ProjectManifest) -> Result<(), String> {
    let raw = serde_json::to_vec_pretty(manifest).map_err(|error| error.to_string())?;
    fs::write(project_manifest_path(root), raw)
        .map_err(|error| format!("写入项目元信息失败: {error}"))
}

fn open_story_db(path: &Path) -> Result<Connection, String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("无法创建故事目录: {error}"))?;
        fs::create_dir_all(parent.join("assets").join("images"))
            .map_err(|error| format!("无法创建故事目录: {error}"))?;
        fs::create_dir_all(parent.join("assets").join("videos"))
            .map_err(|error| format!("无法创建故事目录: {error}"))?;
    }

    let conn = Connection::open(path).map_err(|error| format!("故事数据库打开失败: {error}"))?;
    conn.execute_batch(
        "
      CREATE TABLE IF NOT EXISTS workspace (
        id INTEGER PRIMARY KEY,
        settings_json TEXT NOT NULL,
        tree_json TEXT NOT NULL,
        library_json TEXT NOT NULL DEFAULT '{\"tags\":[],\"categories\":[]}'
      );
      ",
    )
    .map_err(|error| format!("初始化故事数据库失败: {error}"))?;

    let _ = conn.execute(
    "ALTER TABLE workspace ADD COLUMN library_json TEXT NOT NULL DEFAULT '{\"tags\":[],\"categories\":[]}'",
    [],
  );

    Ok(conn)
}

fn read_workspace(path: &Path) -> Result<Workspace, String> {
    if !path.exists() {
        return Ok(Workspace {
            settings: vec![],
            tree: vec![],
            library: default_library(),
        });
    }

    let conn = open_story_db(path)?;
    let row = conn
        .query_row(
            "SELECT settings_json, tree_json, library_json FROM workspace WHERE id = 1",
            [],
            |row| {
                let settings_json: String = row.get(0)?;
                let tree_json: String = row.get(1)?;
                let library_json: Option<String> = row.get(2)?;
                Ok((settings_json, tree_json, library_json))
            },
        )
        .optional()
        .map_err(|error| format!("读取故事工作区失败: {error}"))?;

    if let Some((settings_json, tree_json, library_json)) = row {
        let settings = serde_json::from_str::<Vec<serde_json::Value>>(&settings_json)
            .map_err(|error| format!("解析故事设定失败: {error}"))?;
        let tree = serde_json::from_str::<Vec<serde_json::Value>>(&tree_json)
            .map_err(|error| format!("解析故事树结构失败: {error}"))?;
        let library = library_json
            .as_deref()
            .map(|raw| {
                serde_json::from_str::<SettingLibrary>(raw).unwrap_or_else(|_| default_library())
            })
            .unwrap_or_else(default_library);
        Ok(Workspace {
            settings,
            tree,
            library,
        })
    } else {
        Ok(Workspace {
            settings: vec![],
            tree: vec![],
            library: default_library(),
        })
    }
}

fn write_workspace(path: &Path, workspace: &Workspace) -> Result<(), String> {
    let conn = open_story_db(path)?;
    let settings_json =
        serde_json::to_string(&workspace.settings).map_err(|error| error.to_string())?;
    let tree_json = serde_json::to_string(&workspace.tree).map_err(|error| error.to_string())?;
    let library_json =
        serde_json::to_string(&workspace.library).map_err(|error| error.to_string())?;

    conn
    .execute(
      "INSERT INTO workspace (id, settings_json, tree_json, library_json) VALUES (1, ?1, ?2, ?3) ON CONFLICT(id) DO UPDATE SET settings_json = excluded.settings_json, tree_json = excluded.tree_json, library_json = excluded.library_json",
      params![settings_json, tree_json, library_json],
    )
    .map_err(|error| format!("写入故事工作区失败: {error}"))?;
    Ok(())
}

fn find_story_entry<'a>(
    manifest: &'a ProjectManifest,
    story_id: &str,
) -> Option<&'a StoryManifestEntry> {
    manifest
        .stories
        .iter()
        .find(|item| item.story.id == story_id)
}

fn find_story_entry_mut<'a>(
    manifest: &'a mut ProjectManifest,
    story_id: &str,
) -> Option<&'a mut StoryManifestEntry> {
    manifest
        .stories
        .iter_mut()
        .find(|item| item.story.id == story_id)
}

fn load_project_data(root: &Path) -> Result<ProjectData, String> {
    let mut manifest = read_manifest(root)?;
    manifest
        .stories
        .sort_by(|a, b| b.story.updated_at.cmp(&a.story.updated_at));

    let mut workspaces = std::collections::HashMap::new();
    for entry in &manifest.stories {
        let db_path = story_db_path(root, &entry.folder_name);
        let legacy_db_path = stories_root(root).join(&entry.story.id).join("story.db");

        if !db_path.exists() && legacy_db_path.exists() {
            if let Some(parent) = db_path.parent() {
                fs::create_dir_all(parent).map_err(|error| format!("迁移故事目录失败: {error}"))?;
            }
            fs::rename(&legacy_db_path, &db_path)
                .map_err(|error| format!("迁移故事数据库失败: {error}"))?;
        }

        let workspace = read_workspace(&db_path)?;
        workspaces.insert(entry.story.id.clone(), workspace);
    }

    Ok(ProjectData {
        stories: manifest
            .stories
            .into_iter()
            .map(|item| item.story)
            .collect(),
        workspaces,
        shared_library: manifest.shared_library,
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
        .and_then(|status| {
            if status.success() {
                Ok(())
            } else {
                Err("打开路径失败".to_string())
            }
        })
}

fn copy_dir_recursive(from: &Path, to: &Path) -> Result<(), String> {
    fs::create_dir_all(to).map_err(|error| format!("创建备份目录失败: {error}"))?;
    for entry in fs::read_dir(from).map_err(|error| format!("读取目录失败: {error}"))? {
        let entry = entry.map_err(|error| format!("读取目录失败: {error}"))?;
        let src = entry.path();
        let dst = to.join(entry.file_name());
        if src.is_dir() {
            copy_dir_recursive(&src, &dst)?;
        } else {
            fs::copy(&src, &dst).map_err(|error| format!("复制文件失败: {error}"))?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn get_bootstrap_state(
    app: AppHandle,
    state: State<ProjectState>,
) -> Result<BootstrapState, String> {
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
pub fn initialize_project_root(
    app: AppHandle,
    state: State<ProjectState>,
    root_path: Option<String>,
) -> Result<(), String> {
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
pub fn open_project_root(
    app: AppHandle,
    state: State<ProjectState>,
    root_path: String,
) -> Result<(), String> {
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
pub fn ensure_project(
    app: AppHandle,
    state: State<ProjectState>,
) -> Result<EnsureProjectResponse, String> {
    let root = require_active_root(&app, &state)?;
    ensure_root_layout(&root)?;
    let data = load_project_data(&root)?;
    Ok(EnsureProjectResponse {
        project_path: root.to_string_lossy().to_string(),
        data,
    })
}

#[tauri::command]
pub fn create_story(
    app: AppHandle,
    state: State<ProjectState>,
    input: CreateStoryInput,
) -> Result<Story, String> {
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
    let folder_name = make_story_folder_name(&story.title, &story.id);

    let workspace = Workspace {
        settings: vec![],
        tree: vec![],
        library: default_library(),
    };
    write_workspace(&story_db_path(&root, &folder_name), &workspace)?;

    manifest.stories.push(StoryManifestEntry {
        story: story.clone(),
        folder_name,
    });
    write_manifest(&root, &manifest)?;

    Ok(story)
}

#[tauri::command]
pub fn rename_story(
    app: AppHandle,
    state: State<ProjectState>,
    story_id: String,
    title: String,
) -> Result<Story, String> {
    let clean_title = title.trim();
    if clean_title.is_empty() {
        return Err("故事名称不能为空".to_string());
    }

    let root = require_active_root(&app, &state)?;
    let mut manifest = read_manifest(&root)?;
    let updated_story = {
        let Some(entry) = find_story_entry_mut(&mut manifest, &story_id) else {
            return Err("故事不存在".to_string());
        };

        let old_folder_name = entry.folder_name.clone();
        let next_folder_name = make_story_folder_name(clean_title, &story_id);

        if old_folder_name != next_folder_name {
            let old_path = story_root(&root, &old_folder_name);
            let next_path = story_root(&root, &next_folder_name);
            if old_path.exists() {
                if next_path.exists() {
                    return Err("目标故事目录已存在，请使用其他名称".to_string());
                }
                fs::rename(&old_path, &next_path)
                    .map_err(|error| format!("重命名故事目录失败: {error}"))?;
            }
            entry.folder_name = next_folder_name;
        }

        entry.story.title = clean_title.to_string();
        entry.story.updated_at = now_rfc3339();
        entry.story.clone()
    };

    write_manifest(&root, &manifest)?;
    Ok(updated_story)
}

#[tauri::command]
pub fn delete_story(
    app: AppHandle,
    state: State<ProjectState>,
    story_id: String,
) -> Result<(), String> {
    let root = require_active_root(&app, &state)?;
    let mut manifest = read_manifest(&root)?;

    let index = manifest
        .stories
        .iter()
        .position(|item| item.story.id == story_id)
        .ok_or_else(|| "故事不存在".to_string())?;

    let folder_name = manifest.stories[index].folder_name.clone();
    let folder_path = story_root(&root, &folder_name);
    if folder_path.exists() {
        fs::remove_dir_all(&folder_path).map_err(|error| format!("删除故事目录失败: {error}"))?;
    }

    manifest.stories.remove(index);
    write_manifest(&root, &manifest)
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
    let Some(entry) = find_story_entry_mut(&mut manifest, &story_id) else {
        return Err("故事不存在".to_string());
    };

    let current = read_workspace(&story_db_path(&root, &entry.folder_name))?;
    let next = Workspace {
        settings,
        tree: current.tree,
        library: current.library,
    };
    write_workspace(&story_db_path(&root, &entry.folder_name), &next)?;

    entry.story.updated_at = now_rfc3339();
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
    let Some(entry) = find_story_entry_mut(&mut manifest, &story_id) else {
        return Err("故事不存在".to_string());
    };

    let current = read_workspace(&story_db_path(&root, &entry.folder_name))?;
    let next = Workspace {
        settings: current.settings,
        tree,
        library: current.library,
    };
    write_workspace(&story_db_path(&root, &entry.folder_name), &next)?;

    entry.story.updated_at = now_rfc3339();
    write_manifest(&root, &manifest)
}

#[tauri::command]
pub fn update_story_library(
    app: AppHandle,
    state: State<ProjectState>,
    story_id: String,
    library: SettingLibrary,
) -> Result<(), String> {
    let root = require_active_root(&app, &state)?;
    let mut manifest = read_manifest(&root)?;
    let Some(entry) = find_story_entry_mut(&mut manifest, &story_id) else {
        return Err("故事不存在".to_string());
    };

    let mut current = read_workspace(&story_db_path(&root, &entry.folder_name))?;
    current.library = library;
    write_workspace(&story_db_path(&root, &entry.folder_name), &current)?;

    entry.story.updated_at = now_rfc3339();
    write_manifest(&root, &manifest)
}

#[tauri::command]
pub fn update_global_library(
    app: AppHandle,
    state: State<ProjectState>,
    library: SettingLibrary,
) -> Result<(), String> {
    let root = require_active_root(&app, &state)?;
    let mut manifest = read_manifest(&root)?;
    manifest.shared_library = library;
    write_manifest(&root, &manifest)
}

#[tauri::command]
pub fn export_project(
    app: AppHandle,
    state: State<ProjectState>,
) -> Result<ExportedProjectData, String> {
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
pub fn export_story(
    app: AppHandle,
    state: State<ProjectState>,
    story_id: String,
) -> Result<ExportedStoryData, String> {
    let root = require_active_root(&app, &state)?;
    let manifest = read_manifest(&root)?;
    let Some(entry) = find_story_entry(&manifest, &story_id) else {
        return Err("故事不存在".to_string());
    };

    let workspace = read_workspace(&story_db_path(&root, &entry.folder_name))?;
    Ok(ExportedStoryData {
        app: "takecopter".to_string(),
        schema_version: CURRENT_SCHEMA_VERSION,
        exported_at: now_rfc3339(),
        story: entry.story.clone(),
        workspace,
    })
}

#[tauri::command]
pub fn export_project_to_local(
    app: AppHandle,
    state: State<ProjectState>,
) -> Result<String, String> {
    let root = require_active_root(&app, &state)?;
    let payload = export_project(app, state)?;
    let export_dir = root.join("exports");
    fs::create_dir_all(&export_dir).map_err(|error| format!("创建导出目录失败: {error}"))?;
    let file_path = export_dir.join(format!(
        "takecopter-project-{}.json",
        Utc::now().format("%Y%m%d-%H%M%S")
    ));
    let raw = serde_json::to_vec_pretty(&payload).map_err(|error| error.to_string())?;
    fs::write(&file_path, raw).map_err(|error| format!("写入导出文件失败: {error}"))?;
    open_path_in_file_manager(&export_dir)?;
    Ok(export_dir.to_string_lossy().to_string())
}

#[tauri::command]
pub fn export_story_to_local(
    app: AppHandle,
    state: State<ProjectState>,
    story_id: String,
) -> Result<String, String> {
    let root = require_active_root(&app, &state)?;
    let payload = export_story(app, state, story_id)?;
    let export_dir = root.join("exports");
    fs::create_dir_all(&export_dir).map_err(|error| format!("创建导出目录失败: {error}"))?;
    let file_path = export_dir.join(format!(
        "takecopter-story-{}-{}.json",
        payload.story.id,
        Utc::now().format("%Y%m%d-%H%M%S")
    ));
    let raw = serde_json::to_vec_pretty(&payload).map_err(|error| error.to_string())?;
    fs::write(&file_path, raw).map_err(|error| format!("写入导出文件失败: {error}"))?;
    open_path_in_file_manager(&export_dir)?;
    Ok(export_dir.to_string_lossy().to_string())
}

#[tauri::command]
pub fn backup_local_database(app: AppHandle, state: State<ProjectState>) -> Result<String, String> {
    let root = require_active_root(&app, &state)?;
    let export_dir = root.join("exports");
    fs::create_dir_all(&export_dir).map_err(|error| format!("创建备份目录失败: {error}"))?;
    let backup_dir = export_dir.join(format!("backup-{}", Utc::now().format("%Y%m%d-%H%M%S")));
    copy_dir_recursive(&root, &backup_dir)?;
    open_path_in_file_manager(&backup_dir)?;
    Ok(backup_dir.to_string_lossy().to_string())
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

    let root = require_active_root(&app, &state)?;
    ensure_root_layout(&root)?;

    let mut manifest = read_manifest(&root)?;
    manifest.shared_library = payload.data.shared_library.clone();
    manifest.stories = payload
        .data
        .stories
        .iter()
        .map(|story| StoryManifestEntry {
            story: story.clone(),
            folder_name: make_story_folder_name(&story.title, &story.id),
        })
        .collect();
    write_manifest(&root, &manifest)?;

    for entry in &manifest.stories {
        let workspace = payload
            .data
            .workspaces
            .get(&entry.story.id)
            .cloned()
            .unwrap_or(Workspace {
                settings: vec![],
                tree: vec![],
                library: default_library(),
            });
        write_workspace(&story_db_path(&root, &entry.folder_name), &workspace)?;
    }

    Ok(())
}

#[tauri::command]
pub fn import_story(
    app: AppHandle,
    state: State<ProjectState>,
    payload: ExportedStoryData,
) -> Result<(), String> {
    if payload.app != "takecopter" {
        return Err("无效的故事文件来源".to_string());
    }
    if payload.schema_version > CURRENT_SCHEMA_VERSION {
        return Err("故事版本过新，请升级应用后再导入".to_string());
    }

    let root = require_active_root(&app, &state)?;
    ensure_root_layout(&root)?;

    let mut manifest = read_manifest(&root)?;
    let folder_name = if let Some(existing) = find_story_entry(&manifest, &payload.story.id) {
        existing.folder_name.clone()
    } else {
        make_story_folder_name(&payload.story.title, &payload.story.id)
    };

    if let Some(entry) = find_story_entry_mut(&mut manifest, &payload.story.id) {
        entry.story = payload.story.clone();
        entry.folder_name = folder_name.clone();
    } else {
        manifest.stories.push(StoryManifestEntry {
            story: payload.story.clone(),
            folder_name: folder_name.clone(),
        });
    }

    write_manifest(&root, &manifest)?;
    write_workspace(&story_db_path(&root, &folder_name), &payload.workspace)
}

#[tauri::command]
pub fn open_story_folder(
    app: AppHandle,
    state: State<ProjectState>,
    story_id: String,
) -> Result<(), String> {
    let root = require_active_root(&app, &state)?;
    let manifest = read_manifest(&root)?;
    let Some(entry) = find_story_entry(&manifest, &story_id) else {
        return Err("故事不存在".to_string());
    };
    open_path_in_file_manager(&story_root(&root, &entry.folder_name))
}

#[tauri::command]
pub fn open_story_database(
    app: AppHandle,
    state: State<ProjectState>,
    story_id: String,
) -> Result<(), String> {
    let root = require_active_root(&app, &state)?;
    let manifest = read_manifest(&root)?;
    let Some(entry) = find_story_entry(&manifest, &story_id) else {
        return Err("故事不存在".to_string());
    };
    open_path_in_file_manager(&story_db_path(&root, &entry.folder_name))
}
