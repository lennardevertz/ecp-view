// js/api.js

import { ECP_API_URL, COMMENTS_QUERY, COMMENT_FETCH_LIMIT } from './constants.js';

export async function fetchComments(cursor = null) {
    try {
        const response = await fetch(ECP_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
            },
            body: JSON.stringify({
                query: COMMENTS_QUERY,
                variables: { limit: COMMENT_FETCH_LIMIT, after: cursor },
            }),
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const result = await response.json();
        if (result.errors) {
            console.error("GraphQL Errors:", result.errors);
            throw new Error(
                `GraphQL error: ${result.errors
                    .map((e) => e.message)
                    .join(", ")}`
            );
        }
        return (
            result.data.comments || {
                items: [],
                pageInfo: { hasNextPage: false, endCursor: null },
            }
        );
    } catch (error) {
        console.error("Error fetching comments:", error);
        throw error;
    }
}
