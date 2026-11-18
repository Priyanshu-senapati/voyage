# Voyance hosted demo: the API and the built dashboard in one container.
# Build:  docker build -t voyance .
# Run:    docker run -p 8080:8080 voyance          (open http://localhost:8080)
# Every start wipes and re-seeds the demo database; see deploy/start.py.

FROM node:22-slim AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PORT=8080
WORKDIR /app
COPY pyproject.toml ./
COPY voyance/ voyance/
RUN pip install .
COPY scripts/seed_demo.py scripts/
COPY deploy/ deploy/
COPY --from=web /web/dist web/dist
RUN useradd --create-home --uid 10001 voyance
USER voyance
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
    CMD python -c "import os, urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.environ[\"PORT\"]}/healthz', timeout=4)"
CMD ["python", "deploy/start.py"]
