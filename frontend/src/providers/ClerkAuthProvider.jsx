import { ClerkProvider } from '@clerk/react';

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

/**
 * Wraps the app with Clerk when a publishable key is configured.
 * Without a key, children render normally so the UI still works during setup.
 */
export function ClerkAuthProvider({ children }) {
  if (!publishableKey) {
    return children;
  }

  return (
    <ClerkProvider publishableKey={publishableKey} afterSignOutUrl="/">
      {children}
    </ClerkProvider>
  );
}

export function isClerkConfigured() {
  return Boolean(publishableKey);
}
