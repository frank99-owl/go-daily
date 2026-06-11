use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::window::Color;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_shell::ShellExt;

const PRODUCTION_URL: &str = "https://go-daily.app";
const RELOAD_ID: &str = "reload";

/// Hosts that must stay inside the webview so the OAuth round-trip
/// (go-daily.app -> supabase -> Google -> supabase -> go-daily.app)
/// completes in-app. Everything else opens in the default browser.
fn stays_in_webview(url: &url::Url, base_host: &str) -> bool {
    match url.host_str() {
        Some(h) => {
            h == base_host
                || h.ends_with(".supabase.co")
                || h == "accounts.google.com"
        }
        None => false,
    }
}

fn build_app_menu(app: &tauri::AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let pkg = app.package_info().name.clone();

    let reload = MenuItem::with_id(app, RELOAD_ID, "Reload Page", true, Some("CmdOrCtrl+R"))?;

    let edit_menu = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;

    let view_menu = Submenu::with_items(
        app,
        "View",
        true,
        &[
            &reload,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::fullscreen(app, None)?,
        ],
    )?;

    let window_menu = Submenu::with_items(
        app,
        "Window",
        true,
        &[
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::maximize(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::close_window(app, None)?,
        ],
    )?;

    let menu = Menu::with_items(
        app,
        &[
            #[cfg(target_os = "macos")]
            &Submenu::with_items(
                app,
                pkg,
                true,
                &[
                    &PredefinedMenuItem::about(app, None, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::hide(app, None)?,
                    &PredefinedMenuItem::hide_others(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::quit(app, None)?,
                ],
            )?,
            &edit_menu,
            &view_menu,
            &window_menu,
        ],
    )?;

    Ok(menu)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_filename("window-state.json")
                .build(),
        )
        .menu(build_app_menu)
        .on_menu_event(|app, event| {
            if event.id() == RELOAD_ID {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.eval("location.reload()");
                }
            }
        })
        .setup(|app| {
            let base_url = if cfg!(debug_assertions) {
                std::env::var("TAURI_DEV_URL")
                    .unwrap_or_else(|_| "http://localhost:3000".to_string())
            } else {
                PRODUCTION_URL.to_string()
            };

            let app_handle = app.handle().clone();
            let nav_url = url::Url::parse(&base_url).expect("invalid URL");
            let base_host = nav_url.host_str().unwrap_or("").to_string();

            // go-daily dark background — matches the site's deep dark tone
            // Prevents white flash on load and keeps the window feeling seamless
            let bg = Color(10, 10, 26, 255);

            #[allow(deprecated)]
            let _window =
                WebviewWindowBuilder::new(app, "main", WebviewUrl::External(nav_url))
                    .title("Go Daily")
                    .inner_size(1080.0, 674.0)
                    .min_inner_size(800.0, 500.0)
                    .resizable(true)
                    .fullscreen(false)
                    .center()
                    .title_bar_style(tauri::TitleBarStyle::Overlay)
                    .hidden_title(true)
                    .background_color(bg)
                    .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15")
                    .on_navigation(move |url| {
                        if stays_in_webview(&url, &base_host) {
                            true
                        } else {
                            let _ = app_handle.shell().open(url.as_str(), None);
                            false
                        }
                    })
                    .build()?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Go Daily desktop app");
}
