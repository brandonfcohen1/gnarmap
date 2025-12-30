FROM rust:1.83-bookworm AS builder

RUN apt-get update && apt-get install -y \
    libgdal-dev \
    gdal-bin \
    clang \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY Cargo.toml Cargo.lock* ./
COPY src ./src

RUN cargo build --release

FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y \
    libgdal32 \
    gdal-bin \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/snodas-pipeline /usr/local/bin/

ENV RUST_LOG=info

ENTRYPOINT ["snodas-pipeline"]
CMD ["daily", "--date", "yesterday"]
