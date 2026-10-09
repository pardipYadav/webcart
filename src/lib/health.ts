export function messageIndex(dateKey: string, length: number) {
  let hash = 0;
  for (let i = 0; i < dateKey.length; i += 1) {
    hash = (hash * 33 + dateKey.charCodeAt(i)) >>> 0;
  }
  return length === 0 ? 0 : hash % length;
}

export function messageForDate(messages: readonly string[], dateKey: string) {
  if (messages.length === 0) return "A healthy breakfast is a good place to start.";
  return messages[messageIndex(dateKey, messages.length)] ?? messages[0];
}
