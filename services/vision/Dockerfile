FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY detector.py server.py walls.py wall_worker.py ./
ENV OPENCV_IO_MAX_IMAGE_PIXELS=40000000
EXPOSE 8000
# The grid HTTP service by default; the wall worker runs from the same image with
# `python wall_worker.py` (see docker-compose.yml, ADR 0025).
CMD ["python", "server.py"]
