// Full article page: loads one article and its comments, and lets readers comment.

const v = Date.now();
const { el, firestore, richText, formatDate, timeAgo, readingTime, safeUrl, millis } = await import(`./format.js?v=${v}`);

const { spamReason, rememberMessage, startPenalty, penaltyLeft, formatWait, PENALTY_MINUTES } = await import(`./spam.js?v=${v}`);

const UPLOAD_SECONDS = 15;     // the "uploading" wait before a comment is posted (slows down spam)
const LONG_COMMENT_CHARS = 400; // longer comments are folded with "Show more"

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

  const article = { id: snap.id, ...snap.data() };
  const images = /\]\(img:/.test(article.body || '') ? await loadImages() : {};
  renderArticle(article, images);
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

// Pictures uploaded on the Writers' Desk are stored with the article.
async function loadImages() {
  try {
    const snap = await fs.getDocs(fs.collection(fs.db, 'articles', articleId, 'images'));
    const map = {};
    snap.forEach(d => { map[d.id] = d.data().data; });
    return map;
  } catch (err) {
    console.warn('Images could not be loaded', err);
    return {};
  }
}

function renderArticle(a, images = {}) {
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

  $('post-body').replaceChildren(...richText(a.body, images));

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
// Comments can be replies: a reply stores the id of the top-level comment it
// belongs to (parentId) and the name of the person being answered (replyTo).

let allComments = [];

function commentsRef() {
  return fs.collection(fs.db, 'articles', articleId, 'comments');
}

async function loadComments() {
  const snap = await fs.getDocs(commentsRef());
  allComments = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => millis(a.createdAt) - millis(b.createdAt)); // oldest first, like a conversation
  renderComments();
  $('discussion').hidden = false;
}

function renderComments() {
  const top = allComments.filter(c => !c.parentId);
  const ids = new Set(top.map(c => c.id));
  $('comments').replaceChildren(...top.map(c => {
    const li = commentNode(c);
    const replies = allComments.filter(r => r.parentId === c.id);
    if (replies.length) {
      const ol = el('ol', 'replies');
      ol.append(...replies.map(r => commentNode(r, c.id)));
      li.append(ol);
    }
    return li;
  }));
  // Replies whose comment was deleted still show, at the end
  const orphans = allComments.filter(c => c.parentId && !ids.has(c.parentId));
  for (const o of orphans) $('comments').append(commentNode(o));
  updateCount(allComments.length);
}

function updateCount(n) {
  $('comment-count').textContent = n === 0 ? 'Discussion' : n + (n === 1 ? ' comment' : ' comments');
}

// One comment. `threadId` is the top-level comment a reply belongs to.
function commentNode(c, threadId) {
  const li = el('li', 'comment');
  li.dataset.id = c.id;
  const head = el('div', 'comment-head');
  const name = String(c.name || 'Anonymous');
  head.append(el('span', 'avatar-sm', name.trim().charAt(0).toUpperCase()), el('strong', '', name));
  if (c.replyTo) head.append(el('span', 'reply-to', '↳ ' + c.replyTo));
  head.append(el('span', 'comment-time', timeAgo(c.createdAt)));

  const body = el('div', 'comment-text');
  for (const line of String(c.text || '').split('\n').map(s => s.trim()).filter(Boolean)) body.append(el('p', '', line));
  li.append(head, body);

  const actions = el('div', 'comment-actions-row');
  if (String(c.text || '').length > LONG_COMMENT_CHARS || String(c.text || '').split('\n').length > 6) {
    li.classList.add('long');
    const more = el('button', 'link-btn', 'Show more');
    more.type = 'button';
    more.setAttribute('aria-expanded', 'false');
    more.addEventListener('click', () => {
      const open = li.classList.toggle('open');
      more.textContent = open ? 'Show less' : 'Show more';
      more.setAttribute('aria-expanded', String(open));
    });
    actions.append(more);
  }
  const reply = el('button', 'link-btn', 'Reply');
  reply.type = 'button';
  reply.addEventListener('click', () => openReplyForm(li, threadId || c.id, name));
  actions.append(reply);
  li.append(actions);
  return li;
}

/* ---------- Posting (main form + reply forms) ---------- */

function setUpComments() {
  try { $('c-name').value = localStorage.getItem('norre-comment-name') || ''; } catch (e) {}
  $('comment-form').addEventListener('submit', e => {
    e.preventDefault();
    postComment($('comment-form'), { parentId: '', replyTo: '' });
  });
  showPenalty($('comment-form'));
}

// Opens a small reply form under a comment (only one at a time).
function openReplyForm(li, parentId, replyTo) {
  document.querySelectorAll('.reply-form').forEach(f => f.remove());
  const form = el('form', 'comment-form reply-form');
  form.innerHTML = `
    <label>Your name <input type="text" name="name" maxlength="50" autocomplete="nickname" required></label>
    <label>Reply to <span class="reply-name"></span> <textarea name="text" rows="3" maxlength="2000" required></textarea></label>
    <div class="comment-actions">
      <button type="button" class="link-btn" data-cancel>Cancel</button>
      <button type="submit" class="button">Post reply</button>
    </div>
    <div class="upload" hidden>
      <div class="upload-row"><span class="upload-text">Uploading your reply…</span><span class="upload-secs"></span></div>
      <div class="upload-bar"><div class="upload-fill"></div></div>
      <small class="muted">Please keep this page open until it's posted.</small>
    </div>
    <p class="penalty" hidden></p>
    <p class="error" role="alert"></p>`;
  form.querySelector('.reply-name').textContent = replyTo; // set as text, never as HTML
  form.querySelector('[name=name]').value = $('c-name').value || '';
  form.querySelector('[data-cancel]').addEventListener('click', () => form.remove());
  form.addEventListener('submit', e => { e.preventDefault(); postComment(form, { parentId, replyTo }); });
  li.querySelector(':scope > .comment-actions-row').after(form);
  showPenalty(form);
  form.querySelector('textarea').focus();
}

const field = (form, name) => form.querySelector(`[name=${name}]`) || form.querySelector(name === 'name' ? '#c-name' : '#c-text');

async function postComment(form, { parentId, replyTo }) {
  const nameEl = field(form, 'name');
  const textEl = field(form, 'text');
  const errEl = form.querySelector('.error');
  const name = nameEl.value.trim();
  const text = textEl.value.trim();
  errEl.textContent = '';

  if (penaltyLeft()) return showPenalty(form);
  if (!name) return (errEl.textContent = 'Please add your name.');
  if (text.length < 2) return (errEl.textContent = 'Please write something first.');

  const reason = spamReason(text, allComments.map(c => c.text))
    || (/(.)\1{5,}/u.test(name) || (name.length > 30 && !name.includes(' ')) ? 'a strange name' : '');
  if (reason) {
    startPenalty();
    errEl.textContent = `This looks like spam (${reason}), so it wasn't posted. You can try again in ${PENALTY_MINUTES} minutes.`;
    return showPenalty(form);
  }
  try { localStorage.setItem('norre-comment-name', name); } catch (e) {}

  lock(form, true);
  await fakeUpload(form);
  try {
    const data = { name, text, createdAt: fs.serverTimestamp() };
    if (parentId) { data.parentId = parentId; data.replyTo = replyTo; }
    const ref = await fs.addDoc(commentsRef(), data);
    rememberMessage(text);
    allComments.push({ id: ref.id, name, text, parentId, replyTo, createdAt: { toMillis: () => Date.now() } });
    renderComments();
    const li = document.querySelector(`.comment[data-id="${ref.id}"]`);
    if (li) { li.classList.add('new'); li.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    if (form.classList.contains('reply-form')) form.remove();
    else {
      textEl.value = '';
      form.querySelector('.upload-text').textContent = 'Comment posted ✓';
      setTimeout(() => { form.querySelector('.upload').hidden = true; }, 2500);
    }
  } catch (err) {
    console.error(err);
    form.querySelector('.upload').hidden = true;
    errEl.textContent = 'Your comment could not be posted. Please try again.';
  } finally {
    lock(form, false);
  }
}

function lock(form, locked) {
  form.querySelectorAll('input, textarea, button').forEach(b => { b.disabled = locked; });
  const submit = form.querySelector('[type=submit]');
  if (!submit.dataset.label) submit.dataset.label = submit.textContent;
  submit.textContent = locked ? 'Posting…' : submit.dataset.label;
}

// While a spam timeout is running, the form is locked and shows a countdown.
function showPenalty(form) {
  const box = form.querySelector('.penalty');
  const submit = form.querySelector('[type=submit]');
  clearInterval(form._penaltyTimer);
  const tick = () => {
    const left = penaltyLeft();
    box.hidden = !left;
    submit.disabled = !!left;
    if (left) box.textContent = `Spam protection: you can post again in ${formatWait(left)}.`;
    else clearInterval(form._penaltyTimer);
  };
  tick();
  if (penaltyLeft()) form._penaltyTimer = setInterval(tick, 1000);
}

// Shows an "uploading" progress bar for UPLOAD_SECONDS before the comment is sent.
function fakeUpload(form) {
  return new Promise(resolve => {
    const start = Date.now();
    const up = form.querySelector('.upload');
    up.hidden = false;
    up.querySelector('.upload-text').textContent = form.classList.contains('reply-form') ? 'Uploading your reply…' : 'Uploading your comment…';
    const tick = () => {
      const elapsed = (Date.now() - start) / 1000;
      up.querySelector('.upload-secs').textContent = Math.max(0, Math.ceil(UPLOAD_SECONDS - elapsed)) + 's';
      up.querySelector('.upload-fill').style.width = Math.min(100, (elapsed / UPLOAD_SECONDS) * 100) + '%';
      if (elapsed >= UPLOAD_SECONDS) { clearInterval(timer); resolve(); }
    };
    const timer = setInterval(tick, 250);
    tick();
  });
}
