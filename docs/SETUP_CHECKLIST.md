# Setup Checklist

Follow this checklist to get your flight tracker running.

---

## Pre-Flight

- [ ] macOS computer that can run 24/7 (Mac mini, MacBook, etc.)
- [ ] Node.js 18+ installed (`node --version`)
- [ ] Git configured with GitHub credentials
- [ ] GitHub account

---

## Step 1: Clone & Install

- [ ] Clone repo: `git clone https://github.com/jackwallner/flight-tracker-service.git`
- [ ] Enter directory: `cd flight-tracker-service`
- [ ] Install deps: `npm install`

---

## Step 2: Configure

- [ ] Copy env file: `cp .env.example .env`
- [ ] Edit `.env` with your coordinates
  - [ ] Set `TRACKER_LAT` (find on Google Maps)
  - [ ] Set `TRACKER_LON` (find on Google Maps)
  - [ ] Adjust `TRACKER_RADIUS_NM` if needed (default: 1.5)
- [ ] Set `AWTRIX_IP` if using AWTRIX clock
  - [ ] Upload required icons (see [AWTRIX_ICONS.md](./AWTRIX_ICONS.md))

---

## Step 3: Test Run

- [ ] Run manually: `node tracker.mjs`
- [ ] Check for flights detected in terminal output
- [ ] Verify no errors in console
- [ ] Stop with Ctrl+C

---

## Step 4: GitHub Pages Repo

- [ ] Create GitHub repo called `my-flights`
- [ ] Enable GitHub Pages (Settings → Pages → main branch)
- [ ] Clone it locally: `git clone git@github.com:YOURNAME/my-flights.git`

---

## Step 5: Configure Sync

- [ ] Copy sync script: `cp sync-to-pages.sh sync-to-my-repo.sh`
- [ ] Edit `sync-to-my-repo.sh`:
  - [ ] Set `GITHUB_REPO="git@github.com:YOURNAME/my-flights.git"`
- [ ] Make executable: `chmod +x sync-to-my-repo.sh`
- [ ] Test sync: `./sync-to-my-repo.sh`
- [ ] Verify files appear in GitHub repo
- [ ] Check site loads: `https://YOURNAME.github.io/my-flights/`

---

## Step 6: Install as Service

- [ ] Create plist file at `~/Library/LaunchAgents/com.YOURNAME.flight-tracker.plist`
- [ ] Update all paths in plist to your username
- [ ] Update coordinates in plist
- [ ] Load service: `launchctl load ~/Library/LaunchAgents/com.YOURNAME.flight-tracker.plist`
- [ ] Verify running: `launchctl list | grep flight-tracker`
- [ ] Check logs: `tail -f ~/flight-tracker-service/tracker.log`

---

## Step 7: Verify Everything

- [ ] Service running: `launchctl list | grep flight-tracker`
- [ ] Logs showing polls: `tail tracker.log`
- [ ] GitHub repo updating (check commit times)
- [ ] Website showing current data
- [ ] AWTRIX displaying flights (if configured)

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Service won't start | Check plist syntax, paths, permissions |
| No flights detected | Verify coordinates, increase radius |
| GitHub sync failing | Check SSH keys, repo URL |
| Website not updating | Check sync interval (2 min), git status |

---

## Maintenance

- [ ] Check logs weekly for errors
- [ ] Update Node.js periodically
- [ ] Review flight history size (flights.json can grow large)
