/**
 * LinkedIn API client
 *
 * Posts content via the LinkedIn Community Management API (rest/posts).
 */

/**
 * Post a text post to LinkedIn.
 *
 * @param accessToken - OAuth 2.0 access token with w_member_social scope
 * @param authorUrn - The author URN (e.g. "urn:li:person:abc123")
 * @param content - The text content of the post
 * @returns The post URN identifier
 */
export async function postToLinkedIn(accessToken: string, authorUrn: string, content: string): Promise<string> {
  const response = await fetch('https://api.linkedin.com/rest/posts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'LinkedIn-Version': '202401',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      author: authorUrn,
      commentary: content,
      visibility: 'PUBLIC',
      distribution: {
        feedDistribution: 'MAIN_FEED',
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: 'PUBLISHED',
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`LinkedIn API error (${response.status}): ${errorBody}`);
  }

  // LinkedIn returns the post URN in the x-restli-id header
  const postUrn = response.headers.get('x-restli-id');

  if (!postUrn) {
    // Fallback: try to parse from response body
    const json = (await response.json()) as { id?: string };
    if (json.id) {
      return json.id;
    }
    throw new Error('LinkedIn API did not return a post URN');
  }

  return postUrn;
}
