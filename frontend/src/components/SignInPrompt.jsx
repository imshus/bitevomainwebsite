import { useAuth } from '../state/auth.jsx';
import { User } from './Icons.jsx';

// Shown on account pages to visitors who aren't signed in.
export default function SignInPrompt({ text }) {
  const { requireLogin } = useAuth();
  return (
    <div className="empty">
      <div className="empty__icon"><User /></div>
      <h3>You’re not signed in</h3>
      <p>{text}</p>
      <button type="button" className="btn btn--red btn--lg" onClick={() => requireLogin()}>Sign in with your phone</button>
    </div>
  );
}
