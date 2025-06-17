let allFetchedComments = [];
let currentChannelFilter = null; // null for 'All Comments', 0 for 'No Channel', channelId for specific channel

document.addEventListener("DOMContentLoaded", () => {
    const refreshButton = document.getElementById("refresh-button");
    const commentsContainer = document.getElementById("comments-container");
    const logoElement = document.getElementById("logo"); // Get logo element
    const burgerMenuButton = document.getElementById("burger-menu-button");
    const channelMenu = document.getElementById("channel-menu"); // Get the channel menu itself

    const ECP_API_URL = "https://api.ethcomments.xyz/";
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
                txHash
            }
        }
    }`;

    if (burgerMenuButton && channelMenu) {
        burgerMenuButton.addEventListener("click", () => {
            channelMenu.classList.toggle("open");
            burgerMenuButton.classList.toggle("open");
            const isExpanded = channelMenu.classList.contains("open");
            burgerMenuButton.setAttribute("aria-expanded", isExpanded);
            document.body.classList.toggle("menu-open-overlay", isExpanded);
        });
    } else {
        if (!burgerMenuButton) console.warn("Burger menu button not found.");
        if (!channelMenu)
            console.warn(
                "Channel menu element not found for burger functionality."
            );
    }

    function showLoadingMessage(message = "Loading comments...") {
        commentsContainer.innerHTML = `<p class="loading-message">${message}</p>`;
    }

    function showErrorMessage(
        message = "Error loading comments. Please try again."
    ) {
        commentsContainer.innerHTML = `<p class="error-message">${message}</p>`;
    }

    function showNoCommentsMessage(message = "No comments found.") {
        commentsContainer.innerHTML = `<p class="no-comments-message">${message}</p>`;
    }

    async function fetchComments() {
        try {
            const response = await fetch(ECP_API_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
                body: JSON.stringify({query: COMMENTS_QUERY}),
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
            return result.data.comments.items || [];
        } catch (error) {
            console.error("Error fetching comments:", error);
            throw error; // Re-throw to be caught
        }
    }

    function buildCommentTree(comments) {
        const commentMap = new Map();
        comments.forEach((comment) => {
            comment.children = [];
            commentMap.set(comment.id, comment);
        });

        const tree = [];
        comments.forEach((comment) => {
            if (comment.parentId && commentMap.has(comment.parentId)) {
                const parent = commentMap.get(comment.parentId);
                parent.children.push(comment);
            } else {
                tree.push(comment); // Add to root if no parentId or parent not found in this batch
            }
        });

        // Sort root comments and children by createdAt (newest first)
        const sortByDate = (a, b) =>
            parseInt(b.createdAt) - parseInt(a.createdAt);
        tree.sort(sortByDate);
        comments.forEach((comment) => {
            if (comment.children.length > 0) {
                comment.children.sort(sortByDate);
            }
        });

        return tree;
    }

    function formatAddress(address) {
        if (!address || address.length < 10) return address;
        return `${address.substring(0, 6)}...${address.substring(
            address.length - 4
        )}`;
    }

    function formatDate(timestamp) {
        if (!timestamp) return "Unknown date";
        return new Date(parseInt(timestamp)).toLocaleString();
    }

    function renderComment(comment, depth = 0) {
        const commentDiv = document.createElement("div");
        commentDiv.classList.add("comment");
        commentDiv.style.marginLeft = `${depth * 10}px`; // Indentation for replies

        const header = document.createElement("div");
        header.classList.add("comment-header");

        const headerInfoLeft = document.createElement("div");
        headerInfoLeft.classList.add("comment-header-info-left");

        const authorLink = document.createElement("a");
        authorLink.href = `https://etherscan.io/address/${comment.author}`;
        authorLink.target = "_blank";
        authorLink.textContent = formatAddress(comment.author);
        const authorSpan = document.createElement("span");
        authorSpan.classList.add("author");
        authorSpan.innerHTML = `<strong>Author:</strong> `;
        authorSpan.appendChild(authorLink);

        const appLink = document.createElement("a");
        appLink.href = `https://etherscan.io/address/${comment.app}`;
        appLink.target = "_blank";
        appLink.textContent = formatAddress(comment.app);
        const appSpan = document.createElement("span");
        appSpan.classList.add("app");
        appSpan.innerHTML = `<strong>App:</strong> `;
        appSpan.appendChild(appLink);

        const dateSpan = document.createElement("span");
        dateSpan.classList.add("date");
        dateSpan.textContent = formatDate(comment.createdAt);

        headerInfoLeft.appendChild(authorSpan);
        headerInfoLeft.appendChild(appSpan);

        header.appendChild(headerInfoLeft);
        header.appendChild(dateSpan);

        commentDiv.appendChild(header);

        const contentP = document.createElement("p");
        contentP.classList.add("comment-content");
        contentP.textContent = comment.content;
        commentDiv.appendChild(contentP);

        if (comment.channelId && String(comment.channelId) !== "0") {
            const channelDisplayDiv = document.createElement("div");
            channelDisplayDiv.classList.add("comment-channel-display");
            channelDisplayDiv.textContent = `Channel: ${comment.channelId}`;
            commentDiv.appendChild(channelDisplayDiv);
        }

        // Add Transaction Hash Link
        if (comment.txHash) {
            const txLinkDiv = document.createElement("div");
            txLinkDiv.classList.add("comment-tx-link"); // For styling

            const txLink = document.createElement("a");
            txLink.href = `https://sepolia.basescan.org/tx/${comment.txHash}`;
            txLink.target = "_blank"; // Open in new tab
            txLink.rel = "noopener noreferrer"; // Security best practice
            txLink.textContent = "View Transaction"; // Or formatAddress(comment.txHash)

            txLinkDiv.appendChild(txLink);
            commentDiv.appendChild(txLinkDiv);
        }

        if (comment.children && comment.children.length > 0) {
            const toggleButton = document.createElement("button");
            toggleButton.classList.add("toggle-replies");
            toggleButton.textContent = `[-] Hide Replies (${comment.children.length})`;
            commentDiv.appendChild(toggleButton);

            const childrenContainer = document.createElement("div");
            childrenContainer.classList.add("comment-children");

            comment.children.forEach((reply) => {
                childrenContainer.appendChild(renderComment(reply, depth + 1));
            });
            commentDiv.appendChild(childrenContainer);

            toggleButton.onclick = () => {
                const isHidden = childrenContainer.classList.toggle("hidden");
                toggleButton.textContent = isHidden
                    ? `[+] Show Replies (${comment.children.length})`
                    : `[-] Hide Replies (${comment.children.length})`;
            };
        }
        return commentDiv;
    }

    function handleChannelClick(filterId) {
        displayFilteredComments(filterId);
        // Close burger menu if open on mobile
        if (window.innerWidth <= 768) {
            // Check if on mobile view (matches CSS breakpoint)
            // const burger = document.getElementById("burger-menu-button"); // already defined as burgerMenuButton
            // const menu = document.getElementById("channel-menu"); // already defined as channelMenu
            if (channelMenu && channelMenu.classList.contains("open")) {
                channelMenu.classList.remove("open");
                if (burgerMenuButton) {
                    burgerMenuButton.classList.remove("open");
                    burgerMenuButton.setAttribute("aria-expanded", "false");
                }
                document.body.classList.remove("menu-open-overlay");
            }
        }
    }

    function renderChannelMenu() {
        const channelMenuContainer = document.getElementById("channel-menu");
        if (!channelMenuContainer) {
            console.warn("Channel menu container not found.");
            return;
        }

        channelMenuContainer.innerHTML = ""; // Clear previous menu items

        const menuTitle = document.createElement("h3");
        menuTitle.textContent = "Channels";
        channelMenuContainer.appendChild(menuTitle);

        if (allFetchedComments.length === 0 && currentChannelFilter === null) {
            // If menu is open on mobile and no comments, still show "All Comments" button
            // to allow closing or re-triggering a filter.
            // The logic below will handle adding "All Comments" button.
        }

        const channelIds = new Set();
        let hasNoChannelComments = false;

        allFetchedComments.forEach((comment) => {
            const id = comment.channelId;
            if (
                id === null ||
                id === undefined ||
                id === 0 ||
                String(id) === "0"
            ) {
                hasNoChannelComments = true;
            } else {
                channelIds.add(id);
            }
        });

        const viewAllButton = document.createElement("button");
        viewAllButton.textContent = "All Comments";
        viewAllButton.onclick = () => handleChannelClick(null);
        if (currentChannelFilter === null) {
            viewAllButton.classList.add("active-channel");
        }
        channelMenuContainer.appendChild(viewAllButton);

        if (
            hasNoChannelComments ||
            (allFetchedComments.length > 0 &&
                !channelIds.size &&
                !hasNoChannelComments)
        ) {
            const noChannelButton = document.createElement("button");
            noChannelButton.textContent = "No Channel";
            noChannelButton.onclick = () => handleChannelClick(0);
            if (currentChannelFilter === 0 && currentChannelFilter !== null) {
                noChannelButton.classList.add("active-channel");
            }
            channelMenuContainer.appendChild(noChannelButton);
        }

        const sortedChannelIds = Array.from(channelIds).sort((a, b) => {
            const valA = String(a);
            const valB = String(b);
            const numA = parseFloat(valA);
            const numB = parseFloat(valB);
            if (!isNaN(numA) && !isNaN(numB)) {
                return numA - numB;
            }
            return valA.localeCompare(valB);
        });

        sortedChannelIds.forEach((channelId) => {
            const channelButton = document.createElement("button");
            channelButton.textContent = `Channel: ${channelId}`;
            channelButton.onclick = () => handleChannelClick(channelId);
            if (
                currentChannelFilter !== null &&
                currentChannelFilter !== 0 &&
                String(currentChannelFilter) === String(channelId)
            ) {
                channelButton.classList.add("active-channel");
            }
            channelMenuContainer.appendChild(channelButton);
        });
    }

    function displayFilteredComments(filterChannelId) {
        currentChannelFilter = filterChannelId;

        let commentsToDisplay;
        if (currentChannelFilter === null) {
            // "All Comments"
            commentsToDisplay = allFetchedComments;
        } else if (currentChannelFilter === 0) {
            // "No Channel"
            commentsToDisplay = allFetchedComments.filter(
                (comment) =>
                    comment.channelId === null ||
                    comment.channelId === undefined ||
                    comment.channelId === 0 ||
                    String(comment.channelId) === "0"
            );
        } else {
            // Specific channel
            commentsToDisplay = allFetchedComments.filter(
                (comment) =>
                    String(comment.channelId) === String(currentChannelFilter)
            );
        }

        commentsContainer.innerHTML = ""; // Clear previous comments

        if (commentsToDisplay.length === 0) {
            if (allFetchedComments.length > 0) {
                showNoCommentsMessage("No comments found for this filter.");
            } else {
                showNoCommentsMessage(); // Default "No comments found."
            }
        } else {
            const commentTree = buildCommentTree(commentsToDisplay);
            if (commentTree.length === 0 && commentsToDisplay.length > 0) {
                showNoCommentsMessage(
                    "No root comments for this filter. All matching items might be replies."
                );
            } else {
                commentTree.forEach((comment) => {
                    commentsContainer.appendChild(renderComment(comment));
                });
            }
        }
        renderChannelMenu(); // Update menu to show active filter
    }

    async function initializeCommentsView() {
        showLoadingMessage();
        try {
            const fetchedComments = await fetchComments();
            allFetchedComments = fetchedComments || [];

            if (allFetchedComments.length === 0) {
                showNoCommentsMessage();
                renderChannelMenu();
                return;
            }
            displayFilteredComments(null);
        } catch (error) {
            allFetchedComments = [];
            showErrorMessage(`Failed to load comments: ${error.message}`);
            renderChannelMenu();
        }
    }

    refreshButton.addEventListener("click", initializeCommentsView);

    if (logoElement) {
        logoElement.addEventListener("click", () => {
            // displayFilteredComments(null); // Show all comments
            handleChannelClick(null); // Use handleChannelClick to also close mobile menu if open
        });
    } else {
        console.warn("Logo element with ID 'logo' not found.");
    }

    // Initial load
    initializeCommentsView();
});
