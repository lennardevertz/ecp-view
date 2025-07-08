// js/ui/index.js

import * as constants from "../constants.js";
import {fetchComments} from "../api.js";
import * as wallet from "../wallet.js";
import {renderComment} from "./commentRenderer.js";

// --- State ---
let allFetchedComments = [];
let currentChannelFilter = null;
let currentProfileFilter = null;
let currentCursor = null;
let hasNextPage = true;
let isLoadingMore = false;
let isInitialLoad = true;
let likerLists = new Map();
let ensCache = new Map();
let pendingEnsLookups = new Map();
let avatarCache = new Map();
let pendingAvatarLookups = new Map();
// Caches for profile view
let followerStatsCache = new Map();
let ensDetailsCache = new Map();
let followStateCache = new Map();
let commonFollowersCache = new Map();

// --- DOM Elements (will be assigned in init) ---
let dom = {};

// --- Utility Functions ---
const sortByDate = (a, b) => parseInt(b.createdAt) - parseInt(a.createdAt);

function buildCommentTree(comments) {
    const commentMap = new Map();
    comments.forEach((comment) => {
        comment.children = [];
        commentMap.set(comment.id, comment);
    });
    const tree = [];
    comments.forEach((comment) => {
        if (comment.parentId && commentMap.has(comment.parentId)) {
            commentMap.get(comment.parentId).children.push(comment);
        } else {
            tree.push(comment);
        }
    });
    tree.sort(sortByDate);
    comments.forEach((comment) => {
        if (comment.children.length > 0) {
            comment.children.sort(sortByDate);
        }
    });
    return tree;
}

function formatAddress(address, elementToUpdate = null) {
    if (!address) return "";
    if (ensCache.has(address)) {
        const cached = ensCache.get(address);
        if (cached !== address) return cached;
    }
    const shortAddress = `${address.substring(0, 6)}...${address.substring(
        address.length - 4
    )}`;
    const resolveAndApplyEns = async () => {
        if (
            !elementToUpdate ||
            !window.ethers.utils.isAddress(address) ||
            pendingEnsLookups.has(address)
        )
            return;
        try {
            const lookupPromise = constants.ensProvider.lookupAddress(address);
            pendingEnsLookups.set(address, lookupPromise);
            const ensName = await lookupPromise;
            if (ensName) {
                ensCache.set(address, ensName);
                elementToUpdate.textContent = ensName;
            } else {
                ensCache.set(address, address);
            }
        } catch (error) {
            console.warn(`ENS lookup failed for ${address}:`, error);
        } finally {
            pendingEnsLookups.delete(address);
        }
    };
    resolveAndApplyEns();
    return shortAddress;
}

async function resolveAndApplyAvatar(address, elementToUpdate) {
    if (!elementToUpdate || !window.ethers.utils.isAddress(address)) return;
    elementToUpdate.style.backgroundImage = "";
    if (avatarCache.has(address)) {
        const cachedUrl = avatarCache.get(address);
        if (cachedUrl && cachedUrl !== address) {
            elementToUpdate.style.backgroundImage = `url('${cachedUrl}')`;
        }
        return;
    }
    if (pendingAvatarLookups.has(address)) return;
    try {
        const lookupPromise = constants.ensProvider.getAvatar(address);
        pendingAvatarLookups.set(address, lookupPromise);
        const avatarUrl = await lookupPromise;
        if (avatarUrl) {
            avatarCache.set(address, avatarUrl);
            elementToUpdate.style.backgroundImage = `url('${avatarUrl}')`;
        } else {
            avatarCache.set(address, address);
        }
    } catch (error) {
        console.warn(`Avatar lookup failed for ${address}:`, error);
    } finally {
        pendingAvatarLookups.delete(address);
    }
}

function formatDate(timestamp) {
    if (!timestamp) return "Unknown date";
    return new Date(parseInt(timestamp)).toLocaleString(undefined, {
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
    });
}

