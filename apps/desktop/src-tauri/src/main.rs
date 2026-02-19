#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod project;

use project::{
  backup_local_database, create_story, ensure_project, export_project, export_project_to_local, export_story,
  export_story_to_local, get_bootstrap_state, import_project, import_story, initialize_project_root,
  open_project_root, open_story_database, open_story_folder, pick_project_root, rename_story, update_global_library,
  update_settings, update_story_library, update_tree, ProjectState,
};

fn main() {
  tauri::Builder::default()
    .manage(ProjectState::default())
    .invoke_handler(tauri::generate_handler![
      ensure_project,
      get_bootstrap_state,
      pick_project_root,
      initialize_project_root,
      open_project_root,
      create_story,
      rename_story,
      update_settings,
      update_story_library,
      update_global_library,
      update_tree,
      export_project,
      export_story,
      export_project_to_local,
      export_story_to_local,
      backup_local_database,
      import_project,
      import_story,
      open_story_folder,
      open_story_database,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
