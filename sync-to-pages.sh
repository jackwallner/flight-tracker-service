#!/bin/bash
# Sync flights-web.json to GitHub Pages repo
# Usage: ./sync-to-pages.sh [repo-path-or-url]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_DIR="$SCRIPT_DIR"

# GitHub repo configuration
# Option 1: Local path to your my-flights repo
# DEFAULT_REPO="$HOME/my-flights"
#
# Option 2: HTTPS URL (will prompt for credentials)
# DEFAULT_REPO="https://github.com/yourusername/my-flights.git"
#
# Option 3: SSH URL (requires SSH key setup)
# DEFAULT_REPO="git@github.com:yourusername/my-flights.git"

# Use argument or default
GITHUB_REPO="${1:-$DEFAULT_REPO}"

if [ -z "$GITHUB_REPO" ]; then
    echo "Error: No GitHub repo specified"
    echo "Usage: ./sync-to-pages.sh <repo-path-or-url>"
    echo ""
    echo "Examples:"
    echo "  ./sync-to-pages.sh ~/my-flights"
    echo "  ./sync-to-pages.sh https://github.com/user/my-flights.git"
    echo "  ./sync-to-pages.sh git@github.com:user/my-flights.git"
    exit 1
fi

echo "Flight Tracker - GitHub Pages Sync"
echo "=================================="
echo "Service directory: $SERVICE_DIR"
echo "Target repo: $GITHUB_REPO"
echo ""

# Determine if repo is a local path or URL
if [[ "$GITHUB_REPO" == http* ]] || [[ "$GITHUB_REPO" == git@* ]]; then
    # It's a URL - clone/update it
    REPO_DIR="/tmp/flight-tracker-sync-$$"
    
    # Cleanup on exit
    trap "rm -rf $REPO_DIR" EXIT
    
    # Clone the repo
    echo "Cloning repo..."
    git clone "$GITHUB_REPO" "$REPO_DIR" 2>/dev/null || {
        echo "Error: Could not clone repo. Check URL and credentials."
        exit 1
    }
else
    # It's a local path
    REPO_DIR="$GITHUB_REPO"
    
    if [ ! -d "$REPO_DIR/.git" ]; then
        echo "Error: $REPO_DIR is not a git repository"
        exit 1
    fi
fi

# Copy files
echo "Copying flight data..."
cp "$SERVICE_DIR/flights-web.json" "$REPO_DIR/flights-web.json"
cp "$SERVICE_DIR/flights-web.html" "$REPO_DIR/index.html"

# Also copy flight history if it exists
if [ -f "$SERVICE_DIR/flights.json" ]; then
    cp "$SERVICE_DIR/flights.json" "$REPO_DIR/flights.json"
fi

# Check if there are changes
cd "$REPO_DIR"
if git diff --quiet HEAD -- flights-web.json index.html flights.json 2>/dev/null; then
    echo "No changes to sync"
    exit 0
fi

# Commit and push
echo "Committing changes..."
git add flights-web.json index.html flights.json
git commit -m "Update flights: $(date '+%Y-%m-%d %H:%M:%S')"

if [[ "$GITHUB_REPO" == http* ]] || [[ "$GITHUB_REPO" == git@* ]]; then
    echo "Pushing to GitHub..."
    git push origin main
else
    echo "Pushing local changes..."
    git push
fi

echo "✅ Synced at $(date '+%Y-%m-%d %H:%M:%S')"