// --- UI Update Functions ---
function showLoadingMessage(message = "Loading comments...") {
    dom.commentsContainer.innerHTML = `<p class="loading-message">${message}</p>`;
}
function showErrorMessage(message = "Error loading comments.") {
    dom.commentsContainer.innerHTML = `<p class="error-message">${message}</p>`;
}
function showNoCommentsMessage(message = "No comments found.") {
    dom.commentsContainer.innerHTML = `<p class="no-comments-message">${message}</p>`;
}
function showPostStatus(
    message,
    isError = false,
    element = dom.postStatusMessage
) {
    element.textContent = message;
    element.style.color = isError ? "red" : "green";
    element.style.display = message ? "block" : "none";
}

function processCommentsAndLikes(comments) {
    const newLikerLists = new Map();
    const contentComments = [];
    comments.forEach((comment) => {
        if (
            comment.commentType === constants.COMMENT_TYPE_REACTION &&
            comment.content === constants.REACTION_CONTENT_LIKE &&
            comment.parentId
        ) {
            if (!newLikerLists.has(comment.parentId)) {
                newLikerLists.set(comment.parentId, new Set());
            }
            newLikerLists.get(comment.parentId).add(comment.author);
        } else {
            contentComments.push(comment);
        }
    });
    return {contentComments, newLikerLists};
}

function displayFilteredComments(filterChannelId) {
    if (filterChannelId !== undefined) {
        currentChannelFilter = filterChannelId;
    }

    let commentsToDisplay;

    if (currentProfileFilter) {
        dom.mentionsContainer.classList.add("hidden");
        dom.commentsContainer.classList.remove("hidden");

        const commentMap = new Map(allFetchedComments.map((c) => [c.id, c]));
        const userComments = allFetchedComments.filter(
            (c) => c.author.toLowerCase() === currentProfileFilter.toLowerCase()
        );
        const finalCommentIds = new Set();

        userComments.forEach((userComment) => {
            finalCommentIds.add(userComment.id);
            let currentParentId = userComment.parentId;
            while (currentParentId && commentMap.has(currentParentId)) {
                finalCommentIds.add(currentParentId);
                const parentComment = commentMap.get(currentParentId);
                currentParentId = parentComment.parentId;
            }
        });

        commentsToDisplay = allFetchedComments.filter((c) =>
            finalCommentIds.has(c.id)
        );
    } else if (currentChannelFilter === null) {
        commentsToDisplay = allFetchedComments;
    } else {
        commentsToDisplay = allFetchedComments.filter(
            (comment) =>
                String(comment.channelId || 0) === String(currentChannelFilter)
        );
    }

    dom.commentsContainer.innerHTML = "";
    if (commentsToDisplay.length === 0) {
        let message = "No comments found for this filter.";
        if (currentProfileFilter) {
            message = "This user has not posted any comments.";
        } else if (allFetchedComments.length === 0) {
            message = "No comments found.";
        }
        showNoCommentsMessage(message);
    } else {
        const commentTree = buildCommentTree(commentsToDisplay);
        if (commentTree.length === 0 && commentsToDisplay.length > 0) {
            showNoCommentsMessage(
                "This user has not made any top-level posts (all comments are replies)."
            );
        } else {
            commentTree.forEach((comment) => {
                dom.commentsContainer.appendChild(
                    createCommentElement(comment, 0)
                );
            });
        }
    }
    renderChannelMenu();
}

function renderChannelMenu() {
    dom.channelMenu.innerHTML = "<h3>Channels</h3>";

    const channelIds = new Set();
    let hasNoChannelComments = false;
    allFetchedComments.forEach((comment) => {
        const id = comment.channelId;
        if (id === null || id === undefined || id === 0 || String(id) === "0") {
            hasNoChannelComments = true;
        } else {
            channelIds.add(id);
        }
    });

    const createButton = (text, filterId) => {
        const button = document.createElement("button");
        button.textContent = text;
        button.onclick = () => handleChannelClick(filterId);
        if (currentChannelFilter === filterId) {
            button.classList.add("active-channel");
        }
        return button;
    };

    dom.channelMenu.appendChild(createButton("All Comments", null));

    if (
        hasNoChannelComments ||
        (allFetchedComments.length > 0 &&
            !channelIds.size &&
            !hasNoChannelComments)
    ) {
        const noChannelButton = createButton("No Channel", 0);
        if (currentChannelFilter === 0 && currentChannelFilter !== null) {
            noChannelButton.classList.add("active-channel");
        }
        dom.channelMenu.appendChild(noChannelButton);
    }

    const sortedChannelIds = Array.from(channelIds).sort((a, b) => {
        const valA = String(a);
        const valB = String(b);
        const numA = parseFloat(valA);
        const numB = parseFloat(valB);
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        return valA.localeCompare(valB);
    });

    sortedChannelIds.forEach((id) => {
        const channelButton = createButton(`Channel: ${id}`, id);
        if (
            currentChannelFilter !== null &&
            currentChannelFilter !== 0 &&
            String(currentChannelFilter) === String(id)
        ) {
            channelButton.classList.add("active-channel");
        }
        dom.channelMenu.appendChild(channelButton);
    });
}

