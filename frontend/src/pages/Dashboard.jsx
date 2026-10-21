import { Show, SignInButton, useUser } from '@clerk/react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import InterviewIcon from '../components/InterviewIcon.jsx';
import ResumeUpload from '../components/ResumeUpload.jsx';
import { isClerkConfigured } from '../providers/ClerkAuthProvider.jsx';

export default function Dashboard() {
  const clerkReady = isClerkConfigured();
  const { user } = useUser();
  const displayName = user?.firstName?.trim() || user?.fullName?.trim().split(/\s+/)[0] || '';
  const [greeting] = useState(() => {
    const hour = new Date().getHours();
    return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  });

  return (
    <section className="dashboard">
      <header className="dashboard-hero">
        <div>
          <p className="eyebrow"><InterviewIcon name="dashboard" size={15} /> CAREER WORKSPACE</p>
          <h1>{greeting}{displayName ? `, ${displayName}` : ''}</h1>
          <p className="lead">Continue building your interview readiness.</p>
        </div>
        <Link className="btn btn-primary" to="/interviews/new">
          <InterviewIcon name="microphone" size={17} /> Practice interview
        </Link>
      </header>

      <div className="dashboard-cards">
        <a className="card dashboard-module" href="#resume-workspace">
          <span className="dashboard-module-icon"><InterviewIcon name="document" size={19} /></span>
          <span><strong>Resume</strong><small>Upload and analyze your experience</small></span>
          <InterviewIcon name="replay" size={16} />
        </a>
        <a className="card dashboard-module" href="#resume-workspace">
          <span className="dashboard-module-icon module-violet"><InterviewIcon name="target" size={19} /></span>
          <span><strong>Career match</strong><small>Explore roles from your resume analysis</small></span>
          <InterviewIcon name="replay" size={16} />
        </a>
        <a className="card dashboard-module" href="#resume-workspace">
          <span className="dashboard-module-icon module-cyan"><InterviewIcon name="chart" size={19} /></span>
          <span><strong>Skill gap</strong><small>Find learning directions for recommended roles</small></span>
          <InterviewIcon name="replay" size={16} />
        </a>
        <Link className="card dashboard-module" to="/interviews/new">
          <span className="dashboard-module-icon module-green"><InterviewIcon name="microphone" size={19} /></span>
          <span><strong>Mock interview</strong><small>Practice with role-focused questions</small></span>
          <InterviewIcon name="replay" size={16} />
        </Link>
      </div>

      {clerkReady ? (
        <div id="resume-workspace" className="dashboard-workspace">
          <Show when="signed-out">
            <p>Sign in to unlock your personal dashboard.</p>
            <SignInButton mode="modal">
              <button type="button" className="btn btn-primary">
                Sign in with Clerk
              </button>
            </SignInButton>
          </Show>
          <Show when="signed-in">
            <ResumeUpload />
          </Show>
        </div>
      ) : (
        <div id="resume-workspace" className="dashboard-workspace">
          <p className="setup-hint">
            Authentication UI will show here after you configure Clerk.
          </p>
        </div>
      )}
    </section>
  );
}
