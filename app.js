
// Loaded with a fresh ?v= each time so browsers never use an old cached copy.
const { firebaseConfig, databaseId } = await import(`./firebase-config.js?v=${Date.now()}`);

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const isConfigured = firebaseConfig && firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith('PASTE');

if (isConfigured) {
  loadPosts().catch(err => console.warn('Nørre News: could not load posts.', err));
  loadArticles().catch(err => console.warn('Nørre News: could not load articles.', err));
}

// A summary card for every published article, newest first. Each card leads to the full article page.
async function loadArticles() {
  const list = document.getElementById('articles-list');
  try {
    const { publishedArticles, articleCard, el } = await import(`./format.js?v=${Date.now()}`);
    const articles = await publishedArticles();
    list.replaceChildren(...(articles.length
      ? articles.map(articleCard)
      : [el('p', 'post-status', 'No articles yet. Check back soon!')]));
  } catch (err) {
    list.replaceChildren();
    list.append(Object.assign(document.createElement('p'), { className: 'post-status', textContent: 'Articles could not be loaded right now.' }));
    throw err;
  }
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

  // All content comes from the Writers' Desk. Sections start hidden in
  // index.html and only appear when they have something published.
  if (bySection.feature) { renderFeature(bySection.feature[0]); show('.feature'); }
  if (bySection.news) { renderCards('news-list', bySection.news); show('#news', 'news'); }
  if (bySection.events && renderEvents(bySection.events)) show('#events', 'events');
  if (bySection.spotlight) { renderSpotlight(bySection.spotlight[0]); show('#spotlight', 'spotlight'); }
  if (bySection.corner) { renderCards('corner-list', bySection.corner); show('#corner-list'); }
  if (bySection.quote) { renderQuotes(bySection.quote); show('#quote-content'); }
  if (bySection.corner || bySection.quote) show('#corner', 'corner');
  if (bySection.gossip) { renderGossip(bySection.gossip); show('#gossip', 'gossip'); }
}

// Shows a part of the page (and its menu link, if given).
function show(selector, navId) {
  const node = document.querySelector(selector);
  if (node) node.hidden = false;
  if (navId) {
    const link = document.querySelector(`nav a[href="#${navId}"]`);
    if (link) link.hidden = false;
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

const PREVIEW_WORDS = 80; // longer articles get a "Read more" button

function renderCards(id, posts) {
  fill(id, posts.map(p => {
    const card = el('article', 'card');
    if (p.tag) card.append(el('span', 'tag', p.tag));
    card.append(el('h3', '', p.title));
    const body = el('div', 'card-body');
    body.append(...paragraphs(p.body));
    card.append(body);
    const words = (String(p.body || '').match(/\S+/g) || []).length;
    if (words > PREVIEW_WORDS) {
      card.classList.add('long');
      const btn = el('button', 'read-more', 'Read more');
      btn.type = 'button';
      btn.setAttribute('aria-expanded', 'false');
      btn.addEventListener('click', () => {
        const open = card.classList.toggle('expanded');
        btn.textContent = open ? 'Show less' : 'Read more';
        btn.setAttribute('aria-expanded', String(open));
        if (!open) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
      card.append(btn);
    }
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

// Every published quote, newest first.
function renderQuotes(posts) {
  fill('quote-content', posts.map(p => {
    const item = el('div', 'quote-item');
    item.append(el('p', '', `"${String(p.body || '').trim().replace(/^"|"$/g, '')}"`));
    if (p.tag) item.append(el('span', '', p.tag));
    return item;
  }));
}

function renderGossip(posts) {
  fill('gossip-list', posts.map(p => {
    const card = el('article', 'whisper');
    card.append(el('h3', '', p.title), ...paragraphs(p.body));
    return card;
  }));
}
