// Shared helpers for articles: safe text formatting, dates and reading time.
//
// Writers can use a few simple formatting codes in articles:
//   ## Heading          ### Smaller heading
//   > A quote           - A bullet point
//   **bold**            *italic*
//   [link text](https://example.com)
//   ---  (a line on its own draws a divider)
//   ![Caption](img:ID)            an image uploaded on the Writers' Desk
//   ![Caption](https://…/pic.png) an image from another website
// Everything is built with DOM nodes and textContent, so nobody can inject HTML.

export const SDK = 'https://www.gstatic.com/firebasejs/10.12.2';

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

export function millis(ts) {
  return ts && typeof ts.toMillis === 'function' ? ts.toMillis() : 0;
}

export function formatDate(ts) {
  const ms = millis(ts);
  if (!ms) return '';
  return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function timeAgo(ts) {
  const ms = millis(ts);
  if (!ms) return 'just now';
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60); if (m < 60) return m + (m === 1 ? ' minute ago' : ' minutes ago');
  const h = Math.round(m / 60); if (h < 24) return h + (h === 1 ? ' hour ago' : ' hours ago');
  const d = Math.round(h / 24); if (d < 7) return d + (d === 1 ? ' day ago' : ' days ago');
  return formatDate(ts);
}

export function readingTime(text) {
  const words = (String(text || '').match(/\S+/g) || []).length;
  return Math.max(1, Math.round(words / 220)) + ' min read';
}

// Only allow normal web links and images (no javascript: or data: tricks).
export function safeUrl(url) {
  try {
    const u = new URL(String(url || '').trim());
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : '';
  } catch (e) {
    return '';
  }
}

// **bold**, *italic* and [text](https://link) inside one line.
export function inline(text) {
  const out = [];
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(document.createTextNode(text.slice(last, m.index)));
    if (m[1]) out.push(el('strong', '', m[1]));
    else if (m[2]) out.push(el('em', '', m[2]));
    else {
      const href = safeUrl(m[4]);
      if (href) {
        const a = el('a', '', m[3]);
        a.href = href; a.target = '_blank'; a.rel = 'noopener nofollow';
        out.push(a);
      } else {
        out.push(document.createTextNode(m[0]));
      }
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(document.createTextNode(text.slice(last)));
  return out;
}

// Turns an article body into headings, paragraphs, quotes, lists and dividers.
// `images` maps uploaded image IDs to their picture data (see article.js).
export function richText(body, images = {}) {
  const nodes = [];
  let list = null;
  for (const raw of String(body || '').split('\n')) {
    const line = raw.trim();
    if (!line) { list = null; continue; }
    const pic = line.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/);
    if (pic) {
      list = null;
      const fig = imageFigure(pic[2], pic[1], images);
      if (fig) nodes.push(fig);
      continue;
    }
    if (/^[-*] /.test(line)) {
      if (!list) { list = el('ul'); nodes.push(list); }
      const li = el('li'); li.append(...inline(line.slice(2))); list.append(li);
      continue;
    }
    list = null;
    let node;
    if (line === '---') node = el('hr');
    else if (line.startsWith('### ')) { node = el('h3'); node.append(...inline(line.slice(4))); }
    else if (line.startsWith('## ')) { node = el('h2'); node.append(...inline(line.slice(3))); }
    else if (line.startsWith('> ')) { node = el('blockquote'); node.append(...inline(line.slice(2))); }
    else { node = el('p'); node.append(...inline(line)); }
    nodes.push(node);
  }
  return nodes;
}

// A picture with an optional caption. Uploaded images ("img:ID") come from the
// article's own image store; others must be normal https links.
function imageFigure(src, caption, images) {
  let url = '';
  if (src.startsWith('img:')) {
    const data = images[src.slice(4)];
    if (typeof data === 'string' && /^data:image\/(png|jpeg|webp|gif);base64,/.test(data)) url = data;
  } else {
    url = safeUrl(src);
  }
  if (!url) return null;
  const fig = el('figure', 'post-figure');
  const img = el('img');
  img.src = url;
  img.alt = caption || '';
  img.loading = 'lazy';
  img.addEventListener('error', () => fig.remove());
  // Tap/click to open the full-size picture
  img.addEventListener('click', () => fig.classList.toggle('zoomed'));
  fig.append(img);
  if (caption) fig.append(el('figcaption', '', caption));
  return fig;
}

// Plain-text preview (formatting codes removed) for cards.
export function plainPreview(body, words = 40) {
  const text = String(body || '').slice(0, 6000) // long articles: only the start is needed
    .replace(/^!\[[^\]]*\]\([^)]*\)$/gm, '')
    .replace(/^#+ |^> |^[-*] /gm, '')
    .replace(/\*\*([^*]+)\*\*|\*([^*]+)\*/g, '$1$2')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^---$/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
  const parts = text.split(' ');
  return parts.length > words ? parts.slice(0, words).join(' ') + '…' : text;
}

// A clickable card linking to the full article.
export function articleCard(a) {
  const link = el('a', 'article-card');
  link.href = 'article.html?id=' + encodeURIComponent(a.id);
  const cover = safeUrl(a.coverUrl);
  if (cover) {
    const img = el('img', 'article-cover');
    img.src = cover; img.alt = ''; img.loading = 'lazy';
    img.addEventListener('error', () => img.remove());
    link.append(img);
  }
  const text = el('div', 'article-card-text');
  text.append(el('p', 'article-meta', [a.authorName, formatDate(a.createdAt), readingTime(a.body)].filter(Boolean).join(' · ')));
  text.append(el('h3', '', a.title));
  if (a.subtitle) text.append(el('p', 'article-subtitle', a.subtitle));
  text.append(el('p', 'article-summary', plainPreview(a.body, 45)));
  text.append(el('span', 'article-read', 'Read the full article →'));
  link.append(text);
  return link;
}

// Loads Firebase once and returns the Firestore functions + database.
let fsPromise = null;
export function firestore() {
  if (!fsPromise) {
    fsPromise = (async () => {
      const { firebaseConfig, databaseId } = await import(`./firebase-config.js?v=${Date.now()}`);
      if (!firebaseConfig || !firebaseConfig.apiKey || firebaseConfig.apiKey.startsWith('PASTE')) return null;
      const { initializeApp } = await import(`${SDK}/firebase-app.js`);
      const mod = await import(`${SDK}/firebase-firestore.js`);
      return { ...mod, db: mod.getFirestore(initializeApp(firebaseConfig), databaseId || '(default)') };
    })();
  }
  return fsPromise;
}

// All published articles, newest first.
export async function publishedArticles() {
  const fs = await firestore();
  if (!fs) return [];
  const snap = await fs.getDocs(fs.query(fs.collection(fs.db, 'articles'), fs.where('published', '==', true)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => millis(b.createdAt) - millis(a.createdAt));
}
