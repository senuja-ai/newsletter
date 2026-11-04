// Full article page: loads one article and its comments, and lets readers comment.

const v = Date.now();
const { el, firestore, richText, formatDate, timeAgo, readingTime, safeUrl, millis } = await import(`./format.js?v=${v}`);

const UPLOAD_SECONDS = 30; // the "uploading" wait before a comment is posted (slows down spam)

const $ = id => document.getElementById(id);
const articleId = new URLSearchParams(location.search).get('id');
let fs = null;

main().catch(err => {
  console.error(err);
  showStatus('Sorry, this article could not be loaded. Check your connection and try again.');
});

async function main() {
  if (!articleId) return showStatus('No article was chosen. Pick one from the list of articles.', true);
  fs = await firestore();
  if (!fs) return showStatus('Articles are not set up yet.', true);

  let snap;
  try {
    snap = await fs.getDoc(fs.doc(fs.db, 'articles', articleId));
  } catch (err) {
    // Unpublished articles are not readable by the public, which shows up as "permission denied".
    if (err.code === 'permission-denied') return showStatus('This article is not available.', true);
    throw err;
  }
  if (!snap.exists() || !snap.data().published) return showStatus('This article is not available.', true);

  renderArticle({ id: snap.id, ...snap.data() });
  setUpComments();
  await loadComments();
}

function showStatus(text, withLink) {
  const s = $('post-status');
  s.textContent = text + ' ';
  if (withLink) {
    const a = el('a', '', 'See all articles →');
    a.href = './#articles';
    s.append(a);
  }
  s.hidden = false;
}

/* ---------- Article ---------- */

function renderArticle(a) {
  document.title = a.title + ' · Nørre News';
  $('post-title').textContent = a.title;
  $('post-subtitle').textContent = a.subtitle || '';
  $('post-subtitle').hidden = !a.subtitle;
  const author = a.authorName || 'Nørre News';
  $('post-author').textContent = author;
  $('post-avatar').textContent = author.trim().charAt(0).toUpperCase();
  $('post-meta').textContent = [formatDate(a.createdAt), readingTime(a.body)].filter(Boolean).join(' · ');

  const cover = safeUrl(a.coverUrl);
  if (cover) {
    const img = $('post-cover');
    img.src = cover;
    img.hidden = false;
    img.addEventListener('error', () => { img.hidden = true; });
  }

  $('post-body').replaceChildren(...richText(a.body));

  $('share-btn').addEventListener('click', async () => {
    const url = location.href;
    try {
      if (navigator.share) await navigator.share({ title: a.title, url });
      else { await navigator.clipboard.writeText(url); $('share-btn').textContent = 'Link copied ✓'; }
    } catch (e) { /* share sheet closed */ }
  });

  $('post-status').hidden = true;
  $('post').hidden = false;
}

/* ---------- Comments ---------- */

function commentsRef() {
  return fs.collection(fs.db, 'articles', articleId, 'comments');
}

async function loadComments() {
  const snap = await fs.getDocs(commentsRef());
  const comments = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => millis(a.createdAt) - millis(b.createdAt)); // oldest first, like a conversation
  $('comments').replaceChildren(...comments.map(commentNode));
  updateCount(comments.length);
  $('discussion').hidden = false;
}

function updateCount(n) {
  $('comment-count').textContent = n === 0 ? 'Discussion' : n + (n === 1 ? ' comment' : ' comments');
  $('comment-count').dataset.n = n;
}

function commentNode(c) {
  const li = el('li', 'comment');
  const head = el('div', 'comment-head');
  const name = String(c.name || 'Anonymous');
  head.append(el('span', 'avatar-sm', name.trim().charAt(0).toUpperCase()), el('strong', '', name), el('span', 'comment-time', timeAgo(c.createdAt)));
  li.append(head);
  for (const line of String(c.text || '').split('\n').map(s => s.trim()).filter(Boolean)) li.append(el('p', '', line));
  return li;
}

function setUpComments() {
  try { $('c-name').value = localStorage.getItem('norre-comment-name') || ''; } catch (e) {}

  $('comment-form').addEventListener('submit', async e => {
    e.preventDefault();
    const name = $('c-name').value.trim();
    const text = $('c-text').value.trim();
    $('c-error').textContent = '';
    if (!name) return ($('c-error').textContent = 'Please add your name.');
    if (text.length < 2) return ($('c-error').textContent = 'Please write a comment first.');
    try { localStorage.setItem('norre-comment-name', name); } catch (e2) {}

    setFormLocked(true);
    await fakeUpload();

    try {
      const ref = await fs.addDoc(commentsRef(), { name, text, createdAt: fs.serverTimestamp() });
      const li = commentNode({ id: ref.id, name, text, createdAt: null });
      li.classList.add('new');
      $('comments').append(li);
      updateCount(Number($('comment-count').dataset.n || 0) + 1);
      $('c-text').value = '';
      $('upload-text').textContent = 'Comment posted ✓';
      li.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => { $('upload').hidden = true; }, 2500);
    } catch (err) {
      console.error(err);
      $('upload').hidden = true;
      $('c-error').textContent = 'Your comment could not be posted. Please try again.';
    } finally {
      setFormLocked(false);
    }
  });
}

function setFormLocked(locked) {
  for (const id of ['c-name', 'c-text', 'c-submit']) $(id).disabled = locked;
  $('c-submit').textContent = locked ? 'Posting…' : 'Post comment';
}

// Shows an "uploading" progress bar for UPLOAD_SECONDS before the comment is sent.
function fakeUpload() {
  return new Promise(resolve => {
    const start = Date.now();
    $('upload').hidden = false;
    $('upload-text').textContent = 'Uploading your comment…';
    const tick = () => {
      const elapsed = (Date.now() - start) / 1000;
      const left = Math.max(0, Math.ceil(UPLOAD_SECONDS - elapsed));
      $('upload-secs').textContent = left + 's';
      $('upload-fill').style.width = Math.min(100, (elapsed / UPLOAD_SECONDS) * 100) + '%';
      if (elapsed >= UPLOAD_SECONDS) { clearInterval(timer); resolve(); }
    };
    const timer = setInterval(tick, 250);
    tick();
  });
}
