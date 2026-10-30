// Loads published posts from Firebase and puts them into the page.
// If Firebase isn't set up yet (or nothing is published at all), the default
// content written in index.html stays on the page. Once posts exist, the
// Writers' Desk controls everything: empty sections are hidden.

// Loaded with a fresh ?v= each time so browsers never use an old cached copy.
const { firebaseConfig, databaseId } = await import(`./firebase-config.js?v=${Date.now()}`);

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const isConfigured = firebaseConfig && firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith('PASTE');

if (isConfigured) {
  loadPosts().catch(err => console.warn('Nørre News: could not load posts, showing default content.', err));
}

async function loadPosts() {
  const { initializeApp } = await import(`${SDK}/firebase-app.js`);
  const { getFirestore, collection, query, where, getDocs } = await import(`${SDK}/firebase-firestore.js`);

  const db = getFirestore(initializeApp(firebaseConfig), databaseId || '(default)');
  const snap = await getDocs(query(collection(db, 'posts'), where('published', '==', true)));

  const bySection = {};
  snap.forEach(doc => {
    const p = doc.data();
    (bySection[p.section] ||= []).push(p);
  });

  // Newest first everywhere, except events (soonest first).
  for (const key in bySection) bySection[key].sort((a, b) => millis(b.createdAt) - millis(a.createdAt));

  // Nothing published at all yet → writers haven't started; keep the default page.
  if (snap.empty) return;

  // From here on the Writers' Desk is in charge: sections with nothing
  // published are hidden instead of showing the old default text.
  if (bySection.feature) renderFeature(bySection.feature[0]); else hide('.feature');
  if (bySection.news) renderCards('news-list', bySection.news); else hide('#news', 'news');
  if (!(bySection.events && renderEvents(bySection.events))) hide('#events', 'events');
  if (bySection.spotlight) renderSpotlight(bySection.spotlight[0]); else hide('#spotlight', 'spotlight');
  if (bySection.corner) renderCards('corner-list', bySection.corner); else hide('#corner-list');
  if (bySection.quote) renderQuote(bySection.quote[0]); else hide('#quote-content');
  if (!bySection.corner && !bySection.quote) hide('#corner', 'corner');
  if (bySection.gossip) renderGossip(bySection.gossip); else hide('#gossip', 'gossip');
}

// Hides a part of the page (and its menu link, if given).
function hide(selector, navId) {
  const node = document.querySelector(selector);
  if (node) node.hidden = true;
  if (navId) {
    const link = document.querySelector(`nav a[href="#${navId}"]`);
    if (link) link.hidden = true;
  }
}

/* ---------- helpers ---------- */

function millis(ts) {
  return ts && typeof ts.toMillis === 'function' ? ts.toMillis() : 0;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text; // textContent keeps writers' text safe (no HTML injection)
  return node;
}

function paragraphs(body, firstClass) {
  return String(body || '')
    .split(/\n+/)
    .map(s => s.trim())
    .filter(Boolean)
    .map((text, i) => el('p', i === 0 && firstClass ? firstClass : '', text));
}

function fill(id, nodes) {
  const box = document.getElementById(id);
  if (!box) return;
  box.replaceChildren(...nodes);
}

/* ---------- renderers ---------- */

function renderFeature(p) {
  fill('feature-content', [el('h2', '', p.title), ...paragraphs(p.body, 'lede')]);
}

function renderCards(id, posts) {
  fill(id, posts.map(p => {
    const card = el('article', 'card');
    if (p.tag) card.append(el('span', 'tag', p.tag));
    card.append(el('h3', '', p.title), ...paragraphs(p.body));
    return card;
  }));
}

function renderEvents(posts) {
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = posts
    .filter(p => !p.date || p.date >= today)          // hide events that have passed
    .sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
  if (!upcoming.length) return false; // all events have passed → section gets hidden

  fill('events-list', upcoming.map(p => {
    const li = el('li');
    const box = el('div', 'date');
    if (p.date) {
      const [, m, d] = p.date.split('-');
      box.append(el('span', 'day', d), el('span', 'month', MONTHS[Number(m) - 1]));
    } else {
      box.append(el('span', 'day', 'TBC'), el('span', 'month', p.tag || 'Soon'));
    }
    const text = el('div');
    text.append(el('h3', '', p.title), ...paragraphs(p.body));
    li.append(box, text);
    return li;
  }));
  return true;
}

function renderSpotlight(p) {
  fill('spotlight-content', [el('h3', '', p.title), ...paragraphs(p.body)]);
}

function renderQuote(p) {
  const nodes = [el('p', '', `"${String(p.body || '').trim().replace(/^"|"$/g, '')}"`)];
  if (p.tag) nodes.push(el('span', '', p.tag));
  fill('quote-content', nodes);
}

function renderGossip(posts) {
  fill('gossip-list', posts.map(p => {
    const card = el('article', 'whisper');
    card.append(el('h3', '', p.title), ...paragraphs(p.body));
    return card;
  }));
}