function updateNewCommentAreaVisibility() {
    const isConnected =
        wallet.getUserAddress() && wallet.getIsOnCorrectNetwork();
    const isPostableContext =
        !currentProfileFilter ||
        (currentProfileFilter &&
            wallet.getUserAddress() &&
            currentProfileFilter.toLowerCase() ===
                wallet.getUserAddress().toLowerCase());
    dom.newCommentArea.style.display =
        isConnected && isPostableContext ? "block" : "none";
}

function hideUserProfile() {
    currentProfileFilter = null;
    dom.profileViewHeader.classList.add("hidden");
    dom.profileViewTabs.classList.add("hidden");
    dom.mentionsContainer.classList.add("hidden");
    dom.commonFollowersSection.classList.add("hidden");
    dom.profileViewDescription.classList.add("hidden");
    dom.profileViewSocials.classList.add("hidden");
    dom.followButton.classList.add("hidden");
    dom.profileFollowState.classList.add("hidden");
    displayFilteredComments(currentChannelFilter);
    updateNewCommentAreaVisibility();
}

function showUserProfile(authorAddress) {
    currentProfileFilter = authorAddress;
    currentChannelFilter = null;
    dom.profileViewName.textContent = formatAddress(
        authorAddress,
        dom.profileViewName
    );
    resolveAndApplyAvatar(authorAddress, dom.profileViewAvatar);
    dom.profileViewHeader.classList.remove("hidden");
    dom.profileViewTabs.classList.remove("hidden");
    dom.profileCommentsTab.classList.add("active");
    dom.profileMentionsTab.classList.remove("active");

    dom.profileCommentsTab.onclick = () => {
        dom.profileCommentsTab.classList.add("active");
        dom.profileMentionsTab.classList.remove("active");
        displayFilteredComments();
    };
    dom.profileMentionsTab.onclick = () => {
        dom.profileCommentsTab.classList.remove("active");
        dom.profileMentionsTab.classList.add("active");
        displayProfileMentions();
    };

    displayFilteredComments();
    updateNewCommentAreaVisibility();

    fetchAndDisplayFollowerStats(authorAddress);
    fetchAndDisplayEnsDetails(authorAddress);
    const viewerAddress = wallet.getUserAddress();
    if (
        viewerAddress &&
        viewerAddress.toLowerCase() !== authorAddress.toLowerCase()
    ) {
        fetchAndDisplayFollowState(authorAddress, viewerAddress);
        fetchAndDisplayCommonFollowers(authorAddress, viewerAddress);
    } else {
        dom.followButton.classList.add("hidden");
        dom.commonFollowersSection.classList.add("hidden");
    }
}

function createCommentElement(comment, depth) {
    const config = {
        depth,
        state: {
            userAddress: wallet.getUserAddress(),
            isOnCorrectNetwork: wallet.getIsOnCorrectNetwork(),
            likerLists,
        },
        formatters: {formatDate, formatAddress, resolveAndApplyAvatar},
        callbacks: {
            onProfileClick: showUserProfile,
            onReply: async (parentComment, content, statusElement) => {
                try {
                    await wallet.submitEcpComment(
                        content,
                        parentComment.channelId,
                        parentComment.id,
                        statusElement,
                        showPostStatus
                    );
                    return true;
                } catch {
                    return false;
                }
            },
            onLike: async (parentComment) => {
                try {
                    await wallet.submitEcpComment(
                        constants.REACTION_CONTENT_LIKE,
                        parentComment.channelId,
                        parentComment.id,
                        dom.postStatusMessage,
                        showPostStatus,
                        constants.COMMENT_TYPE_REACTION
                    );
                    return true;
                } catch {
                    return false;
                }
            },
        },
    };
    return renderComment(comment, config);
}

