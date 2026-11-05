// The Letterbox: anonymous reports and article submissions, read by the editors on the Writers' Desk.

const v = Date.now();
const { firestore } = await import(`./format.js?v=${v}`);
const { spamReason, rememberMessage, startPenalty, penaltyLeft, formatWait, PENALTY_MINUTES, cooldownLeft, startCooldown } = await import(`./spam.js?v=${v}`);

const MAX_WORDS = { report: 5000, article: 50000 };
const COOLDOWN_MINUTES = 30;           // time between two Letterbox messages from one browser
const COOLDOWN_KEY = 'norre-letterbox-until';
const DRAFT_KEY = 'norre-letterbox-draft';
const MAX_IMAGES = 10;
const MAX_IMAGE_SIDE = 1600;
const MAX_IMAGE_CHARS = 700000;

const $ = id => document.getElementById(id);
const images = new Map(); // local id -> { data, type }
let fs = null;
let timer = null;

const type = () => document.querySelector('input[name=type]:checked').value;
const countWords = t => (String(t).trim().match(/\S+/g) || []).length;
const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

setUp();

function setUp() {
  restoreDraft();
  document.querySelectorAll('input[name=type]').forEach(r => r.addEventListener('change', () => { applyType(); saveDraft(); }));
  for (const id of ['lb-title', 'lb-name', 'lb-body']) $(id).addEventListener('input', () => { saveDraft(); if (id === 'lb-body') updateCount(); });
  $('lb-add-image').addEventListener('click', () => $('lb-file').click());
  $('lb-file').addEventListener('change', () => { addImages([...$('lb-file').files]); $('lb-file').value = ''; });
  $('lb-body').addEventListener('paste', e => {
    const files = [...(e.clipboardData && e.clipboardData.files || [])].filter(f => f.type.startsWith('image/'));
    if (files.length) { e.preventDefault(); addImages(files); }
  });
  $('lb-body').addEventListener('dragover', e => e.preventDefault());
  $('lb-body').addEventListener('drop', e => {
    const files = [...(e.dataTransfer && e.dataTransfer.files || [])].filter(f => f.type.startsWith('image/'));
    if (files.length) { e.preventDefault(); addImages(files); }
  });
  $('lb-form').addEventListener('submit', e => { e.preventDefault(); send(); });
  applyType();
  updateCount();
  updateWait();
}

function applyType() {
  const t = type();
  const article = t === 'article';
  $('lb-title-label').innerHTML = article ? 'Article title' : 'Subject <small>(optional)</small>';
  $('lb-name-wrap').hidden = !article;
  $('lb-safety').hidden = article;
  $('lb-body-label').textContent = article ? 'Your article' : 'Your report';
  $('lb-body').placeholder = article
    ? 'Write your article here. Use ## for headings, **bold**, *italic* and > for quotes if you like.'
    : 'What happened, where and when? Share as much or as little as you want.';
  updateCount();
}

function updateCount() {
  const n = countWords($('lb-body').value);
  const max = MAX_WORDS[type()];
  $('lb-count').textContent = `${n.toLocaleString('en-GB')} / ${max.toLocaleString('en-GB')} words`;
  $('lb-count').classList.toggle('over', n > max);
}

/* ---------- Draft kept on this device ---------- */

function saveDraft() {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ type: type(), title: $('lb-title').value, name: $('lb-name').value, body: $('lb-body').value }));
  } catch (e) { /* storage full or blocked: ignore */ }
}

function restoreDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY));
    if (!d) return;
    const r = document.querySelector(`input[name=type][value="${d.type === 'article' ? 'article' : 'report'}"]`);
    if (r) r.checked = true;
    $('lb-title').value = d.title || '';
    $('lb-name').value = d.name || '';
    // Image codes can't be restored (pictures aren't saved in the draft), so drop them.
    $('lb-body').value = String(d.body || '').replace(/^!\[[^\]]*\]\(img:[^)]*\)\n?/gm, '');
  } catch (e) { /* ignore */ }
}

/* ---------- Waiting times (30-minute cooldown and 5-minute spam timeout) ---------- */

function updateWait() {
  clearInterval(timer);
  const tick = () => {
    const spam = penaltyLeft();
    const cool = cooldownLeft(COOLDOWN_KEY);
    const left = Math.max(spam, cool);
    $('lb-wait').hidden = !left;
    $('lb-send').disabled = !!left;
    if (spam && spam >= cool) $('lb-wait').textContent = `Spam protection: you can send again in ${formatWait(spam)}.`;
    else if (cool) $('lb-wait').textContent = `To keep the Letterbox tidy, you can send one message every ${COOLDOWN_MINUTES} minutes. Next one in ${formatWait(cool)}.`;
    if (!left) clearInterval(timer);
  };
  tick();
  if (penaltyLeft() || cooldownLeft(COOLDOWN_KEY)) timer = setInterval(tick, 1000);
}

/* ---------- Images ---------- */

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function loadImg(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('this file is not a picture the browser can read'));
    img.src = src;
  });
}

