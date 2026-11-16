const $ = (id) => document.getElementById(id);
const TRAIL_BOUNDS = [[33.8, -85.8], [46.2, -67.1]];
const REGION_LAYERS = [2, 3, 4, 5];
const REGION_URL = 'https://services7.arcgis.com/zT81dv4wL0hECyTd/ArcGIS/rest/services/AT_WGS84_AGOL_WFL1/FeatureServer';

const FALLBACK_ROUTE = [
  [34.627, -84.194], [34.735, -83.918], [35.053, -83.478],
  [35.332, -83.592], [35.452, -83.805], [35.563, -83.499],
  [35.796, -82.957], [35.892, -82.830], [36.106, -82.448],
  [36.299, -82.127], [36.634, -81.787], [36.870, -81.358],
  [37.333, -80.735], [37.390, -80.090], [38.100, -79.250],
  [38.550, -78.400], [39.325, -77.738], [39.482, -77.619],
  [40.090, -77.200], [40.982, -75.142], [41.235, -74.379],
  [41.780, -73.490], [42.474, -73.148], [43.103, -72.964],
  [43.630, -72.780], [43.700, -72.290], [44.230, -71.280],
  [44.590, -70.800], [45.290, -69.490], [45.904, -68.922]
];

let map;
let posts = [];
let trail = [];
let prelude = [];
let allOrdered = [];
let markers = new Map();
let routeBase;
let progressLine;
let traveler;
let routeSegments = [];
let selectedPost = null;
let currentStep = -1;
let currentTooltip = null;
let timer = null;
let playing = false;

function formatDate(date, compact = false) {
  if (!date) return 'Undated';
  const value = new Date(`${date}T12:00:00Z`);
  return new Intl.DateTimeFormat('en-US', {
    month: compact ? 'short' : 'long', day: 'numeric', year: compact ? undefined : 'numeric', timeZone: 'UTC'
  }).format(value);
}

function makeIcon(post, className = '') {
  return L.divIcon({
    className: `trail-icon ${post.kind === 'prelude' ? 'prelude' : ''} ${className}`,
    html: '<span class="pin" aria-hidden="true"></span>',
    iconSize: [20, 20], iconAnchor: [10, 10]
  });
}

function setSegments(segments) {
  routeSegments = segments
    .filter((segment) => segment.length > 1)
    .map((latlngs) => ({ latlngs, maxLat: Math.max(...latlngs.map((p) => p[0])) }));
  routeBase.setLatLngs(routeSegments.map((segment) => segment.latlngs));
  if (currentStep >= 0) updateProgress(trail[currentStep].lat);
}

function updateProgress(lat) {
  const visible = routeSegments
    .filter((segment) => segment.maxLat <= lat + 0.035)
    .map((segment) => segment.latlngs);
  progressLine.setLatLngs(visible);
}