async function loadMoreComments() {
    if (!hasNextPage || isLoadingMore) return;
    isLoadingMore = true;
    dom.refreshButton.classList.add("loading");
    try {
        const {items: newRawComments, pageInfo} = await fetchComments(
            currentCursor
        );
        if (newRawComments && newRawComments.length > 0) {
            const {contentComments: newContentComments, newLikerLists} =
                processCommentsAndLikes(newRawComments);

            // Merge liker lists
            newLikerLists.forEach((value, key) => {
                if (likerLists.has(key)) {
                    value.forEach((liker) => likerLists.get(key).add(liker));
                } else {
                    likerLists.set(key, value);
                }
            });

            allFetchedComments.push(...newContentComments);
            currentCursor = pageInfo.endCursor;
            hasNextPage = pageInfo.hasNextPage;
            const newCommentTree = buildCommentTree(newContentComments);
            newCommentTree.forEach((comment) => {
                dom.commentsContainer.appendChild(
                    createCommentElement(comment, 0)
                );
            });
        } else {
            hasNextPage = false;
        }
    } catch (error) {
        console.error("Error loading more comments:", error);
    } finally {
        isLoadingMore = false;
        dom.refreshButton.classList.remove("loading");
    }
}

async function initializeCommentsView() {
    const wasInitialLoad = isInitialLoad;
    if (wasInitialLoad) showLoadingMessage();
    else dom.refreshButton.classList.add("loading");

    currentCursor = null;
    hasNextPage = true;
    isLoadingMore = false;
    allFetchedComments = [];
    likerLists.clear();

    try {
        const {items: rawFetchedComments, pageInfo} = await fetchComments();
        const {contentComments, newLikerLists} = processCommentsAndLikes(
            rawFetchedComments || []
        );
        likerLists = newLikerLists;
        allFetchedComments = contentComments;
        currentCursor = pageInfo.endCursor;
        hasNextPage = pageInfo.hasNextPage;

        if (allFetchedComments.length === 0) {
            showNoCommentsMessage("No comments found.");
            renderChannelMenu();
        } else {
            displayFilteredComments(currentChannelFilter);
        }
        if (wasInitialLoad) isInitialLoad = false;
    } catch (error) {
        if (wasInitialLoad)
            showErrorMessage(`Failed to load comments: ${error.message}`);
        else console.error("Background refresh failed:", error);
    } finally {
        if (!wasInitialLoad) dom.refreshButton.classList.remove("loading");
    }
}

// --- Profile View Specific Functions ---
function updateFollowerStatsUI(stats) {
    if (
        stats &&
        stats.followers_count !== undefined &&
        stats.following_count !== undefined
    ) {
        dom.profileFollowers.textContent = `${stats.followers_count} Followers`;
        dom.profileFollowing.textContent = `${stats.following_count} Following`;
        dom.profileViewStats.classList.remove("hidden");
    } else {
        dom.profileViewStats.classList.add("hidden");
    }
}
async function fetchAndDisplayFollowerStats(address) {
    updateFollowerStatsUI(null);
    if (followerStatsCache.has(address)) {
        updateFollowerStatsUI(followerStatsCache.get(address));
        return;
    }
    try {
        const response = await fetch(
            `https://api.ethfollow.xyz/api/v1/users/${address}/stats`
        );
        if (!response.ok)
            throw new Error(`API returned status ${response.status}`);
        const stats = await response.json();
        followerStatsCache.set(address, stats);
        updateFollowerStatsUI(stats);
    } catch (error) {
        console.warn(
            `Could not fetch follower stats for ${address}:`,
            error.message
        );
        followerStatsCache.set(address, null);
        updateFollowerStatsUI(null);
    }
}

