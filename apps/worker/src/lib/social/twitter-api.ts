/**
 * Twitter/X API v2 client
 *
 * Posts tweets via the Twitter API v2 endpoint using Bearer token auth.
 */

export type TweetResponse = {
  id: string;
  text: string;
};

/**
 * Post a tweet using the Twitter API v2.
 *
 * @param accessToken - OAuth 2.0 Bearer token with tweet.write scope
 * @param content - The text content of the tweet (max 280 characters)
 * @returns The created tweet's id and text
 */
export async function postTweet(accessToken: string, content: string): Promise<TweetResponse> {
  const response = await fetch('https://api.twitter.com/2/tweets', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ text: content }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Twitter API error (${response.status}): ${errorBody}`);
  }

  const json = (await response.json()) as { data: { id: string; text: string } };

  return {
    id: json.data.id,
    text: json.data.text,
  };
}
