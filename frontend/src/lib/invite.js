// A friend's invite (from a /r/CODE or ?ref=CODE link), kept in this browser until the visitor signs
// up, so the code is filled in for them. It lapses after 30 days.
const KEY = 'bitevo_invite';
const TTL = 30 * 86400000;

export function saveInvite(code, inviter) {
  try { localStorage.setItem(KEY, JSON.stringify({ code, inviter, at: Date.now() })); } catch { /* private mode */ }
}

export function getInvite() {
  try {
    const invite = JSON.parse(localStorage.getItem(KEY));
    if (invite?.code && Date.now() - invite.at < TTL) return invite;
  } catch { /* nothing saved, or unreadable */ }
  return null;
}

export function clearInvite() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

export const shareLink = code => `${window.location.origin}/r/${code}`;
