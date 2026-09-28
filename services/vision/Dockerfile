FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY detector.py server.py ./
ENV OPENCV_IO_MAX_IMAGE_PIXELS=40000000
EXPOSE 8000
CMD ["python", "server.py"]
