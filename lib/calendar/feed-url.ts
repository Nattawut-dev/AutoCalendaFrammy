export function createFeedUrl(appBaseUrl: string, token: string): string {
  return new URL(`/api/feed/${token}.ics`, appBaseUrl).toString();
}
