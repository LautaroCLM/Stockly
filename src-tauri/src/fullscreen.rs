//! F11 toggles real fullscreen on the main window.
//!
//! The window loads the hosted web app, so the shortcut lives here (Rust)
//! instead of exposing Tauri IPC to a remote origin. F11 is registered only
//! while Stockly has focus, so other programs keep their own F11.

use tauri::{App, Manager, WebviewWindow, WindowEvent};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Shortcut, ShortcutState};

fn toggle(window: &WebviewWindow) {
  let is_fullscreen = window.is_fullscreen().unwrap_or(false);
  if let Err(err) = window.set_fullscreen(!is_fullscreen) {
    log::warn!("could not toggle fullscreen: {err}");
  }
}

pub fn setup(app: &mut App) -> tauri::Result<()> {
  let f11 = Shortcut::new(None, Code::F11);

  app.handle().plugin(
    tauri_plugin_global_shortcut::Builder::new()
      .with_handler(move |app, shortcut, event| {
        if shortcut == &f11 && event.state() == ShortcutState::Pressed {
          if let Some(window) = app.get_webview_window("main") {
            toggle(&window);
          }
        }
      })
      .build(),
  )?;

  let Some(window) = app.get_webview_window("main") else {
    return Ok(());
  };

  // The window may already have focus before the listener below exists.
  if window.is_focused().unwrap_or(false) {
    let _ = app.global_shortcut().register(f11);
  }

  let handle = app.handle().clone();
  window.on_window_event(move |event| {
    if let WindowEvent::Focused(focused) = event {
      let shortcuts = handle.global_shortcut();
      let result = if *focused {
        shortcuts.register(f11)
      } else {
        shortcuts.unregister(f11)
      };
      if let Err(err) = result {
        log::warn!("F11 shortcut (focused={focused}): {err}");
      }
    }
  });

  Ok(())
}
