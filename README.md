# Flight Tracker Service ✈️

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green?logo=node.js)](https://nodejs.org/)
[![macOS](https://img.shields.io/badge/macOS-Compatible-silver?logo=apple)](https://www.apple.com/macos/)

> A perpetual macOS service that tracks aircraft flying overhead and displays them on an AWTRIX clock. Feeds flight data to [my-flights](https://github.com/jackwallner/my-flights) GitHub Pages site.

## Features

- 🛩️ **Real-time tracking** - Polls FlightRadar24 API every 10 seconds
- 📊 **Closest approach** - Calculates minimum distance for each flight
- 🔄 **Session-based tracking** - Creates new entry for each overhead pass (5-min buffer)
- 📺 **AWTRIX display** - Shows flights on pixel clock with 3-screen rotation
- 🌐 **Auto-publishes** - Syncs to GitHub Pages every 2 minutes
- 💾 **Persistent history** - Saves all flights to JSON
- 🗄️ **Aircraft database** - 520k aircraft records for type/registration lookup

## Quick Start

```bash
# Clone
git clone https://github.com/jackwallner/flight-tracker-service.git
cd flight-tracker-service

# Install dependencies
npm install

# Configure (edit with your coordinates)
export TRACKER_LAT=45.625280431872
export TRACKER_LON=-122.52811167430798
export TRACKER_RADIUS_NM=1.5
export AWTRIX_IP=192.168.5.56

# Run once (for testing)
node tracker.mjs

# Or run with sync
cp sync-to-pages.sh sync-to-my-repo.sh
# Edit sync-to-my-repo.sh with your GitHub repo URL
./run.sh
```

## Installation as macOS Service

### 1. Create LaunchAgent

Create `~/Library/LaunchAgents/com.yourname.flight-tracker.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.yourname.flight-tracker</string>
    
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/Users/YOURNAME/flight-tracker-service/tracker.mjs</string>
    </array>
    
    <key>EnvironmentVariables</key>
    <dict>
        <key>TRACKER_LAT</key>
        <string>45.625280431872</string>
        <key>TRACKER_LON</key>
        <string>-122.52811167430798</string>
        <key>TRACKER_RADIUS_NM</key>
        <string>1.5</string>
        <key>AWTRIX_IP</key>
        <string>192.168.5.56</string>
        <key>POLL_INTERVAL</key>
        <string>10</string>
    </dict>
    
    <key>WorkingDirectory</key>
    <string>/Users/YOURNAME/flight-tracker-service</string>
    <key>StandardOutPath</key>
    <string>/Users/YOURNAME/flight-tracker-service/tracker.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/YOURNAME/flight-tracker-service/tracker.error.log</string>
    <key>KeepAlive</key>
    <true/>
    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>
```

### 2. Load the Service

```bash
launchctl load ~/Library/LaunchAgents/com.yourname.flight-tracker.plist
```

### 3. Check Status

```bash
launchctl list | grep flight-tracker
```

### 4. View Logs

```bash
# Live tail
tail -f ~/flight-tracker-service/tracker.log

# Errors
tail -f ~/flight-tracker-service/tracker.error.log
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TRACKER_LAT` | (required) | Your latitude |
| `TRACKER_LON` | (required) | Your longitude |
| `TRACKER_RADIUS_NM` | 1.5 | Detection radius in nautical miles |
| `POLL_INTERVAL` | 10 | Seconds between API polls |
| `AWTRIX_IP` | 192.168.5.56 | AWTRIX clock IP address |
| `GITHUB_REPO` | - | GitHub Pages repo for sync |

### Finding Your Coordinates

1. Open Google Maps
2. Right-click your location
3. Copy the lat/lng values

### AWTRIX Setup

1. Ensure your AWTRIX clock is on the same network
2. Find its IP in your router's admin panel
3. Test: `curl http://YOUR_AWTRIX_IP/api/stats`
4. **Upload required icons** - See [docs/AWTRIX_ICONS.md](./docs/AWTRIX_ICONS.md) for setup instructions

## File Structure

```
flight-tracker-service/
├── tracker.mjs           # Main service (Node.js)
├── api-fr24.mjs          # FlightRadar24 API client
├── aircraft-db.mjs       # Aircraft database lookup
├── aircraft_db.json      # 520k aircraft database (53MB)
├── channel.mjs           # AWTRIX clock integration
├── enrich-history.mjs    # History enrichment tool
├── flights-web.html      # Website template (for my-flights)
├── sync-to-pages.sh      # GitHub Pages sync script
├── run.sh                # Launch script
├── flights-web.json      # Current flight data (auto-generated)
├── flights.json          # Flight history (auto-generated)
└── tracker.log           # Service logs (auto-generated)
```

## How It Works

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  FlightRadar24  │────▶│  tracker.mjs    │────▶│  AWTRIX Clock   │
│     API         │     │  (Mac service)  │     │  (192.168.5.56) │
└─────────────────┘     └────────┬────────┘     └─────────────────┘
                                 │
                    ┌────────────┼────────────┐
                    ▼            ▼            ▼
            ┌──────────┐  ┌──────────┐  ┌──────────┐
            │ flights  │  │  flights │  │flights-  │
            │ .json    │  │  -web    │  │ web.html │
            │(history) │  │  .json   │  │(website) │
            └──────────┘  └────┬─────┘  └────┬─────┘
                               │             │
                               │  sync-to-   │
                               │  pages.sh   │
                               ▼             ▼
                    ┌─────────────────────┐
                    │  my-flights/        │
                    │  (GitHub Pages)     │
                    └─────────────────────┘
```

1. **Poll** FlightRadar24 every 10s for flights within 1.5 NM radius
2. **Lookup** aircraft details in 520k aircraft database
3. **Track** closest approach for each flight while in zone
4. **Session Tracking** - Creates separate entry for each overhead pass (5-min buffer prevents duplicates)
5. **Notify** AWTRIX clock with 3-screen sequence for close flights (≤1.5 NM):
   - Screen 1: Distance with icon (plane/helicopter)
   - Screen 2: Route (Origin-Destination)
   - Screen 3: Airline code + Aircraft type
6. **Export** `flights-web.json` continuously (throttled 5s)
7. **Sync** to `my-flights/` repo every 2 minutes for GitHub Pages

## GitHub Pages Sync

To publish flight data to a website:

1. Copy the sync script:
```bash
cp sync-to-pages.sh sync-to-my-repo.sh
```

2. Edit `sync-to-my-repo.sh` with your repo:
```bash
GITHUB_REPO="git@github.com:yourusername/my-flights.git"
```

3. Run it:
```bash
./sync-to-my-repo.sh
```

Or use `run.sh` which starts both the tracker and the sync loop.

## AWTRIX Display Sequence

When a new close flight (≤1.5 NM) is detected, cycles 3 times:

| Screen | Duration | Content | Icon | Color |
|--------|----------|---------|------|-------|
| 1 | 5 sec | Distance (e.g., "1.2") | ✈️/🚁 | Cyan |
| 2 | 5 sec | Route (e.g., "SEA-LAX") | - | White |
| 3 | 5 sec | Airline + Type (e.g., "ASB738") | ✈️/🚁 | Gold |

Icons:
- ✈️ **Plane** - Commercial flights
- 🚁 **Helicopter** - Private/N-number flights

Colors indicate:
- 🟠 Orange: Low altitude (< 5,000 ft)
- 🟡 Gold: Medium altitude (5,000 - 15,000 ft)
- 🔵 Cyan: Climbing/descending (15,000 - 30,000 ft)
- 🟣 Purple: Cruising altitude (> 30,000 ft)

## Management Commands

```bash
# Check if running
launchctl list | grep flight-tracker

# Stop service
launchctl unload ~/Library/LaunchAgents/com.yourname.flight-tracker.plist

# Start service
launchctl load ~/Library/LaunchAgents/com.yourname.flight-tracker.plist

# Restart
launchctl unload ~/Library/LaunchAgents/com.yourname.flight-tracker.plist
launchctl load ~/Library/LaunchAgents/com.yourname.flight-tracker.plist

# View logs
tail -f ~/flight-tracker-service/tracker.log
tail -f ~/flight-tracker-service/tracker.error.log

# Run manually (for debugging)
cd ~/flight-tracker-service
node tracker.mjs
```

## Session-Based Tracking

The tracker uses **session-based tracking** to ensure each overhead pass is recorded separately:

- **Session Key**: `callsign_YYYY-MM-DDTHH` (hour-level grouping)
- **Buffer Window**: 5 minutes
- Same flight passing 10 minutes later = **separate entry**
- Same flight tomorrow = **new entry** (not updating yesterday's)
- Private planes doing circuits = **each pass tracked separately**

This prevents the old behavior where ASA123 on Monday would overwrite ASA123's data from Sunday.

## Troubleshooting

### `disableTimeApp is not a function`

The `channel.mjs` file is missing. Ensure all files are in the service directory.

### No flights detected

- Check coordinates in plist file
- Verify radius isn't too small (try 2.0 NM)
- Check API is responding: `curl https://fr24api.flightradar24.com/api/splash/health`
- Check logs: `tail tracker.error.log`

### Website showing old data

The sync loop runs every 2 minutes. Check:
- `sync-to-pages.sh` has correct GitHub repo URL
- Git credentials are configured
- Check sync log: `tail tracker.log | grep "Synced to"`

### AWTRIX not showing flights

- Verify AWTRIX_IP is correct
- Test connectivity: `curl http://YOUR_AWTRIX_IP/api/stats`
- **Check icons are uploaded** - See [docs/AWTRIX_ICONS.md](./docs/AWTRIX_ICONS.md)
- Check AWTRIX MQTT settings if using MQTT mode

## Uninstall

```bash
# Stop service
launchctl unload ~/Library/LaunchAgents/com.yourname.flight-tracker.plist

# Remove service file
rm ~/Library/LaunchAgents/com.yourname.flight-tracker.plist

# Remove service directory (optional)
rm -rf ~/flight-tracker-service
```

## Related Projects

- **[my-flights](https://github.com/jackwallner/my-flights)** - GitHub Pages display for this service
- **[overhead-flights](https://github.com/jackwallner/overhead-flights)** - Standalone client-side tracker (no server needed)

## License

MIT
