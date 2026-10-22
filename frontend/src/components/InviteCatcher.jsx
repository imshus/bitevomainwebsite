// Invite links: bitevo.in/r/CODE (what customers share) and ?ref=CODE on any page. The code is kept in
// the browser and filled in when the visitor signs up. Someone already signed in who hasn't ordered
// yet gets it applied straight away.
import { useEffect, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../state/auth.jsx';
import { useToast } from '../state/toast.jsx';
import { saveInvite, getInvite, clearInvite } from '../lib/invite.js';

function useCatch() {
  const toast = useToast();
  return code => api.referralLookup(code).then(
    ({ code: valid, inviter }) => {
      saveInvite(valid, inviter);
      toast(`${inviter} invited you to BiteVo! Sign in to join.`);
    },
    () => toast('That invite link isn’t valid any more.', 'error'),
  );
}

// The /r/CODE page: remembers the invite, then shows the menu.
export function InviteRoute() {
  const { code } = useParams();
  const navigate = useNavigate();
  const catchInvite = useCatch();
  const done = useRef('');
  useEffect(() => {
    if (done.current === code) return; // effects run twice in development
    done.current = code;
    catchInvite(code).finally(() => navigate('/', { replace: true }));
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export default function InviteCatcher() {
  const { search, pathname, hash } = useLocation();
  const navigate = useNavigate();
  const { customer, ready } = useAuth();
  const toast = useToast();
  const catchInvite = useCatch();

  // ?ref=CODE: remember it and take it out of the address bar.
  useEffect(() => {
    const params = new URLSearchParams(search);
    const code = params.get('ref');
    if (!code) return;
    params.delete('ref');
    const rest = params.toString();
    navigate({ pathname, search: rest ? `?${rest}` : '', hash }, { replace: true });
    catchInvite(code);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  // Signed in (with a name) and holding an invite: use it if they're still eligible, else drop it.
  useEffect(() => {
    if (!ready || !customer?.name) return;
    const invite = getInvite();
    if (!invite) return;
    clearInvite();
    api.applyReferral(invite.code).then(
      () => toast(`You joined with ${invite.inviter}’s invite. Enjoy your first order!`),
      () => {}, // already ordered, or already used a code: nothing to do
    );
  }, [ready, customer?._id, customer?.name, search]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
