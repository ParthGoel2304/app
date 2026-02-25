#!/bin/bash
# Start the web server for the Excel Reader app

echo "Starting Excel Reader Web Server..."

# Kill any existing process on port 3000
lsof -ti:3000 | xargs kill -9 2>/dev/null

# Navigate to frontend directory
cd /app/frontend/dist

# Start Python HTTP server on port 3000
python3 -m http.server 3000 > /tmp/web_server.log 2>&1 &

echo "Web server started on port 3000"
echo "Access the app at: https://parchi-builder.preview.emergentagent.com"
