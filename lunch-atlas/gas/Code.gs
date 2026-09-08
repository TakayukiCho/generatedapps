const CONFIG = {
  owner: 'TakayukiCho',
  repo: 'generatedapps',
  baseBranch: 'main',
  restaurantsJsonPath: 'lunch-atlas/restaurants.json',
  restaurantsJsPath: 'lunch-atlas/restaurants-data.js',
  placesEndpoint: 'https://places.googleapis.com/v1/places:searchNearby',
  center: { latitude: 35.60699, longitude: 139.73505 },
  // Dense area: split Oimachi into several overlapping circles because Nearby Search returns max 20 places/request.
  searchCenters: [
    { latitude: 35.60699, longitude: 139.73505 },
    { latitude: 35.61020, longitude: 139.73505 },
    { latitude: 35.60380, longitude: 139.73505 },
    { latitude: 35.60699, longitude: 139.73120 },
    { latitude: 35.60699, longitude: 139.73890 }
  ],
  radiusMeters: 420,
  includedTypes: [
    'restaurant',
    'cafe',
    'bakery',
    'bar',
    'meal_takeaway'
  ]
};

/**
 * Main entry point. Run this once manually to create the baseline,
 * then install a daily trigger with setupDailyTrigger().
 */
function watchNewRestaurants() {
  const props = PropertiesService.getScriptProperties();
  requireProperty_(props, 'GOOGLE_MAPS_API_KEY');
  requireProperty_(props, 'GITHUB_TOKEN');

  const places = collectNearbyPlaces_();
  const initialized = props.getProperty('BASELINE_INITIALIZED') === 'true';

  if (!initialized) {
    places.forEach(place => markSeen_(props, place.id));
    props.setProperty('BASELINE_INITIALIZED', 'true');
    Logger.log(`Baseline initialized with ${places.length} places. No PR created.`);
    return;
  }

  const unseen = places.filter(place => !isSeen_(props, place.id));
  if (unseen.length === 0) {
    Logger.log('No new restaurant candidates found.');
    return;
  }

  const currentRestaurants = readRestaurantsFromGitHub_();
  const existingNames = new Set(currentRestaurants.map(item => normalizeName_(item.name)));

  const candidates = unseen.filter(place => !existingNames.has(normalizeName_(place.displayName?.text || '')));

  // Existing Atlas entries discovered by place ID later are not new restaurants.
  unseen
    .filter(place => existingNames.has(normalizeName_(place.displayName?.text || '')))
    .forEach(place => markSeen_(props, place.id));

  if (candidates.length === 0) {
    Logger.log('Only already-listed restaurants were newly discovered.');
    return;
  }

  const additions = candidates.map(placeToRestaurant_);
  const nextRestaurants = currentRestaurants.concat(additions);
  const pr = createUpdatePullRequest_(nextRestaurants, candidates);

  candidates.forEach(place => markSeen_(props, place.id));
  Logger.log(`Created PR: ${pr.html_url || pr.url || JSON.stringify(pr)}`);
}

function setupDailyTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(trigger => trigger.getHandlerFunction() === 'watchNewRestaurants')
    .forEach(trigger => ScriptApp.deleteTrigger(trigger));

  ScriptApp.newTrigger('watchNewRestaurants')
    .timeBased()
    .everyDays(1)
    .atHour(8)
    .create();
}

function collectNearbyPlaces_() {
  const byId = new Map();
  CONFIG.searchCenters.forEach(center => {
    searchNearby_(center).forEach(place => {
      if (place.id) byId.set(place.id, place);
    });
  });
  return [...byId.values()];
}

function searchNearby_(center) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GOOGLE_MAPS_API_KEY');
  const payload = {
    includedTypes: CONFIG.includedTypes,
    includeFutureOpeningBusinesses: true,
    maxResultCount: 20,
    locationRestriction: {
      circle: {
        center,
        radius: CONFIG.radiusMeters
      }
    }
  };

  const response = UrlFetchApp.fetch(CONFIG.placesEndpoint, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'X-Goog-Api-Key': apiKey,
      // Keep this at Nearby Search Pro; do not add rating, priceLevel or servesLunch here.
      'X-Goog-FieldMask': [
        'places.id',
        'places.displayName',
        'places.formattedAddress',
        'places.primaryType',
        'places.types',
        'places.businessStatus',
        'places.openingDate',
        'places.googleMapsUri'
      ].join(',')
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  assertOk_(response, 'Places API');
  const json = JSON.parse(response.getContentText());
  return json.places || [];
}

function placeToRestaurant_(place) {
  const type = place.primaryType || 'restaurant';
  const defaults = scoreDefaultsForType_(type);
  return {
    name: place.displayName?.text || '名称未取得',
    genre: genresForType_(type),
    healthy_score: defaults.healthy,
    price_score: defaults.price,
    taste_score: defaults.taste
  };
}

function genresForType_(type) {
  const map = {
    japanese_restaurant: ['和食'],
    sushi_restaurant: ['寿司', '和食'],
    ramen_restaurant: ['ラーメン'],
    udon_restaurant: ['和食'],
    soba_restaurant: ['そば', '和食'],
    chinese_restaurant: ['中華'],
    korean_restaurant: ['韓国料理'],
    indian_restaurant: ['エスニック'],
    thai_restaurant: ['エスニック'],
    vietnamese_restaurant: ['エスニック'],
    italian_restaurant: ['イタリアン'],
    french_restaurant: ['洋食'],
    spanish_restaurant: ['スパニッシュ'],
    steak_house: ['洋食'],
    hamburger_restaurant: ['洋食'],
    pizza_restaurant: ['イタリアン'],
    seafood_restaurant: ['和食'],
    vegetarian_restaurant: ['ヘルシー'],
    vegan_restaurant: ['ヘルシー'],
    cafe: ['洋食'],
    bakery: ['洋食'],
    bar: ['洋食'],
    meal_takeaway: ['洋食'],
    restaurant: ['洋食']
  };
  return map[type] || ['洋食'];
}

