#[cfg(desktop)]
mod fullscreen;
#[cfg(desktop)]
mod updater;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      #[cfg(desktop)]
      fullscreen::setup(app)?;
      #[cfg(desktop)]
      updater::setup(app)?;
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
