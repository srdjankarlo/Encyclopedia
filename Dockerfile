FROM ubuntu:24.04

# Prevent interactive prompts
ENV DEBIAN_FRONTEND=noninteractive
# Define Rust paths
ENV RUSTUP_HOME=/usr/local/rustup \
    CARGO_HOME=/usr/local/cargo \
    PATH=/usr/local/cargo/bin:$PATH

# 1. Install basic tools (Removed the invalid --privileged flag)
RUN apt-get update && apt-get install -y \
    ca-certificates \
    curl \
    gnupg \
    build-essential \
    libssl-dev \
    pkg-config \
    git \
    xz-utils \
    && update-ca-certificates

# 2. MANUALLY INSTALL NODEJS 20
# Using -k to bypass the local issuer certificate issue
RUN mkdir -p /etc/apt/keyrings && \
    curl -fsSLk https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg && \
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list && \
    apt-get update && apt-get install -y nodejs

# 3. INSTALL RUST
RUN curl --proto '=https' --tlsv1.2 -sSfk https://sh.rustup.rs | sh -s -- -y --no-modify-path --default-toolchain stable

# 4. INSTALL CARGO-WATCH (Fast Binary Version)
RUN curl -L -k https://github.com/watchexec/cargo-watch/releases/download/v8.5.2/cargo-watch-v8.5.2-x86_64-unknown-linux-musl.tar.xz | tar xJ -C /tmp && \
    mv /tmp/cargo-watch-v8.5.2-x86_64-unknown-linux-musl/cargo-watch /usr/local/cargo/bin/ && \
    rm -rf /tmp/cargo-watch-v8.5.2-x86_64-unknown-linux-musl

WORKDIR /app