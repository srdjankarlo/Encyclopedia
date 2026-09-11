# Encyclopedia #

A fast, lightweight, local-first desktop wiki and note-taking application built for power users. All your data stays entirely private and secure on your local machine.

## Features ##

- **Local-First & Private:** Powered by a local SQLite database managed via Rust and Tauri. No cloud accounts, no telemetry, complete data ownership.

- **Hierarchical Tree View:** Organize your notes into infinite nested parent-child structures with custom sorting (Oldest, Newest, A-Z, Z-A) and expand/collapse controls.

- **Rich Text Editor:** Built on Tiptap with support for:

  - Custom keyboard shortcuts (Tab, line shifting, task lists)

  - Interactive checklists and task items (Ctrl+Space, Ctrl+1)

  - Tables, image resizing, and custom wiki-style internal linking ([[Tab Name]])

  - Text alignment, highlighting, colors, and underlines

- **Global Search & Replace:** Quickly filter tabs by title or search deep within full document text content with instant matching and navigation.

- **Customizable Themes:** Seamlessly switch between Light, Gray, and Dark themes.

- **Native Performance:** Built with Tauri v2, avoiding the heavy memory footprint of traditional Electron apps.
  
<img width="999" height="630" alt="Screenshot 2026-09-11 033824" src="https://github.com/user-attachments/assets/37126988-9465-4be0-be92-4a4fc222d8f9" />
<img width="994" height="635" alt="Screenshot 2026-09-11 033838" src="https://github.com/user-attachments/assets/9055dadd-3b8d-410d-aa9a-5a42de1f7b7d" />
<img width="1035" height="630" alt="Screenshot 2026-09-11 033914" src="https://github.com/user-attachments/assets/c73bf6cd-e4b5-4a67-b733-ebbc35cf2e1d" />
<img width="1037" height="703" alt="Screenshot 2026-09-11 034107" src="https://github.com/user-attachments/assets/06f90e86-793a-45ea-860f-1e63b89a6d03" />

## Tech Stack ##

**Frontend:** React, TypeScript, Vite, Tiptap Editor

**Backend:** Rust, Tauri v2

**Database:** SQLite

## Getting Started (Run from Source) ##

If you want to run, modify, or build the source code yourself, follow these steps.

### Prerequisites ###

Make sure you have the following installed on your system:

Node.js (v18 or higher)

Rust (and Cargo) - [Install Rust](https://rust-lang.org/)

Tauri Prerequisites (depending on your OS, e.g., WebView2 on Windows) - [Tauri Setup Guide](https://v2.tauri.app/start/prerequisites/)

Clone the repository:

> git clone https://github.com/srdjankarlo/Encyclopedia.git

> cd Encyclopedia

Run the app in development mode:

> cargo tauri dev

Build the app for production:

> cargo tauri build
