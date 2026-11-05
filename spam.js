// Simple spam check for comments and Letterbox messages.
//
// It looks for the usual signs of spam: the same message posted again,
// the same word or sentence repeated, long runs of one character, text with
// no spaces, shouting in capitals and lots of links. If a message looks like
// spam, this browser has to wait PENALTY_MINUTES before posting again.
//
// This runs in the reader's browser, so it stops casual spam, not a
// determined attacker. Writers can always delete anything from the Writers' Desk.

export const PENALTY_MINUTES = 5;

const PENALTY_KEY = 'norre-spam-until';
const HISTORY_KEY = 'norre-recent-messages';

function store(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {} }
function read(key, fallback) { try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch (e) { return fallback; } }

const normalise = text => String(text || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// Returns a short reason if the text looks like spam, or '' if it looks fine.
// `others` = messages already on the page (to catch copy-pasted repeats).
export function spamReason(text, others = []) {
  const t = String(text || '').trim();
  const norm = normalise(t);
  if (!norm) return '';

  // 1. The same message posted before (by this browser, or already on the page)
  const recent = read(HISTORY_KEY, []).filter(m => Date.now() - m.at < 24 * 3600 * 1000);
  if (norm.length > 3 && (recent.some(m => m.text === norm) || others.some(o => normalise(o) === norm))) {
    return 'the same message has already been posted';
  }

  // 2. One character repeated over and over (e.g. "!!!!!!!!" or "aaaaaaaa")
  if (/(.)\1{7,}/u.test(t.replace(/\s/g, ' '))) return 'one character repeated too many times';

  // Ignore image codes and links for the spacing checks below
  const prose = t.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/https?:\/\/\S+/g, ' ');

  // 3. Hardly any spaces (keyboard mashing, joined-up junk)
  const words = prose.split(/\s+/).filter(Boolean);
  if (words.some(w => w.length > 40)) return 'a very long word with no spaces';
  const letters = prose.replace(/\s/g, '').length;
  if (letters >= 30 && letters / Math.max(1, words.length) > 18) return 'not enough spaces between words';

  // 4. The same word many times in a row ("buy buy buy buy")
  const ws = norm.split(' ');
  let run = 1;
  for (let i = 1; i < ws.length; i++) {
    run = ws[i] === ws[i - 1] ? run + 1 : 1;
    if (run >= 4) return 'the same word repeated';
  }

  // 5. A short message made of only a few words repeated
  if (ws.length >= 10 && ws.length <= 400 && new Set(ws).size / ws.length < 0.3) return 'the same words repeated';

  // 6. The same sentence three or more times
  const sentences = t.split(/[.!?\n]+/).map(normalise).filter(s => s.length > 15);
  const seen = {};
  for (const s of sentences) if ((seen[s] = (seen[s] || 0) + 1) >= 3) return 'the same sentence repeated';

  // 7. Shouting: long text in capital letters
  const caps = (t.match(/\p{Lu}/gu) || []).length;
  const lower = (t.match(/\p{Ll}/gu) || []).length;
  if (caps + lower > 30 && caps / (caps + lower) > 0.7) return 'too many capital letters';

  // 8. Lots of links
  if ((t.match(/https?:\/\/|www\./gi) || []).length > 3) return 'too many links';

  return '';
}

// Remember a message that was posted, so posting it again counts as a repeat.
export function rememberMessage(text) {
  const recent = read(HISTORY_KEY, []).filter(m => Date.now() - m.at < 24 * 3600 * 1000);
  recent.push({ text: normalise(text), at: Date.now() });
  store(HISTORY_KEY, recent.slice(-30));
}

export function startPenalty() { store(PENALTY_KEY, Date.now() + PENALTY_MINUTES * 60 * 1000); }

// Milliseconds left on the spam penalty (0 = free to post).
export function penaltyLeft() { return Math.max(0, read(PENALTY_KEY, 0) - Date.now()); }

export function formatWait(ms) {
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  return m ? `${m}:${String(s % 60).padStart(2, '0')}` : `${s}s`;
}

// Generic cooldown (e.g. the Letterbox's 30 minutes between sends).
export function cooldownLeft(key) { return Math.max(0, read(key, 0) - Date.now()); }
export function startCooldown(key, minutes) { store(key, Date.now() + minutes * 60 * 1000); }
