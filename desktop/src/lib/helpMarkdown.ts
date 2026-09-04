/**
 * The READMEs open with a centered HTML banner (wordmark image, tagline,
 * language link) that GitHub renders but react-markdown shows as raw tags.
 * Drop that preamble when it is HTML-only, and strip any other inline HTML
 * tags so their text still reads.
 */
export function stripHtmlPreamble(markdown: string): string {
  const lines = markdown.split('\n');
  const firstHeading = lines.findIndex((line) => /^#{1,6}\s/.test(line));
  const preambleIsHtml = firstHeading > 0
    && lines.slice(0, firstHeading).every((line) => line.trim() === '' || line.trim().startsWith('<'));
  const body = preambleIsHtml ? lines.slice(firstHeading) : lines;
  return body.join('\n').replace(/<\/?[a-z][^>]*>/gi, '');
}
