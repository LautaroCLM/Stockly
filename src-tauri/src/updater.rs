//! Actualización automática de la app de escritorio.
//!
//! Al abrir, consulta en GitHub si hay una versión nueva. Si la hay, pregunta antes de instalar.
//! El instalador viene firmado con la clave de Stockly: el plugin rechaza uno sin firma válida.
//! Todo corre en Rust, así la web (que se carga desde internet) no recibe ningún permiso.

use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_updater::UpdaterExt;

pub fn setup(app: &tauri::App) -> tauri::Result<()> {
  app.handle().plugin(tauri_plugin_dialog::init())?;
  app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;

  let handle = app.handle().clone();
  tauri::async_runtime::spawn(async move {
    if let Err(err) = check_and_offer(handle).await {
      // Sin internet o GitHub caído: se intenta de nuevo la próxima vez que se abra
      log::warn!("no se pudo buscar actualizaciones: {err}");
    }
  });
  Ok(())
}

async fn check_and_offer(app: AppHandle) -> Result<(), Box<dyn std::error::Error>> {
  let Some(update) = app.updater()?.check().await? else {
    return Ok(());
  };

  let question = format!(
    "Hay una versión nueva de Stockly ({}). Tenés la {}.\n\nSe instala en unos segundos y Stockly se vuelve a abrir solo.",
    update.version, update.current_version
  );
  let dialog = app
    .dialog()
    .message(question)
    .title("Actualización de Stockly")
    .kind(MessageDialogKind::Info)
    .buttons(MessageDialogButtons::OkCancelCustom("Actualizar ahora".into(), "Más tarde".into()));
  let accepted = tauri::async_runtime::spawn_blocking(move || dialog.blocking_show()).await?;
  if !accepted {
    return Ok(());
  }

  if let Err(err) = update.download_and_install(|_, _| {}, || {}).await {
    let failure = app
      .dialog()
      .message(format!("No se pudo instalar la actualización. Probá de nuevo más tarde.\n\nDetalle: {err}"))
      .title("Actualización de Stockly")
      .kind(MessageDialogKind::Error);
    tauri::async_runtime::spawn_blocking(move || failure.blocking_show()).await?;
    return Ok(());
  }
  // En Windows el instalador cierra la app; en el resto se reinicia acá
  if let Some(window) = app.get_webview_window("main") {
    let _ = window.hide();
  }
  app.restart();
}
