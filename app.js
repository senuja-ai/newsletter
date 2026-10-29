// Loads published posts from Firebase and puts them into the page.
// If Firebase isn't set up yet, or a section has no published posts,
// the default content written in index.html stays on the page.

import { firebaseConfig } from './firebase-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const isConfigured = firebaseConfig && firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith('PASTE');

if (isConfigured) {
  loadPosts().catch(err => console.warn('Nørre News: could not load posts, showing default content.', err));
}

async function loadPosts() {
  const { initializeApp } = await import(`${SDK}/firebase-app.js`);
  const { getFirestore, collection, query, where, getDocs } = await import(`${SDK}/firebase-firestore.js`);

  const db = getFirestore(initializeApp(firebaseConfig));
  const snap = await getDocs(query(collection(db, 'posts'), where('published', '==', true)));

  const bySection = {};
  snap.forEach(doc => {
    const p = doc.data();
    (bySection[p.section] ||= []).push(p);
  });

  // Newest first everywhere, except events (soonest first).
  for (const key in bySection) bySection[key].sort((a, b) => millis(b.createdAt) - millis(a.createdAt));

  if (bySection.feature) renderFeature(bySection.feature[0]);
  if (bySection.news) renderCards('news-list', bySection.news);
  if (bySection.events) renderEvents(bySection.events);
  if (bySection.spotlight) renderSpotlight(bySection.spotlight[0]);
  if (bySection.corner) renderCards('corner-list', bySection.corner);
  if (bySection.quote) renderQuote(bySection.quote[0]);
  if (bySection.gossip) renderGossip(bySection.gossip);
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
  if (!upcoming.length) return;

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
