FROM rustlang/rust:nightly-slim

WORKDIR /app
RUN apt-get update && apt-get install -y libssl-dev pkg-config ca-certificates && rm -rf /var/lib/apt/lists/*

COPY . .

# We build it first to save time on restarts
RUN cargo build --release

# Instead of pointing to a path that might shift, we let cargo run the release binary
CMD ["cargo", "run", "--release"]