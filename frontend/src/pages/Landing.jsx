import { Link } from 'react-router-dom';
import InterviewIcon from '../components/InterviewIcon.jsx';
import { isClerkConfigured } from '../providers/ClerkAuthProvider.jsx';

export default function Landing() {
  const clerkReady = isClerkConfigured();

  return (
    <section className="hero-section">
      <p className="eyebrow"><InterviewIcon name="spark" size={15} /> AI CAREER PLATFORM</p>
      <h1>Build confidence for your next career move.</h1>
      <p className="lead">
        Turn your resume into actionable career insights, identify skill gaps, and prepare for interviews with focused practice.
      </p>
      <div className="hero-actions">
        <Link to="/dashboard" className="btn btn-primary">
          Open career workspace <span aria-hidden="true">→</span>
        </Link>
      </div>
      {!clerkReady && (
        <p className="setup-hint">
          Clerk is not configured yet. Add{' '}
          <code>VITE_CLERK_PUBLISHABLE_KEY</code> to{' '}
          <code>frontend/.env.local</code> (see project <code>.env.example</code>
          ).
        </p>
      )}
    </section>
  );
}
