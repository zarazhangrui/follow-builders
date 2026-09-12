export function isUsableSourceUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;

    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'youtu.be') return url.pathname.length > 1;
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (url.pathname === '/watch') return Boolean(url.searchParams.get('v'));
      return /^\/(live|shorts)\/[^/]+/.test(url.pathname);
    }

    return true;
  } catch {
    return false;
  }
}

export function filterPodcasts(podcasts, errors) {
  return podcasts.filter(episode => {
    if (isUsableSourceUrl(episode?.url)) return true;

    errors.push(
      `Podcast skipped because it has no direct episode URL: ${episode?.title || episode?.name || 'unknown episode'}`
    );
    return false;
  });
}
