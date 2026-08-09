export class HttpError extends Error {
  constructor(message, { backend = 'http', httpStatus = null, url = '', cause } = {}) {
    super(message, { cause });
    this.name = 'HttpError';
    this.backend = backend;
    this.httpStatus = Number.isFinite(httpStatus) ? httpStatus : null;
    this.url = url;
  }
}

export async function fetchJsonStrict(url, {
  backend = 'http',
  fetchImpl = globalThis.fetch,
  headers = {},
  timeoutMs = 15000,
  ...options
} = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': 'follow-builders-digest/1.0',
        ...headers
      }
    });
  } catch (error) {
    throw new HttpError(`${backend} request failed: ${error.message}`, {
      backend,
      url,
      cause: error
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new HttpError(`${backend} returned HTTP ${response.status}`, {
      backend,
      httpStatus: response.status,
      url
    });
  }

  try {
    return {
      data: await response.json(),
      httpStatus: response.status
    };
  } catch (error) {
    throw new HttpError(`${backend} returned invalid JSON`, {
      backend,
      httpStatus: response.status,
      url,
      cause: error
    });
  }
}
