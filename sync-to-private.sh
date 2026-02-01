#!/bin/bash
# Sync flights-web.json to private my-flights repo for GitHub Pages
# Run this as a background loop from run.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PRIVATE_REPO="$HOME/my-flights"
SERVICE_DIR="$SCRIPT_DIR"

# Loop forever, syncing every 2 minutes
while true; do
    sleep 120
    
    # Check if my-flights repo exists
    if [ ! -d "$PRIVATE_REPO/.git" ]; then
        echo "Error: my-flights repo not found at $PRIVATE_REPO"
        continue
    fi
    
    # Check if files exist
    if [ ! -f "$SERVICE_DIR/flights-web.json" ]; then
        continue
    fi
    
    # Copy web data, HTML, and flight history to private repo
    cp "$SERVICE_DIR/flights-web.json" "$PRIVATE_REPO/flights-web.json"
    cp "$SERVICE_DIR/flights-web.html" "$PRIVATE_REPO/index.html"
    
    # Also copy flights.json history if it exists
    if [ -f "$SERVICE_DIR/flights.json" ]; then
        cp "$SERVICE_DIR/flights.json" "$PRIVATE_REPO/flights.json"
    fi
    
    # Check if there are changes
    cd "$PRIVATE_REPO"
    if git diff --quiet HEAD -- flights-web.json index.html flights.json 2>/dev/null; then
        continue
    fi
    
    # Commit and push
    git add flights-web.json index.html flights.json
    git commit -m "Update flights: $(date '+%Y-%m-%d %H:%M:%S')"
    git push origin main
    
    echo "Synced to private repo at $(date)"
done