function scoreDefaultsForType_(type) {
  const map = {
    ramen_restaurant: { healthy: 1, price: 3, taste: 4 },
    hamburger_restaurant: { healthy: 2, price: 3, taste: 3 },
    pizza_restaurant: { healthy: 2, price: 3, taste: 4 },
    vegetarian_restaurant: { healthy: 5, price: 3, taste: 3 },
    vegan_restaurant: { healthy: 5, price: 3, taste: 3 },
    sushi_restaurant: { healthy: 4, price: 2, taste: 4 },
    japanese_restaurant: { healthy: 4, price: 3, taste: 4 },
    soba_restaurant: { healthy: 4, price: 4, taste: 3 },
    cafe: { healthy: 3, price: 3, taste: 3 },
    bakery: { healthy: 2, price: 3, taste: 3 },
    bar: { healthy: 2, price: 2, taste: 4 },
    meal_takeaway: { healthy: 2, price: 4, taste: 3 }
  };
  return map[type] || { healthy: 3, price: 3, taste: 3 };
}

function createUpdatePullRequest_(restaurants, places) {
  const props = PropertiesService.getScriptProperties();
  const timestamp = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd-HHmmss');
  const branch = `bot/oimachi-new-restaurants-${timestamp}`;

  const baseRef = githubJson_(`/repos/${CONFIG.owner}/${CONFIG.repo}/git/ref/heads/${CONFIG.baseBranch}`);
  githubJson_(`/repos/${CONFIG.owner}/${CONFIG.repo}/git/refs`, 'post', {
    ref: `refs/heads/${branch}`,
    sha: baseRef.object.sha
  });

  const jsonText = `${JSON.stringify(restaurants, null, 2)}\n`;
  const jsText = `window.RESTAURANTS = ${JSON.stringify(restaurants, null, 2)};\n`;

  updateGitHubFile_(CONFIG.restaurantsJsonPath, jsonText, branch, 'Add newly discovered Oimachi restaurants');
  updateGitHubFile_(CONFIG.restaurantsJsPath, jsText, branch, 'Sync restaurant data for Lunch Atlas');

  const names = places.map(place => place.displayName?.text || '名称未取得');
  const details = places.map(place => {
    const opening = formatOpeningDate_(place.openingDate);
    const status = place.businessStatus || 'UNKNOWN';
    const url = place.googleMapsUri || '';
    return `- ${place.displayName?.text || '名称未取得'} (${status}${opening ? ` / opening: ${opening}` : ''})${url ? `\n  - ${url}` : ''}`;
  }).join('\n');

  return githubJson_(`/repos/${CONFIG.owner}/${CONFIG.repo}/pulls`, 'post', {
    title: `大井町の新店候補を追加: ${names.join(', ')}`,
    head: branch,
    base: CONFIG.baseBranch,
    body: [
      'GAS の大井町新店ウォッチャーが自動生成したPRです。',
      '',
      '## 検出した店舗',
      details,
      '',
      '## 注意',
      '- Google Places の place ID がベースラインに存在しなかった店舗を候補としています。',
      '- healthy / price / taste は primaryType からの暫定値です。必要ならマージ前に調整してください。',
      '- rating / priceLevel / servesLunch はAPIコストを抑えるため取得していません。'
    ].join('\n')
  });
}

function readRestaurantsFromGitHub_() {
  const file = githubJson_(`/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${CONFIG.restaurantsJsonPath}?ref=${encodeURIComponent(CONFIG.baseBranch)}`);
  return JSON.parse(decodeGitHubContent_(file.content));
}

function updateGitHubFile_(path, content, branch, message) {
  const file = githubJson_(`/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${path}?ref=${encodeURIComponent(branch)}`);
  return githubJson_(`/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${path}`, 'put', {
    message,
    content: Utilities.base64Encode(content, Utilities.Charset.UTF_8),
    sha: file.sha,
    branch
  });
}

function githubJson_(path, method = 'get', payload) {
  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  const options = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    muteHttpExceptions: true
  };
  if (payload !== undefined) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(payload);
  }

  const response = UrlFetchApp.fetch(`https://api.github.com${path}`, options);
  assertOk_(response, `GitHub ${method.toUpperCase()} ${path}`);
  const text = response.getContentText();
  return text ? JSON.parse(text) : {};
}

function decodeGitHubContent_(base64Text) {
  const bytes = Utilities.base64Decode((base64Text || '').replace(/\s/g, ''));
  return Utilities.newBlob(bytes).getDataAsString('UTF-8');
}

function isSeen_(props, placeId) {
  return props.getProperty(`seen:${placeId}`) === '1';
}

function markSeen_(props, placeId) {
  props.setProperty(`seen:${placeId}`, '1');
}

function normalizeName_(name) {
  return String(name || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[・.．,，]/g, '');
}

function formatOpeningDate_(openingDate) {
  if (!openingDate) return '';
  const parts = [openingDate.year, openingDate.month, openingDate.day].filter(Boolean);
  return parts.join('-');
}

function requireProperty_(props, key) {
  if (!props.getProperty(key)) {
    throw new Error(`Script Property ${key} is required.`);
  }
}

function assertOk_(response, label) {
  const status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error(`${label} failed (${status}): ${response.getContentText()}`);
  }
}
