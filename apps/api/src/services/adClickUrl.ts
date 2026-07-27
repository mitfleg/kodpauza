export function appendEridToUrl(value: string, erid: string | null | undefined): string {
  const token = erid?.trim();
  if (!token) {
    return value;
  }

  try {
    const url = new URL(value);
    url.searchParams.set('erid', token);
    return url.toString();
  } catch {
    return value;
  }
}
