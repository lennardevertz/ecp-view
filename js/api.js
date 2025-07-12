// js/api.js

import {
    ECP_API_URL,
    COMMENTS_QUERY,
    COMMENT_FETCH_LIMIT,
    COMMENTS_BY_AUTHOR_QUERY,
    COMMENTS_BY_IDS_QUERY,
} from "./constants.js";

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

export async function fetchCommentsByAuthor(author, cursor = null) {
    try {
        const response = await fetch(ECP_API_URL, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                query: COMMENTS_BY_AUTHOR_QUERY,
                variables: {
                    author: author,
                    limit: COMMENT_FETCH_LIMIT,
                    after: cursor,
                },
            }),
        });
        if (!response.ok) throw new Error(`HTTP error! ${response.status}`);
        const result = await response.json();
        return result.data.comments || {items: [], pageInfo: {}};
    } catch (error) {
        console.error("Error fetching comments by author:", error);
        throw error;
    }
}

export async function fetchCommentsByIds(ids) {
    if (!ids || ids.length === 0) return {items: []};
    try {
        const response = await fetch(ECP_API_URL, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                query: COMMENTS_BY_IDS_QUERY,
                variables: {ids},
            }),
        });
        if (!response.ok) throw new Error(`HTTP error! ${response.status}`);
        const result = await response.json();
        return result.data.comments || {items: []};
    } catch (error) {
        console.error("Error fetching comments by IDs:", error);
        throw error;
    }
}
