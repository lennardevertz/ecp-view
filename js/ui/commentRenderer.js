// js/ui/commentRenderer.js

import {
    MAX_COMMENT_LENGTH,
    ensProvider,
    MINIMAL_ERC20_ABI,
    MINIMAL_ERC721_ABI,
} from "../constants.js";

const tokenInfoCache = new Map();
const providerCache = new Map();
const coinGeckoIdCache = new Map();

// ADD THIS HELPER FUNCTION
let sharedChartTooltip = null;
function getSharedChartTooltip() {
    if (!sharedChartTooltip) {
        sharedChartTooltip = document.createElement("div");
        sharedChartTooltip.classList.add("coingecko-chart-tooltip");
        document.body.appendChild(sharedChartTooltip);
    }
    return sharedChartTooltip;
}

function createCaip19Embed(caip19String) {
    const embed = document.createElement("a");
    embed.classList.add("caip19-embed");
    embed.target = "_blank";
    embed.rel = "noopener noreferrer";

    const icon = document.createElement("div");
    icon.classList.add("caip19-icon");

    const infoDiv = document.createElement("div");
    infoDiv.classList.add("caip19-info");

    const nameSpan = document.createElement("span");
    nameSpan.classList.add("caip19-name");

    const symbolSpan = document.createElement("span");
    symbolSpan.classList.add("caip19-symbol");

    infoDiv.append(nameSpan, symbolSpan);
    embed.append(icon, infoDiv);

    const fetchTokenData = async () => {
        try {
            const [chainInfo, assetInfo] = caip19String.split("/");
            const [assetNamespace, assetReference] = assetInfo.split(":");
            const [chainNamespace, chainId] = chainInfo.split(":");
            const [contractAddress, tokenId] = assetReference.split("/");

            if (chainNamespace !== "eip155") return;

            const explorerUrl =
                chainId === "8453"
                    ? `https://basescan.org/token/${contractAddress}`
                    : `https://etherscan.io/token/${contractAddress}`;
            embed.href = tokenId ? `${explorerUrl}?a=${tokenId}` : explorerUrl;

            const cacheKey = `${chainId}:${contractAddress}`;
            if (tokenInfoCache.has(cacheKey)) {
                const {name, symbol, logo} = tokenInfoCache.get(cacheKey);
                nameSpan.textContent = name;
                symbolSpan.textContent = symbol;
                if (logo) icon.style.backgroundImage = `url('${logo}')`;
                return;
            }

            nameSpan.textContent = `${assetNamespace.toUpperCase()} Token`;
            symbolSpan.textContent = `${contractAddress.substring(0, 6)}...`;

            if (!providerCache.has(chainId)) {
                const rpcUrl =
                    chainId === "8453"
                        ? "https://base.llamarpc.com"
                        : "https://ethereum-rpc.publicnode.com";
                providerCache.set(
                    chainId,
                    new window.ethers.providers.JsonRpcProvider(rpcUrl)
                );
            }
            const provider = providerCache.get(chainId);

            if (assetNamespace === "erc20") {
                const contract = new window.ethers.Contract(
                    contractAddress,
                    MINIMAL_ERC20_ABI,
                    provider
                );
                const [name, symbol] = await Promise.all([
                    contract.name(),
                    contract.symbol(),
                ]);

                const checksumAddress =
                    window.ethers.utils.getAddress(contractAddress);
                const chainNameForLogo =
                    chainId === "8453" ? "base" : "ethereum";
                const logo = `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/${chainNameForLogo}/assets/${checksumAddress}/logo.png`;

                nameSpan.textContent = name;
                symbolSpan.textContent = symbol;
                icon.style.backgroundImage = `url('${logo}')`;

                tokenInfoCache.set(cacheKey, {name, symbol, logo});
            }
        } catch (error) {
            console.warn(`Failed to fetch info for ${caip19String}:`, error);
            nameSpan.textContent = "Unknown Token";
        }
    };

    fetchTokenData();

    // --- Logic for shared, robustly positioned tooltip ---
    let hideTooltipTimeout;

    const positionTooltip = () => {
        const tooltip = getSharedChartTooltip();
        if (tooltip.style.display !== "block") return;

        const rect = embed.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();
        const buffer = 10; // Screen edge buffer

        // Vertical position: Prefer above, but move below if not enough space.
        // NO GAP when positioning above to prevent flickering.
        let top = rect.top - tooltipRect.height;
        if (top < buffer) {
            // Add a small gap when positioning below.
            top = rect.bottom + 5;
        }

        // Horizontal position: Center it, but keep it on-screen.
        let left = rect.left + rect.width / 2 - tooltipRect.width / 2;
        if (left < buffer) {
            left = buffer;
        }
        if (left + tooltipRect.width > window.innerWidth - buffer) {
            left = window.innerWidth - tooltipRect.width - buffer;
        }

        tooltip.style.top = `${top}px`;
        tooltip.style.left = `${left}px`;
        tooltip.style.opacity = "1";
    };

    embed.addEventListener("mouseenter", async () => {
        clearTimeout(hideTooltipTimeout);
        const tooltip = getSharedChartTooltip();

        tooltip.style.opacity = "0";
        tooltip.style.display = "block";
        tooltip.style.top = "-9999px";

        if (tooltip.dataset.renderedFor === caip19String) {
            requestAnimationFrame(positionTooltip);
            return;
        }

        tooltip.innerHTML = `<p class="loading-message">Loading chart...</p>`;

        try {
            const [chainInfo, assetInfo] = caip19String.split("/");
            const [_, assetReference] = assetInfo.split(":");
            const [chainNamespace, chainId] = chainInfo.split(":");
            const [contractAddress] = assetReference.split("/");

            if (chainNamespace !== "eip155")
                throw new Error("Not an EVM chain");

            const cacheKey = `${chainId}:${contractAddress}`;
            let coinId = coinGeckoIdCache.get(cacheKey);

            if (coinId === undefined) {
                const platformId = chainId === "8453" ? "base" : "ethereum";
                const response = await fetch(
                    `https://api.coingecko.com/api/v3/coins/${platformId}/contract/${contractAddress}`
                );
                if (!response.ok)
                    throw new Error("Token not found on CoinGecko");
                const data = await response.json();
                coinId = data.id;
                coinGeckoIdCache.set(cacheKey, coinId);
            }

            if (coinId) {
                tooltip.innerHTML = "";
                const chartWidget = document.createElement(
                    "gecko-coin-price-chart-widget"
                );
                chartWidget.setAttribute("coin-id", coinId);
                chartWidget.setAttribute("locale", "en");
                chartWidget.setAttribute("transparent-background", "true");
                chartWidget.setAttribute("outlined", "false"); // Set to false
                tooltip.appendChild(chartWidget);
                tooltip.dataset.renderedFor = caip19String;

                setTimeout(() => requestAnimationFrame(positionTooltip), 150);
            } else {
                throw new Error("CoinGecko ID not found");
            }
        } catch (error) {
            console.warn(
                `Could not load CoinGecko chart for ${caip19String}:`,
                error
            );
            tooltip.innerHTML = `<p class="loading-message">Chart not available</p>`;
            tooltip.dataset.renderedFor = caip19String;
            requestAnimationFrame(positionTooltip);
        }
    });

    const hideTooltip = () => {
        const tooltip = getSharedChartTooltip();
        hideTooltipTimeout = setTimeout(() => {
            tooltip.style.opacity = "0";
            setTimeout(() => {
                tooltip.style.display = "none";
                tooltip.dataset.renderedFor = "";
            }, 150);
        }, 100);
    };

    embed.addEventListener("mouseleave", hideTooltip);
    getSharedChartTooltip().addEventListener("mouseenter", () =>
        clearTimeout(hideTooltipTimeout)
    );
    getSharedChartTooltip().addEventListener("mouseleave", hideTooltip);

    return embed;
}

