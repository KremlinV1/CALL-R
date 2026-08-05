FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies for audio processing
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libsndfile1 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONMALLOC=malloc
ENV MALLOC_TRIM_THRESHOLD_=65536

# Run the bank IVR agent with memory optimization
CMD ["python", "-X", "gc_min_threshold=100", "-X", "gc_min_interval=50", "bank_ivr_agent.py", "start"]
