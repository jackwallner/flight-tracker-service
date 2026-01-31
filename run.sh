#!/bin/bash
# Flight Tracker Service Launcher
# Usage: ./run.sh [github-repo-path-or-url]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     Flight Tracker Service             ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# Check dependencies
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed${NC}"
    echo "Install from: https://nodejs.org/"
    exit 1
fi

# Check Node version
NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${YELLOW}Warning: Node.js 18+ recommended (found $(node --version))${NC}"
fi

# Check configuration
if [ -z "$TRACKER_LAT" ] || [ -z "$TRACKER_LON" ]; then
    echo -e "${YELLOW}⚠️  Configuration needed${NC}"
    echo ""
    echo "Set environment variables:"
    echo "  export TRACKER_LAT=45.625280431872    # Your latitude"
    echo "  export TRACKER_LON=-122.52811167430798 # Your longitude"
    echo "  export TRACKER_RADIUS_NM=1.5           # Detection radius (optional)"
    echo "  export AWTRIX_IP=192.168.5.56          # AWTRIX clock IP (optional)"
    echo ""
    echo "Or create a .env file with these values."
    echo ""
    
    # Check for .env file
    if [ -f ".env" ]; then
        echo -e "${GREEN}Loading configuration from .env file...${NC}"
        export $(grep -v '^#' .env | xargs)
    else
        echo -e "${YELLOW}Creating example .env file...${NC}"
        cat > .env.example << 'EOF'
# Flight Tracker Configuration
# Copy this to .env and update with your values

# Required: Your coordinates (find on Google Maps)
TRACKER_LAT=45.625280431872
TRACKER_LON=-122.52811167430798

# Optional: Detection radius in nautical miles (default: 1.5)
TRACKER_RADIUS_NM=1.5

# Optional: AWTRIX clock IP (default: 192.168.5.56)
AWTRIX_IP=192.168.5.56

# Optional: Poll interval in seconds (default: 10)
POLL_INTERVAL=10
EOF
        echo "Created .env.example - copy to .env and configure your settings"
        exit 1
    fi
fi

# Validate coordinates
if [ -z "$TRACKER_LAT" ] || [ -z "$TRACKER_LON" ]; then
    echo -e "${RED}Error: TRACKER_LAT and TRACKER_LON must be set${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Configuration valid${NC}"
echo "  Location: $TRACKER_LAT, $TRACKER_LON"
echo "  Radius: ${TRACKER_RADIUS_NM:-1.5} NM"
echo "  AWTRIX: ${AWTRIX_IP:-192.168.5.56}"
echo ""

# Check for aircraft database
if [ ! -f "aircraft_db.json" ]; then
    echo -e "${YELLOW}⚠️  Aircraft database not found${NC}"
    echo "Downloading aircraft database..."
    curl -L -o aircraft_db.json "https://raw.githubusercontent.com/wiedehopf/tar1090-db/master/aircraft.csv.json" 2>/dev/null || {
        echo -e "${YELLOW}Warning: Could not download aircraft database${NC}"
        echo "The service will work with limited aircraft info"
    }
fi

# GitHub Pages sync configuration
GITHUB_REPO="${1:-}"

if [ -n "$GITHUB_REPO" ]; then
    echo -e "${GREEN}✓ GitHub Pages sync enabled${NC}"
    echo "  Target: $GITHUB_REPO"
    echo ""
    
    # Start tracker in background
    echo -e "${BLUE}Starting tracker service...${NC}"
    node tracker.mjs &
    TRACKER_PID=$!
    
    # Wait a moment for tracker to start
    sleep 2
    
    if ! kill -0 $TRACKER_PID 2>/dev/null; then
        echo -e "${RED}Error: Tracker failed to start${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✓ Tracker running (PID: $TRACKER_PID)${NC}"
    echo ""
    
    # Start sync loop
    echo -e "${BLUE}Starting GitHub Pages sync loop...${NC}"
    echo "  Sync interval: 2 minutes"
    echo "  Press Ctrl+C to stop"
    echo ""
    
    trap "echo ''; echo 'Stopping...'; kill $TRACKER_PID 2>/dev/null; exit 0" INT TERM
    
    while true; do
        sleep 120
        ./sync-to-pages.sh "$GITHUB_REPO" 2>&1 | while read line; do
            echo "  [$(date '+%H:%M:%S')] $line"
        done
    done
else
    echo -e "${YELLOW}⚠️  GitHub Pages sync not configured${NC}"
    echo ""
    echo "To enable sync, provide your my-flights repo:"
    echo "  ./run.sh ~/my-flights"
    echo "  ./run.sh https://github.com/user/my-flights.git"
    echo ""
    echo -e "${BLUE}Starting tracker only...${NC}"
    echo "  Press Ctrl+C to stop"
    echo ""
    
    node tracker.mjs
fi
