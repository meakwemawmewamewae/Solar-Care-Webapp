/* =====================================================
   SolarCare – Home Page
   DATA SOURCES
   - Weather: REAL data from the Open-Meteo API (no API key).
   - Solar output / Solar Health / Neighborhood: SIMULATED DEMO DATA.
     (No inverter or hardware is connected. Replace the
     simulate*() functions with a real inverter API later.)
   ===================================================== */

/* ---------- 1. Config ---------- */
const LOCATION = { lat: 14.5861, lon: 121.1760, name: 'Antipolo' }; // change for another city
const SYSTEM_KWP = 1.5;      // demo system size used for the estimate
const SLOW = { sunny: 1, partly: 0.75, cloudy: 0.5, rain: 0.3 }; // expected production factor

/* Navigation map. Set a real URL here when a page is built, e.g. weather: 'weather.html'.
   null = "Coming soon" message. Nothing else needs to change. */
const ROUTES = {
  home: 'index.html', 'solar-health': null, weather: null, planner: null, history: null,
  support: null, neighborhood: null, briefing: null, glance: null, diy: null, profile: null
};

/* ---------- 2. State ---------- */
const state = { weather: null, cond: 'sunny', health: null, energy: 0, alerts: [], chartStart: 8, briefing: '' };
const $ = id => document.getElementById(id);

/* ---------- 3. Helpers ---------- */
function showToast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(showToast.timer); showToast.timer = setTimeout(() => t.classList.remove('show'), 2200);
}
function fmtHour(h) { h = ((h % 24) + 24) % 24; return (h % 12 || 12) + ' ' + (h < 12 ? 'AM' : 'PM'); }
function safeJSON(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }

/* Turn a weather code + cloud/rain values into one of: sunny, partly, cloudy, rain */
function classify(code, cloud, precip) {
  const rainCodes = [51,53,55,56,57,61,63,65,66,67,80,81,82,95,96,99];
  if (rainCodes.includes(code) || precip > 0.2) return 'rain';
  if (cloud >= 70 || [3,45,48].includes(code)) return 'cloudy';
  if (cloud >= 30 || code === 2) return 'partly';
  return 'sunny';
}
const COND = {
  sunny:  { icon: '☀️', name: 'Clear Skies',      effect: 'Full Output' },
  partly: { icon: '⛅', name: 'Partly Cloudy',    effect: 'Slightly Lower Output' },
  cloudy: { icon: '☁️', name: 'Heavy Cloud Cover', effect: 'Lower Output' },
  rain:   { icon: '🌧️', name: 'Rain',             effect: 'Much Lower Output' }
};

/* ---------- 4. Weather (REAL API) ---------- */
async function fetchWeather() {
  setLoading();
  const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + LOCATION.lat + '&longitude=' + LOCATION.lon +
    '&current=temperature_2m,precipitation,weather_code,cloud_cover' +
    '&hourly=weather_code,cloud_cover,shortwave_radiation,precipitation_probability&timezone=auto&forecast_days=1';
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const d = await res.json();
    state.weather = {
      temp: d.current.temperature_2m, code: d.current.weather_code, precip: d.current.precipitation, cloud: d.current.cloud_cover,
      hCode: d.hourly.weather_code, hCloud: d.hourly.cloud_cover, hRad: d.hourly.shortwave_radiation, hProb: d.hourly.precipitation_probability
    };
    state.cond = classify(state.weather.code, state.weather.cloud, state.weather.precip);
    $('dataNote').textContent = 'Weather: live data (Open-Meteo) · Solar data: simulated';
    refreshAll();
  } catch (err) {
    console.warn('Weather failed:', err);
    setFallback();
  }
}
function setLoading() {
  $('wName').textContent = 'Loading…'; $('wEffect').textContent = 'Checking'; $('noteTitle').textContent = 'Checking the weather…';
  $('noteText').textContent = 'Please wait.';
}
/* If the API cannot be reached, use a clearly-labelled demo weather so the page still works */
function setFallback() {
  state.weather = null; state.cond = 'partly';
  $('dataNote').textContent = 'Weather unavailable (offline) – showing demo values. Click here to retry.';
  $('dataNote').style.cursor = 'pointer'; $('dataNote').onclick = fetchWeather;
  refreshAll();
  $('noteTitle').textContent = 'Live weather is unavailable.';
  $('noteText').textContent = 'Check your internet connection. Showing demo values.';
}