function updateEnsDetailsUI(data) {
    const description = data?.ens?.records?.description;
    if (description) {
        dom.profileViewDescription.textContent = description;
        dom.profileViewDescription.classList.remove("hidden");
    } else {
        dom.profileViewDescription.classList.add("hidden");
    }
    const socials = {
        twitter: data?.ens?.records?.["com.twitter"],
        github: data?.ens?.records?.["com.github"],
        discord: data?.ens?.records?.["com.discord"],
    };
    const socialIcons = {
        twitter: `<svg viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`,
        github: `<svg viewBox="0 0 24 24"><path d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.95 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.85-2.34 4.7-4.57 4.94.36.31.68.92.68 1.85v2.72c0 .27.18.58.69.48A10 10 0 0 0 22 12 10 10 0 0 0 12 2Z"/></svg>`,
        discord: `<svg viewBox="0 0 24 24"><path d="M20.317 4.369a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.443.805-.61 1.249a18.58 18.58 0 0 0-5.488 0 18.18 18.18 0 0 0-.61-1.249.074.074 0 0 0-.078-.037A19.791 19.791 0 0 0 3.683 4.37a.07.07 0 0 0-.034.044c-1.429 5.2-1.107 9.6.324 13.024a.074.074 0 0 0 .043.058 21.47 21.47 0 0 0 5.223 2.433.074.074 0 0 0 .086-.023c.33-.24.63-.516.89-.814a.074.074 0 0 0-.02-.11c-1.21-.88-2.22-2.04-2.87-3.446a.074.074 0 0 1 .004-.08c.48-.39.93-.82 1.33-1.284a.074.074 0 0 1 .08-.01c3.47 1.57 7.15 1.57 10.64 0a.074.074 0 0 1 .08.01c.4.46.85.89 1.33 1.284a.074.074 0 0 1 .004.08c-.65 1.4-1.66 2.56-2.87 3.446a.074.074 0 0 0-.02.11c.26.3.56.57.89.814a.074.074 0 0 0 .086.023 21.47 21.47 0 0 0 5.223-2.433.074.074 0 0 0 .043-.058c1.43-3.42.75-7.82-.32-13.02a.07.07 0 0 0-.03-.045zM8.02 15.33c-1.18 0-2.15-1.08-2.15-2.42s.97-2.42 2.15-2.42c1.19 0 2.15 1.08 2.15 2.42s-.96 2.42-2.15 2.42zm7.96 0c-1.18 0-2.15-1.08-2.15-2.42s.97-2.42 2.15-2.42c1.19 0 2.15 1.08 2.15 2.42s-.96 2.42-2.15 2.42z"/></svg>`,
    };
    dom.profileViewSocials.innerHTML = "";
    let hasSocials = false;
    for (const [key, value] of Object.entries(socials)) {
        if (value) {
            hasSocials = true;
            const link = document.createElement("a");
            link.href =
                key === "twitter"
                    ? `https://twitter.com/${value}`
                    : key === "github"
                    ? `https://github.com/${value}`
                    : "#";
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.title = `${key}: ${value}`;
            link.innerHTML = socialIcons[key];
            dom.profileViewSocials.appendChild(link);
        }
    }
    dom.profileViewSocials.classList.toggle("hidden", !hasSocials);
}
async function fetchAndDisplayEnsDetails(address) {
    if (ensDetailsCache.has(address)) {
        updateEnsDetailsUI(ensDetailsCache.get(address));
        return;
    }
    try {
        const response = await fetch(
            `https://api.ethfollow.xyz/api/v1/users/${address}/ens`
        );
        if (!response.ok) throw new Error(`API error ${response.status}`);
        const data = await response.json();
        ensDetailsCache.set(address, data);
        updateEnsDetailsUI(data);
    } catch (error) {
        console.warn(`Could not fetch ENS details for ${address}:`, error);
        ensDetailsCache.set(address, null);
        updateEnsDetailsUI(null);
    }
}

