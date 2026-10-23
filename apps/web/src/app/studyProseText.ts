/** Add reading pauses to long unbroken AI prose without rewriting any words or punctuation. */
export function studyProse(text: string): string {
  if (text.length < 260 || /[\r\n]/u.test(text)) return text;
  const sentences = text.match(/[\s\S]*?[。！？]+[”’」』]?|[\s\S]+$/gu) ?? [
    text,
  ];
  if (sentences.join("") !== text) return text;
  const paragraphs: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    current += sentence;
    if (current.length >= 140) {
      paragraphs.push(current);
      current = "";
    }
  }
  if (current) paragraphs.push(current);
  return paragraphs.join("\n\n");
}