/* ---------- 5. Solar estimate & activity ---------- */
/* Hourly radiation (W/m²) from the forecast, or a simple demo curve if offline */
function hourRad(h) {
  if (state.weather) return state.weather.hRad[h] ?? 0;
  return Math.max(0, Math.sin((h - 6) / 12 * Math.PI)) * 800 * SLOW[state.cond];
}
/* Estimated energy for the whole day (kWh) – ESTIMATE, not measured */
function calculateEnergyEstimate() {
  let sum = 0; for (let h = 0; h < 24; h++) sum += hourRad(h);
  return +(sum / 1000 * SYSTEM_KWP * 0.8).toFixed(1);
}
/* Best 4-hour window for heavy appliances, based on forecast radiation */
function calculateSolarActivity() {
  let best = 10, bestSum = -1;
  for (let s = 6; s <= 14; s++) {
    let sum = 0; for (let h = s; h < s + 4; h++) sum += hourRad(h) * (1 - (state.weather ? state.weather.hProb[h] || 0 : 0) / 200);
    if (sum > bestSum) { bestSum = sum; best = s; }
  }
  const level = state.cond === 'sunny' ? 'Favorable solar conditions' : state.cond === 'rain' ? 'Reduced solar generation expected' : 'Moderate solar conditions';
  return { start: best, end: best + 4, level };
}

/* ---------- 6. Solar Health (SIMULATED) ---------- */
/* expected output comes from the weather; "actual" output is simulated.
   Weather alone NEVER makes the system unhealthy – only actual vs expected does. */
function simulateActualFactor() {
  const mode = $('demoState').value;
  if (mode === 'offline') return 0;
  if (mode === 'low') return 0.35;
  return 0.97 + Math.random() * 0.03; // normal: 97–100% of the weather-adjusted expectation
}
function calculateSolarHealth() {
  if (!state.health) state.health = { factor: simulateActualFactor() };
  const mode = $('demoState').value, f = state.health.factor;
  let pct = Math.min(100, Math.round(f * 100)), status, cls = 'ok';
  if (mode === 'offline') { status = 'System Offline'; cls = 'bad'; pct = 0; }
  else if (pct >= 90) status = 'Healthy';
  else if (pct >= 70) { status = 'Check Recommended'; cls = 'warn'; }
  else { status = 'Action Needed'; cls = 'bad'; }
  return { pct, status, cls, weatherOnly: state.cond !== 'sunny' && status === 'Healthy' };
}

