export const GENERATED_DESCRIPTION_MAX_LENGTH = 35;

// Qwen sometimes exceeds a requested length. Keep its first complete thought when possible.
export function limitGeneratedDescription(value: string) {
  const characters = Array.from(value.replace(/\s+/g, " ").trim());
  const firstSentenceEnd = characters.findIndex((character) => /[。！？!?]/.test(character));
  if (characters.length <= GENERATED_DESCRIPTION_MAX_LENGTH) {
    return characters.slice(0, firstSentenceEnd >= 0 ? firstSentenceEnd + 1 : undefined).join("");
  }

  if (firstSentenceEnd >= 19 && firstSentenceEnd < GENERATED_DESCRIPTION_MAX_LENGTH) {
    return characters.slice(0, firstSentenceEnd + 1).join("");
  }

  const clauseEnd = characters.slice(20, GENERATED_DESCRIPTION_MAX_LENGTH - 1).findLastIndex((character) => /[，、；：,;:]/.test(character));
  if (clauseEnd >= 0) return `${characters.slice(0, clauseEnd + 20).join("").trimEnd()}。`;

  return `${characters.slice(0, GENERATED_DESCRIPTION_MAX_LENGTH - 1).join("").replace(/[，、；：,;:]$/, "")}。`;
}
