use chrono::Timelike;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::TrayIconBuilder;
use tauri::window::Color;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt as _};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_shell::ShellExt;

const PRODUCTION_URL: &str = "https://go-daily.app";
const RELOAD_ID: &str = "reload";

/// Frank-approved exception to the no-injection rule (2026-06-12), strictly
/// scoped to hiding scrollbars: the desktop shell should scroll like a native
/// app, without WebKit scrollbar gutters. Applies only to the app's own host.
const HIDE_SCROLLBARS: &str = r#"
(function () {
  if (!/(^|\.)go-daily\.app$/.test(location.hostname) && location.hostname !== "localhost") {
    return;
  }
  function inject() {
    var style = document.createElement("style");
    style.textContent = "::-webkit-scrollbar { width: 0; height: 0; display: none; }";
    document.head.appendChild(style);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inject);
  } else {
    inject();
  }
})();
"#;

/// Go menu entries: (menu id, label, accelerator, site path).
/// Paths are locale-free — the site middleware negotiates the locale.
const NAV_ITEMS: &[(&str, &str, &str, &str)] = &[
    ("nav-today", "Today's Puzzle", "CmdOrCtrl+1", "/today"),
    ("nav-puzzles", "Puzzles", "CmdOrCtrl+2", "/puzzles"),
    ("nav-review", "Review", "CmdOrCtrl+3", "/review"),
    ("nav-stats", "Stats", "CmdOrCtrl+4", "/stats"),
];

fn base_url() -> String {
    if cfg!(debug_assertions) {
        std::env::var("TAURI_DEV_URL").unwrap_or_else(|_| "http://localhost:3000".to_string())
    } else {
        PRODUCTION_URL.to_string()
    }
}

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

/// Shell-level preferences, stored in the app config dir as settings.json.
#[derive(serde::Serialize, serde::Deserialize, Default)]
#[serde(default)]
struct ShellSettings {
    reminder_enabled: bool,
    last_fired: String,
}

fn settings_path(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    app.path()
        .app_config_dir()
        .ok()
        .map(|dir| dir.join("settings.json"))
}

fn load_settings(app: &tauri::AppHandle) -> ShellSettings {
    settings_path(app)
        .and_then(|path| std::fs::read_to_string(path).ok())
        .and_then(|json| serde_json::from_str(&json).ok())
        .unwrap_or_default()
}

fn save_settings(app: &tauri::AppHandle, settings: &ShellSettings) {
    let Some(path) = settings_path(app) else {
        return;
    };
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    if let Ok(json) = serde_json::to_string_pretty(settings) {
        let _ = std::fs::write(path, json);
    }
}

