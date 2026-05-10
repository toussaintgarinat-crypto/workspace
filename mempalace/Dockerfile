FROM python:3.12-slim
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir setuptools && pip install --no-cache-dir -r requirements.txt

COPY . .
RUN pip install -e . --no-deps --no-build-isolation

EXPOSE 8100
CMD ["uvicorn", "mempalace.api:app", "--host", "0.0.0.0", "--port", "8100"]
