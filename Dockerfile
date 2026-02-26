FROM ubuntu:24.04

# Install system dependencies for Tauri 2.0
RUN apt-get update && apt-get install -y \
    curl build-essential libssl-dev libgtk-3-dev libayatana-appindicator3-dev \
    librsvg2-dev libwebkit2gtk-4.1-dev wget pkg-config

# Install Node.js
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs

# Install Rust
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

WORKDIR /app