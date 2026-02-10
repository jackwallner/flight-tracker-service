#!/usr/bin/env node
/**
 * AWTRIX Custom App Feature Test
 *
 * Standalone script that tests each visual feature against the live clock.
 * Each test sends to the clock, verifies HTTP 200, and logs PASS/FAIL.
 *
 * Run: node test-awtrix-app.mjs
 */

const CLOCK_IP = process.env.CLOCK_IP || '192.168.5.56';
const APP_NAME = 'flighttest';
const DELAY_MS = 2500; // Pause between tests for visual verification

let passed = 0;
let failed = 0;
const results = [];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendApp(payload) {
  const res = await fetch(`http://${CLOCK_IP}/api/custom?name=${APP_NAME}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return res;
}

function log(testNum, name, pass, detail = '') {
  const tag = pass ? '[PASS]' : '[FAIL]';
  const msg = `  ${tag} ${testNum}. ${name}${detail ? ' — ' + detail : ''}`;
  console.log(msg);
  results.push({ testNum, name, pass });
  if (pass) passed++;
  else failed++;
}

// ============================================================================

async function runTests() {
  console.log('='.repeat(60));
  console.log('  AWTRIX Custom App Feature Tests');
  console.log('='.repeat(60));
  console.log(`  Clock: ${CLOCK_IP}`);
  console.log(`  App:   ${APP_NAME}`);
  console.log('');

  // 1. Health check
  try {
    const res = await fetch(`http://${CLOCK_IP}/api/stats`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000)
    });
    if (res.ok) {
      const stats = await res.json();
      log(1, 'Health check', true, `online, v${stats.version}, wifi ${stats.wifi_signal}%`);
    } else {
      log(1, 'Health check', false, `HTTP ${res.status}`);
      console.log('\n  ❌ Clock offline — cannot continue.\n');
      return;
    }
  } catch (err) {
    log(1, 'Health check', false, err.message);
    console.log('\n  ❌ Clock unreachable — cannot continue.\n');
    return;
  }
  await sleep(DELAY_MS);

  // 2. Custom app create
  try {
    const res = await sendApp({
      text: 'TEST',
      color: '#00FF00',
      noScroll: true,
      lifetime: 30
    });
    log(2, 'Custom app create', res.ok, `HTTP ${res.status}`);
  } catch (err) {
    log(2, 'Custom app create', false, err.message);
  }
  await sleep(DELAY_MS);

  // 3. In-place update (3 rapid updates)
  try {
    let allOk = true;
    for (let i = 1; i <= 3; i++) {
      const res = await sendApp({
        text: `UPD ${i}`,
        color: i === 1 ? '#FF0000' : i === 2 ? '#00FF00' : '#0000FF',
        noScroll: true,
        lifetime: 30
      });
      if (!res.ok) allOk = false;
      await sleep(500);
    }
    log(3, 'In-place update (x3)', allOk, 'no blanking between updates');
  } catch (err) {
    log(3, 'In-place update (x3)', false, err.message);
  }
  await sleep(DELAY_MS);

  // 4. Gradient text
  try {
    const res = await sendApp({
      text: 'GRADIENT',
      gradient: ['#FF0000', '#00FF00'],
      noScroll: true,
      lifetime: 30
    });
    log(4, 'Gradient text', res.ok, `HTTP ${res.status}`);
  } catch (err) {
    log(4, 'Gradient text', false, err.message);
  }
  await sleep(DELAY_MS);

  // 5. Rainbow text
  try {
    const res = await sendApp({
      text: 'RAINBOW',
      rainbow: true,
      noScroll: true,
      lifetime: 30
    });
    log(5, 'Rainbow text', res.ok, `HTTP ${res.status}`);
  } catch (err) {
    log(5, 'Rainbow text', false, err.message);
  }
  await sleep(DELAY_MS);

  // 6. PushIcon modes (0, 1, 2)
  try {
    let allOk = true;
    const modes = [
      { pushIcon: 0, label: 'fixed' },
      { pushIcon: 1, label: 'slide' },
      { pushIcon: 2, label: 'bounce' }
    ];
    for (const m of modes) {
      const res = await sendApp({
        text: `P${m.pushIcon} ${m.label}`,
        icon: 'plane',
        pushIcon: m.pushIcon,
        color: '#00D9FF',
        noScroll: true,
        lifetime: 30
      });
      if (!res.ok) allOk = false;
      await sleep(1500);
    }
    log(6, 'PushIcon modes (0/1/2)', allOk, 'fixed → slide → bounce');
  } catch (err) {
    log(6, 'PushIcon modes (0/1/2)', false, err.message);
  }
  await sleep(DELAY_MS);

  // 7. Progress bar
  try {
    const res = await sendApp({
      text: '75%',
      progress: 75,
      progressC: [0, 255, 0],
      progressBC: [30, 30, 30],
      noScroll: true,
      lifetime: 30
    });
    log(7, 'Progress bar', res.ok, `HTTP ${res.status}`);
  } catch (err) {
    log(7, 'Progress bar', false, err.message);
  }
  await sleep(DELAY_MS);

  // 8. Proximity color sweep (0.1 → 0.7 NM)
  try {
    let allOk = true;
    const distances = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7];
    for (const d of distances) {
      const color = d < 0.3 ? '#FF0000' : d < 0.5 ? '#FFA500' : '#00D9FF';
      const colorRGB = d < 0.3 ? [255, 0, 0] : d < 0.5 ? [255, 165, 0] : [0, 217, 255];
      const progress = Math.round((1 - d / 0.7) * 100);
      const res = await sendApp({
        text: d.toFixed(1),
        icon: 'plane',
        pushIcon: 2,
        color: color,
        progress: progress,
        progressC: colorRGB,
        progressBC: [30, 30, 30],
        noScroll: true,
        lifetime: 30
      });
      if (!res.ok) allOk = false;
      await sleep(800);
    }
    log(8, 'Proximity color sweep', allOk, '0.1→0.7NM with color + progress');
  } catch (err) {
    log(8, 'Proximity color sweep', false, err.message);
  }
  await sleep(DELAY_MS);

  // 9. 3-screen rotation (simulated flight)
  try {
    let allOk = true;
    const screens = [
      { // Screen 1: Distance
        text: '0.4',
        icon: 'plane',
        pushIcon: 2,
        color: '#FFA500',
        progress: 43,
        progressC: [255, 165, 0],
        progressBC: [30, 30, 30],
        noScroll: true,
        lifetime: 30
      },
      { // Screen 2: Route
        text: 'SEA-PDX',
        pushIcon: 1,
        gradient: ['#00D9FF', '#FFD700'],
        noScroll: true,
        lifetime: 30
      },
      { // Screen 3: Flight ID
        text: 'ASB738',
        icon: 'plane',
        pushIcon: 2,
        rainbow: true,
        noScroll: true,
        lifetime: 30
      }
    ];

    for (let i = 0; i < screens.length; i++) {
      const res = await sendApp(screens[i]);
      if (!res.ok) allOk = false;
      await sleep(3000);
    }
    log(9, '3-screen rotation', allOk, 'distance → route → flightID');
  } catch (err) {
    log(9, '3-screen rotation', false, err.message);
  }
  await sleep(DELAY_MS);

  // 10. App clear
  try {
    const res = await sendApp({});
    log(10, 'App clear', res.ok, `HTTP ${res.status}`);
  } catch (err) {
    log(10, 'App clear', false, err.message);
  }
  await sleep(1000);

  // 11. Cleanup — disable native apps (user preference)
  try {
    const res = await fetch(`http://${CLOCK_IP}/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ TIM: false, TEMP: false, HUM: false, BAT: false })
    });
    log(11, 'Cleanup (disable native apps)', res.ok, `HTTP ${res.status}`);
  } catch (err) {
    log(11, 'Cleanup (disable native apps)', false, err.message);
  }

  // Summary
  const total = passed + failed;
  console.log('');
  console.log('='.repeat(60));
  console.log(`  Results: ${passed}/${total} PASS${failed > 0 ? `, ${failed} FAIL` : ''}`);
  console.log('='.repeat(60));

  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