function renderContentWithEmbeds(content, formatters, callbacks) {
    const {formatAddress} = formatters;
    const {onProfileClick} = callbacks;
    const fragment = document.createDocumentFragment();

    const combinedRegex =
        /(https?:\/\/[^\s]+)|(@(0x[a-fA-F0-9]{40}))|(\b[a-zA-Z0-9-]+\.eth\b)|(eip155:\d+\/(?:erc20|erc721):0x[a-fA-F0-9]{40}(?:\/\d+)?)/gi;

    const imageRegex = /\.(jpg|jpeg|png|gif|webp)$/i;
    const ipfsGatewayRegex =
        /(gateway\.pinata\.cloud|[a-zA-Z0-9-]+\.mypinata\.cloud|ipfs\.io)/i;

    let lastIndex = 0;
    let match;

    while ((match = combinedRegex.exec(content)) !== null) {
        if (match.index > lastIndex) {
            fragment.appendChild(
                document.createTextNode(
                    content.substring(lastIndex, match.index)
                )
            );
        }
        const urlMatch = match[1];
        const mentionAddress = match[3];
        const ensNameMatch = match[4];
        const caip19Match = match[5];

        if (caip19Match) {
            fragment.appendChild(createCaip19Embed(caip19Match));
        } else if (urlMatch) {
            const link = document.createElement("a");
            link.href = urlMatch;
            link.target = "_blank";
            link.rel = "noopener noreferrer";

            if (imageRegex.test(urlMatch) || ipfsGatewayRegex.test(urlMatch)) {
                link.title = "View full-size image";
                const image = document.createElement("img");
                image.src = urlMatch;
                image.alt = "User-posted image";
                image.classList.add("embedded-image");
                link.appendChild(image);
            } else {
                link.textContent =
                    urlMatch.length > 50
                        ? urlMatch.substring(0, 47) + "..."
                        : urlMatch;
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
            const ensLink = document.createElement("a");
            ensLink.href = "#";
            ensLink.classList.add("mention-link");
            ensLink.textContent = ensNameMatch;

            ensLink.onclick = async (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (ensLink.dataset.resolving === "true") return;
                ensLink.dataset.resolving = "true";
                ensLink.style.cursor = "wait";
                try {
                    const resolvedAddress = await ensProvider.resolveName(
                        ensNameMatch
                    );
                    if (resolvedAddress) {
                        onProfileClick(resolvedAddress);
                    } else {
                        ensLink.title = `Could not resolve ${ensNameMatch}`;
                        ensLink.style.textDecoration = "line-through";
                        ensLink.style.color = "#95a5a6";
                        ensLink.onclick = (ev) => ev.preventDefault();
                    }
                } catch (error) {
                    console.error(
                        `Failed to resolve ENS name ${ensNameMatch}:`,
                        error
                    );
                    ensLink.title = "Error during resolution";
                    ensLink.style.textDecoration = "line-through";
                    ensLink.style.color = "#e74c3c";
                    ensLink.onclick = (ev) => ev.preventDefault();
                } finally {
                    ensLink.style.cursor = "pointer";
                    delete ensLink.dataset.resolving;
                }
            };
            fragment.appendChild(ensLink);
        }

        lastIndex = combinedRegex.lastIndex;
    }
    if (lastIndex < content.length) {
        fragment.appendChild(
            document.createTextNode(content.substring(lastIndex))
        );
    }
    return fragment;
}

export function renderComment(comment, config) {
    const {depth, state, formatters, callbacks} = config;
    const {userAddress, isOnCorrectNetwork} = state;
    const {formatDate, formatAddress, resolveAndApplyAvatar} = formatters;
    const {onProfileClick, onReply, onLike} = callbacks;

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
        const truncatedContent =
            comment.content.substring(0, MAX_COMMENT_LENGTH) + "...";
        contentP.appendChild(
            renderContentWithEmbeds(truncatedContent, formatters, callbacks)
        );
        commentDiv.appendChild(contentP);
        const toggleButton = document.createElement("button");
        toggleButton.classList.add("toggle-content-button");
        toggleButton.textContent = "Show more";
        let isExpanded = false;
        toggleButton.onclick = () => {
            isExpanded = !isExpanded;
            contentP.innerHTML = "";
            if (isExpanded) {
                contentP.appendChild(
                    renderContentWithEmbeds(
                        comment.content,
                        formatters,
                        callbacks
                    )
                );
                toggleButton.textContent = "Show less";
            } else {
                contentP.appendChild(
                    renderContentWithEmbeds(
                        truncatedContent,
                        formatters,
                        callbacks
                    )
                );
                toggleButton.textContent = "Show more";
            }
        };
        commentDiv.appendChild(toggleButton);
    } else {
        contentP.appendChild(
            renderContentWithEmbeds(comment.content, formatters, callbacks)
        );
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
    const likeCount = comment.reactionCounts?.like || 0;
    const likeCountSpan = document.createElement("span");
    likeCountSpan.classList.add("like-count");
    likeCountSpan.innerHTML = `<img src="https://www.cryptologos.cc/logos/ethereum-eth-logo.svg?v=040" alt="Likes" class="like-icon"> ${likeCount}`;
    likeSectionDiv.appendChild(likeCountSpan);

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
        const submitReplyBtn = replyFormDiv.querySelector(
            ".submit-reply-button"
        );
        const cancelReplyBtn = replyFormDiv.querySelector(
            ".cancel-reply-button"
        );
        const replyStatusMsgElement = replyFormDiv.querySelector(
            ".reply-status-message"
        );

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
            const success = await onReply(
                comment,
                replyTextarea.value,
                replyStatusMsgElement
            );
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
    if (
        comment.contentReplyCount > 0 &&
        comment.children &&
        comment.children.length > 0
    ) {
        // Main toggle button for showing/hiding the entire replies section
        const toggleButton = document.createElement("button");
        toggleButton.classList.add("toggle-replies");
        toggleButton.textContent = `[-] Hide Replies (${comment.contentReplyCount})`;
        commentDiv.appendChild(toggleButton);

        // Container for all children elements, visible by default
        const childrenContainer = document.createElement("div");
        childrenContainer.classList.add("comment-children");
        commentDiv.appendChild(childrenContainer);

        // --- Progressive Rendering Logic ---

        // 1. Render and display the first reply immediately.
        const firstReply = comment.children[0];
        const firstReplyConfig = {...config, depth: depth + 1};
        childrenContainer.appendChild(renderComment(firstReply, firstReplyConfig));

        const remainingReplies = comment.children.slice(1);

        // 2. If there are more replies, add a "Show more/less" button.
        if (remainingReplies.length > 0) {
            const showMoreButton = document.createElement("button");
            showMoreButton.classList.add("toggle-replies", "show-more-replies");
            showMoreButton.textContent = `[+] Show ${remainingReplies.length} more replies`;
            childrenContainer.appendChild(showMoreButton);

            let areExtraRepliesRendered = false;
            let extraRepliesContainer = null;

            showMoreButton.onclick = (e) => {
                e.stopPropagation(); // Prevent the main toggle from firing

                if (!areExtraRepliesRendered) {
                    // First click: create container and render replies
                    extraRepliesContainer = document.createElement("div");
                    extraRepliesContainer.classList.add("extra-replies-container");
                    
                    remainingReplies.forEach((reply) => {
                        const replyConfig = {...config, depth: depth + 1};
                        extraRepliesContainer.appendChild(renderComment(reply, replyConfig));
                    });
                    
                    childrenContainer.insertBefore(extraRepliesContainer, showMoreButton);
                    areExtraRepliesRendered = true;
                    showMoreButton.textContent = `[-] Show less`;
                } else {
                    // Subsequent clicks: toggle visibility of the extra replies
                    const isHidden = extraRepliesContainer.classList.toggle("hidden");
                    showMoreButton.textContent = isHidden
                        ? `[+] Show ${remainingReplies.length} more replies`
                        : `[-] Show less`;
                }
            };
        }

        // --- Main Toggle Functionality ---
        toggleButton.onclick = () => {
            const isHidden = childrenContainer.classList.toggle("hidden");
            toggleButton.textContent = isHidden
                ? `[+] Show Replies (${comment.contentReplyCount})`
                : `[-] Hide Replies (${comment.contentReplyCount})`;
        };
    }
    return commentDiv;
}
