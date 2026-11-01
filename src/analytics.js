// Visit statistics, kept by Umami Cloud (no cookies; the script is in index.html).
// `track` sends one named event, with optional data. It does nothing where the
// script is not there (the dev server, an ad blocker) and never throws: counting
// must not be able to break the picture.

export function track(name, data) {
  try {
    globalThis.umami?.track(name, data)
  } catch {
    // a failing counter is not worth a failing app
  }
}
