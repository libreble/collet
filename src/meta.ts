import { useEffect } from 'react';

function upsert(key: 'name' | 'property', keyVal: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${key}="${keyVal}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(key, keyVal);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function canonical(href: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

// Canonical URLs always point at the public app, also in self-hosted copies (any base path),
// so search engines don't index those as duplicates.
const CANONICAL_ROOT = 'https://libreble.github.io/collet/';

function canonicalFor(pathname: string) {
  const base = import.meta.env.BASE_URL;
  const route = pathname.startsWith(base)
    ? pathname.slice(base.length)
    : pathname.replace(/^\//, '');
  return CANONICAL_ROOT + route;
}

/** Set title + description + Open Graph/Twitter tags for the current route. */
export function useDocumentMeta(title: string, description: string) {
  useEffect(() => {
    document.title = title;
    upsert('name', 'description', description);
    upsert('property', 'og:title', title);
    upsert('property', 'og:description', description);
    upsert('name', 'twitter:title', title);
    upsert('name', 'twitter:description', description);
    canonical(canonicalFor(window.location.pathname));
  }, [title, description]);
}
