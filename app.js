let allFetchedComments = [];
let currentChannelFilter = null; // null for 'All Comments', 0 for 'No Channel', channelId for specific channel

// ECP contract:
const COMMENT_MANAGER_ADDRESS = "0xb262C9278fBcac384Ef59Fc49E24d800152E19b1";
const ICommentManagerABI = [
    {
        type: "function",
        name: "postComment",
        inputs: [
            {
                name: "commentData",
                type: "tuple",
                internalType: "struct ECPCommentData",
                components: [
                    {name: "author", type: "address", internalType: "address"},
                    {name: "app", type: "address", internalType: "address"},
                    {
                        name: "channelId",
                        type: "uint256",
                        internalType: "uint256",
                    },
                    {
                        name: "deadline",
                        type: "uint256",
                        internalType: "uint256",
                    },
                    {
                        name: "parentId",
                        type: "bytes32",
                        internalType: "bytes32",
                    },
                    {name: "commentType", type: "uint8", internalType: "uint8"},
                    {name: "content", type: "string", internalType: "string"},
                    {
                        name: "metadata",
                        type: "tuple[]",
                        internalType: "struct MetadataEntry[]",
                        components: [
                            {
                                name: "key",
                                type: "bytes32",
                                internalType: "bytes32",
                            },
                            {
                                name: "value",
                                type: "bytes",
                                internalType: "bytes",
                            },
                        ],
                    },
                    {name: "targetUri", type: "string", internalType: "string"},
                ],
            },
            {name: "appSignature", type: "bytes", internalType: "bytes"},
        ],
        outputs: [
            {name: "commentId", type: "bytes32", internalType: "bytes32"},
        ],
        stateMutability: "nonpayable",
    },
];

const TARGET_CHAIN_ID = 8453;
const TARGET_CHAIN_ID_HEX = "0x2105"; // Hex representation of 8453
const BASE_RPC_URL = "https://base.llamarpc.com";
const BASE_EXPLORER_URL = "https://basescan.org";
const BASE_CHAIN_NAME = "Base Mainnet";
const ETH_MAINNET_RPC_URL = "https://1rpc.io/eth";

// Add these for reactions:
const COMMENT_TYPE_REACTION = 1;
const REACTION_CONTENT_LIKE = "like";

// Wallet related global variables
let eip6963Providers = [];
let selectedProviderDetail = null;
let ethersProvider;
let signer;
let userAddress;
let commentManagerContract;
let isOnCorrectNetwork = false;
window.currentLikeCounts = new Map();
window.likerLists = new Map();
const ensProvider = new ethers.providers.JsonRpcProvider(ETH_MAINNET_RPC_URL);
let isInitialLoad = true;
let ensCache = new Map();
let pendingEnsLookups = new Map();
let avatarCache = new Map();
let pendingAvatarLookups = new Map();
let followerStatsCache = new Map();
let ensDetailsCache = new Map();
let followStateCache = new Map();
let commonFollowersCache = new Map();
let currentProfileFilter = null; // Add this for the new view
let currentCursor = null;
let hasNextPage = true;
let isLoadingMore = false;
const COMMENT_FETCH_LIMIT = 100;
const MAX_COMMENT_LENGTH = 300;

