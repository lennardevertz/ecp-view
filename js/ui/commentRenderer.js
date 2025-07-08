// js/ui/commentRenderer.js

import { MAX_COMMENT_LENGTH, ensProvider } from '../constants.js';

function renderContentWithEmbeds(content, formatters, callbacks) {
    const { formatAddress } = formatters;
    const { onProfileClick } = callbacks;
    const fragment = document.createDocumentFragment();
    
    // Updated regex to also capture standalone .eth names
    const combinedRegex = /(https?:\/\/[^\s]+)|(@(0x[a-fA-F0-9]{40}))|(\b[a-zA-Z0-9-]+\.eth\b)/gi;
    
    const imageRegex = /\.(jpg|jpeg|png|gif|webp)$/i;
    let lastIndex = 0;
    let match;

    while ((match = combinedRegex.exec(content)) !== null) {
        if (match.index > lastIndex) {
            fragment.appendChild(document.createTextNode(content.substring(lastIndex, match.index)));
        }
        const urlMatch = match[1];
        const mentionAddress = match[3];
        const ensNameMatch = match[4]; // New capture group for .eth names

        if (urlMatch) {
            const link = document.createElement('a');
            link.href = urlMatch;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            if (imageRegex.test(urlMatch)) {
                link.title = 'View full-size image';
                const image = document.createElement('img');
                image.src = urlMatch;
                image.alt = 'User-posted image';
                image.classList.add('embedded-image');
                link.appendChild(image);
            } else {
                link.textContent = urlMatch.length > 50 ? urlMatch.substring(0, 47) + '...' : urlMatch;
                link.title = urlMatch;
            }
            fragment.appendChild(link);
        } else if (mentionAddress) {
            const mentionLink = document.createElement("a");
            mentionLink.href = "#";
            mentionLink.classList.add("mention-link");
            const nameHolder = document.createElement("span");
            nameHolder.textContent = formatAddress(mentionAddress, nameHolder);
            mentionLink.appendChild(document.createTextNode("@"));
            mentionLink.appendChild(nameHolder);
            mentionLink.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                onProfileClick(mentionAddress);
            };
            fragment.appendChild(mentionLink);
        } else if (ensNameMatch) {
            // Logic to handle clickable .eth names
            const ensLink = document.createElement("a");
            ensLink.href = "#";
            ensLink.classList.add("mention-link");
            ensLink.textContent = ensNameMatch;

            ensLink.onclick = async (e) => {
                e.preventDefault();
                e.stopPropagation();

                if (ensLink.dataset.resolving === 'true') return;
                ensLink.dataset.resolving = 'true';
                ensLink.style.cursor = 'wait';

                try {
                    const resolvedAddress = await ensProvider.resolveName(ensNameMatch);
                    if (resolvedAddress) {
                        onProfileClick(resolvedAddress);
                    } else {
                        ensLink.title = `Could not resolve ${ensNameMatch}`;
                        ensLink.style.textDecoration = 'line-through';
                        ensLink.style.color = '#95a5a6';
                        ensLink.onclick = (ev) => ev.preventDefault(); // Disable future clicks
                    }
                } catch (error) {
                    console.error(`Failed to resolve ENS name ${ensNameMatch}:`, error);
                    ensLink.title = 'Error during resolution';
                    ensLink.style.textDecoration = 'line-through';
                    ensLink.style.color = '#e74c3c';
                    ensLink.onclick = (ev) => ev.preventDefault();
                } finally {
                    ensLink.style.cursor = 'pointer';
                    delete ensLink.dataset.resolving;
                }
            };
            fragment.appendChild(ensLink);
        }
        
        lastIndex = combinedRegex.lastIndex;
    }
    if (lastIndex < content.length) {
        fragment.appendChild(document.createTextNode(content.substring(lastIndex)));
    }
    return fragment;
}

