use axum::{routing::{get, post}, Router, Json, extract::State};
use sqlx::{postgres::PgPoolOptions, Pool, Postgres, Row};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tower_http::cors::{Any, CorsLayer};
use axum::http::StatusCode; // Add this to your imports

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
    // Give DB time to breathe on slower work laptops
    tokio::time::sleep(Duration::from_secs(2)).await;
    
    let database_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");

    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await
        .expect("Failed to connect to Postgres");

    println!("✅ Connected! Ensuring table exists...");

    // NEW: Auto-create table if it doesn't exist
    let _ = sqlx::query(
        "CREATE TABLE IF NOT EXISTS tabs (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            content TEXT DEFAULT '',
            child_window_id TEXT,
            parent_id TEXT,
            created_at BIGINT NOT NULL
        );"
    )
    .execute(&pool)
    .await;

    println!("🚀 Server is ready and table is verified!");

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/health", get(|| async { "Backend is healthy!" }))
        .route("/tabs", get(get_tabs).post(save_tab))
        .layer(cors)
        .with_state(pool);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:8080").await.unwrap();
    println!("🚀 Server running on 0.0.0.0:8080");
    axum::serve(listener, app).await.unwrap();
}

async fn get_tabs(State(pool): State<Pool<Postgres>>) -> Json<Vec<Tab>> {
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
    State(pool): State<Pool<Postgres>>, 
    Json(tab): Json<Tab>
) -> Result<&'static str, (StatusCode, String)> {
    
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
            eprintln!("❌ Database Error: {:?}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR, 
                format!("Database Error: {}", e)
            ))
        }
    }
}