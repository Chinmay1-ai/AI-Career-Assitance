export async function requestInterviewApi(path, getToken, options = {}) {
  const token = await getToken();
  if (!token) {
    throw new Error('Sign in is required to use mock interviews.');
  }

  const headers = new Headers(options.headers ?? {});
  headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(path, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'The interview request failed.');
  }
  return data;
}

export function getMessage(error, fallback) {
  return error instanceof Error ? error.message : fallback;
}
