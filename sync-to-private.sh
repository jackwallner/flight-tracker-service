#!/bin/bash
# Sync flights-web.json to private my-flights repo for GitHub Pages
# Run this as a background loop from run.sh

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
    cp "$SERVICE_DIR/flights-web.json" "$PRIVATE_REPO/flights-web.json" || true
    cp "$SERVICE_DIR/flights-web.html" "$PRIVATE_REPO/index.html" || true
    
    # Also copy flights.json history if it exists
    if [ -f "$SERVICE_DIR/flights.json" ]; then
        cp "$SERVICE_DIR/flights.json" "$PRIVATE_REPO/flights.json" || true
    fi
    
    # Check if there are changes
    cd "$PRIVATE_REPO" || continue
    if git diff --quiet HEAD -- flights-web.json index.html flights.json 2>/dev/null; then
        continue
    fi
    
    # Commit and push (with error handling)
    if git add flights-web.json index.html flights.json 2>/dev/null; then
        if git commit -m "Update flights: $(date '+%Y-%m-%d %H:%M:%S')" 2>/dev/null; then
            if git push origin main 2>/dev/null; then
                echo "Synced to private repo at $(date)"
            else
                echo "Push failed at $(date), will retry later"
            fi
        else
            echo "Commit failed at $(date), will retry later"
        fi
    else
        echo "Add failed at $(date), will retry later"
    fi
done
