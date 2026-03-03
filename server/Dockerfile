FROM rustlang/rust:nightly-slim

WORKDIR /app

# Install system dependencies and cargo-watch
RUN apt-get update && apt-get install -y \
    libssl-dev \
    pkg-config \
    ca-certificates \
    && cargo install cargo-watch \
    && rm -rf /var/lib/apt/lists/*

COPY . .

# Pre-build the project dependencies to speed up container starts
RUN cargo build

# Default command (will be overridden by docker-compose for dev)
CMD ["cargo", "run"]