function updateFollowStateUI(state) {
    if (state) {
        if (state.follow) {
            dom.profileFollowState.textContent = "Following";
            dom.profileFollowState.classList.remove("hidden");
            dom.followButton.classList.add("hidden");
        } else {
            dom.profileFollowState.classList.add("hidden");
        }
    } else {
        dom.followButton.classList.add("hidden");
        dom.profileFollowState.classList.add("hidden");
    }
}
async function fetchAndDisplayFollowState(profileAddress, viewerAddress) {
    if (!viewerAddress) {
        updateFollowStateUI(null);
        return;
    }
    const cacheKey = `${profileAddress}-${viewerAddress}`;
    if (followStateCache.has(cacheKey)) {
        updateFollowStateUI(followStateCache.get(cacheKey));
        return;
    }
    try {
        const response = await fetch(
            `https://api.ethfollow.xyz/api/v1/users/${profileAddress}/${viewerAddress}/followerState`
        );
        if (!response.ok) throw new Error(`API error ${response.status}`);
        const data = await response.json();
        followStateCache.set(cacheKey, data.state);
        updateFollowStateUI(data.state);
    } catch (error) {
        console.warn(`Could not fetch follow state:`, error);
        followStateCache.set(cacheKey, null);
        updateFollowStateUI(null);
    }
}

function updateCommonFollowersUI(data) {
    dom.commonFollowersList.innerHTML = "";
    if (data && data.results && data.results.length > 0) {
        data.results.slice(0, 10).forEach((follower) => {
            const item = document.createElement("div");
            item.classList.add("common-follower-item");
            item.innerHTML = `<div class="author-avatar"></div><span>${
                follower.name || formatAddress(follower.address)
            }</span>`;
            const avatar = item.querySelector(".author-avatar");
            if (follower.avatar) {
                avatar.style.backgroundImage = `url('${follower.avatar}')`;
            }
            dom.commonFollowersList.appendChild(item);
        });
        dom.commonFollowersSection.classList.remove("hidden");
    } else {
        dom.commonFollowersSection.classList.add("hidden");
    }
}
async function fetchAndDisplayCommonFollowers(profileAddress, viewerAddress) {
    if (!viewerAddress) {
        updateCommonFollowersUI(null);
        return;
    }
    const cacheKey = `${profileAddress}-${viewerAddress}`;
    if (commonFollowersCache.has(cacheKey)) {
        updateCommonFollowersUI(commonFollowersCache.get(cacheKey));
        return;
    }
    try {
        const response = await fetch(
            `https://api.ethfollow.xyz/api/v1/users/${profileAddress}/commonFollowers?leader=${viewerAddress}`
        );
        if (!response.ok) throw new Error(`API error ${response.status}`);
        const data = await response.json();
        commonFollowersCache.set(cacheKey, data);
        updateCommonFollowersUI(data);
    } catch (error) {
        console.warn(`Could not fetch common followers:`, error);
        commonFollowersCache.set(cacheKey, null);
        updateCommonFollowersUI(null);
    }
}

function displayProfileMentions() {
    if (!currentProfileFilter) return;
    dom.commentsContainer.classList.add("hidden");
    dom.mentionsContainer.classList.remove("hidden");
    const profileAddress = currentProfileFilter.toLowerCase();

    // Check our cache for a known ENS name for the current user profile
    const profileEnsName = ensCache.get(currentProfileFilter);
    console.log(profileEnsName);
    const hasRealEnsName = profileEnsName && profileEnsName.includes(".");

    const mentions = allFetchedComments.filter((c) => {
        const contentLower = c.content.toLowerCase();

        // Condition 1: Check for direct address mention, e.g., "@0x123..."
        if (contentLower.includes(`@${profileAddress}`)) {
            return true;
        }

        // Condition 2: If an ENS name is known, check for mentions of it.
        // This will find "vitalik.eth" and "@vitalik.eth" correctly.
        if (hasRealEnsName) {
            // Use a regex with word boundaries (\b) to avoid partial matches
            const ensRegex = new RegExp(
                `\\b${profileEnsName.replace(/\./g, "\\.")}\\b`,
                "i"
            );
            if (ensRegex.test(contentLower)) {
                return true;
            }
        }

        return false;
    });

    dom.mentionsContainer.innerHTML = "";
    if (mentions.length > 0) {
        const sortedMentions = mentions.sort(sortByDate);
        const commentTree = buildCommentTree(sortedMentions);
        commentTree.forEach((comment) => {
            dom.mentionsContainer.appendChild(createCommentElement(comment, 0));
        });
    } else {
        dom.mentionsContainer.innerHTML = `<p class="no-comments-message">No mentions found for this user.</p>`;
    }
}

