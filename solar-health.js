/* =====================================================
   SolarCare – Solar Health Page
   DATA SOURCES
   - Weather: REAL data from the Open-Meteo API (no API key).
   - Solar output, efficiency, panel temperature, energy generated,
     health score and system status: SIMULATED DEMO DATA.
     No inverter or hardware is connected. Replace the
     simulate*() functions with a real inverter API later.
   ===================================================== */

const LOCATION = { lat: 14.5861, lon: 121.1760, name: 'Antipolo' };
const SYSTEM_KWP = 1.5;
const SLOW = { sunny: 1, partly: 0.75, cloudy: 0.5, rain: 0.3 };

/* Same routing idea as the Home Page: null = page not built yet -> "Coming soon".
   Solar Health is this page, so it never shows Coming Soon. */
const ROUTES = { home: 'index.html', 'solar-health': 'solar-health.html', weather: null, planner: null, history: null, support: null, profile: null };

const state = { weather: null, cond: 'sunny', health: null, chartTab: 'energy', goals: null };
const $ = id => document.getElementById(id);

/* ---------- helpers ---------- */
function showToast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(showToast.timer); showToast.timer = setTimeout(() => t.classList.remove('show'), 2200);
}
function safeJSON(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function classify(code, cloud, precip) {
  const rainCodes = [51,53,55,56,57,61,63,65,66,67,80,81,82,95,96,99];
  if (rainCodes.includes(code) || precip > 0.2) return 'rain';
  if (cloud >= 70 || [3,45,48].includes(code)) return 'cloudy';
  if (cloud >= 30 || code === 2) return 'partly';
  return 'sunny';
}
const COND = {
  sunny:  { icon: '☀️', text: 'Sunny',   note: 'Favorable solar conditions.' },
  partly: { icon: '⛅', text: 'Partly Cloudy', note: 'Cloud cover may slightly reduce solar generation.' },
  cloudy: { icon: '☁️', text: 'Cloudy',  note: 'Cloud cover may reduce solar generation.' },
  rain:   { icon: '🌧️', text: 'Rain',    note: 'Rain is currently detected. Reduced solar generation is expected.' }
};

/* ---------- weather (REAL) ---------- */
async function fetchWeather() {
  $('statusWeather').textContent = 'Updating solar conditions…';
  const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + LOCATION.lat + '&longitude=' + LOCATION.lon +
    '&current=temperature_2m,precipitation,weather_code,cloud_cover&timezone=auto&forecast_days=1';
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const d = await res.json();
    state.weather = { temp: d.current.temperature_2m, code: d.current.weather_code, precip: d.current.precipitation, cloud: d.current.cloud_cover };
    state.cond = classify(state.weather.code, state.weather.cloud, state.weather.precip);
    refreshAll();
  } catch (err) {
    console.warn('Weather failed:', err);
    state.weather = null; state.cond = 'partly';
    $('statusWeather').textContent = 'Weather data temporarily unavailable.';
    refreshAll(true);
  }
}

/* ---------- simulated solar data ---------- */
function simulateActualFactor() {
  const mode = $('demoState').value;
  if (mode === 'offline') return 0;
  if (mode === 'low') return 0.35;
  return 0.95 + Math.random() * 0.05;
}
function computeMetrics() {
  const mode = $('demoState').value, factor = simulateActualFactor();
  const expected = +(4.0 * SLOW[state.cond]).toFixed(1);     // expected kW for current weather
  const output = mode === 'offline' ? 0 : +(expected * factor).toFixed(1);
  const efficiency = mode === 'offline' ? 0 : Math.round(90 + factor * 8);
  const temp = mode === 'offline' ? 24 : Math.round(28 + (state.cond === 'sunny' ? 10 : state.cond === 'rain' ? 2 : 6));
  const energy = mode === 'offline' ? 0 : +((output / expected || 0) * 12.6 * SLOW[state.cond] + 4).toFixed(1);
  return { expected, output, efficiency, temp, energy, factor, mode };
}
/* Health score & status: weather alone never lowers this. Only actual-vs-expected output does. */
function calculateSolarHealth(m) {
  let pct;
  if (m.mode === 'offline') pct = 0;
  else pct = Math.min(100, Math.round(m.factor * 100));
  let label, status, cls;
  if (m.mode === 'offline') { label = 'Offline'; status = 'OFFLINE'; cls = 'bad'; }
  else if (pct >= 90) { label = 'Healthy'; status = 'NORMAL'; cls = 'ok'; }
  else if (pct >= 70) { label = 'Good / Monitor'; status = 'CHECK REQUIRED'; cls = 'warn'; }
  else if (pct >= 40) { label = 'Check Recommended'; status = 'CHECK REQUIRED'; cls = 'warn'; }
  else { label = 'Action Needed'; status = 'ACTION NEEDED'; cls = 'bad'; }
  return { pct, label, status, cls };
}