/// Reminder copy follows the OS language; full i18n lives in the web app.
fn reminder_body() -> &'static str {
    let locale = sys_locale::get_locale().unwrap_or_default();
    if locale.starts_with("zh") {
        "今日死活题已更新，来保持连胜吧。"
    } else if locale.starts_with("ja") {
        "本日の詰碁が更新されました。連続記録を守りましょう。"
    } else if locale.starts_with("ko") {
        "오늘의 사활 문제가 준비되었습니다. 연승을 이어가세요."
    } else {
        "Today's tsumego is ready. Keep your streak going."
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

    let mut nav_items: Vec<MenuItem<tauri::Wry>> = Vec::new();
    for (id, label, accel, _path) in NAV_ITEMS {
        nav_items.push(MenuItem::with_id(app, *id, *label, true, Some(*accel))?);
    }
    let nav_item_refs: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> = nav_items
        .iter()
        .map(|i| i as &dyn tauri::menu::IsMenuItem<tauri::Wry>)
        .collect();
    let go_menu = Submenu::with_items(app, "Go", true, &nav_item_refs)?;

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
            &go_menu,
            &window_menu,
        ],
    )?;

    Ok(menu)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
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
            let id = event.id().as_ref();
            if id == RELOAD_ID {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.eval("location.reload()");
                }
            } else if let Some((_, _, _, path)) =
                NAV_ITEMS.iter().find(|(item_id, ..)| *item_id == id)
            {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.show();
                    let _ = win.set_focus();
                    if let Ok(target) = url::Url::parse(&format!("{}{}", base_url(), path)) {
                        let _ = win.navigate(target);
                    }
                }
            }
        })
        .setup(|app| {
            let base_url = base_url();

            let app_handle = app.handle().clone();
            let nav_url = url::Url::parse(&base_url).expect("invalid URL");
            let base_host = nav_url.host_str().unwrap_or("").to_string();

            // Exact page background of the site (--color-paper in app/globals.css).
            // Shown through the transparent title bar and before the page paints,
            // so it must match precisely to keep the window seamless.
            let bg = Color(10, 10, 10, 255);

            #[allow(deprecated)]
            let window =
                WebviewWindowBuilder::new(app, "main", WebviewUrl::External(nav_url))
                    .title("Go Daily")
                    .inner_size(1080.0, 674.0)
                    .min_inner_size(800.0, 500.0)
                    .resizable(true)
                    .fullscreen(false)
                    .center()
                    .title_bar_style(tauri::TitleBarStyle::Transparent)
                    .hidden_title(true)
                    .background_color(bg)
                    .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15")
                    .initialization_script(HIDE_SCROLLBARS)
                    .on_navigation(move |url| {
                        if stays_in_webview(&url, &base_host) {
                            true
                        } else {
                            let _ = app_handle.shell().open(url.as_str(), None);
                            false
                        }
                    })
                    .build()?;

            let win_handle = window.clone();
            window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = win_handle.hide();
                }
            });

            let settings = load_settings(app.handle());
            let show_item = MenuItem::with_id(app, "show", "Show Go Daily", true, None::<&str>)?;
            let reminder_item = CheckMenuItem::with_id(
                app,
                "reminder",
                "Daily Reminder (9:00)",
                true,
                settings.reminder_enabled,
                None::<&str>,
            )?;
            let autostart_on = app.autolaunch().is_enabled().unwrap_or(false);
            let autostart_item = CheckMenuItem::with_id(
                app,
                "autostart",
                "Launch at Login",
                true,
                autostart_on,
                None::<&str>,
            )?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let tray_menu = Menu::with_items(
                app,
                &[
                    &show_item,
                    &PredefinedMenuItem::separator(app)?,
                    &reminder_item,
                    &autostart_item,
                    &PredefinedMenuItem::separator(app)?,
                    &quit_item,
                ],
            )?;

            // Monochrome template image — macOS tints it to match the menu bar
            let tray_icon = tauri::image::Image::from_bytes(include_bytes!("../icons/tray.png"))?;

            let reminder_check = reminder_item.clone();
            let autostart_check = autostart_item.clone();
            let _tray = TrayIconBuilder::new()
                .icon(tray_icon)
                .icon_as_template(true)
                .menu(&tray_menu)
                .tooltip("Go Daily")
                .on_menu_event(move |app, event| {
                    match event.id().as_ref() {
                        "show" => {
                            if let Some(win) = app.get_webview_window("main") {
                                let _ = win.show();
                                let _ = win.set_focus();
                            }
                        }
                        // CheckMenuItem toggles itself on click; persist the new state.
                        "reminder" => {
                            let mut settings = load_settings(app);
                            settings.reminder_enabled =
                                reminder_check.is_checked().unwrap_or(false);
                            save_settings(app, &settings);
                        }
                        "autostart" => {
                            let autolaunch = app.autolaunch();
                            if autostart_check.is_checked().unwrap_or(false) {
                                let _ = autolaunch.enable();
                            } else {
                                let _ = autolaunch.disable();
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .build(app)?;

            // Daily reminder loop — fires at most once per day, any time
            // during the 9 o'clock hour the app happens to be awake.
            let reminder_handle = app.handle().clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(std::time::Duration::from_secs(60));
                let mut settings = load_settings(&reminder_handle);
                let now = chrono::Local::now();
                let today = now.format("%Y-%m-%d").to_string();
                if settings.reminder_enabled && now.hour() == 9 && settings.last_fired != today {
                    let sent = reminder_handle
                        .notification()
                        .builder()
                        .title("Go Daily")
                        .body(reminder_body())
                        .show()
                        .is_ok();
                    if sent {
                        settings.last_fired = today;
                        save_settings(&reminder_handle, &settings);
                    }
                }
            });

            let toggle_shortcut = Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyG);
            let sc_win = window.clone();
            app.global_shortcut().on_shortcut(toggle_shortcut, move |_app, _shortcut, event| {
                if event.state == ShortcutState::Pressed {
                    if sc_win.is_visible().unwrap_or(false) {
                        let _ = sc_win.hide();
                    } else {
                        let _ = sc_win.show();
                        let _ = sc_win.set_focus();
                    }
                }
            })?;

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Go Daily desktop app");

    app.run(|app_handle, event| {
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Reopen { .. } = event {
            if let Some(win) = app_handle.get_webview_window("main") {
                let _ = win.show();
                let _ = win.set_focus();
            }
        }
    });
}
