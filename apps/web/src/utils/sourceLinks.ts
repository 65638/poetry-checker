const disabledDomains = [
  "wikimedia.org",
  "wikimediafoundation.org",
  "wikipedia.org",
  "wikisource.org",
  "wiktionary.org",
  "wikiquote.org",
  "wikibooks.org",
  "wikiversity.org",
  "wikivoyage.org",
  "wikinews.org",
  "wikidata.org",
  "mediawiki.org",
  "w.wiki",
];

/** Display policy only: original provenance records remain intact. */
export function sourceLinkUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol)) return null;
    const host = url.hostname.toLowerCase().replace(/\.+$/u, "");
    if (
      disabledDomains.some(
        (domain) => host === domain || host.endsWith(`.${domain}`),
      )
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}
