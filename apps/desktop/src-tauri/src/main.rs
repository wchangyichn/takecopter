#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod project;

use project::{
  create_story, ensure_project, export_project, import_project, update_settings, update_tree, ProjectState,
};

fn main() {
  tauri::Builder::default()
    .manage(ProjectState::default())
    .invoke_handler(tauri::generate_handler![
      ensure_project,
      create_story,
      update_settings,
      update_tree,
      export_project,
      import_project,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
