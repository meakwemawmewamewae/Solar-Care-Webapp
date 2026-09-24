/* =====================================================
   SolarCare – Weather Page
   DATA SOURCES
   - Current / hourly / daily weather, sunrise/sunset, UV: REAL data
     from the Open-Meteo API (no API key). Location search uses
     Open-Meteo's free geocoding API.
   - Solar Panel Output Forecast: ESTIMATED / DEMO data derived from
     the real weather (no inverter is connected).
   - Weather Map: illustrative demo art, not a live radar feed.
   ===================================================== */

let LOCATION = { lat: 14.6507, lon: 121.1029, name: 'Marikina City, Philippines' };
const ROUTES = { home: 'index.html', 'solar-health': 'solar-health.html', weather: 'weather.html', planner: null, history: null, support: null, profile: null };

const state = { current: null, hourly: null, daily: null, mapView: 'radar' };
const $ = id => document.getElementById(id);

/* ---------- helpers ---------- */
function showToast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(showToast.timer); showToast.timer = setTimeout(() => t.classList.remove('show'), 2200);
}
function timeOfDay() { const h = new Date().getHours(); return h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening'; }
function fmtHour(iso) { const h = new Date(iso).getHours(); return (h % 12 || 12) + (h < 12 ? ' AM' : ' PM'); }
function fmtDay(iso, i) { return i === 0 ? 'Today' : new Date(iso).toLocaleDateString('en-US', { weekday: 'short' }); }
function fmtDate(iso) { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }

/* Weather-code → Font Awesome icon + label (no emoji, per project requirement) */
function iconFor(code) {
  if ([0, 1].includes(code)) return { icon: 'fa-solid fa-sun', text: 'Clear' };
  if (code === 2) return { icon: 'fa-solid fa-cloud-sun', text: 'Partly Cloudy' };
  if (code === 3) return { icon: 'fa-solid fa-cloud', text: 'Overcast' };
  if ([45, 48].includes(code)) return { icon: 'fa-solid fa-smog', text: 'Fog' };
  if ([51, 53, 55, 56, 57].includes(code)) return { icon: 'fa-solid fa-cloud-rain', text: 'Drizzle' };
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { icon: 'fa-solid fa-cloud-showers-heavy', text: 'Rain' };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { icon: 'fa-solid fa-snowflake', text: 'Snow' };
  if ([95, 96, 99].includes(code)) return { icon: 'fa-solid fa-bolt', text: 'Thunderstorm' };
  return { icon: 'fa-solid fa-cloud', text: 'Cloudy' };
}
function windDir(deg) { const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']; return dirs[Math.round(deg / 45) % 8]; }
/* Weather-based expected-solar factor, reused across the solar estimate, alerts and voice summary */
function solarFactor(code, cloud) {
  if ([0, 1].includes(code)) return 1;
  if (code === 2 || cloud < 60) return 0.7;
  if ([3, 45, 48].includes(code) || cloud < 85) return 0.45;
  return 0.25;
}

/* ---------- geocoding (real) ---------- */
async function searchLocation(q) {
  const res = await fetch('https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(q) + '&count=6&language=en');
  const d = await res.json();
  return d.results || [];
}
async function detectLocation() {
  if (!('geolocation' in navigator)) return fetchWeather();
  navigator.geolocation.getCurrentPosition(
    pos => { LOCATION = { lat: pos.coords.latitude, lon: pos.coords.longitude, name: 'Your Location' }; fetchWeather(); },
    () => { $('locName').textContent = LOCATION.name; fetchWeather(); },
    { timeout: 4000 }
  );
}

/* ---------- weather (real) ---------- */
async function fetchWeather() {
  setLoading(true);
  const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + LOCATION.lat + '&longitude=' + LOCATION.lon +
    '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,precipitation' +
    '&hourly=temperature_2m,weather_code,precipitation_probability,uv_index,cloud_cover' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max,sunrise,sunset' +
    '&timezone=auto&forecast_days=6';
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const d = await res.json();
    state.current = d.current; state.hourly = d.hourly; state.daily = d.daily;
    $('locName').textContent = LOCATION.name;
    renderAll();
    setLoading(false);
  } catch (err) {
    console.warn('Weather failed:', err);
    setLoading(false, true);
  }
}
function setLoading(loading, error) {
  $('curLoading').hidden = !loading; $('curError').hidden = !error; $('curBody').hidden = loading || error;
  $('btnRefresh').classList.toggle('spin', loading);
  if (error) { $('hourlyList').innerHTML = '<div class="w-state w-error">Weather data temporarily unavailable.</div>'; $('dailyList').innerHTML = ''; }
}

/* ---------- render: current ---------- */
function renderCurrent() {
  const c = state.current, ic = iconFor(c.weather_code);
  $('curIcon').className = 'w-cur-icon ' + ic.icon;
  $('curTemp').textContent = Math.round(c.temperature_2m) + '°C';
  $('curCond').textContent = ic.text;
  $('curFeels').textContent = Math.round(c.apparent_temperature) + '°C';
  $('curHumidity').textContent = Math.round(c.relative_humidity_2m) + '%';
  $('curWind').textContent = Math.round(c.wind_speed_10m) + ' km/h ' + windDir(c.wind_direction_10m);
  const uvNow = currentHourValue('uv_index') ?? 0;
  $('curUv').textContent = uvNow.toFixed(0) + ' (' + uvLabel(uvNow) + ')';
  $('greeting').textContent = 'Good ' + timeOfDay() + ', Team Balingbeng!';

}
function currentHourValue(field) {
  const h = state.hourly, nowIso = new Date().toISOString().slice(0, 13);
  const idx = h.time.findIndex(t => t.slice(0, 13) === nowIso);
  return idx >= 0 ? h[field][idx] : h[field][0];
}
function uvLabel(v) { return v >= 8 ? 'Very High' : v >= 6 ? 'High' : v >= 3 ? 'Moderate' : 'Low'; }

/* ---------- render: hourly / daily ---------- */
function renderHourly() {
  const h = state.hourly, nowIdx = h.time.findIndex(t => new Date(t) >= new Date());
  const idxs = [0, 1, 2, 3, 4].map(i => Math.max(0, nowIdx) + i * 3).filter(i => i < h.time.length);
  $('hourlyList').innerHTML = idxs.map(i => {
    const ic = iconFor(h.weather_code[i]);
    return '<div class="w-hour"><span>' + fmtHour(h.time[i]) + '</span><i class="' + ic.icon + '"></i><b>' + Math.round(h.temperature_2m[i]) + '°C</b>' +
      '<span class="rain"><i class="fa-solid fa-droplet"></i>' + (h.precipitation_probability[i] ?? 0) + '%</span></div>';
  }).join('');
}
function renderDaily() {
  const d = state.daily;
  $('dailyList').innerHTML = d.time.slice(0, 5).map((t, i) => {
    const ic = iconFor(d.weather_code[i]);
    return '<div class="w-day"><b>' + fmtDay(t, i) + '</b><span>' + fmtDate(t) + '</span><i class="' + ic.icon + '"></i>' +
      '<span class="temps"><span class="max">' + Math.round(d.temperature_2m_max[i]) + '°</span> / <span class="min">' + Math.round(d.temperature_2m_min[i]) + '°</span></span>' +
      '<span class="rain"><i class="fa-solid fa-droplet"></i>' + (d.precipitation_probability_max[i] ?? 0) + '%</span></div>';
  }).join('');
}

/* ---------- render: solar output estimate (demo) ---------- */
const PERIODS = [{ k: 'Morning', r: '8 AM – 11 AM', h: [8, 11] }, { k: 'Midday', r: '11 AM – 2 PM', h: [11, 14] }, { k: 'Afternoon', r: '2 PM – 5 PM', h: [14, 17] }, { k: 'Evening', r: '5 PM – 8 PM', h: [17, 20] }];
function periodFactor(p) {
  const h = state.hourly; let sum = 0, n = 0;
  for (let i = 0; i < h.time.length; i++) { const hr = new Date(h.time[i]).getHours(); if (hr >= p.h[0] && hr < p.h[1] && new Date(h.time[i]).getDate() === new Date().getDate()) { sum += solarFactor(h.weather_code[i], h.cloud_cover[i]); n++; } }
  return n ? sum / n : solarFactor(state.current.weather_code, currentHourValue('cloud_cover') ?? 50);
}
function levelFor(f) { const lo = Math.round(f * 100 * 0.9), hi = Math.round(f * 100 * 1.1); return { label: f >= 0.85 ? 'Very High' : f >= 0.6 ? 'High' : f >= 0.35 ? 'Moderate' : 'Low', range: lo + '–' + hi + '%' }; }
function renderSolar() {
  const factors = PERIODS.map(periodFactor);
  $('solarGrid').innerHTML = PERIODS.map((p, i) => {
    const lv = levelFor(factors[i]), ic = factors[i] >= 0.6 ? 'fa-solid fa-sun' : factors[i] >= 0.35 ? 'fa-solid fa-cloud-sun' : 'fa-solid fa-cloud';
    return '<div class="w-solar-cell"><i class="' + ic + '"></i><b>' + p.k + '</b><span class="span">(' + p.r + ')</span><div class="lvl">' + lv.label + '</div><div class="pct">' + lv.range + '</div></div>';
  }).join('');
  const best = PERIODS[factors.indexOf(Math.max(...factors))];
  $('solarNote').querySelector('p').textContent = 'Your panels are expected to perform well today, especially from ' + best.r + '. ' +
    (Math.min(...factors) < 0.5 ? 'Some cloud cover or rain elsewhere in the day may reduce output.' : 'Conditions look steady through the day.');
}

/* ---------- render: alerts ---------- */
function renderAlerts() {
  const d = state.daily, list = [];
  if (d.precipitation_probability_max[0] >= 60) list.push({ cls: 'bad', icon: 'fa-solid fa-cloud-showers-heavy', t: 'Heavy rain expected', p: 'Rain probability is ' + d.precipitation_probability_max[0] + '% today.' });
  if (d.uv_index_max[0] >= 8) list.push({ cls: 'warn', icon: 'fa-solid fa-sun', t: 'High UV', p: 'UV index reaches ' + Math.round(d.uv_index_max[0]) + ' — use sun protection outdoors.' });
  if (state.current.wind_speed_10m >= 30) list.push({ cls: 'warn', icon: 'fa-solid fa-wind', t: 'Strong wind', p: Math.round(state.current.wind_speed_10m) + ' km/h winds currently.' });
  if ([95, 96, 99].includes(state.current.weather_code)) list.push({ cls: 'bad', icon: 'fa-solid fa-bolt', t: 'Thunderstorm possibility', p: 'Thunderstorm activity detected nearby.' });
  const box = $('alertsBody');
  if (!list.length) box.innerHTML = '<div class="ok-box"><i class="fa-solid fa-circle-check"></i><b>No severe weather alerts</b><p>in your area. You\'re good to go!</p></div>';
  else box.innerHTML = list.map(a => '<div class="w-alert-item ' + a.cls + '"><i class="' + a.icon + '"></i><span><b>' + a.t + '</b>' + a.p + '</span></div>').join('');
  const rainDay = d.time.findIndex((t, i) => i > 0 && d.precipitation_probability_max[i] >= 50);
  if (rainDay > 0) { $('rainCard').hidden = false; $('rainText').textContent = 'Light to moderate rain is expected on ' + new Date(d.time[rainDay]).toLocaleDateString('en-US', { weekday: 'long' }) + ' (' + d.precipitation_probability_max[rainDay] + '%).'; }
  else $('rainCard').hidden = true;
}

/* ---------- insight / voice text ---------- */
function buildSummary() {
  const c = state.current, ic = iconFor(c.weather_code), f = solarFactor(c.weather_code, currentHourValue('cloud_cover') ?? 50);
  const solarLine = f >= 0.85 ? 'Excellent conditions for solar generation.' : f >= 0.6 ? 'Solar generation may vary as clouds pass.' :
    ic.text === 'Rain' || ic.text === 'Drizzle' ? 'Solar generation may decrease because sunlight is reduced. This does not necessarily mean your system has a hardware problem.' :
    'Solar production may be reduced today, mainly due to cloud cover.';
  return 'Good ' + timeOfDay() + '. It is currently ' + Math.round(c.temperature_2m) + ' degrees Celsius with ' + ic.text.toLowerCase() +
    ' conditions. Rain probability is ' + (state.hourly.precipitation_probability[0] ?? 0) + ' percent. ' + solarLine;
}

/* ---------- map tabs (illustrative demo) ---------- */
const MAP_STYLES = { radar: 'linear-gradient(120deg,#dce9f5,#c9e3d8 45%,#e7d9f5)', rain: 'linear-gradient(120deg,#bfe6ff,#7fd0f2 45%,#4a9fe0)', sat: 'linear-gradient(120deg,#cfe3c8,#a9d1a0 45%,#7fb87a)' };
function setMap(tab) {
  state.mapView = tab;
  document.querySelectorAll('.w-tabs button').forEach(b => b.classList.toggle('on', b.dataset.map === tab));
  $('mapBox').style.background = MAP_STYLES[tab];
}

/* ---------- voice ---------- */
function triggerVoiceAlert() {
  if (!state.current) return showToast('Weather is still loading.');
  if (!('speechSynthesis' in window)) return showToast('Voice is not supported in this browser.');
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(buildSummary()); u.lang = 'en-US'; u.rate = 0.95; speechSynthesis.speak(u);
  showToast('🔊 Speaking…');
}

/* ---------- location modal ---------- */
let searchTimer;
function openLocModal() { $('locInput').value = ''; $('locResults').innerHTML = ''; $('locModal').hidden = false; $('locInput').focus(); }
function onLocInput() {
  clearTimeout(searchTimer);
  const q = $('locInput').value.trim();
  if (q.length < 2) { $('locResults').innerHTML = ''; return; }
  searchTimer = setTimeout(async () => {
    $('locResults').innerHTML = '<div class="w-state">Searching…</div>';
    try {
      const results = await searchLocation(q);
      $('locResults').innerHTML = results.length ? results.map(r =>
        '<button class="res" data-lat="' + r.latitude + '" data-lon="' + r.longitude + '" data-name="' + (r.name + (r.admin1 ? ', ' + r.admin1 : '') + ', ' + r.country).replace(/"/g, '') + '">' +
        r.name + (r.admin1 ? ', ' + r.admin1 : '') + ', ' + r.country + '</button>').join('')
        : '<div class="w-state">No matching locations found.</div>';
      document.querySelectorAll('.res').forEach(b => b.onclick = () => {
        LOCATION = { lat: +b.dataset.lat, lon: +b.dataset.lon, name: b.dataset.name };
        $('locModal').hidden = true; fetchWeather(); showToast('Location updated.');
      });
    } catch { $('locResults').innerHTML = '<div class="w-state w-error">Search unavailable.</div>'; }
  }, 350);
}

/* ---------- learn more modal ---------- */
function openLearn() {
  $('learnBody').innerHTML = [
    ['Sunny', 'Excellent conditions for solar generation.'],
    ['Partly Cloudy', 'Solar generation may vary as clouds pass.'],
    ['Cloudy', 'Cloud cover may reduce solar output.'],
    ['Rain', 'Solar generation may decrease because sunlight is reduced. This does not necessarily mean your system has a hardware problem.'],
    ['Thunderstorm', 'Solar production may be reduced during heavy cloud cover.']
  ].map(r => '<div class="row-item"><b>' + r[0] + '</b>' + r[1] + '</div>').join('');
  $('learnModal').hidden = false;
}

/* ---------- navigation (same pattern as other SolarCare pages) ---------- */
function navigate(page) {
  if (page === 'weather') return;
  const dest = ROUTES[page];
  if (dest) window.location.href = dest; else showToast('Coming soon');
}

/* ---------- refresh everything ---------- */
function renderAll() { renderCurrent(); renderHourly(); renderDaily(); renderSolar(); renderAlerts(); }

/* ---------- init ---------- */
function init() {
  document.querySelectorAll('[data-page]').forEach(el => el.addEventListener('click', () => navigate(el.dataset.page)));
  $('btnRefresh').onclick = fetchWeather;
  $('btnRetry').onclick = fetchWeather;
  $('btnVoice').onclick = triggerVoiceAlert;
  $('btnBell').onclick = () => showToast('No new notifications.');
  $('btnAccess').onclick = () => { document.body.classList.toggle('big'); showToast(document.body.classList.contains('big') ? 'Larger text on' : 'Larger text off'); };
  $('btnChangeLoc').onclick = openLocModal;
  $('closeLoc').onclick = () => $('locModal').hidden = true;
  $('locInput').oninput = onLocInput;
  $('btnLearnMore').onclick = openLearn;
  $('closeLearn').onclick = () => $('learnModal').hidden = true;
  document.querySelectorAll('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m) m.hidden = true; }));
  document.querySelectorAll('.w-tabs button').forEach(b => b.onclick = () => setMap(b.dataset.map));
  setMap('radar');
  detectLocation();
  setInterval(fetchWeather, 15 * 60 * 1000);
}
document.addEventListener('DOMContentLoaded', init);
