# AWTRIX Icon Setup

This document explains how to configure custom icons on your AWTRIX clock for the flight tracker service.

## Overview

The flight tracker sends notifications to your AWTRIX clock with **icon names** (not LaMetric IDs). Your AWTRIX must have these icons uploaded to its `/ICONS` folder with the correct filenames.

## Required Icons

The flight tracker uses these 5 icons:

| Icon Name | Purpose | Source File |
|-----------|---------|-------------|
| `plane.gif` | Flight number display (commercial flights) | `2933.gif` (LaMetric "Plane Anim") |
| `globe.gif` | Route display (departure-arrival) | `17777.gif` (LaMetric "Globe 2") |
| `helicopter.gif` | Private/GA aircraft distance | `72581.gif` (LaMetric "Helicopter") |
| `arrow_up.gif` | High altitude indicator (>30k ft) | `7465.gif` (LaMetric "Arrow Up") |
| `arrow_down.gif` | Low altitude indicator (<5k ft) | `7463.gif` (LaMetric "Arrow Down") |

## Installation

### Step 1: Download LaMetric Icons

Download the icon files from LaMetric:

```bash
# Download from LaMetric API
curl -O https://developer.lametric.com/content/apps/icon_thumbs/2933_icon_thumb.gif
mv 2933_icon_thumb.gif plane.gif

curl -O https://developer.lametric.com/content/apps/icon_thumbs/17777_icon_thumb.gif
mv 17777_icon_thumb.gif globe.gif

curl -O https://developer.lametric.com/content/apps/icon_thumbs/72581_icon_thumb.gif
mv 72581_icon_thumb.gif helicopter.gif

curl -O https://developer.lametric.com/content/apps/icon_thumbs/7465_icon_thumb.gif
mv 7465_icon_thumb.gif arrow_up.gif

curl -O https://developer.lametric.com/content/apps/icon_thumbs/7463_icon_thumb.gif
mv 7463_icon_thumb.gif arrow_down.gif
```

### Step 2: Upload to AWTRIX

Upload each icon to your AWTRIX `/ICONS` folder via the web editor:

1. Open `http://YOUR_AWTRIX_IP/edit` in your browser
2. Navigate to the `/ICONS` folder
3. Upload each `.gif` file with the correct name (e.g., `plane.gif`)

**Or use curl:**

```bash
AWTRIX_IP=192.168.5.56

curl -X POST "http://${AWTRIX_IP}/edit?dir=/ICONS" \
  -F "file=@plane.gif;filename=/ICONS/plane.gif"

curl -X POST "http://${AWTRIX_IP}/edit?dir=/ICONS" \
  -F "file=@globe.gif;filename=/ICONS/globe.gif"

curl -X POST "http://${AWTRIX_IP}/edit?dir=/ICONS" \
  -F "file=@helicopter.gif;filename=/ICONS/helicopter.gif"

curl -X POST "http://${AWTRIX_IP}/edit?dir=/ICONS" \
  -F "file=@arrow_up.gif;filename=/ICONS/arrow_up.gif"

curl -X POST "http://${AWTRIX_IP}/edit?dir=/ICONS" \
  -F "file=@arrow_down.gif;filename=/ICONS/arrow_down.gif"
```

### Step 3: Verify Installation

Check that icons are in the correct location:

```bash
curl http://YOUR_AWTRIX_IP/list?dir=/ICONS | grep -E "(plane|globe|helicopter|arrow_up|arrow_down)"
```

You should see all 5 icon files listed.

### Step 4: Test Icons

Test each icon via the API:

```bash
AWTRIX_IP=192.168.5.56

# Test plane
curl -X POST "http://${AWTRIX_IP}/api/notify" \
  -H "Content-Type: application/json" \
  -d '{"text":"ASA B738", "icon":"plane", "color":"#FFD700", "duration":3}'

# Test globe
curl -X POST "http://${AWTRIX_IP}/api/notify" \
  -H "Content-Type: application/json" \
  -d '{"text":"SEA-PDX", "icon":"globe", "color":"#FFFFFF", "duration":3}'

# Test helicopter
curl -X POST "http://${AWTRIX_IP}/api/notify" \
  -H "Content-Type: application/json" \
  -d '{"text":"N123AB", "icon":"helicopter", "color":"#00D9FF", "duration":3}'

# Test arrow_up
curl -X POST "http://${AWTRIX_IP}/api/notify" \
  -H "Content-Type: application/json" \
  -d '{"text":"35000 FT", "icon":"arrow_up", "color":"#00D9FF", "duration":3}'

# Test arrow_down
curl -X POST "http://${AWTRIX_IP}/api/notify" \
  -H "Content-Type: application/json" \
  -d '{"text":"5000 FT", "icon":"arrow_down", "color":"#00FF00", "duration":3}'
```

Each test should display text with the corresponding icon on your AWTRIX.

## Troubleshooting

### Icons Not Showing

1. **Check location**: Icons MUST be in `/ICONS` folder, not root
2. **Verify filenames**: Must match exactly: `plane.gif`, `globe.gif`, `helicopter.gif`, `arrow_up.gif`, `arrow_down.gif`
3. **Check file format**: Must be 8x8 GIF files
4. **Test with icon name**: AWTRIX requires icon names (strings), not numeric IDs

### Icons in Wrong Folder

If icons were uploaded to root (`/`) instead of `/ICONS`:

```bash
AWTRIX_IP=192.168.5.56

# Delete from root
for icon in plane globe helicopter arrow_up arrow_down; do
  curl -X DELETE "http://${AWTRIX_IP}/edit?file=/${icon}.gif"
done

# Re-upload to /ICONS (see Step 2 above)
```

### Conflicting Icons

If you have existing icons with the same names:

1. Delete the old versions from `/ICONS`
2. Upload the new versions
3. Test to confirm they work

## Technical Details

### How Icon Mapping Works

The flight tracker sends notifications like this:

```javascript
{
  text: "ASA B738",
  icon: "plane",        // Icon NAME, not ID
  color: "#FFD700",
  duration: 4
}
```

The AWTRIX looks for `/ICONS/plane.gif` to display.

### Why Not LaMetric IDs?

The flight tracker's `channel.mjs` maps internal names to LaMetric IDs:

```javascript
export const ICONS = {
  plane: '2933',      // LaMetric ID
  globe: '1200',
  // ...
};
```

But AWTRIX requires matching the **icon name** to a file in `/ICONS/`, not resolving numeric IDs.

## References

- LaMetric Icon Database: https://developer.lametric.com/icons
- AWTRIX API Docs: https://blueforcer.github.io/awtrix3/#/api
- Icon files stored in: `/ICONS/` folder on AWTRIX