async function loadRouteLayer(layer) {
  const features = [];
  for (let offset = 0; offset < 20000; offset += 2000) {
    const query = new URLSearchParams({
      where: '1=1', outFields: 'OBJECTID', returnGeometry: 'true',
      outSR: '4326', geometryPrecision: '4', maxAllowableOffset: '0.006',
      resultOffset: String(offset), resultRecordCount: '2000', f: 'geojson'
    });
    const response = await fetch(`${REGION_URL}/${layer}/query?${query}`);
    if (!response.ok) throw new Error(`Trail layer ${layer}: ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data.features)) throw new Error(`Trail layer ${layer}: invalid response`);
    features.push(...data.features);
    if (!data.properties?.exceededTransferLimit && data.features.length < 2000) break;
  }
  return features;
}

async function loadOfficialRoute() {
  try {
    const collections = await Promise.all(REGION_LAYERS.map(loadRouteLayer));
    const segments = collections.flat().flatMap((feature) => {
      const geometry = feature.geometry;
      if (!geometry) return [];
      const lines = geometry.type === 'LineString' ? [geometry.coordinates] :
        geometry.type === 'MultiLineString' ? geometry.coordinates : [];
      return lines.map((line) => line.map(([lon, lat]) => [lat, lon]));
    });
    if (segments.length < 100) throw new Error('Incomplete route geometry');
    setSegments(segments);
    document.documentElement.dataset.routeSource = 'atc-nps';
    $('route-note').hidden = true;
  } catch (error) {
    console.warn('Detailed A.T. route unavailable:', error);
    document.documentElement.dataset.routeSource = 'illustrative';
    $('route-note').hidden = false;
  }
}

function renderList(items, target) {
  target.replaceChildren();
  items.forEach((post, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'list-item';
    button.innerHTML = `<span class="list-number">${String(index + 1).padStart(2, '0')}</span><span class="list-title"></span><span class="list-arrow" aria-hidden="true">↗</span>`;
    const title = button.querySelector('.list-title');
    title.textContent = post.title;
    const date = document.createElement('small');
    date.textContent = formatDate(post.date, true);
    title.append(date);
    button.addEventListener('click', () => openPost(post, true));
    target.append(button);
  });
}

function setMarkerSelected(post) {
  if (selectedPost && markers.has(selectedPost.id)) {
    markers.get(selectedPost.id).setIcon(makeIcon(selectedPost));
  }
  selectedPost = post;
  if (post && markers.has(post.id)) {
    const marker = markers.get(post.id);
    marker.setOpacity(1);
    marker.setIcon(makeIcon(post, 'active'));
  }
}

function openPost(post, centerMap = false) {
  pauseJourney();
  if (currentTooltip) currentTooltip.closeTooltip();
  setMarkerSelected(post);
  $('journal-home').hidden = true;
  $('post-panel').hidden = false;
  $('post-date').textContent = formatDate(post.date);
  const sequence = post.kind === 'trail' ? trail : prelude;
  $('post-index').textContent = post.kind === 'trail'
    ? `NOTE ${String(sequence.indexOf(post) + 1).padStart(2, '0')} / ${sequence.length}`
    : 'BEFORE THE TRAIL';
  $('post-title').textContent = post.title;
  $('post-body').textContent = post.post;
  const image = $('post-image');
  image.hidden = true;
  image.removeAttribute('src');
  if (post.img) {
    image.alt = post.title;
    image.onload = () => { image.hidden = false; };
    image.onerror = () => { image.hidden = true; };
    image.src = post.img;
  }
  const allIndex = allOrdered.indexOf(post);
  const prev = allOrdered[allIndex - 1];
  const next = allOrdered[allIndex + 1];
  $('prev-button').disabled = !prev;
  $('next-button').disabled = !next;
  $('prev-title').textContent = prev?.title || '—';
  $('next-title').textContent = next?.title || '—';
  $('prev-button').onclick = prev ? () => openPost(prev, true) : null;
  $('next-button').onclick = next ? () => openPost(next, true) : null;
  $('journal').scrollTo({ top: 0, behavior: 'smooth' });
  if (centerMap) map.flyTo([post.lat, post.lon], Math.max(map.getZoom(), 6), { duration: 1 });
  if (window.innerWidth <= 700) $('journal').scrollIntoView({ behavior: 'smooth', block: 'start' });
  history.replaceState(null, '', `#${encodeURIComponent(post.id)}`);
}

function closePost() {
  setMarkerSelected(null);
  $('post-panel').hidden = true;
  $('journal-home').hidden = false;
  $('journal').scrollTo({ top: 0, behavior: 'smooth' });
  history.replaceState(null, '', location.pathname + location.search);
}

function updatePlayButton() {
  $('play-glyph').textContent = playing ? 'Ⅱ' : '▶';
  $('play-text').textContent = playing ? 'Pause journey' : currentStep >= trail.length - 1 ? 'Replay journey' : currentStep >= 0 ? 'Resume journey' : 'Play the journey';
  $('play-button').setAttribute('aria-label', $('play-text').textContent);
}

function pauseJourney() {
  if (timer) clearTimeout(timer);
  timer = null;
  playing = false;
  updatePlayButton();
}

function clearJourney() {
  pauseJourney();
  currentStep = -1;
  if (currentTooltip) currentTooltip.closeTooltip();
  currentTooltip = null;
  trail.forEach((post) => {
    const marker = markers.get(post.id);
    marker.setOpacity(1);
    marker.setIcon(makeIcon(post));
  });
  progressLine.setLatLngs([]);
  if (traveler) map.removeLayer(traveler);
  traveler = null;
  $('chapter-card').hidden = true;
  $('progress-fill').style.width = '0%';
  $('player-status').textContent = '49 trail notes · May–August 2019';
  updatePlayButton();
}

function revealStep() {
  currentStep += 1;
  if (currentStep >= trail.length) {
    pauseJourney();
    return;
  }
  const post = trail[currentStep];
  const marker = markers.get(post.id);
  if (currentTooltip) currentTooltip.closeTooltip();
  currentTooltip = marker;
  marker.setIcon(makeIcon(post, 'new'));
  marker.setOpacity(1);
  marker.openTooltip();
  updateProgress(post.lat);
  if (!traveler) {
    traveler = L.circleMarker([post.lat, post.lon], {
      radius: 8, color: '#fffaf0', weight: 3, fillColor: '#263a31', fillOpacity: 1, interactive: false
    }).addTo(map);
  } else traveler.setLatLng([post.lat, post.lon]);
  $('progress-fill').style.width = `${((currentStep + 1) / trail.length) * 100}%`;
  $('player-status').textContent = `${String(currentStep + 1).padStart(2, '0')} / ${trail.length} · ${formatDate(post.date, true)}`;
  $('chapter-date').textContent = formatDate(post.date).toUpperCase();
  $('chapter-title').textContent = post.title;
  $('chapter-card').hidden = false;
  $('chapter-card').onclick = () => openPost(post);
  if (currentStep === trail.length - 1) {
    playing = false;
    updatePlayButton();
  } else {
    timer = setTimeout(revealStep, 1050);
  }
}

function playJourney() {
  if (playing) return pauseJourney();
  if (currentStep >= trail.length - 1 || currentStep === -1) {
    clearJourney();
    trail.forEach((post) => markers.get(post.id).setOpacity(0));
    map.fitBounds(TRAIL_BOUNDS, { padding: [24, 24], animate: true });
  }
  playing = true;
  updatePlayButton();
  revealStep();
}

async function init() {
  if (!Array.isArray(window.TRAIL_POSTS)) throw new Error('Could not load journal posts');
  posts = window.TRAIL_POSTS;
  trail = posts.filter((post) => post.kind === 'trail').sort((a, b) => a.lat - b.lat || a.lon - b.lon);
  prelude = posts.filter((post) => post.kind === 'prelude').sort((a, b) => a.date.localeCompare(b.date));
  allOrdered = [...prelude, ...trail];
  $('note-count').textContent = `${posts.length} ENTRIES`;

  map = L.map('map', { zoomControl: false, scrollWheelZoom: false, preferCanvas: true, minZoom: 4, maxZoom: 13 });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors'
  }).addTo(map);
  L.control.zoom({ position: 'topleft' }).addTo(map);
  map.fitBounds(TRAIL_BOUNDS, { padding: [24, 24], animate: false });

  routeBase = L.polyline([], { color: '#334f3d', weight: 3, opacity: .58, smoothFactor: 1, interactive: false }).addTo(map);
  progressLine = L.polyline([], { color: '#be6540', weight: 4.7, opacity: .95, smoothFactor: 1, interactive: false }).addTo(map);
  setSegments(FALLBACK_ROUTE.slice(1).map((point, i) => [FALLBACK_ROUTE[i], point]));
  document.documentElement.dataset.routeSource = 'loading';

  posts.forEach((post) => {
    const marker = L.marker([post.lat, post.lon], {
      icon: makeIcon(post), title: post.title, riseOnHover: true, keyboard: true, zIndexOffset: post.kind === 'trail' ? 10 : 0
    }).addTo(map);
    marker.bindTooltip(post.title, { direction: 'top', offset: [0, -9], className: 'trail-tooltip' });
    marker.on('click', () => openPost(post));
    markers.set(post.id, marker);
  });
  renderList(trail, $('trail-list'));
  renderList(prelude, $('prelude-list'));
  $('play-button').addEventListener('click', playJourney);
  $('home-play').addEventListener('click', playJourney);
  $('reset-button').addEventListener('click', () => {
    clearJourney();
    map.fitBounds(TRAIL_BOUNDS, { padding: [24, 24], animate: true });
  });
  $('back-button').addEventListener('click', closePost);
  $('close-button').addEventListener('click', closePost);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && selectedPost) closePost(); });
  const id = decodeURIComponent(location.hash.slice(1));
  const linked = posts.find((post) => post.id === id);
  if (linked) openPost(linked, true);
  loadOfficialRoute();
}

init().catch((error) => {
  console.error(error);
  $('player-status').textContent = 'The journal could not be loaded. Please refresh.';
});
