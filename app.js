document.addEventListener('DOMContentLoaded', () => {
    const refreshButton = document.getElementById('refresh-button');
    const commentsContainer = document.getElementById('comments-container');

    const ECP_API_URL = 'https://api.ethcomments.xyz/';
    const COMMENTS_QUERY = `query MyQuery {
        comments {
            items {
                id
                app
                author
                channelId
                commentType
                content
                createdAt
                parentId
            }
        }
    }`;

    function showLoadingMessage(message = 'Loading comments...') {
        commentsContainer.innerHTML = `<p class="loading-message">${message}</p>`;
    }

    function showErrorMessage(message = 'Error loading comments. Please try again.') {
        commentsContainer.innerHTML = `<p class="error-message">${message}</p>`;
    }
    
    function showNoCommentsMessage(message = 'No comments found.') {
        commentsContainer.innerHTML = `<p class="no-comments-message">${message}</p>`;
    }

    async function fetchComments() {
        try {
            const response = await fetch(ECP_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({ query: COMMENTS_QUERY })
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const result = await response.json();
            if (result.errors) {
                console.error("GraphQL Errors:", result.errors);
                throw new Error(`GraphQL error: ${result.errors.map(e => e.message).join(', ')}`);
            }
            return result.data.comments.items || [];
        } catch (error) {
            console.error("Error fetching comments:", error);
            throw error; // Re-throw to be caught by displayComments
        }
    }

    function buildCommentTree(comments) {
        const commentMap = new Map();
        comments.forEach(comment => {
            comment.children = [];
            commentMap.set(comment.id, comment);
        });

        const tree = [];
        comments.forEach(comment => {
            if (comment.parentId && commentMap.has(comment.parentId)) {
                const parent = commentMap.get(comment.parentId);
                parent.children.push(comment);
            } else {
                tree.push(comment); // Add to root if no parentId or parent not found in this batch
            }
        });
        
        // Sort root comments and children by createdAt (newest first)
        const sortByDate = (a, b) => parseInt(b.createdAt) - parseInt(a.createdAt);
        tree.sort(sortByDate);
        comments.forEach(comment => {
            if (comment.children.length > 0) {
                comment.children.sort(sortByDate);
            }
        });

        return tree;
    }

    function formatAddress(address) {
        if (!address || address.length < 10) return address;
        return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
    }
    
    function formatDate(timestamp) {
        if (!timestamp) return 'Unknown date';
        return new Date(parseInt(timestamp)).toLocaleString();
    }

    function renderComment(comment, depth = 0) {
        const commentDiv = document.createElement('div');
        commentDiv.classList.add('comment');
        commentDiv.style.marginLeft = `${depth * 10}px`; // Indentation for replies

        const header = document.createElement('div');
        header.classList.add('comment-header');
        
        const authorLink = document.createElement('a');
        authorLink.href = `https://etherscan.io/address/${comment.author}`;
        authorLink.target = '_blank';
        authorLink.textContent = formatAddress(comment.author);
        const authorSpan = document.createElement('span');
        authorSpan.classList.add('author');
        authorSpan.innerHTML = `<strong>Author:</strong> `;
        authorSpan.appendChild(authorLink);

        const appLink = document.createElement('a');
        appLink.href = `https://etherscan.io/address/${comment.app}`;
        appLink.target = '_blank';
        appLink.textContent = formatAddress(comment.app);
        const appSpan = document.createElement('span');
        appSpan.classList.add('app');
        appSpan.innerHTML = `<strong>App:</strong> `;
        appSpan.appendChild(appLink);
        
        const dateSpan = document.createElement('span');
        dateSpan.classList.add('date');
        dateSpan.textContent = `Date: ${formatDate(comment.createdAt)}`;
        
        const channelSpan = document.createElement('span');
        channelSpan.classList.add('channel');
        channelSpan.textContent = `Channel: ${comment.channelId}`;

        header.appendChild(authorSpan);
        header.appendChild(appSpan);
        header.appendChild(dateSpan);
        header.appendChild(channelSpan);

        if (comment.parentId) {
            const parentInfoSpan = document.createElement('span');
            parentInfoSpan.classList.add('parent-info');
            parentInfoSpan.textContent = `(reply to ${formatAddress(comment.parentId)})`;
            header.appendChild(parentInfoSpan);
        }


        commentDiv.appendChild(header);

        const contentP = document.createElement('p');
        contentP.classList.add('comment-content');
        contentP.textContent = comment.content;
        commentDiv.appendChild(contentP);

        if (comment.children && comment.children.length > 0) {
            const toggleButton = document.createElement('button');
            toggleButton.classList.add('toggle-replies');
            toggleButton.textContent = `[-] Hide Replies (${comment.children.length})`;
            commentDiv.appendChild(toggleButton);

            const childrenContainer = document.createElement('div');
            childrenContainer.classList.add('comment-children');
            // childrenContainer.style.display = 'block'; // Default to shown

            comment.children.forEach(reply => {
                childrenContainer.appendChild(renderComment(reply, depth + 1));
            });
            commentDiv.appendChild(childrenContainer);

            toggleButton.onclick = () => {
                const isHidden = childrenContainer.classList.toggle('hidden');
                toggleButton.textContent = isHidden 
                    ? `[+] Show Replies (${comment.children.length})` 
                    : `[-] Hide Replies (${comment.children.length})`;
            };
        }
        return commentDiv;
    }

    async function displayComments() {
        showLoadingMessage();
        try {
            const comments = await fetchComments();
            
            if (!comments || comments.length === 0) {
                showNoCommentsMessage();
                return;
            }

            const commentTree = buildCommentTree(comments);
            commentsContainer.innerHTML = ''; // Clear loading/previous message

            if (commentTree.length === 0) {
                 // This case might happen if all comments are children and their parents are not in the batch,
                 // or if buildCommentTree logic results in no roots.
                showNoCommentsMessage("No root comments to display. All fetched items might be replies.");
                // As a fallback, you could render them flat:
                // comments.forEach(comment => commentsContainer.appendChild(renderComment(comment, 0)));
            } else {
                commentTree.forEach(comment => {
                    commentsContainer.appendChild(renderComment(comment));
                });
            }
        } catch (error) {
            showErrorMessage(`Failed to load comments: ${error.message}`);
        }
    }

    refreshButton.addEventListener('click', displayComments);

    // Initial load
    displayComments();
});
