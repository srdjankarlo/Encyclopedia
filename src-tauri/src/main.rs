// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use axum::{
    routing::{get, post, delete},
    Router, Json, extract::{State, Path}, 
    http::StatusCode
};
use axum::extract::DefaultBodyLimit;
use sqlx::{sqlite::SqlitePoolOptions, Pool, Sqlite, Row};
use serde::{Deserialize, Serialize};
use tower_http::cors::{Any, CorsLayer};

#[derive(Serialize, Deserialize, Clone)]
struct Tab {
    id: String,
    title: String,
    content: String,
    child_window_id: Option<String>,
    parent_id: Option<String>,
    created_at: i64,
}

#[tokio::main]
async fn main() {
    // 1. Setup the Database
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

    // 2. Setup the Axum Server
    let cors = CorsLayer::new().allow_origin(Any).allow_headers(Any).allow_methods(Any);
    let app = Router::new()
        .route("/health", get(|| async { "Backend is healthy!" }))
        .route("/tabs", get(get_tabs).post(save_tab))
        .route("/tabs/:id", delete(delete_tab))
        .layer(DefaultBodyLimit::max(20 * 1024 * 1024))
        .layer(cors)
        .with_state(pool);

    // 3. Run the Axum Server in a background task
    tokio::spawn(async move {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:8080").await.unwrap();
        axum::serve(listener, app).await.unwrap();
    });

    // 4. Start the Tauri Window System
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// --- HANDLERS ---

async fn get_tabs(State(pool): State<Pool<Sqlite>>) -> Json<Vec<Tab>> {
    let rows = sqlx::query("SELECT id, title, content, child_window_id, parent_id, created_at FROM tabs")
        .fetch_all(&pool)
        .await
        .unwrap_or_default();

    let tabs = rows.iter().map(|row| Tab {
        id: row.get("id"),
        title: row.get("title"),
        content: row.get("content"),
        child_window_id: row.get("child_window_id"),
        parent_id: row.get("parent_id"),
        created_at: row.get("created_at"),
    }).collect();

    Json(tabs)
}

async fn save_tab(
    State(pool): State<Pool<Sqlite>>, 
    Json(tab): Json<Tab>
) -> Result<&'static str, (StatusCode, String)> {
    // LINE DEBUG
    println!("📥 Received Tab: {} - Content Length: {}", tab.id, tab.content.len());

    let result = sqlx::query(
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
    .execute(&pool)
    .await;

    match result {
        Ok(_) => Ok("OK"),
        Err(e) => {
            eprintln!("❌ DB Error (Save): {:?}", e);
            Err((StatusCode::INTERNAL_SERVER_ERROR, format!("DB Error: {}", e)))
        }
    }
}

// NEW: Delete Handler
async fn delete_tab(
    State(pool): State<Pool<Sqlite>>,
    Path(id): Path<String>
) -> Result<StatusCode, (StatusCode, String)> {
    // This query finds the parent and every nested child regardless of depth
    let sql = r#"
        WITH RECURSIVE tab_tree AS (
            SELECT id FROM tabs WHERE id = $1
            UNION ALL
            SELECT t.id FROM tabs t
            INNER JOIN tab_tree tt ON t.parent_id = tt.id
        )
        DELETE FROM tabs WHERE id IN (SELECT id FROM tab_tree)
    "#;

    match sqlx::query(sql).bind(&id).execute(&pool).await {
        Ok(res) => {
            println!("🗑️ Database Cleaned: {} records removed", res.rows_affected());
            Ok(StatusCode::NO_CONTENT)
        },
        Err(e) => {
            eprintln!("❌ DB Delete Error: {:?}", e);
            Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
        }
    }
}
