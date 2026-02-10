# Flight Tracker Service

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green?logo=node.js)](https://nodejs.org/)
[![macOS](https://img.shields.io/badge/macOS-Compatible-silver?logo=apple)](https://www.apple.com/macos/)

> A perpetual macOS service that tracks aircraft flying overhead and displays them on an [AWTRIX](https://github.com/Blueforcer/awtrix3) pixel clock. Smooth in-place screen updates with visual effects (proximity colors, progress bars, gradients, rainbow text).

## Features

- **Real-time tracking** - Polls FlightRadar24 every 10 seconds
- **Closest approach** - Calculates minimum distance for each flight
- **AWTRIX custom app** - Smooth in-place updates (no screen blanking)
- **Visual effects** - Proximity-based colors, progress bars, gradient text, rainbow text, animated icons
- **3-screen rotation** - Distance, Route, Flight ID cycling every 4 seconds
- **Aircraft database** - 520k aircraft records for type/registration lookup
- **Persistent history** - Saves all flights to JSON
- **Auto-publishes** - Optional sync to GitHub Pages

## Quick Start

```bash
# Clone
git clone https://github.com/jackwallner/flight-tracker-service.git
cd flight-tracker-service

# Configure (edit with YOUR coordinates)
export TRACKER_LAT=40.748817        # Your latitude
export TRACKER_LON=-73.985428       # Your longitude
export TRACKER_RADIUS_NM=0.70       # Detection radius in nautical miles
export CLOCK_IP=192.168.1.100       # Your AWTRIX clock IP

# Run
node tracker-v2.mjs

# Or use the launcher script
./run.sh
```

### Finding Your Coordinates

1. Open [Google Maps](https://maps.google.com)
2. Right-click your location
3. Copy the latitude, longitude values

## AWTRIX Display

When a flight enters your zone, 3 screens rotate every 4 seconds with no blanking:

| Screen | Content | Effects |
|--------|---------|---------|
| Distance | e.g., "0.4" | Proximity color (red/orange/cyan), progress bar, bouncing icon |
| Route | e.g., "SEA-PDX" | Cyan-to-gold gradient, sliding icon |
| Flight ID | e.g., "ASB738" | Rainbow text (commercial) or gold (private), bouncing icon |

**Proximity colors:**
- Red: Very close (< 43% of radius)
- Orange: Close (< 71% of radius)
- Cyan: In zone

**Icons:**
- Plane - Commercial flights
- Helicopter - Private/GA flights

## Test AWTRIX Features

Run the test script to verify all visual features work on your clock:

```bash
node test-awtrix-app.mjs
```

Tests: health check, custom app create/update, gradient, rainbow, pushIcon modes, progress bar, proximity color sweep, 3-screen rotation, app clear.

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
        <string>/path/to/flight-tracker-service/tracker-v2.mjs</string>
    </array>

    <key>EnvironmentVariables</key>
    <dict>
        <key>TRACKER_LAT</key>
        <string>YOUR_LATITUDE</string>
        <key>TRACKER_LON</key>
        <string>YOUR_LONGITUDE</string>
        <key>TRACKER_RADIUS_NM</key>
        <string>0.70</string>
        <key>CLOCK_IP</key>
        <string>YOUR_AWTRIX_IP</string>
        <key>POLL_INTERVAL</key>
        <string>10</string>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin</string>
    </dict>

    <key>WorkingDirectory</key>
    <string>/path/to/flight-tracker-service</string>
    <key>StandardOutPath</key>
    <string>/path/to/flight-tracker-service/tracker.log</string>
    <key>StandardErrorPath</key>
    <string>/path/to/flight-tracker-service/tracker.error.log</string>
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

### 3. Management

```bash
# Check if running
launchctl list | grep flight-tracker

# Stop
launchctl unload ~/Library/LaunchAgents/com.yourname.flight-tracker.plist

# Restart
launchctl unload ~/Library/LaunchAgents/com.yourname.flight-tracker.plist
launchctl load ~/Library/LaunchAgents/com.yourname.flight-tracker.plist

# View logs
tail -f tracker.log
tail -f tracker.error.log
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TRACKER_LAT` | 40.748817 | Your latitude |
| `TRACKER_LON` | -73.985428 | Your longitude |
| `TRACKER_RADIUS_NM` | 0.70 | Detection radius in nautical miles |
| `POLL_INTERVAL` | 10 | Seconds between API polls |
| `CLOCK_IP` | 192.168.5.56 | AWTRIX clock IP address |

### AWTRIX Setup

1. Ensure your AWTRIX clock is on the same network
2. Find its IP in your router's admin panel
3. Test: `curl http://YOUR_AWTRIX_IP/api/stats`
4. Upload required icons - See [docs/AWTRIX_ICONS.md](./docs/AWTRIX_ICONS.md)

## File Structure

```
flight-tracker-service/
├── tracker-v2.mjs        # Main service (custom app, visual effects)
├── tracker.mjs           # Legacy service (notify API, no effects)
├── api-fr24.mjs          # FlightRadar24 API client
├── aircraft-db.mjs       # Aircraft database lookup
├── aircraft_db.json      # 520k aircraft database (53MB)
├── channel.mjs           # AWTRIX clock integration
├── test-awtrix-app.mjs   # AWTRIX feature test suite
├── run.sh                # Launch script
├── flights.json          # Flight history (auto-generated)
└── flights-web.json      # Current flight data (auto-generated)
```

## How It Works

1. **Poll** FlightRadar24 every 10s for flights within radius
2. **Lookup** aircraft details in 520k aircraft database
3. **Track** closest approach for each flight while in zone
4. **Display** on AWTRIX via custom app API (smooth, no blanking)
5. **Rotate** 3 screens every 4 seconds with live distance updates
6. **Clear** display when flight leaves zone

## Troubleshooting

### No flights detected

- Check your coordinates are correct
- Try increasing radius (e.g., `TRACKER_RADIUS_NM=2.0`)
- Verify FR24 API: `curl "https://data-cloud.flightradar24.com/zones/fcgi/feed.js?bounds=41,40,-73,-74"`

### AWTRIX not updating

- Verify clock IP: `curl http://YOUR_CLOCK_IP/api/stats`
- Run test suite: `node test-awtrix-app.mjs`
- Check icons are uploaded

### Stale display after restart

- Clear the app manually: `curl -X POST -H "Content-Type: application/json" -d '{}' http://YOUR_CLOCK_IP/api/custom?name=flight`

## License

MIT
