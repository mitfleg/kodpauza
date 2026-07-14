export function adDisplayText(value: string): string {
  const source = value.trim();
  const withoutDisclosure = source.replace(/^(?:Реклама|Advertisement)\s*:\s*/i, '').trim();
  return withoutDisclosure || source;
}
