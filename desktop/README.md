# Go Daily Desktop

Tauri v2 wrapper for the Go Daily web application. Loads the production site in a native Mac window — no browser chrome, no address bar, just the app.

## Features

- Native macOS window with a transparent title bar — traffic-light buttons sit in a slim strip matching the site background, never overlapping page content
- Loads production URL in a secure webview
- OAuth (Supabase/Google) completes inside the app window
- Stripe checkout and other external links open in the default browser
- Window hides on close and restores from the Dock (macOS convention)
- Dark window background prevents white flash on load
- Remembers window size and position between launches
- Native Go menu: Today's Puzzle (Cmd+1), Puzzles (Cmd+2), Review (Cmd+3), Stats (Cmd+4)
- Keyboard shortcuts: Cmd+R (reload), Cmd+Q (quit), Cmd+M (minimize), Cmd+W (close)
- Edit menu with standard clipboard shortcuts (Cmd+C/V/X/A)
- Monochrome template tray icon (matches the macOS menu bar style) with Show / Quit menu
- Cmd+Shift+G global shortcut to toggle window visibility

## Known Limitations

- **Magic-link login** opens in the default browser, so the session lands there instead of the desktop app. Use Google sign-in on desktop.
- **Stripe checkout** intentionally opens in the default browser.

## Prerequisites

- macOS 10.15+
- Rust toolchain: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- Xcode Command Line Tools: `xcode-select --install`

## Development

Start the Next.js dev server first, then launch the desktop app:

```bash
# Terminal 1 — from project root
npm run dev

# Terminal 2 — from desktop/
cd desktop
cargo tauri dev
```

Set a custom dev URL if your dev server runs on a different port:

```bash
TAURI_DEV_URL=http://localhost:3001 cargo tauri dev
```

## Build

Generate a macOS `.app` and `.dmg`:

```bash
cd desktop
cargo tauri build
```

Output location:

```
desktop/src-tauri/target/release/bundle/dmg/Go Daily_1.3.0_aarch64.dmg
desktop/src-tauri/target/release/bundle/macos/Go Daily.app
```

Optional — ad-hoc signing for a milder Gatekeeper warning:

```bash
codesign --force --deep --sign - "desktop/src-tauri/target/release/bundle/macos/Go Daily.app"
```

## Distributing to Users

### First Launch on an Unsigned App

macOS blocks apps from unidentified developers by default. Users need to bypass Gatekeeper once:

**Method 1 — Right-click (recommended):**

1. Open the `.dmg` and drag **Go Daily** to Applications (or any folder)
2. **Right-click** (or Control-click) the app → select **Open**
3. In the dialog that appears, click **Open**
4. The app will launch. Subsequent opens work normally.

<!-- TODO: Add screenshot of the right-click → Open dialog -->

**Method 2 — System Settings:**

1. Double-click the app — macOS will block it
2. Open **System Settings → Privacy & Security**
3. Scroll to the bottom — see "Go Daily was blocked from use because it is not from an identified developer"
4. Click **Open Anyway**
5. Authenticate and confirm

<!-- TODO: Add screenshot of the Privacy & Security "Open Anyway" button -->

### Download Page Notes

Include the following on the download page:

> **macOS users:** Go Daily is not yet notarized by Apple. On first launch, right-click the app and select "Open" to bypass the security warning. This is a one-time step.

## Customizing the Production URL

The URL is set in `src-tauri/src/lib.rs`:

```rust
const PRODUCTION_URL: &str = "https://go-daily.app";
```

Change this if the production domain differs, then rebuild.

## Customizing the App Icon

Icons in `src-tauri/icons/` are auto-generated from `public/icon-512.png`. To replace:

| File | Dimensions |
|---|---|
| `32x32.png` | 32×32 |
| `128x128.png` | 128×128 |
| `128x128@2x.png` | 256×256 |
| `icon.icns` | macOS icon set (use `iconutil`) |
| `icon.ico` | 256×256 |

## Architecture

```
desktop/
├── package.json              # npm scripts (dev, build, tauri)
├── public/index.html         # Placeholder required by frontendDist config, never displayed
├── README.md                 # This file
└── src-tauri/
    ├── Cargo.toml            # Rust dependencies
    ├── tauri.conf.json       # Tauri config (bundle, devUrl)
    ├── capabilities/         # Plugin permissions
    ├── icons/                # App icons (auto-generated)
    └── src/
        ├── lib.rs            # App setup, menu, navigation handling
        └── main.rs           # Entry point
```

The desktop shell loads the web app in a webview. It does not contain any application logic — all features (puzzles, AI coach, auth, i18n) come from the production URL.
