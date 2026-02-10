/**
 * AWTRIX Channel - Ulanzi Smart Pixel Clock
 * 
 * First-class channel for insight-router
 * Display: 32x8 pixels (256 total)
 * IP: 192.168.5.56
 */

const CLOCK_IP = process.env.CLOCK_IP || '192.168.5.56';
const DEFAULT_DURATION = 8;
const DEFAULT_BRIGHTNESS = parseInt(process.env.AWTRIX_BRIGHTNESS) || 50; // 0-255, ~50% default

// Named colors
export const COLORS = {
  seahawks: '#69BE28',
  mariners: '#0C2C56', 
  kraken: '#5BC2E7',
  error: '#FF0000',
  warning: '#FFA500',
  success: '#00FF00',
  info: '#0080FF',
  white: '#FFFFFF',
  gold: '#FFD700',
  purple: '#800080'
};

// Icon mapping - our uploaded icon names (animated LaMetric icons)
export const ICONS = {
  // Flight/Travel
  plane: 'plane',              // 2933 - animated airplane
  flight: 'plane',
  arrow_up: 'arrow_up',        // 7465 - animated up arrow
  arrow_down: 'arrow_down',    // 7463 - animated down arrow

  // Alerts & Status
  rainbow_alert: 'rainbow_alert',  // 6881 - animated alert
  loading: 'loading',              // 232 - animated spinner

  // Celebrations & Events
  celebrate: 'celebrate',      // 14004 - animated celebration
  fireworks: 'fireworks',      // 2867 - animated fireworks

  // Sports
  seahawks: 'seahawks',        // 7003 - seahawks logo
  football: 'football',        // 1302 - animated football

  // Emotions & Expressions
  eyes: 'eyes',                // 5266 - animated eyes
  smiley: 'smiley',            // 5751 - animated smiley

  // Effects & Visuals
  flame: 'flame',              // 7756 - animated flame
  matrix: 'matrix',            // 5742 - animated matrix
  snow: 'snow',                // 8189 - animated snow

  // Symbols
  usa: 'usa'                   // 413 - animated USA flag
};

// Abbreviations for limited display
const ABBREVIATIONS = {
  'seahawks': 'HAWKS',
  'mariners': 'M\'S',
  'kraken': 'KRAK',
  'touchdown': 'TD',
  'quarterback': 'QB',
  'temperature': 'TEMP',
  'yesterday': 'YEST',
  'tomorrow': 'TMRW',
  'morning': 'AM',
  'evening': 'PM',
  'congratulations': 'NICE!',
  'error': 'ERR',
  'warning': 'WARN',
  'success': 'OK',
  'defeated': 'BEAT',
  'victory': 'WIN',
  'temperature': 'TEMP',
  'finished': 'DONE',
  'completed': 'DONE'
};

/**
 * Send message to AWTRIX clock
 */