function handleChannelClick(filterId) {
    hideUserProfile();
    displayFilteredComments(filterId);
    if (
        window.innerWidth <= 768 &&
        dom.channelMenu.classList.contains("open")
    ) {
        dom.channelMenu.classList.remove("open");
        dom.burgerMenuButton.classList.remove("open");
        document.body.classList.remove("menu-open-overlay");
    }
}

// --- Init ---
export function init() {
    // Assign DOM elements
    const elementIds = [
        "refresh-button",
        "comments-container",
        "logo",
        "burger-menu-button",
        "channel-menu",
        "user-profile",
        "profile-avatar",
        "profile-name",
        "logout-popup",
        "logout-button",
        "profile-view-header",
        "profile-view-avatar",
        "profile-view-name",
        "back-to-comments-button",
        "profile-view-stats",
        "profile-followers",
        "profile-following",
        "profile-follow-state",
        "profile-view-description",
        "profile-view-socials",
        "follow-button",
        "common-followers-section",
        "common-followers-list",
        "profile-view-tabs",
        "profile-comments-tab",
        "profile-mentions-tab",
        "mentions-container",
        "connect-wallet-button",
        "new-comment-area",
        "new-comment-content",
        "new-comment-channel-id",
        "submit-new-comment-button",
        "post-status-message",
    ];
    elementIds.forEach((id) => {
        const camelCaseId = id.replace(/-(\w)/g, (_, c) => c.toUpperCase());
        dom[camelCaseId] = document.getElementById(id);
    });

    // Register wallet callbacks
    wallet.registerOnConnect(() => {
        dom.connectWalletButton.classList.add("hidden");
        dom.userProfile.classList.remove("hidden");
        dom.profileName.textContent = formatAddress(
            wallet.getUserAddress(),
            dom.profileName
        );
        resolveAndApplyAvatar(wallet.getUserAddress(), dom.profileAvatar);
        updateNewCommentAreaVisibility();
        initializeCommentsView();
    });
    wallet.registerOnLogout(() => {
        hideUserProfile();
        dom.connectWalletButton.classList.remove("hidden");
        dom.userProfile.classList.add("hidden");
        updateNewCommentAreaVisibility();
        initializeCommentsView();
    });
    wallet.registerOnCommentPosted(() => {
        showPostStatus("Action completed! Refreshing in 5s...", false);
        setTimeout(initializeCommentsView, 5000);
    });

    // Setup event listeners
    dom.refreshButton.addEventListener("click", initializeCommentsView);
    dom.logo.addEventListener("click", () => {
        hideUserProfile();
        handleChannelClick(null);
    });
    dom.connectWalletButton.addEventListener("click", () =>
        wallet.connectWallet(showPostStatus, dom.connectWalletButton)
    );
    dom.submitNewCommentButton.addEventListener("click", async () => {
        dom.submitNewCommentButton.disabled = true;
        try {
            await wallet.submitEcpComment(
                dom.newCommentContent.value,
                dom.newCommentChannelId.value,
                null,
                dom.postStatusMessage,
                showPostStatus
            );
            dom.newCommentContent.value = "";
            dom.newCommentChannelId.value = "";
        } catch {}
        dom.submitNewCommentButton.disabled = false;
    });
    dom.backToCommentsButton.addEventListener("click", hideUserProfile);
    dom.userProfile.addEventListener("click", (e) => {
        e.stopPropagation();
        dom.logoutPopup.classList.toggle("hidden");
    });
    dom.logoutButton.addEventListener("click", (e) => {
        e.stopPropagation();
        wallet.logout();
    });
    window.addEventListener("click", () =>
        dom.logoutPopup.classList.add("hidden")
    );
    window.addEventListener("scroll", () => {
        if (
            !isLoadingMore &&
            hasNextPage &&
            !currentProfileFilter &&
            currentChannelFilter === null
        ) {
            if (
                window.innerHeight + window.scrollY >=
                document.body.offsetHeight - 300
            ) {
                loadMoreComments();
            }
        }
    });
    dom.burgerMenuButton.addEventListener("click", () => {
        const isOpen = dom.channelMenu.classList.toggle("open");
        dom.burgerMenuButton.classList.toggle("open");
        document.body.classList.toggle("menu-open-overlay", isOpen);
    });

    // Initial calls
    wallet.discoverEIP6963Providers(dom.connectWalletButton);
    initializeCommentsView();
}
