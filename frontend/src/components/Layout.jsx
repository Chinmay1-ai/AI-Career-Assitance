import { Link, NavLink } from 'react-router-dom';
import { Show, SignInButton, UserButton } from '@clerk/react';
import InterviewIcon from './InterviewIcon.jsx';
import { isClerkConfigured } from '../providers/ClerkAuthProvider.jsx';

export default function Layout({ children }) {
  const clerkReady = isClerkConfigured();

  return (
    <div className="layout">
      <header className="site-header">
        <Link to="/" className="brand" aria-label="AI Career Assistant home">
          <span className="brand-mark"><InterviewIcon name="spark" size={16} /></span>
          <span>AI Career Assistant</span>
        </Link>
        <nav className="site-nav">
          <NavLink to="/" end>
            <InterviewIcon name="dashboard" size={15} /> Home
          </NavLink>
          <NavLink to="/dashboard"><InterviewIcon name="chart" size={15} /> Dashboard</NavLink>
          {clerkReady && (
            <>
              <Show when="signed-out">
                <SignInButton mode="modal">
                  <button type="button" className="btn btn-ghost">
                    Sign in
                  </button>
                </SignInButton>
              </Show>
              <Show when="signed-in">
                <UserButton afterSignOutUrl="/" />
              </Show>
            </>
          )}
        </nav>
      </header>
      <main className="site-main">{children}</main>
      <footer className="site-footer">
        <p>AI Career Assistant · Resume insights and interview practice</p>
      </footer>
    </div>
  );
}