export async function send(message) {
  const payload = buildPayload(message);
  
  try {
    const res = await fetch(`http://${CLOCK_IP}/api/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    }
    
    return { success: true, payload };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Build AWTRIX API payload from message
 */
function buildPayload(message) {
  const payload = {
    text: formatText(message.text || message.content || ''),
    color: resolveColor(message.color, message.priority),
    duration: message.duration || DEFAULT_DURATION
  };

  // Add icon if specified (use name directly, not ID)
  if (message.icon) {
    // Map named icon to our icon name, or use as-is if it's already an icon name
    payload.icon = ICONS[message.icon] || message.icon;
  }

  // Add text size (1 or 2)
  if (message.size === 2) {
    payload.size = 2;
  }
  
  // Add brightness (0-255) - use message brightness or default
  const brightness = message.brightness !== undefined ? message.brightness : DEFAULT_BRIGHTNESS;
  payload.brightness = Math.max(0, Math.min(255, brightness));

  // Add effects
  if (message.effect === 'rainbow') {
    payload.rainbow = true;
  }
  if (message.effect === 'blink') {
    payload.blink = true;
  }
  if (message.effect === 'fade') {
    payload.fade = true;
  }
  if (message.scroll === false) {
    payload.noScroll = true;
  }

  // Add sound if specified (and not quiet hours)
  if (message.sound && !isQuietHours()) {
    payload.sound = message.sound;
  }

  // Critical messages hold until dismissed
  if (message.hold || message.priority === 'critical') {
    payload.hold = true;
  }

  return payload;
}

/**
 * Format text for 32x8 display
 * Preserves emojis by only uppercasing non-emoji text
 */
function formatText(text) {
  if (!text) return '';
  
  // Split by emojis and preserve them
  const parts = text.split(/([\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]+)/gu);
  
  let formatted = parts.map((part, index) => {
    // Even indices are text, odd indices are emojis
    if (index % 2 === 0) {
      return part.toUpperCase();
    }
    return part; // Keep emojis as-is
  }).join('');
  
  // Apply abbreviations (only to text portions)
  for (const [word, abbr] of Object.entries(ABBREVIATIONS)) {
    const regex = new RegExp(`(?<![\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}])${word}(?![\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}])`, 'giu');
    formatted = formatted.replace(regex, abbr);
  }
  
  // Remove extra whitespace
  formatted = formatted.replace(/\s+/g, ' ').trim();
  
  // Limit length (AWTRIX handles scrolling, but let's be reasonable)
  if (formatted.length > 50) {
    formatted = formatted.substring(0, 47) + '...';
  }
  
  return formatted;
}

/**
 * Resolve color from string
 */
function resolveColor(color, priority) {
  if (!color) {
    // Default based on priority
    switch (priority) {
      case 'critical': return COLORS.error;
      case 'high': return COLORS.warning;
      case 'success': return COLORS.success;
      default: return COLORS.white;
    }
  }
  
  // Named color
  if (COLORS[color]) {
    return COLORS[color];
  }
  
  // Hex color (validate)
  if (color.match(/^#[0-9A-F]{6}$/i)) {
    return color;
  }
  
  return COLORS.white;
}

/**
 * Check if currently in quiet hours
 */
function isQuietHours() {
  const hour = new Date().getHours();
  return hour >= 22 || hour < 7; // 10 PM - 7 AM
}

/**
 * Auto-format any content for AWTRIX
 */
export function autoFormat(content) {
  const text = typeof content === 'string' ? content : content.text || '';
  
  // Detect content type and style accordingly
  const detected = detectType(text);
  
  return {
    text: formatText(text),
    icon: detected.icon,
    color: detected.color,
    priority: detected.priority,
    sound: detected.sound
  };
}

/**
 * Detect content type from text
 */
function detectType(text) {
  const t = text.toLowerCase();
  
  // Sports
  if (t.includes('seahawks') || t.includes('mariners') || t.includes('kraken') || 
      t.includes('td') || t.includes('touchdown') || t.includes('score')) {
    return { 
      icon: 'sports', 
      color: t.includes('seahawks') ? 'seahawks' : 'info',
      priority: 'high',
      sound: 'piezo'
    };
  }
  
  // Errors
  if (t.includes('error') || t.includes('fail') || t.includes('❌') || t.includes('crash')) {
    return { 
      icon: 'error', 
      color: 'error',
      priority: 'critical',
      sound: 'alarm'
    };
  }
  
  // Success
  if (t.includes('success') || t.includes('✅') || t.includes('done') || t.includes('complete')) {
    return { 
      icon: 'success', 
      color: 'success',
      priority: 'normal',
      sound: 'none'
    };
  }
  
  // Weather
  if (t.includes('weather') || t.includes('°') || t.includes('temp')) {
    return { 
      icon: 'weather', 
      color: 'info',
      priority: 'normal',
      sound: 'none'
    };
  }
  
  // Time/Schedule
  if (t.includes('am') || t.includes('pm') || t.includes('time') || t.includes('o\'clock')) {
    return { 
      icon: 'time', 
      color: 'gold',
      priority: 'normal',
      sound: 'none'
    };
  }
  
  // Default
  return { 
    icon: 'message', 
    color: 'white',
    priority: 'normal',
    sound: 'none'
  };
}

/**
 * Send a sequence of messages
 */
export async function sendSequence(messages, delayMs = 4000) {
  for (const msg of messages) {
    await send(msg);
    if (delayMs > 0) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}

/**
 * Health check
 */
export async function health() {
  try {
    const res = await fetch(`http://${CLOCK_IP}/api/stats`, { 
      method: 'GET',
      signal: AbortSignal.timeout(3000)
    });
    
    if (res.ok) {
      const stats = await res.json();
      return {
        status: 'online',
        ip: stats.ip_address,
        version: stats.version,
        wifi: stats.wifi_signal,
        uptime: stats.uptime
      };
    }
    return { status: 'error', code: res.status };
  } catch (err) {
    return { status: 'offline', error: err.message };
  }
}

/**
 * Test the connection
 */
export async function test() {
  return send({ 
    text: 'AWTRIX ONLINE', 
    color: 'success',
    icon: 'success',
    duration: 5 
  });
}

/**
 * Disable native apps (Time, Temperature, Humidity, Battery)
 * Individual toggles: TIM, TEMP, HUM, BAT
 */
export async function disableNativeApps() {
  try {
    const res = await fetch(`http://${CLOCK_IP}/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ TIM: false, TEMP: false, HUM: false, BAT: false })
    });
    return { success: res.ok };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Disable only the native Time app
 */
export async function disableTimeApp() {
  try {
    const res = await fetch(`http://${CLOCK_IP}/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ TIM: false })
    });
    return { success: res.ok };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Set display brightness (0-255)
 * @param {number} brightness - Brightness level (0-255)
 */
export async function setBrightness(brightness) {
  try {
    const res = await fetch(`http://${CLOCK_IP}/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ BRI: Math.max(0, Math.min(255, brightness)) })
    });
    return { success: res.ok };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Send custom app update (in-place, no blanking)
 * Uses /api/custom?name={name} endpoint
 */
export async function sendApp(name, payload) {
  try {
    const res = await fetch(`http://${CLOCK_IP}/api/custom?name=${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    }

    return { success: true, status: res.status };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Clear a custom app by sending empty payload
 */
export async function clearApp(name) {
  return sendApp(name, {});
}

/**
 * Enable native apps
 */
export async function enableNativeApps() {
  try {
    const res = await fetch(`http://${CLOCK_IP}/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ TIM: true, TEMP: true, HUM: true, BAT: true })
    });
    return { success: res.ok };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