/* ---------- 7. UI updates ---------- */
function updateWeatherUI() {
  const c = COND[state.cond], w = state.weather, h = state.health;
  $('wIcon').textContent = c.icon; $('wName').textContent = c.name;
  const wEff = $('wEffect'); wEff.textContent = c.effect; wEff.className = state.cond === 'sunny' ? 'good' : 'bad';
  $('noteIcon').textContent = c.icon;
  const okHw = h.status === 'Healthy';
  $('hwStatus').textContent = okHw ? 'Working Normally' : h.status; $('hwStatus').className = okHw ? 'good' : 'bad';
  if (!okHw) { $('noteTitle').textContent = 'Output is lower than the weather explains.'; $('noteText').textContent = 'Your hardware may need attention.'; }
  else if (state.cond === 'sunny') { $('noteTitle').textContent = 'Sunny conditions today.'; $('noteText').textContent = 'Your hardware is working perfectly.'; }
  else { $('noteTitle').textContent = 'Lower output today is caused by ' + (state.cond === 'rain' ? 'rain.' : 'cloud cover.'); $('noteText').textContent = 'Your hardware is working perfectly.'; }
  if (w) $('noteText').textContent += ' (' + Math.round(w.temp) + '°C in ' + LOCATION.name + ')';
  // Neighborhood: demo values that follow the weather category
  const drop = { sunny: 0, partly: 12, cloudy: 25, rain: 35 }[state.cond];
  $('regionBadge').textContent = c.icon + ' Regional ' + (state.cond === 'rain' ? 'Rain' : state.cond === 'sunny' ? 'Sun' : 'Cloud');
  $('neighHead').textContent = drop ? 'Solar generation is down ' + drop + '% across your neighborhood.' : 'Solar generation is normal across your neighborhood.';
  $('neighSub').innerHTML = (drop ? 'Regional weather is affecting solar homes nearby.' : 'Sunny skies nearby.') + ' <em>(Demo data)</em>';
}
function updateHealthUI() {
  const h = state.health, color = { ok: '#1f9d3a', warn: '#e39b00', bad: '#d93a3a' }[h.cls];
  $('ring').style.setProperty('--p', h.pct); $('ring').style.setProperty('--c', color);
  $('healthPct').textContent = h.pct + '%';
  $('healthLabel').textContent = h.status === 'Healthy' ? 'SYSTEM HEALTHY' : h.status.toUpperCase();
  $('healthIcon').textContent = h.cls === 'ok' ? '✓' : '!';
  $('healthHeadline').textContent = h.status === 'System Offline' ? 'Your system appears to be offline.' : 'Your system is operating at ' + h.pct + '% health.';
  $('healthSub').textContent = h.cls === 'ok'
    ? (h.weatherOnly ? 'Lower output is expected because of the weather, not your panels.' : 'Your solar panels are working normally today.')
    : 'Output is lower than expected for today\'s weather. Run a self-diagnostic.';
  $('phoneStatus').textContent = h.cls === 'ok' ? 'System Healthy' : h.status;
  $('phoneMatch').textContent = h.cls === 'ok' ? 'Weather Output Match ✓' : 'Weather Output Mismatch';
  $('phoneAction').textContent = h.cls === 'ok' ? 'No action needed.' : 'Action needed.';
}
function updateEnergyData() {
  state.energy = calculateEnergyEstimate();
  $('energyEstimate').textContent = 'Estimated generation today: ' + state.energy + ' kWh (demo estimate)';
  const a = calculateSolarActivity();
  $('plWindow').textContent = fmtHour(a.start) + ' – ' + fmtHour(a.end);
  $('plNote').textContent = a.level + '. ' + (state.cond === 'sunny' ? 'Strong solar production is expected during this period.' : 'This is the best window in today\'s forecast.');
  $('plSub').textContent = 'Best time to run heavy equipment.';
  $('phoneDate').textContent = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
/* Alerts are generated from the current state – only relevant ones are shown */
function updateAlerts() {
  const h = state.health, list = [];
  if (h.cls === 'ok') list.push({ t: 'ok', i: '✓', h: 'No action needed today', p: 'Your system is operating normally.', say: 'No action needed today. Your system is operating normally.' });
  else list.push({ t: 'bad', i: '!', h: 'Action Needed', p: 'Production dropped despite ' + (state.cond === 'sunny' ? 'clear skies' : 'the forecast') + '. Run self-diagnostic.', say: 'Action needed. Your solar system is reporting an issue.' });
  if (state.cond === 'rain') list.push({ t: 'info', i: '🌧️', h: 'Rain detected', p: 'Rain is currently detected. Solar generation may be reduced.', say: 'Rain is currently detected in your area. Solar generation may be reduced.' });
  else if (state.cond === 'sunny') list.push({ t: 'info', i: '☀️', h: 'Sunny conditions', p: 'Sunny conditions are favorable for solar generation.', say: 'Sunny conditions are currently detected. Solar generation conditions are favorable.' });
  else list.push({ t: 'warn', i: '☁️', h: 'Cloudy conditions', p: 'Moderate solar generation expected. Lower output is normal.', say: 'Cloudy conditions are detected. Moderate solar generation is expected.' });
  state.alerts = list;
  $('alerts').innerHTML = list.map((a, n) =>
    '<button class="alert ' + a.t + '" data-alert="' + n + '"><span class="ai">' + a.i + '</span><span><b>' + a.h + '</b>' + a.p + '</span></button>').join('');
  document.querySelectorAll('[data-alert]').forEach(b => b.onclick = () => triggerVoiceAlert(state.alerts[b.dataset.alert].say));
}
function updateBriefing() {
  const hist = safeJSON('solarcare_history', {});
  const y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  const yText = hist[y] ? 'Yesterday your panels generated about ' + hist[y].kwh + ' kilowatt hours.' : 'I do not have yesterday\'s record yet.';
  const tText = { sunny: 'Today will be sunny, so expect strong solar energy.', partly: 'Today will be partly cloudy, so expect slightly lower solar energy.',
    cloudy: 'Today will be cloudy, so expect lower solar energy.', rain: 'Rain is expected, so solar energy will be much lower.' }[state.cond];
  const a = calculateSolarActivity();
  state.briefing = 'Good ' + timeOfDay() + ' Edgar! ' + yText + ' ' + tText + ' The best time to use power is ' + fmtHour(a.start) + ' to ' + fmtHour(a.end) + '.';
  $('briefText').textContent = '“' + state.briefing + '”';
}
function timeOfDay() { const h = new Date().getHours(); return h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening'; }

/* Weather vs Solar Activity chart: SVG line over 5 time slots */
function renderChart() {
  const hours = [0, 2, 4, 6, 8].map(n => state.chartStart + n), box = $('chart');
  const icon = h => { if (!state.weather) return COND[state.cond].icon;
    return COND[classify(state.weather.hCode[h], state.weather.hCloud[h], (state.weather.hProb[h] || 0) > 60 ? 1 : 0)].icon; };
  const pts = hours.map((h, i) => [i * 100 + 50, 78 - Math.min(1, hourRad(h) / 900) * 62]);
  let d = 'M0,' + pts[0][1];
  pts.forEach(p => d += ' L' + p[0] + ',' + p[1]); d += ' L500,' + pts[4][1];
  const dots = pts.map(p => '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="4" fill="#fff" stroke="#f5b800" stroke-width="2"/>').join('');
  box.innerHTML = hours.map(h => '<div class="hr">' + fmtHour(h) + '<div>' + icon(h) + '</div></div>').join('') + '<div class="space"></div>' +
    '<svg viewBox="0 0 500 90" preserveAspectRatio="none"><path d="' + d + ' L500,90 L0,90 Z" fill="rgba(245,184,0,.15)"/><path d="' + d + '" fill="none" stroke="#f5b800" stroke-width="2.5" stroke-linejoin="round"/>' + dots + '</svg>';
}

/* Run every update in one place */
function refreshAll() {
  state.health = null; state.health = { factor: simulateActualFactor() };
  state.health = Object.assign(state.health, calculateSolarHealth());
  updateWeatherUI(); updateHealthUI(); updateEnergyData(); updateAlerts(); updateBriefing(); renderChart(); saveHistory();
  $('greeting').textContent = 'Good ' + timeOfDay();
}

/* ---------- 8. History (localStorage demo records) ---------- */
function saveHistory() {
  const hist = safeJSON('solarcare_history', {}), today = new Date().toISOString().slice(0, 10);
  hist[today] = { kwh: state.energy, health: state.health.pct, condition: state.cond, demo: true };
  try { localStorage.setItem('solarcare_history', JSON.stringify(hist)); } catch (e) { /* storage full/blocked */ }
}
function loadHistory() { return safeJSON('solarcare_history', {}); } // used by the future History page

/* ---------- 9. Voice (SpeechSynthesis) ---------- */
function triggerVoiceAlert(text) {
  if (!('speechSynthesis' in window)) return showToast('Voice is not supported in this browser.');
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text || state.alerts.map(a => a.say).join(' '));
  u.lang = 'en-US'; u.rate = 0.95; speechSynthesis.speak(u);
  showToast('🔊 Speaking…');
}

/* ---------- 10. Support (localStorage) ---------- */
function openSupport() { $('supportPhone').value = localStorage.getItem('solarcare_phone') || ''; updateCallLink(); $('modal').hidden = false; $('supportText').focus(); }
function updateCallLink() { const n = $('supportPhone').value.trim(); $('callLink').href = n ? 'tel:' + n.replace(/[^\d+]/g, '') : '#'; }
function submitSupport(e) {
  e.preventDefault();
  const list = safeJSON('solarcare_support', []);
  list.push({ message: $('supportText').value.trim(), date: new Date().toISOString(), status: 'saved locally' });
  localStorage.setItem('solarcare_support', JSON.stringify(list));
  localStorage.setItem('solarcare_phone', $('supportPhone').value.trim());
  $('supportText').value = ''; $('modal').hidden = true; showToast('Request saved in this browser (demo).');
}

/* ---------- 11. Navigation ---------- */
function navigate(page) {
  const dest = ROUTES[page];
  if (page === 'home') return window.scrollTo({ top: 0, behavior: 'smooth' });
  if (dest) window.location.href = dest; else showToast('Coming soon');
}

/* ---------- 12. Event listeners ---------- */
function init() {
  document.querySelectorAll('[data-page]').forEach(el => el.addEventListener('click', () => navigate(el.dataset.page)));
  $('btnVoice').onclick = () => triggerVoiceAlert();
  $('btnPlay').onclick = () => triggerVoiceAlert(state.briefing);
  $('btnBell').onclick = () => { document.querySelector('.dot').style.display = 'none'; $('alerts').scrollIntoView({ behavior: 'smooth', block: 'center' }); showToast(state.alerts[0]?.h || 'No new alerts'); };
  $('btnAccess').onclick = () => { document.body.classList.toggle('big'); showToast(document.body.classList.contains('big') ? 'Larger text on' : 'Larger text off'); };
  $('btnHelp').onclick = openSupport;
  $('closeModal').onclick = () => $('modal').hidden = true;
  $('modal').addEventListener('click', e => { if (e.target === $('modal')) $('modal').hidden = true; });
  $('supportForm').onsubmit = submitSupport; $('supportPhone').oninput = updateCallLink;
  $('callLink').onclick = e => { if ($('callLink').getAttribute('href') === '#') { e.preventDefault(); showToast('Enter a phone number first.'); } };
  $('demoState').onchange = refreshAll;
  $('dayPrev').onclick = () => { state.chartStart = Math.max(6, state.chartStart - 2); renderChart(); };
  $('dayNext').onclick = () => { state.chartStart = Math.min(10, state.chartStart + 2); renderChart(); };
  document.querySelectorAll('.tools button').forEach(b => b.onclick = () => { b.classList.toggle('on'); showToast(b.dataset.tool + ': run it during ' + $('plWindow').textContent); });
  fetchWeather();
  setInterval(fetchWeather, 15 * 60 * 1000); // refresh every 15 minutes
}
document.addEventListener('DOMContentLoaded', init);
