// Offline-first SPA: IndexedDB is the source of truth, so nothing renders on
// a server. adapter-static's index.html fallback serves every route.
export const ssr = false;
export const prerender = false;