// Shrinks a picture to at most 1600 px and ~700 KB so it can be stored for free.
async function compressImage(file) {
  const original = await readAsDataUrl(file);
  if (file.type === 'image/gif' && original.length <= MAX_IMAGE_CHARS) return { data: original, type: 'image/gif' };
  const img = await loadImg(original);
  let side = MAX_IMAGE_SIDE;
  for (let attempt = 0; attempt < 8; attempt++) {
    const scale = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    const q = Math.max(0.5, 0.85 - attempt * 0.07);
    let data = canvas.toDataURL('image/webp', q), t = 'image/webp';
    if (!data.startsWith('data:image/webp')) { data = canvas.toDataURL('image/jpeg', q); t = 'image/jpeg'; }
    if (data.length <= MAX_IMAGE_CHARS) return { data, type: t };
    side = Math.round(side * 0.8);
  }
  throw new Error('it is too large even after shrinking');
}

async function addImages(files) {
  for (const file of files) {
    if (images.size >= MAX_IMAGES) { $('lb-img-status').textContent = `You can add up to ${MAX_IMAGES} images.`; return; }
    $('lb-img-status').textContent = 'Adding image…';
    try {
      const pic = await compressImage(file);
      const id = newId();
      images.set(id, pic);
      insertAtCursor(`![Caption](img:${id})`);
      addThumb(id, pic.data);
      $('lb-img-status').textContent = 'Image added ✓ You can type a caption in place of "Caption".';
    } catch (err) {
      $('lb-img-status').textContent = `Could not add "${file.name || 'image'}": ${err.message}.`;
    }
  }
}

function insertAtCursor(text) {
  const ta = $('lb-body');
  const start = ta.selectionStart ?? ta.value.length;
  const end = ta.selectionEnd ?? start;
  const before = ta.value.slice(0, start), after = ta.value.slice(end);
  const pre = before && !before.endsWith('\n') ? '\n' : '';
  const post = after.startsWith('\n') ? '' : '\n';
  ta.value = before + pre + text + post + after;
  const s = before.length + pre.length + 2;
  ta.focus();
  ta.setSelectionRange(s, s + 'Caption'.length);
  updateCount();
  saveDraft();
}

function addThumb(id, data) {
  const li = document.createElement('li');
  const img = document.createElement('img');
  img.src = data;
  img.alt = '';
  const rm = document.createElement('button');
  rm.type = 'button';
  rm.className = 'link-btn';
  rm.textContent = 'Remove';
  rm.addEventListener('click', () => {
    images.delete(id);
    li.remove();
    $('lb-body').value = $('lb-body').value.replace(new RegExp('^!\\[[^\\]]*\\]\\(img:' + id + '\\)\\n?', 'gm'), '');
    updateCount();
    saveDraft();
  });
  li.append(img, rm);
  $('lb-thumbs').append(li);
}

/* ---------- Sending ---------- */

async function send() {
  const t = type();
  const title = $('lb-title').value.trim();
  const name = t === 'article' ? $('lb-name').value.trim() : '';
  const body = $('lb-body').value.trim();
  const err = m => { $('lb-error').textContent = m; };
  err('');

  if (penaltyLeft() || cooldownLeft(COOLDOWN_KEY)) return updateWait();
  if (t === 'article' && !title) return err('Please give your article a title.');
  if (countWords(body) < 3) return err('Please write a little more first.');
  const words = countWords(body);
  if (words > MAX_WORDS[t]) return err(`That's ${words.toLocaleString('en-GB')} words. The limit is ${MAX_WORDS[t].toLocaleString('en-GB')}.`);

  const reason = spamReason(body) || (title ? spamReason(title).replace(/^the same message.*/, '') : '');
  if (reason) {
    startPenalty();
    err(`This looks like spam (${reason}), so it wasn't sent. You can try again in ${PENALTY_MINUTES} minutes.`);
    return updateWait();
  }

  // Only send the pictures still used in the text.
  const used = [...images.keys()].filter(id => body.includes(`(img:${id})`));

  $('lb-send').disabled = true;
  $('lb-send').textContent = 'Sending…';
  try {
    fs = fs || await firestore();
    if (!fs) throw new Error('not set up');
    const ref = fs.doc(fs.collection(fs.db, 'submissions'));
    await fs.setDoc(ref, { type: t, title, name, body, imageCount: used.length, status: 'new', createdAt: fs.serverTimestamp() });
    for (let i = 0; i < used.length; i++) {
      $('lb-send').textContent = `Sending image ${i + 1} of ${used.length}…`;
      const pic = images.get(used[i]);
      await fs.setDoc(fs.doc(fs.db, 'submissions', ref.id, 'images', used[i]), { data: pic.data, type: pic.type });
    }
    rememberMessage(body);
    startCooldown(COOLDOWN_KEY, COOLDOWN_MINUTES);
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
    $('lb-form').hidden = true;
    $('lb-done-text').textContent = t === 'article'
      ? 'Thanks for your article! The editors will read it and may get it ready to publish.'
      : 'Thanks for your report. The editors will read it soon.';
    $('lb-done-wait').textContent = `You can send another message in ${COOLDOWN_MINUTES} minutes.`;
    $('lb-done').hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (e) {
    console.error(e);
    err('Your message could not be sent. Check your connection and try again. Your text is still saved here.');
  } finally {
    $('lb-send').textContent = 'Send to the Letterbox';
    $('lb-send').disabled = false;
    updateWait();
  }
}