export function renderComment(comment, config) {
    const { depth, state, formatters, callbacks } = config;
    const { userAddress, isOnCorrectNetwork, likerLists } = state;
    const { formatDate, formatAddress, resolveAndApplyAvatar } = formatters;
    const { onProfileClick, onReply, onLike } = callbacks;

    const commentDiv = document.createElement("div");
    commentDiv.classList.add("comment");
    commentDiv.style.marginLeft = `${depth * 10}px`;

    // Header
    const header = document.createElement("div");
    header.classList.add("comment-header");
    const headerInfoLeft = document.createElement("div");
    headerInfoLeft.classList.add("comment-header-info-left");
    const authorSpan = document.createElement("span");
    authorSpan.classList.add("author");
    const avatarDiv = document.createElement("div");
    avatarDiv.classList.add("author-avatar");
    avatarDiv.style.cursor = "pointer";
    avatarDiv.title = "View Profile";
    avatarDiv.onclick = () => onProfileClick(comment.author);
    resolveAndApplyAvatar(comment.author, avatarDiv);
    const authorDetailsDiv = document.createElement("div");
    authorDetailsDiv.classList.add("author-details");
    const authorLink = document.createElement("a");
    authorLink.classList.add("author-link");
    authorLink.href = `https://basescan.org/address/${comment.author}`;
    authorLink.target = "_blank";
    authorLink.textContent = formatAddress(comment.author, authorLink);
    authorDetailsDiv.appendChild(authorLink);
    if (comment.app.toLowerCase() !== comment.author.toLowerCase()) {
        const appSpan = document.createElement("span");
        appSpan.classList.add("app");
        const appLink = document.createElement("a");
        appLink.href = `https://basescan.org/address/${comment.app}`;
        appLink.target = "_blank";
        appLink.textContent = formatAddress(comment.app, appLink);
        appSpan.append("App: ", appLink);
        authorDetailsDiv.appendChild(appSpan);
    }
    authorSpan.append(avatarDiv, authorDetailsDiv);
    const dateSpan = document.createElement("span");
    dateSpan.classList.add("date");
    dateSpan.textContent = formatDate(comment.createdAt);
    headerInfoLeft.appendChild(authorSpan);
    header.append(headerInfoLeft, dateSpan);
    commentDiv.appendChild(header);

    // Content
    const contentP = document.createElement("p");
    contentP.classList.add("comment-content");
    if (comment.content.length > MAX_COMMENT_LENGTH) {
        const truncatedContent = comment.content.substring(0, MAX_COMMENT_LENGTH) + '...';
        contentP.appendChild(renderContentWithEmbeds(truncatedContent, formatters, callbacks));
        commentDiv.appendChild(contentP);
        const toggleButton = document.createElement('button');
        toggleButton.classList.add('toggle-content-button');
        toggleButton.textContent = 'Show more';
        let isExpanded = false;
        toggleButton.onclick = () => {
            isExpanded = !isExpanded;
            contentP.innerHTML = '';
            if (isExpanded) {
                contentP.appendChild(renderContentWithEmbeds(comment.content, formatters, callbacks));
                toggleButton.textContent = 'Show less';
            } else {
                contentP.appendChild(renderContentWithEmbeds(truncatedContent, formatters, callbacks));
                toggleButton.textContent = 'Show more';
            }
        };
        commentDiv.appendChild(toggleButton);
    } else {
        contentP.appendChild(renderContentWithEmbeds(comment.content, formatters, callbacks));
        commentDiv.appendChild(contentP);
    }

    // Channel, Tx Link
    if (comment.channelId && String(comment.channelId) !== "0") {
        const channelDisplayDiv = document.createElement("div");
        channelDisplayDiv.classList.add("comment-channel-display");
        channelDisplayDiv.textContent = `Channel: ${comment.channelId}`;
        commentDiv.appendChild(channelDisplayDiv);
    }
    if (comment.txHash) {
        const txLinkIcon = document.createElement("a");
        txLinkIcon.classList.add("tx-link-icon");
        txLinkIcon.href = `https://basescan.org/tx/${comment.txHash}`;
        txLinkIcon.target = "_blank";
        txLinkIcon.title = "View Transaction";
        txLinkIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M8.636 3.5a.5.5 0 0 0-.5-.5H1.5A1.5 1.5 0 0 0 0 4.5v10A1.5 1.5 0 0 0 1.5 16h10a1.5 1.5 0 0 0 1.5-1.5V7.864a.5.5 0 0 0-1 0V14.5a.5.5 0 0 1-.5-.5h-10a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5h6.636a.5.5 0 0 0 .5-.5z"/><path fill-rule="evenodd" d="M16 .5a.5.5 0 0 0-.5-.5h-5a.5.5 0 0 0 0 1h3.793L6.146 9.146a.5.5 0 1 0 .708.708L15 1.707V5.5a.5.5 0 0 0 1 0v-5z"/></svg>`;
        commentDiv.appendChild(txLinkIcon);
    }

    // Actions (Like, Reply)
    const likeSectionDiv = document.createElement("div");
    likeSectionDiv.classList.add("like-section");
    const likers = likerLists.get(comment.id) || new Set();
    const tooltipContainer = document.createElement("div");
    tooltipContainer.classList.add("like-tooltip-container");
    const likeCountSpan = document.createElement("span");
    likeCountSpan.classList.add("like-count");
    likeCountSpan.innerHTML = `<img src="https://www.cryptologos.cc/logos/ethereum-eth-logo.svg?v=040" alt="Likes" class="like-icon"> ${likers.size}`;
    tooltipContainer.appendChild(likeCountSpan);
    if (likers.size > 0) {
        const tooltip = document.createElement("div");
        tooltip.classList.add("like-tooltip");
        likers.forEach((likerAddress) => {
            const likerDiv = document.createElement("div");
            likerDiv.classList.add("tooltip-liker");
            likerDiv.textContent = formatAddress(likerAddress, likerDiv);
            tooltip.appendChild(likerDiv);
        });
        tooltipContainer.appendChild(tooltip);
    }
    likeSectionDiv.appendChild(tooltipContainer);

    if (userAddress && isOnCorrectNetwork) {
        const likeButton = document.createElement("button");
        likeButton.classList.add("action-button");
        likeButton.textContent = "Like";
        likeButton.onclick = async () => {
            likeButton.disabled = true;
            likeButton.textContent = "Liking...";
            const success = await onLike(comment);
            if (!success) {
                likeButton.textContent = "Like";
                likeButton.disabled = false;
            }
        };
        likeSectionDiv.appendChild(likeButton);

        const replyButton = document.createElement("button");
        replyButton.classList.add("action-button");
        replyButton.textContent = "Reply";
        likeSectionDiv.appendChild(replyButton);

        const replyFormDiv = document.createElement("div");
        replyFormDiv.classList.add("reply-form");
        replyFormDiv.style.display = "none";
        replyFormDiv.innerHTML = `
            <textarea placeholder="Write your reply..." rows="2"></textarea>
            <button class="submit-reply-button">Post Reply</button>
            <button class="cancel-reply-button">Cancel</button>
            <p class="status-message reply-status-message"></p>`;
        commentDiv.appendChild(replyFormDiv);

        const replyTextarea = replyFormDiv.querySelector("textarea");
        const submitReplyBtn = replyFormDiv.querySelector(".submit-reply-button");
        const cancelReplyBtn = replyFormDiv.querySelector(".cancel-reply-button");
        const replyStatusMsgElement = replyFormDiv.querySelector(".reply-status-message");

        replyButton.onclick = () => {
            const isVisible = replyFormDiv.style.display === "block";
            replyFormDiv.style.display = isVisible ? "none" : "block";
            likeSectionDiv.style.display = isVisible ? "flex" : "none";
        };
        cancelReplyBtn.onclick = () => {
            replyFormDiv.style.display = "none";
            likeSectionDiv.style.display = "flex";
            replyTextarea.value = "";
        };
        submitReplyBtn.onclick = async () => {
            submitReplyBtn.disabled = true;
            cancelReplyBtn.disabled = true;
            const success = await onReply(comment, replyTextarea.value, replyStatusMsgElement);
            if (success) {
                replyTextarea.value = "";
                replyFormDiv.style.display = "none";
                likeSectionDiv.style.display = "flex";
            }
            submitReplyBtn.disabled = false;
            cancelReplyBtn.disabled = false;
        };
    }
    commentDiv.appendChild(likeSectionDiv);

    // Children
    if (comment.children && comment.children.length > 0) {
        const toggleButton = document.createElement("button");
        toggleButton.classList.add("toggle-replies");
        toggleButton.textContent = `[-] Hide Replies (${comment.children.length})`;
        commentDiv.appendChild(toggleButton);
        const childrenContainer = document.createElement("div");
        childrenContainer.classList.add("comment-children");
        comment.children.forEach((reply) => {
            const childConfig = { ...config, depth: depth + 1 };
            childrenContainer.appendChild(renderComment(reply, childConfig));
        });
        commentDiv.appendChild(childrenContainer);
        toggleButton.onclick = () => {
            const isHidden = childrenContainer.classList.toggle("hidden");
            toggleButton.textContent = isHidden ? `[+] Show Replies (${comment.children.length})` : `[-] Hide Replies (${comment.children.length})`;
        };
    }
    return commentDiv;
}