document.addEventListener("DOMContentLoaded", () => {
    const refreshButton = document.getElementById("refresh-button");
    const commentsContainer = document.getElementById("comments-container");
    const logoElement = document.getElementById("logo"); // Get logo element
    const burgerMenuButton = document.getElementById("burger-menu-button");
    const channelMenu = document.getElementById("channel-menu"); // Get the channel menu itself
    const userProfileDiv = document.getElementById("user-profile");
    const profileAvatarDiv = document.getElementById("profile-avatar");
    const profileNameSpan = document.getElementById("profile-name");
    const logoutPopup = document.getElementById("logout-popup");
    const logoutButton = document.getElementById("logout-button");
    const profileViewHeader = document.getElementById("profile-view-header");
    const profileViewAvatar = document.getElementById("profile-view-avatar");
    const profileViewName = document.getElementById("profile-view-name");
    const backToCommentsButton = document.getElementById(
        "back-to-comments-button"
    );
    const profileViewStats = document.getElementById("profile-view-stats");
    const profileFollowers = document.getElementById("profile-followers");
    const profileFollowing = document.getElementById("profile-following");
    const profileFollowState = document.getElementById("profile-follow-state");
    const profileViewDescription = document.getElementById(
        "profile-view-description"
    );
    const profileViewSocials = document.getElementById("profile-view-socials");
    const followButton = document.getElementById("follow-button");
    const commonFollowersSection = document.getElementById(
        "common-followers-section"
    );
    const commonFollowersList = document.getElementById(
        "common-followers-list"
    );

    // Add these:
    const profileViewTabs = document.getElementById("profile-view-tabs");
    const profileCommentsTab = document.getElementById("profile-comments-tab");
    const profileMentionsTab = document.getElementById("profile-mentions-tab");
    const mentionsContainer = document.getElementById("mentions-container");

    // New DOM Elements
    const connectWalletButton = document.getElementById(
        "connect-wallet-button"
    );
    // const walletStatusSpan = document.getElementById("wallet-status"); // Removed
    const newCommentArea = document.getElementById("new-comment-area");
    const newCommentContent = document.getElementById("new-comment-content");
    const newCommentChannelId = document.getElementById(
        "new-comment-channel-id"
    );
    const submitNewCommentButton = document.getElementById(
        "submit-new-comment-button"
    );
    const postStatusMessage = document.getElementById("post-status-message");

    // Initially disable connect button until providers are detected
    if (connectWalletButton) {
        connectWalletButton.disabled = true;
        connectWalletButton.textContent = "Detecting Wallets...";
    }

    discoverEIP6963Providers(); // Call this early

    const ECP_API_URL = "https://api.ethcomments.xyz/";
    const COMMENTS_QUERY = `query PaginatedComments($limit: Int, $after: String) {
    comments(limit: $limit, after: $after, orderBy: "createdAt", orderDirection: "desc") {
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
        pageInfo {
            hasNextPage
            endCursor
        }
    }
}`;

    function storeProvider(providerDetail) {
        const existingProvider = eip6963Providers.find(
            (p) => p.info.uuid === providerDetail.info.uuid
        );
        if (!existingProvider) {
            eip6963Providers.push(providerDetail);
            // console.log("Discovered EIP-6963 provider:", providerDetail.info.name);
            // Update UI or enable connect button if it was disabled
            if (
                connectWalletButton &&
                connectWalletButton.disabled &&
                eip6963Providers.length > 0 &&
                !userAddress // Only update if not already connected
            ) {
                connectWalletButton.disabled = false;
                connectWalletButton.textContent = "Connect Wallet";
            }
        }
    }

    function discoverEIP6963Providers() {
        // Listen for announced providers
        window.addEventListener("eip6963:announceProvider", (event) => {
            storeProvider(event.detail);
        });

        // Dispatch a request for providers to announce themselves
        window.dispatchEvent(new Event("eip6963:requestProvider"));

        // After a short delay, if no providers found, update status
        setTimeout(() => {
            if (eip6963Providers.length === 0 && !userAddress) {
                if (connectWalletButton) {
                    connectWalletButton.disabled = true;
                    connectWalletButton.textContent = "No Wallets Found";
                }
            } else if (eip6963Providers.length > 0 && !userAddress) {
                if (
                    connectWalletButton &&
                    connectWalletButton.textContent === "Detecting Wallets..."
                ) {
                    // Only if not already set by other logic
                    connectWalletButton.disabled = false;
                    connectWalletButton.textContent = "Connect Wallet";
                }
            }
        }, 1000); // Adjust timeout as needed
    }

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

    function showPostStatus(
        message,
        isError = false,
        element = postStatusMessage
    ) {
        element.textContent = message;
        element.style.color = isError ? "red" : "green"; // Or use classes
        if (message) {
            element.style.display = "block";
        } else {
            element.style.display = "none";
        }
    }

    // Add this new function before connectWallet()
    async function switchToBase(rawProvider) {
        try {
            await rawProvider.request({
                method: "wallet_switchEthereumChain",
                params: [{chainId: TARGET_CHAIN_ID_HEX}],
            });
            console.log("Switched to Base successfully.");
            return true;
        } catch (switchError) {
            // This error code indicates that the chain has not been added to MetaMask/wallet.
            if (switchError.code === 4902) {
                console.log("Base not found in wallet, attempting to add it.");
                try {
                    await rawProvider.request({
                        method: "wallet_addEthereumChain",
                        params: [
                            {
                                chainId: TARGET_CHAIN_ID_HEX,
                                chainName: BASE_CHAIN_NAME,
                                nativeCurrency: {
                                    name: "Ethereum",
                                    symbol: "ETH", // Base  uses ETH
                                    decimals: 18,
                                },
                                rpcUrls: [BASE_RPC_URL],
                                blockExplorerUrls: [BASE_EXPLORER_URL],
                            },
                        ],
                    });
                    console.log("Base added and switched successfully.");
                    return true;
                } catch (addError) {
                    console.error("Failed to add Base network:", addError);
                    return false;
                }
            }
            console.error("Failed to switch to Base network:", switchError);
            return false;
        }
    }

    async function connectWallet() {
        if (eip6963Providers.length === 0) {
            showPostStatus(
                "No wallet providers found. Please ensure your EIP-6963 compatible wallet is active.",
                true
            );
            if (connectWalletButton)
                connectWalletButton.textContent = "No Wallets Detected";
            return;
        }

        if (eip6963Providers.length > 1) {
            console.info(
                `Multiple EIP-6963 providers found (${eip6963Providers
                    .map((p) => p.info.name)
                    .join(", ")}). Connecting to the first one: ${
                    eip6963Providers[0].info.name
                }.`
            );
        }

        selectedProviderDetail = eip6963Providers[0];
        const rawProvider = selectedProviderDetail.provider;

        try {
            const accounts = await rawProvider.request({
                method: "eth_requestAccounts",
            });
            if (!accounts || accounts.length === 0) {
                throw new Error("No accounts returned from wallet.");
            }

            ethersProvider = new ethers.providers.Web3Provider(
                rawProvider,
                "any"
            );

            const network = await ethersProvider.getNetwork();
            if (network.chainId !== TARGET_CHAIN_ID) {
                const switched = await switchToBase(rawProvider);
                if (!switched) {
                    // Call logout to reset all UI state to disconnected
                    logout();

                    // Then show a specific message to the user for this case
                    showPostStatus(
                        `Please switch your wallet to ${BASE_CHAIN_NAME} to proceed.`,
                        true
                    );
                    // And update the button text for better UX
                    if (connectWalletButton) {
                        connectWalletButton.textContent = `Switch to ${BASE_CHAIN_NAME.replace(
                            " Mainnet",
                            ""
                        )}`;
                        connectWalletButton.disabled = false;
                    }
                    return;
                }
                // Re-initialize ethersProvider after network switch to ensure it's up-to-date
                ethersProvider = new ethers.providers.Web3Provider(
                    rawProvider,
                    "any"
                );
            }

            isOnCorrectNetwork = true;
            signer = ethersProvider.getSigner();
            userAddress = await signer.getAddress();
            commentManagerContract = new ethers.Contract(
                COMMENT_MANAGER_ADDRESS,
                ICommentManagerABI,
                signer
            );

            if (connectWalletButton)
                connectWalletButton.classList.add("hidden");
            if (userProfileDiv) {
                userProfileDiv.classList.remove("hidden");
                profileNameSpan.textContent = formatAddress(
                    userAddress,
                    profileNameSpan
                );
                resolveAndApplyAvatar(userAddress, profileAvatarDiv);
            }

            updateNewCommentAreaVisibility();
            showPostStatus("", false);
            initializeCommentsView(); // Refresh comments, reply buttons will now be enabled
        } catch (error) {
            console.error(
                "Error connecting wallet or switching network:",
                error
            );
            showPostStatus(
                `Error: ${
                    error.message || "Could not connect/switch network."
                }`,
                true
            );
            logout(); // This handles all UI reset logic
        }
    }

    async function submitEcpComment(
        content,
        channelIdStr,
        parentId,
        statusElement = postStatusMessage,
        commentTypeParam = 0 // Default to 0 (standard comment)
    ) {
        if (!signer || !commentManagerContract) {
            showPostStatus(
                "Please connect your wallet first.",
                true,
                statusElement
            );
            return Promise.reject("Wallet not connected");
        }

        if (!isOnCorrectNetwork || !ethersProvider) {
            showPostStatus(
                `Please connect to the ${BASE_CHAIN_NAME} network to post.`,
                true,
                statusElement
            );
            return Promise.reject("Wrong network or provider not ready");
        }
        const network = await ethersProvider.getNetwork();
        if (network.chainId !== TARGET_CHAIN_ID) {
            isOnCorrectNetwork = false;
            showPostStatus(
                `You are on the wrong network. Please switch to ${BASE_CHAIN_NAME}.`,
                true,
                statusElement
            );
            logout();
            return Promise.reject("Wrong network");
        }

        if (commentTypeParam !== COMMENT_TYPE_REACTION && !content.trim()) {
            // Content can be empty for certain reaction types, but not for standard comments
            // For "like" reactions, content is fixed, so this check is mostly for standard comments.
            showPostStatus(
                "Comment content cannot be empty.",
                true,
                statusElement
            );
            return Promise.reject("Empty content");
        }

        const channelId =
            channelIdStr && String(channelIdStr).trim() !== ""
                ? parseInt(channelIdStr)
                : 0;
        if (isNaN(channelId)) {
            showPostStatus(
                "Invalid Channel ID. Must be a number.",
                true,
                statusElement
            );
            return Promise.reject("Invalid Channel ID");
        }

        showPostStatus("Preparing comment...", false, statusElement);

        const commentData = {
            author: userAddress,
            app: userAddress,
            channelId: ethers.BigNumber.from(channelId),
            deadline: ethers.BigNumber.from(
                Math.floor(Date.now() / 1000) + 86400
            ),
            parentId: parentId || ethers.constants.HashZero,
            commentType: commentTypeParam, // Use the passed parameter
            content: content,
            metadata: [],
            targetUri: "",
        };

        try {
            showPostStatus(
                "Please confirm transaction in your wallet...",
                false,
                statusElement
            );
            const tx = await commentManagerContract.postComment(
                commentData,
                "0x"
            );
            showPostStatus(
                `Transaction sent: ${formatAddress(
                    tx.hash
                )}. Waiting for confirmation...`,
                false,
                statusElement
            );

            await tx.wait();
            showPostStatus(
                "Action completed successfully! Refreshing comments...",
                false,
                statusElement
            );

            if (
                (!parentId || parentId === ethers.constants.HashZero) &&
                commentTypeParam !== COMMENT_TYPE_REACTION
            ) {
                if (newCommentContent) newCommentContent.value = "";
                if (newCommentChannelId) newCommentChannelId.value = "";
            }

            setTimeout(() => {
                initializeCommentsView();
                showPostStatus("", false, statusElement);
            }, 5000); // Increased delay for indexer (5 seconds)
            return Promise.resolve();
        } catch (error) {
            console.error("Error performing action:", error);
            const errMsg =
                error.data?.message ||
                error.reason ||
                error.message ||
                "Failed to perform action.";
            showPostStatus(`Error: ${errMsg}`, true, statusElement);
            return Promise.reject(error);
        }
    }

    function logout() {
        // Reset state variables
        ethersProvider = null;
        signer = null;
        userAddress = null;
        isOnCorrectNetwork = false;
        selectedProviderDetail = null;
        hideUserProfile(); // Add this to exit profile view on logout

        // Reset UI
        if (userProfileDiv) userProfileDiv.classList.add("hidden");
        if (logoutPopup) logoutPopup.classList.add("hidden"); // Ensure popup is closed
        if (connectWalletButton) {
            connectWalletButton.classList.remove("hidden");
            connectWalletButton.disabled = eip6963Providers.length === 0;
            connectWalletButton.textContent =
                eip6963Providers.length > 0
                    ? "Connect Wallet"
                    : "No Wallets Found";
        }
        updateNewCommentAreaVisibility();

        // Re-render comments to update UI state (disable like/reply)
        initializeCommentsView();
    }

    function updateFollowerStatsUI(stats) {
        if (
            stats &&
            stats.followers_count !== undefined &&
            stats.following_count !== undefined
        ) {
            profileFollowers.textContent = `${stats.followers_count} Followers`;
            profileFollowing.textContent = `${stats.following_count} Following`;
            profileViewStats.classList.remove("hidden");
        } else {
            profileViewStats.classList.add("hidden");
        }
    }

    async function fetchAndDisplayFollowerStats(address) {
        // Reset UI for new profile
        updateFollowerStatsUI(null);

        if (followerStatsCache.has(address)) {
            const stats = followerStatsCache.get(address);
            updateFollowerStatsUI(stats);
            return;
        }

        try {
            const response = await fetch(
                `https://api.ethfollow.xyz/api/v1/users/${address}/stats`
            );
            if (!response.ok) {
                // This can happen if the user is not in the protocol (404), which is fine.
                throw new Error(`API returned status ${response.status}`);
            }
            const stats = await response.json();
            followerStatsCache.set(address, stats);
            updateFollowerStatsUI(stats);
        } catch (error) {
            console.warn(
                `Could not fetch follower stats for ${address}:`,
                error.message
            );
            followerStatsCache.set(address, null); // Cache failure to prevent retries
            updateFollowerStatsUI(null);
        }
    }

    // --- START: New functions for enhanced profile data ---

    function updateEnsDetailsUI(data) {
        const description = data?.ens?.records?.description;
        if (description) {
            profileViewDescription.textContent = description;
            profileViewDescription.classList.remove("hidden");
        } else {
            profileViewDescription.classList.add("hidden");
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

        profileViewSocials.innerHTML = "";
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
                        : "#"; // Discord has no standard link format
                link.target = "_blank";
                link.rel = "noopener noreferrer";
                link.title = `${key}: ${value}`;
                link.innerHTML = socialIcons[key];
                profileViewSocials.appendChild(link);
            }
        }
        profileViewSocials.classList.toggle("hidden", !hasSocials);
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
                // Show the subtle "Following" text indicator
                profileFollowState.textContent = "Following";
                profileFollowState.classList.remove("hidden");
                // Hide the action button completely
                followButton.classList.add("hidden");
            } else {
                // // Show the "Follow" action button
                // followButton.textContent = "Follow";
                // followButton.disabled = false;
                // followButton.classList.remove("hidden");
                // Hide the subtle text indicator
                profileFollowState.classList.add("hidden");
            }
        } else {
            // No state available, hide both elements
            followButton.classList.add("hidden");
            profileFollowState.classList.add("hidden");
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
        commonFollowersList.innerHTML = "";
        if (data && data.results && data.results.length > 0) {
            data.results.slice(0, 10).forEach((follower) => {
                // Limit to 10 for now
                const item = document.createElement("div");
                item.classList.add("common-follower-item");
                item.innerHTML = `
                    <div class="author-avatar"></div>
                    <span>${
                        follower.name || formatAddress(follower.address)
                    }</span>
                `;
                const avatar = item.querySelector(".author-avatar");
                if (follower.avatar) {
                    avatar.style.backgroundImage = `url('${follower.avatar}')`;
                }
                commonFollowersList.appendChild(item);
            });
            commonFollowersSection.classList.remove("hidden");
        } else {
            commonFollowersSection.classList.add("hidden");
        }
    }

    async function fetchAndDisplayCommonFollowers(
        profileAddress,
        viewerAddress
    ) {
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

    // --- END: New functions for enhanced profile data ---

    async function loadMoreComments() {
        if (!hasNextPage || isLoadingMore) return;

        isLoadingMore = true;
        if (refreshButton) {
            refreshButton.classList.add("loading");
            refreshButton.disabled = true;
        }

        try {
            const {items: newRawComments, pageInfo} = await fetchComments(
                currentCursor
            );

            if (newRawComments && newRawComments.length > 0) {
                const {
                    contentComments: newContentComments,
                    likeCounts: newLikeCounts,
                    likerLists: newLikerLists,
                } = processCommentsAndLikes(newRawComments);

                // Merge new like data into global stores
                newLikeCounts.forEach((value, key) =>
                    window.currentLikeCounts.set(key, value)
                );
                newLikerLists.forEach((value, key) =>
                    window.likerLists.set(key, value)
                );

                // Append new comments to the main data array
                allFetchedComments.push(...newContentComments);

                // Update pagination state
                currentCursor = pageInfo.endCursor;
                hasNextPage = pageInfo.hasNextPage;

                // Render and append only the new top-level comments to the UI
                const newCommentTree = buildCommentTree(newContentComments);
                newCommentTree.forEach((comment) => {
                    commentsContainer.appendChild(renderComment(comment));
                });
            } else {
                hasNextPage = false;
            }
        } catch (error) {
            console.error("Error loading more comments:", error);
            // Optionally show a message to the user
        } finally {
            isLoadingMore = false;
            if (refreshButton) {
                refreshButton.classList.remove("loading");
                refreshButton.disabled = false;
            }
        }
    }

    function displayProfileMentions() {
        if (!currentProfileFilter) return;

        if (commentsContainer) commentsContainer.classList.add("hidden");
        if (mentionsContainer) mentionsContainer.classList.remove("hidden");

        const mentions = allFetchedComments.filter((c) =>
            c.content
                .toLowerCase()
                .includes(`@${currentProfileFilter.toLowerCase()}`)
        );

        mentionsContainer.innerHTML = ""; // Clear previous content

        if (mentions.length > 0) {
            const sortedMentions = mentions.sort(sortByDate);
            const commentTree = buildCommentTree(sortedMentions);
            commentTree.forEach((comment) => {
                mentionsContainer.appendChild(renderComment(comment));
            });
        } else {
            mentionsContainer.innerHTML = `<p class="no-comments-message">No mentions found for this user.</p>`;
        }
    }

    function updateNewCommentAreaVisibility() {
        if (!newCommentArea) return;

        const isConnectedAndOnCorrectNetwork =
            userAddress && isOnCorrectNetwork;

        // Context is postable if we are NOT in a profile view,
        // OR if we are viewing our OWN profile.
        const isPostableContext =
            !currentProfileFilter ||
            (currentProfileFilter &&
                userAddress &&
                currentProfileFilter.toLowerCase() ===
                    userAddress.toLowerCase());

        if (isConnectedAndOnCorrectNetwork && isPostableContext) {
            newCommentArea.style.display = "block";
        } else {
            newCommentArea.style.display = "none";
        }
    }

    function showUserProfile(authorAddress) {
        currentProfileFilter = authorAddress;
        currentChannelFilter = null; // Deactivate channel filter

        // Populate and show the profile header
        if (profileViewHeader) {
            profileViewName.textContent = formatAddress(
                authorAddress,
                profileViewName
            );
            resolveAndApplyAvatar(authorAddress, profileViewAvatar);

            // --- Add this block ---
            // Show and setup profile tabs
            if (profileViewTabs) {
                profileViewTabs.classList.remove("hidden");
                profileCommentsTab.classList.add("active");
                profileMentionsTab.classList.remove("active");

                profileCommentsTab.onclick = () => {
                    profileCommentsTab.classList.add("active");
                    profileMentionsTab.classList.remove("active");
                    displayFilteredComments(); // Re-display user's own comments
                };

                profileMentionsTab.onclick = () => {
                    profileMentionsTab.classList.add("active");
                    profileCommentsTab.classList.remove("active");
                    displayProfileMentions();
                };
            }
            if (mentionsContainer) mentionsContainer.classList.add("hidden");
            // --- End of added block ---

            profileViewHeader.classList.remove("hidden");

            // Fetch all profile data in parallel
            fetchAndDisplayFollowerStats(authorAddress);
            fetchAndDisplayEnsDetails(authorAddress);
            if (
                userAddress &&
                userAddress.toLowerCase() !== authorAddress.toLowerCase()
            ) {
                fetchAndDisplayFollowState(authorAddress, userAddress);
                fetchAndDisplayCommonFollowers(authorAddress, userAddress);
            } else {
                // Hide elements that are only relevant when viewing another profile
                followButton.classList.add("hidden");
                commonFollowersSection.classList.add("hidden");
            }
        }

        // Re-render comments for the selected author
        displayFilteredComments();
        updateNewCommentAreaVisibility();
    }

    function hideUserProfile() {
        currentProfileFilter = null;
        if (profileViewHeader) {
            profileViewHeader.classList.add("hidden");
        }
        // Add these lines:
        if (profileViewTabs) profileViewTabs.classList.add("hidden");
        if (mentionsContainer) mentionsContainer.classList.add("hidden");

        // Also hide extended profile sections
        if (profileViewDescription)
            profileViewDescription.classList.add("hidden");
        if (profileViewSocials) profileViewSocials.classList.add("hidden");
        if (followButton) followButton.classList.add("hidden");
        if (profileFollowState) profileFollowState.classList.add("hidden");
        if (commonFollowersSection)
            commonFollowersSection.classList.add("hidden");

        // Re-render comments based on the last active channel filter
        displayFilteredComments(currentChannelFilter);
        updateNewCommentAreaVisibility();
    }

    function processCommentsAndLikes(comments) {
        const likerLists = new Map(); // Map<parentId, Set<authorAddress>>
        const contentComments = [];

        comments.forEach((comment) => {
            if (
                comment.commentType === COMMENT_TYPE_REACTION &&
                comment.content === REACTION_CONTENT_LIKE &&
                comment.parentId
            ) {
                if (!likerLists.has(comment.parentId)) {
                    likerLists.set(comment.parentId, new Set());
                }
                likerLists.get(comment.parentId).add(comment.author);
            } else {
                contentComments.push(comment);
            }
        });

        // Derive likeCounts from the size of the sets for uniqueness
        const likeCounts = new Map();
        for (const [parentId, likers] of likerLists.entries()) {
            likeCounts.set(parentId, likers.size);
        }

        return {contentComments, likeCounts, likerLists};
    }

    async function fetchComments(cursor = null) {
        try {
            const response = await fetch(ECP_API_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
                body: JSON.stringify({
                    query: COMMENTS_QUERY,
                    variables: {limit: COMMENT_FETCH_LIMIT, after: cursor},
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
                    pageInfo: {hasNextPage: false, endCursor: null},
                }
            );
        } catch (error) {
            console.error("Error fetching comments:", error);
            throw error;
        }
    }

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
                const parent = commentMap.get(comment.parentId);
                parent.children.push(comment);
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
        if (!address || address.length < 10) return address;

        // 1. Synchronously check cache. If a valid ENS name exists, return it immediately.
        if (ensCache.has(address)) {
            const cached = ensCache.get(address);
            if (cached !== address) {
                return cached; // Return the cached ENS name directly.
            }
            // If cached value is the address itself, it means "not found", so fall through.
        }

        const shortAddress = `${address.substring(0, 6)}...${address.substring(
            address.length - 4
        )}`;

        // 2. If not in cache, perform the lookup asynchronously.
        // This is a fire-and-forget function to update the UI later.
        const resolveAndApplyEns = async () => {
            if (!elementToUpdate || !ethers.utils.isAddress(address)) {
                return;
            }

            // Check for a pending lookup to avoid duplicate requests.
            if (pendingEnsLookups.has(address)) {
                try {
                    const ensName = await pendingEnsLookups.get(address);
                    if (ensName) elementToUpdate.textContent = ensName;
                } catch (e) {
                    /* Pending lookup failed, do nothing. */
                }
                return;
            }

            // No cached result, no pending lookup. Start a new one.
            try {
                const lookupPromise = ensProvider.lookupAddress(address);
                pendingEnsLookups.set(address, lookupPromise);

                const ensName = await lookupPromise;

                if (ensName) {
                    ensCache.set(address, ensName);
                    elementToUpdate.textContent = ensName;
                } else {
                    ensCache.set(address, address); // Cache "not found"
                }
            } catch (error) {
                console.warn(`ENS lookup failed for ${address}:`, error);
            } finally {
                pendingEnsLookups.delete(address);
            }
        };

        resolveAndApplyEns();

        // 3. Return the short address for immediate display.
        return shortAddress;
    }

    async function resolveAndApplyAvatar(address, elementToUpdate) {
        if (!elementToUpdate || !ethers.utils.isAddress(address)) {
            return;
        }

        // Reset the element's style to default before doing anything else.
        // This prevents showing a stale avatar from a previous user.
        elementToUpdate.style.backgroundImage = "";

        // 1. Check cache for a completed lookup.
        if (avatarCache.has(address)) {
            const cachedUrl = avatarCache.get(address);
            if (cachedUrl && cachedUrl !== address) {
                // It's a valid URL
                elementToUpdate.style.backgroundImage = `url('${cachedUrl}')`;
            }
            // If no valid URL, the reset style remains, which is correct.
            return;
        }

        // 2. Check for a pending lookup to avoid duplicate requests.
        if (pendingAvatarLookups.has(address)) {
            try {
                const avatarUrl = await pendingAvatarLookups.get(address);
                if (avatarUrl) {
                    elementToUpdate.style.backgroundImage = `url('${avatarUrl}')`;
                }
                // If avatarUrl is null, the reset style remains.
            } catch (e) {
                // The pending lookup failed, do nothing. The reset style remains.
            }
            return;
        }

        // 3. No cached result, no pending lookup. Start a new one.
        try {
            const lookupPromise = ensProvider.getAvatar(address);
            pendingAvatarLookups.set(address, lookupPromise);

            const avatarUrl = await lookupPromise;

            if (avatarUrl) {
                avatarCache.set(address, avatarUrl);
                elementToUpdate.style.backgroundImage = `url('${avatarUrl}')`;
            } else {
                // Cache the address to indicate we've checked and found no avatar
                avatarCache.set(address, address);
                // The reset style remains, which is correct.
            }
        } catch (error) {
            console.warn(`Avatar lookup failed for ${address}:`, error);
        } finally {
            pendingAvatarLookups.delete(address);
        }
    }

    function formatDate(timestamp) {
        if (!timestamp) return "Unknown date";
        const options = {
            year: "numeric",
            month: "numeric",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
        };
        return new Date(parseInt(timestamp)).toLocaleString(undefined, options);
    }

    function renderContentWithEmbeds(content) {
        const fragment = document.createDocumentFragment();

        // Regex to find a URL OR a mention. Capture groups are key.
        // Group 1: Full URL
        // Group 2: Full Mention (e.g., @0x123...)
        // Group 3: Mentioned Address (e.g., 0x123...)
        const combinedRegex = /(https?:\/\/[^\s]+)|(@(0x[a-fA-F0-9]{40}))/gi;

        // Regex to check if a URL is an image
        const imageRegex = /\.(jpg|jpeg|png|gif|webp)$/i;

        let lastIndex = 0;
        let match;

        while ((match = combinedRegex.exec(content)) !== null) {
            // 1. Append any plain text before the match
            if (match.index > lastIndex) {
                fragment.appendChild(
                    document.createTextNode(
                        content.substring(lastIndex, match.index)
                    )
                );
            }

            const urlMatch = match[1];
            const mentionAddress = match[3];

            if (urlMatch) {
                // It's a URL
                if (imageRegex.test(urlMatch)) {
                    // It's an image URL: create an embed
                    const link = document.createElement("a");
                    link.href = urlMatch;
                    link.target = "_blank";
                    link.rel = "noopener noreferrer";
                    link.title = "View full-size image";

                    const image = document.createElement("img");
                    image.src = urlMatch;
                    image.alt = "User-posted image";
                    image.classList.add("embedded-image");
                    link.appendChild(image);
                    fragment.appendChild(link);
                } else {
                    // It's a regular link
                    const link = document.createElement("a");
                    link.href = urlMatch;
                    link.target = "_blank";
                    link.rel = "noopener noreferrer";
                    link.textContent =
                        urlMatch.length > 50
                            ? urlMatch.substring(0, 47) + "..."
                            : urlMatch;
                    link.title = urlMatch;
                    fragment.appendChild(link);
                }
            } else if (mentionAddress) {
                // It's a mention
                const mentionLink = document.createElement("a");
                mentionLink.href = "#";
                mentionLink.classList.add("mention-link");

                const nameHolder = document.createElement("span");
                nameHolder.textContent = formatAddress(
                    mentionAddress,
                    nameHolder
                );

                mentionLink.appendChild(document.createTextNode("@"));
                mentionLink.appendChild(nameHolder);

                mentionLink.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    showUserProfile(mentionAddress);
                };
                fragment.appendChild(mentionLink);
            }

            lastIndex = combinedRegex.lastIndex;
        }

        // 3. Append any remaining plain text after the last match
        if (lastIndex < content.length) {
            fragment.appendChild(
                document.createTextNode(content.substring(lastIndex))
            );
        }

        return fragment;
    }

    function renderComment(comment, depth = 0) {
        const commentDiv = document.createElement("div");
        commentDiv.classList.add("comment");
        commentDiv.style.marginLeft = `${depth * 10}px`;

        const header = document.createElement("div");
        header.classList.add("comment-header");

        const headerInfoLeft = document.createElement("div");
        headerInfoLeft.classList.add("comment-header-info-left");

        // --- Start of new author/app structure ---
        const authorSpan = document.createElement("span");
        authorSpan.classList.add("author");

        const avatarDiv = document.createElement("div");
        avatarDiv.classList.add("author-avatar");
        avatarDiv.style.cursor = "pointer"; // Make it look clickable
        avatarDiv.title = "View Profile"; // Add a tooltip
        avatarDiv.onclick = () => showUserProfile(comment.author); // Add this line
        resolveAndApplyAvatar(comment.author, avatarDiv);

        const authorDetailsDiv = document.createElement("div");
        authorDetailsDiv.classList.add("author-details");

        const authorLink = document.createElement("a");
        authorLink.classList.add("author-link");
        authorLink.href = `https://basescan.org/address/${comment.author}`;
        authorLink.target = "_blank";
        authorLink.textContent = formatAddress(comment.author, authorLink);
        authorDetailsDiv.appendChild(authorLink);

        // Conditionally add the "App" line
        if (comment.app.toLowerCase() !== comment.author.toLowerCase()) {
            const appSpan = document.createElement("span");
            appSpan.classList.add("app");

            const appLabel = document.createTextNode("App: ");
            const appLink = document.createElement("a");
            appLink.href = `https://basescan.org/address/${comment.app}`;
            appLink.target = "_blank";
            appLink.textContent = formatAddress(comment.app, appLink);

            appSpan.appendChild(appLabel);
            appSpan.appendChild(appLink);
            authorDetailsDiv.appendChild(appSpan);
        }

        authorSpan.appendChild(avatarDiv);
        authorSpan.appendChild(authorDetailsDiv);
        // --- End of new author/app structure ---

        const dateSpan = document.createElement("span");
        dateSpan.classList.add("date");
        dateSpan.textContent = formatDate(comment.createdAt);

        headerInfoLeft.appendChild(authorSpan);

        header.appendChild(headerInfoLeft);
        header.appendChild(dateSpan);

        commentDiv.appendChild(header);

        const contentP = document.createElement("p");
        contentP.classList.add("comment-content");

        // Handle collapsible long comments
        if (comment.content.length > MAX_COMMENT_LENGTH) {
            const truncatedContent =
                comment.content.substring(0, MAX_COMMENT_LENGTH) + "...";

            // Initial state: show truncated content
            contentP.appendChild(renderContentWithEmbeds(truncatedContent));
            commentDiv.appendChild(contentP);

            const toggleButton = document.createElement("button");
            toggleButton.classList.add("toggle-content-button");
            toggleButton.textContent = "Show more";

            let isExpanded = false;

            toggleButton.onclick = () => {
                isExpanded = !isExpanded;
                contentP.innerHTML = ""; // Clear current content

                if (isExpanded) {
                    contentP.appendChild(
                        renderContentWithEmbeds(comment.content)
                    );
                    toggleButton.textContent = "Show less";
                } else {
                    contentP.appendChild(
                        renderContentWithEmbeds(truncatedContent)
                    );
                    toggleButton.textContent = "Show more";
                }
            };

            // Insert the button right after the content paragraph
            commentDiv.appendChild(toggleButton);
        } else {
            // Standard logic for short comments
            contentP.appendChild(renderContentWithEmbeds(comment.content));
            commentDiv.appendChild(contentP);
        }

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
            txLinkIcon.rel = "noopener noreferrer";
            txLinkIcon.title = "View Transaction";
            txLinkIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M8.636 3.5a.5.5 0 0 0-.5-.5H1.5A1.5 1.5 0 0 0 0 4.5v10A1.5 1.5 0 0 0 1.5 16h10a1.5 1.5 0 0 0 1.5-1.5V7.864a.5.5 0 0 0-1 0V14.5a.5.5 0 0 1-.5.5h-10a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5h6.636a.5.5 0 0 0 .5-.5z"/><path fill-rule="evenodd" d="M16 .5a.5.5 0 0 0-.5-.5h-5a.5.5 0 0 0 0 1h3.793L6.146 9.146a.5.5 0 1 0 .708.708L15 1.707V5.5a.5.5 0 0 0 1 0v-5z"/></svg>`;
            commentDiv.appendChild(txLinkIcon);
        }

        // Add Like Count and Like Button
        const likeSectionDiv = document.createElement("div");
        likeSectionDiv.classList.add("like-section");

        const likers = window.likerLists.get(comment.id) || new Set();
        const currentLikes = likers.size;

        // Create a container for the count and tooltip
        const tooltipContainer = document.createElement("div");
        tooltipContainer.classList.add("like-tooltip-container");

        const likeCountSpan = document.createElement("span");
        likeCountSpan.classList.add("like-count");
        likeCountSpan.innerHTML = `<img src="https://www.cryptologos.cc/logos/ethereum-eth-logo.svg?v=040" alt="Likes" class="like-icon"> ${currentLikes}`;
        tooltipContainer.appendChild(likeCountSpan);

        if (currentLikes > 0) {
            const tooltip = document.createElement("div");
            tooltip.classList.add("like-tooltip");

            likers.forEach((likerAddress) => {
                const likerDiv = document.createElement("div");
                likerDiv.classList.add("tooltip-liker");
                // Use formatAddress to get short address immediately and update with ENS later
                likerDiv.textContent = formatAddress(likerAddress, likerDiv);
                tooltip.appendChild(likerDiv);
            });
            tooltipContainer.appendChild(tooltip);
        }

        likeSectionDiv.appendChild(tooltipContainer);

        if (userAddress && isOnCorrectNetwork) {
            // --- Like Button ---
            const likeButton = document.createElement("button");
            likeButton.classList.add("action-button");
            likeButton.textContent = "Like";

            likeButton.onclick = async () => {
                likeButton.disabled = true;
                likeButton.textContent = "Liking...";

                const parentChannelId =
                    comment.channelId && String(comment.channelId) !== "0"
                        ? String(comment.channelId)
                        : "0";
                let success = false;
                try {
                    await submitEcpComment(
                        REACTION_CONTENT_LIKE,
                        parentChannelId,
                        comment.id,
                        postStatusMessage, // Using global status for simplicity
                        COMMENT_TYPE_REACTION
                    );
                    success = true;
                } catch (error) {
                    // Error message is handled by submitEcpComment.
                } finally {
                    if (!success) {
                        likeButton.textContent = "Like";
                        likeButton.disabled = false;
                    }
                }
            };
            likeSectionDiv.appendChild(likeButton);

            // --- Reply Button and Form ---
            const replyButton = document.createElement("button");
            replyButton.classList.add("action-button");
            replyButton.textContent = "Reply";
            likeSectionDiv.appendChild(replyButton); // Add to same container as Like button

            const replyFormDiv = document.createElement("div");
            replyFormDiv.classList.add("reply-form");
            replyFormDiv.style.display = "none";
            replyFormDiv.innerHTML = `
                <textarea placeholder="Write your reply..." rows="2"></textarea>
                <button class="submit-reply-button">Post Reply</button>
                <button class="cancel-reply-button">Cancel</button>
                <p class="status-message reply-status-message" style="font-size:0.8em; margin-top:5px; display:none;"></p>
            `;
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
                // Hide the entire action section when replying to avoid clutter
                likeSectionDiv.style.display = isVisible ? "flex" : "none";
                if (!isVisible) replyTextarea.focus();
                showPostStatus("", false, replyStatusMsgElement);
            };

            cancelReplyBtn.onclick = () => {
                replyFormDiv.style.display = "none";
                likeSectionDiv.style.display = "flex"; // Show the action section again
                replyTextarea.value = "";
                showPostStatus("", false, replyStatusMsgElement);
            };

            submitReplyBtn.onclick = async () => {
                const replyContent = replyTextarea.value;
                const parentChannelId =
                    comment.channelId && String(comment.channelId) !== "0"
                        ? String(comment.channelId)
                        : "0";
                submitReplyBtn.disabled = true;
                cancelReplyBtn.disabled = true;
                showPostStatus(
                    "Posting reply...",
                    false,
                    replyStatusMsgElement
                );
                try {
                    await submitEcpComment(
                        replyContent,
                        parentChannelId,
                        comment.id,
                        replyStatusMsgElement
                    );
                    replyTextarea.value = "";
                    replyFormDiv.style.display = "none";
                    likeSectionDiv.style.display = "flex"; // Show the action section again
                } catch (e) {
                    // Error handled by submitEcpComment
                } finally {
                    submitReplyBtn.disabled = false;
                    cancelReplyBtn.disabled = false;
                }
            };
        }
        commentDiv.appendChild(likeSectionDiv);

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
        hideUserProfile(); // Exit profile view when a channel is clicked
        displayFilteredComments(filterId);
        if (window.innerWidth <= 768) {
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
        channelMenuContainer.innerHTML = "";
        const menuTitle = document.createElement("h3");
        menuTitle.textContent = "Channels";
        channelMenuContainer.appendChild(menuTitle);

        // Note: allFetchedComments here refers to content comments only (after processing)
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
        if (currentChannelFilter === null)
            viewAllButton.classList.add("active-channel");
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
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
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
        // If a channelId is passed, update the global filter state.
        // This is important for when we return from a profile view.
        if (filterChannelId !== undefined) {
            currentChannelFilter = filterChannelId;
        }

        let commentsToDisplay;

        if (currentProfileFilter) {
            // --- Add this block ---
            // When in profile view, ensure mentions container is hidden
            // and comments container is visible.
            if (mentionsContainer) mentionsContainer.classList.add("hidden");
            if (commentsContainer) commentsContainer.classList.remove("hidden");
            // --- End of added block ---

            // Profile view takes precedence. Find all comments by the user and their parent threads.
            const commentMap = new Map(
                allFetchedComments.map((c) => [c.id, c])
            );
            const userComments = allFetchedComments.filter(
                (c) =>
                    c.author.toLowerCase() ===
                    currentProfileFilter.toLowerCase()
            );
            const finalCommentIds = new Set();

            userComments.forEach((userComment) => {
                finalCommentIds.add(userComment.id);
                let currentParentId = userComment.parentId;
                // Traverse up the tree to include the entire conversation thread
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
            // 'All Comments' view
            commentsToDisplay = allFetchedComments;
        } else if (currentChannelFilter === 0) {
            // 'No Channel' view
            commentsToDisplay = allFetchedComments.filter(
                (comment) =>
                    comment.channelId === null ||
                    comment.channelId === undefined ||
                    comment.channelId === 0 ||
                    String(comment.channelId) === "0"
            );
        } else {
            // Specific channel view
            commentsToDisplay = allFetchedComments.filter(
                (comment) =>
                    String(comment.channelId) === String(currentChannelFilter)
            );
        }

        commentsContainer.innerHTML = "";
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
                    commentsContainer.appendChild(renderComment(comment));
                });
            }
        }
        renderChannelMenu();
    }

    async function initializeCommentsView() {
        const wasInitialLoad = isInitialLoad; // Capture the state for this specific call

        if (wasInitialLoad) {
            showLoadingMessage(); // Clears commentsContainer and shows "Loading comments..."
        } else {
            if (refreshButton) {
                refreshButton.classList.add("loading");
                refreshButton.disabled = true;
            }
        }

        // Reset all state for a full refresh
        currentCursor = null;
        hasNextPage = true;
        isLoadingMore = false;
        allFetchedComments = [];
        window.currentLikeCounts.clear();
        window.likerLists.clear();

        try {
            const {items: rawFetchedComments, pageInfo} = await fetchComments();

            const {contentComments, likeCounts, likerLists} =
                processCommentsAndLikes(rawFetchedComments || []);
            window.currentLikeCounts = likeCounts;
            window.likerLists = likerLists; // Store the new data
            allFetchedComments = contentComments; // This now holds only the first page of comments

            // Set pagination state from the first fetch
            currentCursor = pageInfo.endCursor;
            hasNextPage = pageInfo.hasNextPage;

            if (allFetchedComments.length === 0) {
                const message =
                    rawFetchedComments && rawFetchedComments.length > 0
                        ? "No displayable comments found (all items might be reactions or other types)."
                        : "No comments found.";
                showNoCommentsMessage(message);
                renderChannelMenu();
                if (wasInitialLoad) {
                    isInitialLoad = false;
                }
                if (!wasInitialLoad && refreshButton) {
                    refreshButton.classList.remove("loading");
                    refreshButton.disabled = false;
                }
                return;
            }

            displayFilteredComments(currentChannelFilter);

            if (wasInitialLoad) {
                isInitialLoad = false;
            }
        } catch (error) {
            allFetchedComments = [];
            window.currentLikeCounts.clear();
            window.likerLists.clear();

            if (wasInitialLoad) {
                showErrorMessage(`Failed to load comments: ${error.message}`);
            } else {
                console.error("Background refresh failed:", error);
                if (postStatusMessage)
                    showPostStatus(
                        `Refresh failed: ${error.message}`,
                        true,
                        postStatusMessage
                    );
            }
            renderChannelMenu();
        } finally {
            if (!wasInitialLoad && refreshButton) {
                refreshButton.classList.remove("loading");
                refreshButton.disabled = false;
            }
        }
    }

    if (refreshButton) {
        refreshButton.addEventListener("click", initializeCommentsView);
    }
    if (logoElement) {
        logoElement.addEventListener("click", () => {
            hideUserProfile();
            handleChannelClick(null);
        });
    } else {
        console.warn("Logo element with ID 'logo' not found.");
    }

    if (backToCommentsButton) {
        backToCommentsButton.addEventListener("click", hideUserProfile);
    }

    if (connectWalletButton) {
        connectWalletButton.addEventListener("click", connectWallet);
    }
    if (submitNewCommentButton) {
        submitNewCommentButton.addEventListener("click", () => {
            const content = newCommentContent.value;
            const channelId = newCommentChannelId.value;
            submitNewCommentButton.disabled = true;
            showPostStatus("Posting new comment...", false, postStatusMessage);
            submitEcpComment(content, channelId, null, postStatusMessage) // commentType 0 by default
                .catch(() => {
                    /* Error handled */
                })
                .finally(() => {
                    submitNewCommentButton.disabled = false;
                });
        });
    }

    if (userProfileDiv) {
        userProfileDiv.addEventListener("click", (event) => {
            event.stopPropagation();
            if (logoutPopup) logoutPopup.classList.toggle("hidden");
        });
    }

    if (logoutButton) {
        logoutButton.addEventListener("click", (event) => {
            event.stopPropagation();
            logout();
        });
    }

    window.addEventListener("click", () => {
        if (logoutPopup && !logoutPopup.classList.contains("hidden")) {
            logoutPopup.classList.add("hidden");
        }
    });

    window.addEventListener("scroll", () => {
        if (isLoadingMore || !hasNextPage) return;

        // Trigger when user is near the bottom of the page
        const buffer = 300; // Load 300px before hitting the bottom
        if (
            window.innerHeight + window.scrollY >=
            document.body.offsetHeight - buffer
        ) {
            // Only trigger infinite scroll on the main feed (no profile or channel filters)
            if (!currentProfileFilter && currentChannelFilter === null) {
                loadMoreComments();
            }
        }
    });

    initializeCommentsView();
});