/* ---------- UI ---------- */
function updateSummary(m, h) {
  const color = { ok: '#1f9d3a', warn: '#e39b00', bad: '#d93a3a' }[h.cls];
  $('ring').style.setProperty('--p', h.pct); $('ring').style.setProperty('--c', color);
  $('ringIcon').textContent = h.cls === 'bad' ? '⚠️' : COND[state.cond].icon;
  $('scorePct').textContent = h.pct; $('scoreLabel').textContent = h.label;
  $('scoreIcon').textContent = h.cls === 'ok' ? '✓' : '!';
  $('mOutputVal').textContent = m.output + ' kW / ' + m.expected + ' kW expected';
  $('mOutputBar').style.width = Math.min(100, m.expected ? (m.output / m.expected * 100) : 0) + '%';
  $('mEffVal').textContent = m.efficiency + '%'; $('mEffBar').style.width = m.efficiency + '%';
  $('mTempVal').textContent = m.temp + '°C'; $('mTempBar').style.width = Math.min(100, m.temp / 60 * 100) + '%';
  $('mEnergyVal').textContent = m.energy + ' kWh'; $('mEnergyBar').style.width = Math.min(100, m.energy / 16 * 100) + '%';
  const weatherOnly = h.cls === 'ok' && state.cond !== 'sunny';
  $('summaryMsg').textContent = h.cls === 'bad' && m.mode !== 'offline'
    ? 'Action needed. Solar output is lower than expected for today\'s weather.'
    : h.cls === 'bad' ? 'Your system appears to be offline.'
    : h.cls === 'warn' ? 'Output is a little below expectation — worth keeping an eye on.'
    : weatherOnly ? 'Reduced generation is expected because of current weather. Your system itself is healthy.'
    : 'Your solar system is operating normally.';
  $('statusVal').textContent = h.status;
  $('statusVal').style.color = color;
  $('statusWeather').textContent = state.weather ? COND[state.cond].text + ', ' + Math.round(state.weather.temp) + '°C in ' + LOCATION.name : COND[state.cond].text + ' (demo)';
  $('todayDate').textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

/* ---------- weekly chart (demo, weather-adjusted) ---------- */
const WEEK = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
function weekData(tab) {
  const base = { energy: [10,11,13.5,14,12,9,9.5], output: [3.2,3.5,3.9,4.0,3.6,2.8,3.0], efficiency: [88,90,94,95,92,85,87] }[tab];
  const f = SLOW[state.cond];
  return base.map((v, i) => i === new Date().getDay() - 1 || (new Date().getDay() === 0 && i === 6) ? +(v * f).toFixed(1) : v);
}
function renderChart() {
  const data = weekData(state.chartTab), max = Math.max(...data) * 1.15;
  $('weekChart').innerHTML = data.map((v, i) =>
    '<div class="sh-bar-col"><div class="stem" style="height:' + Math.max(4, v / max * 100) + '%"></div><span>' + WEEK[i] + '</span></div>').join('');
}
function switchTab(tab) {
  state.chartTab = tab;
  document.querySelectorAll('.sh-tabs button').forEach(b => { const on = b.dataset.tab === tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
  renderChart();
}

/* ---------- goals ---------- */
const DEFAULT_GOALS = { eff: 95, gen: 15, avail: 99, cons: 90 };
function loadGoals() { state.goals = safeJSON('solarhealth_goals', DEFAULT_GOALS); }
function renderGoals(m) {
  const g = state.goals;
  const rows = [
    { icon: '⚙️', bg: '#e3f3e6', title: 'System Efficiency', cur: m.efficiency, unit: '%', target: g.eff },
    { icon: '🔋', bg: '#e6effd', title: 'Expected Daily Generation', cur: m.energy, unit: ' kWh', target: g.gen },
    { icon: '📶', bg: '#fff4d6', title: 'System Availability', cur: m.mode === 'offline' ? 0 : 99, unit: '%', target: g.avail },
    { icon: '📊', bg: '#f3e9fb', title: 'Output Consistency', cur: Math.round(m.factor * 100), unit: '%', target: g.cons }
  ];
  $('goalsList').innerHTML = rows.map(r => {
    const pct = Math.min(100, Math.round(r.cur / r.target * 100));
    return '<div class="sh-goal-row"><span class="sh-goal-ic" style="background:' + r.bg + '">' + r.icon + '</span>' +
      '<div class="sh-goal-info"><div class="sh-goal-line"><b>' + r.title + '</b><span>' + r.cur + r.unit + ' / ' + r.target + r.unit + '</span></div>' +
      '<div class="sh-bar"><div class="sh-bar-fill" style="width:' + pct + '%;background:#1565d8"></div></div></div>' +
      '<span class="sh-goal-pct">' + pct + '%</span></div>';
  }).join('');
}
function openGoalsModal() {
  const g = state.goals;
  $('goalEff').value = g.eff; $('goalGen').value = g.gen; $('goalAvail').value = g.avail; $('goalCons').value = g.cons;
  $('goalsModal').hidden = false;
}
function saveGoals(e) {
  e.preventDefault();
  state.goals = { eff: +$('goalEff').value, gen: +$('goalGen').value, avail: +$('goalAvail').value, cons: +$('goalCons').value };
  localStorage.setItem('solarhealth_goals', JSON.stringify(state.goals));
  $('goalsModal').hidden = true; renderGoals(state.health.m); showToast('Goals saved.');
}

/* ---------- insights ---------- */
function buildInsights(m, h) {
  const list = [];
  if (h.cls === 'bad' && m.mode !== 'offline') list.push({ ic: '⚠️', bg: '#fdeaea', t: 'Action Needed', p: 'Solar output is lower than expected. Check the solar system status.' });
  else if (h.cls === 'bad') list.push({ ic: '🔌', bg: '#fdeaea', t: 'System offline', p: 'Simulated system is offline. Check power and connections.' });
  else if (h.cls === 'warn') list.push({ ic: '🔍', bg: '#fff4d6', t: 'Check Recommended', p: 'Output is a little below expectation for today\'s weather.' });
  else list.push({ ic: '✅', bg: '#e3f3e6', t: 'Your system is operating efficiently.', p: 'Output is within the expected range for today.' });
  if (state.cond === 'rain') list.push({ ic: '🌧️', bg: '#e6effd', t: 'Solar generation may decrease today', p: 'Rain has been detected, reducing expected generation. No fault was found.' });
  else if (state.cond === 'cloudy' || state.cond === 'partly') list.push({ ic: '☁️', bg: '#e6effd', t: 'Cloud cover today', p: 'Expect moderate generation because of cloud cover.' });
  else list.push({ ic: '☀️', bg: '#fff4d6', t: 'Sunny conditions today', p: 'Conditions are favorable for solar generation.' });
  list.push({ ic: '📊', bg: '#f3e9fb', t: 'Output is within the expected range.', p: 'Actual output compared to weather-adjusted expectation looks normal.' });
  list.push({ ic: '🧹', bg: '#e3f3e6', t: 'Panel cleaning reminder', p: 'Dust build-up can quietly lower output — a quick check helps.' });
  return list;
}
function renderInsights(list) {
  $('insightsList').innerHTML = list.slice(0, 3).map((it, i) =>
    '<button class="sh-insight" data-insight="' + i + '"><span class="sh-i-ic" style="background:' + it.bg + '">' + it.ic + '</span>' +
    '<span><b>' + it.t + '</b><p>' + it.p + '</p></span><span class="chev">›</span></button>').join('');
  document.querySelectorAll('[data-insight]').forEach(b => b.onclick = () => triggerVoiceAlert(list[b.dataset.insight].t + '. ' + list[b.dataset.insight].p));
  $('insightsAll').innerHTML = list.map(it => '<div class="row-item"><b>' + it.ic + ' ' + it.t + '</b>' + it.p + '</div>').join('');
}

/* ---------- tips (static content, always shown) ---------- */
const TIPS = [
  { ic: '🧹', t: 'Clean panels regularly', p: 'Keep panels clear of dust and debris to maintain efficient energy production.' },
  { ic: '🔍', t: 'Check system status', p: 'Review your Solar Health status for unusual performance changes.' },
  { ic: '⛅', t: 'Monitor weather', p: 'Weather conditions can affect expected solar generation.' },
  { ic: '⏱️', t: 'Review energy usage', p: 'Use your generated energy during favorable solar periods.' },
  { ic: '🔧', t: 'Schedule a technician visit', p: 'An annual check-up helps catch issues before they affect output.' },
  { ic: '🌳', t: 'Watch for shading', p: 'Growing trees or new structures can gradually shade your panels.' }
];
function renderTips() {
  $('tipsList').innerHTML = TIPS.slice(0, 4).map(t => '<div class="sh-tip"><span class="sh-t-ic">' + t.ic + '</span><span><b>' + t.t + '</b><p>' + t.p + '</p></span></div>').join('');
  $('tipsAll').innerHTML = TIPS.map(t => '<div class="row-item"><b>' + t.ic + ' ' + t.t + '</b>' + t.p + '</div>').join('');
}

/* ---------- notifications ---------- */
function buildNotifications(m, h) {
  const list = [{ ic: COND[state.cond].icon, t: COND[state.cond].note }];
  list.push({ ic: h.cls === 'ok' ? '✅' : h.cls === 'warn' ? '🔍' : '⚠️', t: h.cls === 'ok' ? 'Solar output is currently within the expected range.' : h.cls === 'warn' ? 'Check Recommended: output is a little below expectation.' : 'Action Needed: simulated system output is lower than expected.' });
  return list;
}
function renderNotifications(list) {
  $('notifList').innerHTML = list.map(n => '<div class="sh-notif-item"><span>' + n.ic + '</span><span>' + n.t + '</span></div>').join('');
  $('bellDot').style.display = list.some((n, i) => i === 1 && n.t.startsWith('Action')) ? 'block' : (list.length ? 'block' : 'none');
}

/* ---------- voice ---------- */
function triggerVoiceAlert(text) {
  if (!('speechSynthesis' in window)) return showToast('Voice is not supported in this browser.');
  const h = state.health.h;
  const fallback = h.cls === 'bad' ? 'Action needed. Solar output is lower than expected.'
    : state.cond === 'rain' ? 'Rain is currently detected. Solar generation may be reduced, but no system fault has been detected.'
    : 'Your solar system is currently healthy and operating normally.';
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text || fallback);
  u.lang = 'en-US'; u.rate = 0.95; speechSynthesis.speak(u);
  showToast('🔊 Speaking…');
}

/* ---------- system check modal ---------- */
function openSystemCheck() {
  const { m, h } = state.health;
  const rows = [
    ['Current Health Score', h.pct + ' / 100 — ' + h.label],
    ['Current Output', m.output + ' kW'],
    ['Expected Output', m.expected + ' kW'],
    ['Weather', COND[state.cond].text + (state.weather ? ', ' + Math.round(state.weather.temp) + '°C' : ' (demo)')],
    ['System Status', h.status],
    ['Recommended Action', h.cls === 'bad' ? 'Check the solar system status and contact your installer if this continues.' : h.cls === 'warn' ? 'Keep an eye on output over the next day.' : 'No action needed.']
  ];
  $('checkBody').innerHTML = rows.map(r => '<div class="sh-check-line"><span>' + r[0] + '</span><b>' + r[1] + '</b></div>').join('');
  $('checkModal').hidden = false;
}

/* ---------- refresh everything ---------- */
function refreshAll() {
  const m = computeMetrics(), h = calculateSolarHealth(m);
  state.health = { m, h };
  updateSummary(m, h);
  renderChart();
  renderGoals(m);
  const insights = buildInsights(m, h); renderInsights(insights);
  renderNotifications(buildNotifications(m, h));
  saveHistory(m, h);
}
function saveHistory(m, h) {
  const hist = safeJSON('solarhealth_history', {}), today = new Date().toISOString().slice(0, 10);
  hist[today] = { score: h.pct, output: m.output, efficiency: m.efficiency, energy: m.energy, condition: state.cond, demo: true };
  try { localStorage.setItem('solarhealth_history', JSON.stringify(hist)); } catch (e) {}
}

/* ---------- navigation (matches Home Page pattern) ---------- */
function navigate(page) {
  if (page === 'solar-health') return; // already here
  const dest = ROUTES[page];
  if (dest) window.location.href = dest; else showToast('Coming soon');
}

/* ---------- init ---------- */
function init() {
  loadGoals();
  document.querySelectorAll('[data-page]').forEach(el => el.addEventListener('click', () => navigate(el.dataset.page)));
  document.querySelectorAll('.sh-tabs button').forEach(b => b.onclick = () => switchTab(b.dataset.tab));

  $('btnBell').onclick = () => { const p = $('notifPanel'); p.hidden = !p.hidden; $('btnBell').setAttribute('aria-expanded', !p.hidden); $('bellDot').style.display = 'none'; };
  document.addEventListener('click', e => { if (!e.target.closest('.sh-notif-wrap')) $('notifPanel').hidden = true; });
  $('btnAccess').onclick = () => { document.body.classList.toggle('big'); showToast(document.body.classList.contains('big') ? 'Larger text on' : 'Larger text off'); };
  $('btnVoice').onclick = () => triggerVoiceAlert();

  $('btnManageGoals').onclick = openGoalsModal;
  $('closeGoals').onclick = () => $('goalsModal').hidden = true;
  $('goalsForm').onsubmit = saveGoals;

  $('btnViewAll').onclick = () => $('insightsModal').hidden = false;
  $('closeInsights').onclick = () => $('insightsModal').hidden = true;
  $('btnSeeMore').onclick = () => $('tipsModal').hidden = false;
  $('closeTips').onclick = () => $('tipsModal').hidden = true;
  $('btnSystemCheck').onclick = openSystemCheck;
  $('closeCheck').onclick = () => $('checkModal').hidden = true;
  document.querySelectorAll('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m) m.hidden = true; }));

  $('demoState').onchange = refreshAll;

  renderTips();
  fetchWeather();
  setInterval(fetchWeather, 15 * 60 * 1000);
}
document.addEventListener('DOMContentLoaded', init);
