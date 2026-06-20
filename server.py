#!/usr/bin/env python3
import http.server
import socketserver
import urllib.request
import urllib.parse
import json
import os
import sys

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))
DB_FILE = os.path.join(DIRECTORY, "database.json")

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        # Enable CORS for all API endpoints
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        # Handle CORS preflight request
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        query_params = urllib.parse.parse_qs(parsed_url.query)

        # 1. Naver Dictionary API Proxy
        if path == "/api/naver":
            query = query_params.get("query", [""])[0]
            if not query:
                print("[Proxy] Error: Missing query parameter", file=sys.stderr)
                self.send_error_response(400, "Missing 'query' parameter")
                return

            naver_url = f"https://dict.naver.com/api3/enko/search?query={urllib.parse.quote(query)}&m=pc"
            print(f"[Proxy] Requesting Naver: {naver_url}", flush=True)
            
            req = urllib.request.Request(
                naver_url,
                headers={
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'application/json, text/plain, */*',
                    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
                    'Referer': 'https://dict.naver.com/'
                }
            )

            try:
                with urllib.request.urlopen(req) as response:
                    content = response.read()
                    print(f"[Proxy] Naver Response Status: {response.status}, Content Length: {len(content)}", flush=True)
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json; charset=utf-8')
                    self.end_headers()
                    self.wfile.write(content)
            except Exception as e:
                print(f"[Proxy] Exception occurred: {str(e)}", file=sys.stderr, flush=True)
                self.send_error_response(500, f"Error calling Naver API: {str(e)}")
            return

        # 2. Local database GET
        elif path == "/api/local-db":
            data = {"words": [], "logs": []}
            if os.path.exists(DB_FILE):
                try:
                    with open(DB_FILE, "r", encoding="utf-8") as f:
                        data = json.load(f)
                except Exception as e:
                    print(f"Error reading database.json: {e}", file=sys.stderr, flush=True)

            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.end_headers()
            self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))
            return

        # 3. Serve static files normally
        else:
            super().do_GET()

    def do_POST(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path

        # Local database POST (save database)
        if path == "/api/local-db":
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)

            try:
                # Validate JSON format
                data = json.loads(post_data.decode('utf-8'))
                
                # Write to database.json
                with open(DB_FILE, "w", encoding="utf-8") as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)

                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps({"success": True}).encode('utf-8'))
            except Exception as e:
                self.send_error_response(500, f"Error saving to database.json: {str(e)}")
            return
        
        else:
            self.send_error_response(404, "Not Found")

    def send_error_response(self, code, message):
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.end_headers()
        self.wfile.write(json.dumps({"error": message}).encode('utf-8'))

if __name__ == "__main__":
    # Ensure port is released immediately on restart
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), CustomHandler) as httpd:
        print(f"============================================================")
        print(f"🚀 English Memorizer App Server started at: http://localhost:{PORT}")
        print(f"📂 Workspace Directory: {DIRECTORY}")
        print(f"💡 Press Ctrl+C to stop the server")
        print(f"============================================================")
        sys.stdout.flush()
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server...")
            sys.exit(0)
