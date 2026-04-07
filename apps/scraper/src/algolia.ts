export interface AlgoliaQueryRequest {
  appId: string;
  apiKey: string;
  indexName: string;
  params: string;
}

export async function queryAlgolia<T>(
  request: AlgoliaQueryRequest,
  fetchImpl: typeof fetch
): Promise<T> {
  const response = await fetchImpl(
    `https://${request.appId}-dsn.algolia.net/1/indexes/*/queries`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-algolia-api-key": request.apiKey,
        "x-algolia-application-id": request.appId
      },
      body: JSON.stringify({
        requests: [
          {
            indexName: request.indexName,
            params: request.params
          }
        ]
      })
    }
  );

  if (!response.ok) {
    throw new Error(`Algolia query failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

