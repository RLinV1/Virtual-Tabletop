"""Private binary image endpoint. Only the Node worker can supply image bytes."""

import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from detector import MAX_BYTES, detect_bytes


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/detect":
            self.send_error(404)
            return
        try:
            size = int(self.headers.get("content-length", "0"))
            width = int(self.headers.get("x-image-width", "0"))
            height = int(self.headers.get("x-image-height", "0"))
            if not 0 < size <= MAX_BYTES:
                raise ValueError("Invalid content length")
            result = detect_bytes(self.rfile.read(size), width, height)
            payload = json.dumps(result).encode("utf-8")
            self.send_response(200)
        except (ValueError, MemoryError, OverflowError):
            payload = b'{"error":"Invalid image"}'
            self.send_response(422)
        except Exception:
            payload = b'{"error":"Analysis failed"}'
            self.send_response(500)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *_args):
        # Request logs must never include image contents or private results.
        pass


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", int(os.environ.get("PORT", "8000"))), Handler).serve_forever()
