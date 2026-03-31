// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use sqlx::{sqlite::SqlitePoolOptions, Pool, Sqlite, Row};
use serde::{Deserialize, Serialize};
use tauri::{State, Manager};

#[derive(Serialize, Deserialize, Clone)]
struct Tab {
    id: String,
    title: String,
    content: String,
    child_window_id: Option<String>,
    parent_id: Option<String>,
    created_at: i64,
}

// 1. GET TABS COMMAND
#[tauri::command]
async fn get_tabs(pool: State<'_, Pool<Sqlite>>) -> Result<Vec<Tab>, String> {
    let rows = sqlx::query("SELECT id, title, content, child_window_id, parent_id, created_at FROM tabs")
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    let tabs = rows.iter().map(|row| Tab {
        id: row.get("id"),
        title: row.get("title"),
        content: row.get("content"),
        child_window_id: row.get("child_window_id"),
        parent_id: row.get("parent_id"),
        created_at: row.get("created_at"),
    }).collect();

    Ok(tabs)
}

// 2. SAVE TAB COMMAND
#[tauri::command]
async fn save_tab(pool: State<'_, Pool<Sqlite>>, tab: Tab) -> Result<String, String> {
    sqlx::query(
        "INSERT INTO tabs (id, title, content, child_window_id, parent_id, created_at) 
         VALUES ($1, $2, $3, $4, $5, $6) 
         ON CONFLICT (id) DO UPDATE SET 
            title = $2, 
            content = $3, 
            child_window_id = $4, 
            parent_id = $5"
    )
    .bind(&tab.id)
    .bind(&tab.title)
    .bind(&tab.content)
    .bind(&tab.child_window_id)
    .bind(&tab.parent_id)
    .bind(tab.created_at)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok("OK".to_string())
}

// 3. DELETE TAB COMMAND
#[tauri::command]
async fn delete_tab(pool: State<'_, Pool<Sqlite>>, id: String) -> Result<String, String> {
    let sql = r#"
        WITH RECURSIVE tab_tree AS (
            SELECT id FROM tabs WHERE id = $1
            UNION ALL
            SELECT t.id FROM tabs t
            INNER JOIN tab_tree tt ON t.parent_id = tt.id
        )
        DELETE FROM tabs WHERE id IN (SELECT id FROM tab_tree)
    "#;

    sqlx::query(sql).bind(&id).execute(&*pool).await.map_err(|e| e.to_string())?;
    Ok("DELETED".to_string())
}

#[tokio::main]
async fn main() {
    let database_url = "sqlite:miller.db?mode=rwc";
    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(database_url)
        .await
        .expect("Failed to connect to SQlite");

    let _ = sqlx::query(
        "CREATE TABLE IF NOT EXISTS tabs (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            content TEXT DEFAULT '',
            child_window_id TEXT,
            parent_id TEXT,
            created_at INTEGER NOT NULL
        )"
    )
    .execute(&pool)
    .await;

    // Start Tauri and hook up the commands
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(pool) // Share the database pool with Tauri commands
        .invoke_handler(tauri::generate_handler![get_tabs, save_tab, delete_tab])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}