use axum::{routing::{get, post}, Router, Json, extract::State};
use sqlx::{postgres::PgPoolOptions, Pool, Postgres, Row};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tower_http::cors::{Any, CorsLayer};

#[derive(Serialize, Deserialize, Clone)]
struct Tab {
    id: String,       // Fixed: Capital S
    title: String,
    content: String,
    parent_id: Option<String>,
    created_at: i64,
}

#[tokio::main]
async fn main() {
    tokio::time::sleep(Duration::from_secs(2)).await;
    let database_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");

    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await
        .expect("Failed to connect to Postgres");

    println!("✅ Successfully connected to PostgreSQL!");

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
    // Switched to runtime query to avoid "online check" errors during build
    let rows = sqlx::query("SELECT id, title, content, parent_id, created_at FROM tabs")
        .fetch_all(&pool)
        .await
        .unwrap_or_default();

    let tabs = rows.iter().map(|row| Tab {
        id: row.get("id"),
        title: row.get("title"),
        content: row.get("content"),
        parent_id: row.get("parent_id"),
        created_at: row.get("created_at"),
    }).collect();

    Json(tabs)
}

async fn save_tab(State(pool): State<Pool<Postgres>>, Json(tab): Json<Tab>) -> &'static str {
    sqlx::query(
        "INSERT INTO tabs (id, title, content, parent_id, created_at) 
         VALUES ($1, $2, $3, $4, $5) 
         ON CONFLICT (id) DO UPDATE SET title = $2, content = $3, parent_id = $4"
    )
    .bind(&tab.id)
    .bind(&tab.title)
    .bind(&tab.content)
    .bind(&tab.parent_id)
    .bind(tab.created_at)
    .execute(&pool)
    .await
    .expect("Failed to save tab");
    
    "OK"
}