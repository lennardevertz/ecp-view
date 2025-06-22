let allFetchedComments = [];
let currentChannelFilter = null; // null for 'All Comments', 0 for 'No Channel', channelId for specific channel

// Add these:
const COMMENT_MANAGER_ADDRESS = "0x5AA15C66D84E8BCbC4FDB696D647Db5f7D30b7D8";
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

// Add these:
const TARGET_CHAIN_ID = 84532;
const TARGET_CHAIN_ID_HEX = "0x14A34"; // Hex representation of 84532
const BASE_SEPOLIA_RPC_URL = "https://sepolia.base.org";
const BASE_SEPOLIA_EXPLORER_URL = "https://sepolia-explorer.base.org";
const BASE_SEPOLIA_CHAIN_NAME = "Base Sepolia Testnet";

// Add these for reactions:
const COMMENT_TYPE_REACTION = 1;
const REACTION_CONTENT_LIKE = "like";

// Wallet related global variables
let eip6963Providers = []; // To store discovered EIP-6963 providers
let selectedProviderDetail = null; // To store the EIP6963ProviderDetail of the chosen wallet
let ethersProvider; // This will be the Ethers.js provider instance
let signer;
let userAddress;
let commentManagerContract;
let isOnCorrectNetwork = false; // New global flag
window.currentLikeCounts = new Map(); // To store like counts for comments
let isInitialLoad = true; // <-- Add this line

document.addEventListener("DOMContentLoaded", () => {
    const refreshButton = document.getElementById("refresh-button");
    const commentsContainer = document.getElementById("comments-container");
    const logoElement = document.getElementById("logo"); // Get logo element
    const burgerMenuButton = document.getElementById("burger-menu-button");
    const channelMenu = document.getElementById("channel-menu"); // Get the channel menu itself

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
    async function switchToBaseSepolia(rawProvider) {
        try {
            await rawProvider.request({
                method: "wallet_switchEthereumChain",
                params: [{chainId: TARGET_CHAIN_ID_HEX}],
            });
            console.log("Switched to Base Sepolia successfully.");
            return true;
        } catch (switchError) {
            // This error code indicates that the chain has not been added to MetaMask/wallet.
            if (switchError.code === 4902) {
                console.log(
                    "Base Sepolia not found in wallet, attempting to add it."
                );
                try {
                    await rawProvider.request({
                        method: "wallet_addEthereumChain",
                        params: [
                            {
                                chainId: TARGET_CHAIN_ID_HEX,
                                chainName: BASE_SEPOLIA_CHAIN_NAME,
                                nativeCurrency: {
                                    name: "Ethereum",
                                    symbol: "ETH", // Base Sepolia uses ETH
                                    decimals: 18,
                                },
                                rpcUrls: [BASE_SEPOLIA_RPC_URL],
                                blockExplorerUrls: [BASE_SEPOLIA_EXPLORER_URL],
                            },
                        ],
                    });
                    console.log(
                        "Base Sepolia added and switched successfully."
                    );
                    return true;
                } catch (addError) {
                    console.error(
                        "Failed to add Base Sepolia network:",
                        addError
                    );
                    return false;
                }
            }
            console.error(
                "Failed to switch to Base Sepolia network:",
                switchError
            );
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
                const switched = await switchToBaseSepolia(rawProvider);
                if (!switched) {
                    isOnCorrectNetwork = false;
                    if (connectWalletButton) {
                        connectWalletButton.textContent = `Switch to ${BASE_SEPOLIA_CHAIN_NAME.replace(
                            " Testnet",
                            ""
                        )}`;
                        connectWalletButton.disabled = false; // Allow user to click again to try switching
                    }
                    if (newCommentArea) newCommentArea.style.display = "none";
                    showPostStatus(
                        `Please switch your wallet to ${BASE_SEPOLIA_CHAIN_NAME} to proceed.`,
                        true
                    );
                    initializeCommentsView(); // Re-render to update reply buttons state
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

            if (connectWalletButton) {
                connectWalletButton.textContent = `${formatAddress(
                    userAddress
                )}`;
                connectWalletButton.disabled = true;
            }
            if (newCommentArea) newCommentArea.style.display = "block";
            showPostStatus("", false);
            initializeCommentsView(); // Refresh comments, reply buttons will now be enabled
        } catch (error) {
            console.error(
                "Error connecting wallet or switching network:",
                error
            );
            isOnCorrectNetwork = false;
            selectedProviderDetail = null;
            showPostStatus(
                `Error: ${
                    error.message || "Could not connect/switch network."
                }`,
                true
            );
            if (connectWalletButton) {
                connectWalletButton.textContent =
                    eip6963Providers.length > 0
                        ? "Connect Wallet"
                        : "No Wallets Found";
                connectWalletButton.disabled = eip6963Providers.length === 0;
            }
            if (newCommentArea) newCommentArea.style.display = "none";
            initializeCommentsView(); // Re-render to update reply buttons state
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
                `Please connect to the ${BASE_SEPOLIA_CHAIN_NAME} network to post.`,
                true,
                statusElement
            );
            return Promise.reject("Wrong network or provider not ready");
        }
        const network = await ethersProvider.getNetwork();
        if (network.chainId !== TARGET_CHAIN_ID) {
            isOnCorrectNetwork = false;
            showPostStatus(
                `You are on the wrong network. Please switch to ${BASE_SEPOLIA_CHAIN_NAME}.`,
                true,
                statusElement
            );
            if (connectWalletButton && userAddress) {
                // Update button if user was connected
                connectWalletButton.textContent = `${formatAddress(
                    userAddress
                )}`;
                connectWalletButton.disabled = false;
            }
            if (newCommentArea) newCommentArea.style.display = "none";
            initializeCommentsView();
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

    function processCommentsAndLikes(comments) {
        const likeCounts = new Map(); // Map<parentId, count>
        const contentComments = []; // Array of comments that are not "likes"

        comments.forEach((comment) => {
            if (
                comment.commentType === COMMENT_TYPE_REACTION &&
                comment.content === REACTION_CONTENT_LIKE &&
                comment.parentId
            ) {
                // This is a "like" reaction
                likeCounts.set(
                    comment.parentId,
                    (likeCounts.get(comment.parentId) || 0) + 1
                );
            } else {
                // This is a regular comment or another type of reaction we're not specifically handling as a "like count"
                contentComments.push(comment);
            }
        });
        return {contentComments, likeCounts};
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
            throw error;
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
                tree.push(comment);
            }
        });

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
        commentDiv.style.marginLeft = `${depth * 10}px`;

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

        if (comment.txHash) {
            const txLinkDiv = document.createElement("div");
            txLinkDiv.classList.add("comment-tx-link");
            const txLink = document.createElement("a");
            txLink.href = `https://sepolia.basescan.org/tx/${comment.txHash}`;
            txLink.target = "_blank";
            txLink.rel = "noopener noreferrer";
            txLink.textContent = "View Transaction";
            txLinkDiv.appendChild(txLink);
            commentDiv.appendChild(txLinkDiv);
        }

        // Add Like Count and Like Button
        const likeSectionDiv = document.createElement("div");
        likeSectionDiv.classList.add("like-section");

        const likeCountSpan = document.createElement("span");
        likeCountSpan.classList.add("like-count");
        const currentLikes = window.currentLikeCounts.get(comment.id) || 0;
        likeCountSpan.textContent = `❤️ ${currentLikes}`;
        likeSectionDiv.appendChild(likeCountSpan);

        if (userAddress && isOnCorrectNetwork) {
            const likeButton = document.createElement("button");
            likeButton.classList.add("like-button");
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
                    // On success, submitEcpComment schedules a refresh, button will be re-rendered.
                } catch (error) {
                    // Error message is handled by submitEcpComment.
                } finally {
                    if (!success) {
                        // If not successful, reset the button state.
                        likeButton.textContent = "Like";
                        likeButton.disabled = false;
                    }
                    // If successful, the button is gone due to refresh.
                }
            };
            likeSectionDiv.appendChild(likeButton);
        }
        commentDiv.appendChild(likeSectionDiv);

        if (userAddress && isOnCorrectNetwork) {
            const replyButtonContainer = document.createElement("div");
            replyButtonContainer.classList.add("reply-button-container");
            const replyButton = document.createElement("button");
            replyButton.classList.add("reply-button");
            replyButton.textContent = "Reply";
            replyButtonContainer.appendChild(replyButton);
            commentDiv.appendChild(replyButtonContainer);

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
                replyButtonContainer.style.display = isVisible
                    ? "block"
                    : "none";
                if (!isVisible) replyTextarea.focus();
                showPostStatus("", false, replyStatusMsgElement);
            };

            cancelReplyBtn.onclick = () => {
                replyFormDiv.style.display = "none";
                replyButtonContainer.style.display = "block";
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
                        // Implicitly commentType 0 for replies
                    );
                    replyTextarea.value = "";
                    replyFormDiv.style.display = "none";
                    replyButtonContainer.style.display = "block";
                } catch (e) {
                    // Error handled by submitEcpComment
                } finally {
                    submitReplyBtn.disabled = false;
                    cancelReplyBtn.disabled = false;
                }
            };
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
        currentChannelFilter = filterChannelId;
        let commentsToDisplay;
        // allFetchedComments here are content comments (already filtered from likes)
        if (currentChannelFilter === null) {
            commentsToDisplay = allFetchedComments;
        } else if (currentChannelFilter === 0) {
            commentsToDisplay = allFetchedComments.filter(
                (comment) =>
                    comment.channelId === null ||
                    comment.channelId === undefined ||
                    comment.channelId === 0 ||
                    String(comment.channelId) === "0"
            );
        } else {
            commentsToDisplay = allFetchedComments.filter(
                (comment) =>
                    String(comment.channelId) === String(currentChannelFilter)
            );
        }

        commentsContainer.innerHTML = "";
        if (commentsToDisplay.length === 0) {
            if (allFetchedComments.length > 0) {
                // Content comments exist, but not for this filter
                showNoCommentsMessage("No comments found for this filter.");
            } else {
                // No content comments at all (after initial processing)
                // This case is handled by initializeCommentsView before calling displayFilteredComments
                // However, if allFetchedComments was empty to begin with, this is the right message.
                showNoCommentsMessage();
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
        renderChannelMenu();
    }

    async function initializeCommentsView() {
        const wasInitialLoad = isInitialLoad; // Capture the state for this specific call

        if (wasInitialLoad) {
            showLoadingMessage(); // Clears commentsContainer and shows "Loading comments..."
        } else {
            // For background refresh, provide a subtle loading indicator
            if (refreshButton) {
                refreshButton.textContent = "Refreshing...";
                refreshButton.disabled = true;
            }
            // Do NOT call the global showLoadingMessage() here for background refreshes.
            // displayFilteredComments will handle clearing and re-rendering the comment list.
        }

        // Update connect button state (this part remains the same)
        if (connectWalletButton) {
            if (userAddress) {
                if (isOnCorrectNetwork) {
                    connectWalletButton.textContent = `${formatAddress(
                        userAddress
                    )}`;
                    connectWalletButton.disabled = true;
                } else {
                    connectWalletButton.textContent = `${formatAddress(
                        userAddress
                    )}`;
                    connectWalletButton.disabled = false;
                }
            }
        }

        try {
            const fetchedComments = await fetchComments();
            const rawFetchedComments = fetchedComments || [];

            const {contentComments, likeCounts} =
                processCommentsAndLikes(rawFetchedComments);
            window.currentLikeCounts = likeCounts;
            allFetchedComments = contentComments; // This now holds only displayable comments

            if (allFetchedComments.length === 0) {
                // No content comments to display after processing.
                // Determine the appropriate message.
                const message =
                    rawFetchedComments.length > 0
                        ? "No displayable comments found (all items might be reactions or other types)."
                        : "No comments found.";
                showNoCommentsMessage(message); // This function clears commentsContainer.
                renderChannelMenu(); // Always render the menu.
                if (wasInitialLoad) {
                    isInitialLoad = false; // Mark initial load as done.
                }
                // Finalize button state for background refresh if it was one
                if (!wasInitialLoad && refreshButton) {
                    refreshButton.textContent = "Refresh Comments";
                    refreshButton.disabled = false;
                }
                return; // Exit early as there's nothing to display via displayFilteredComments.
            }

            // If we have content comments, displayFilteredComments will handle rendering.
            // displayFilteredComments clears commentsContainer and then renders or shows "no comments for filter".
            displayFilteredComments(currentChannelFilter);

            if (wasInitialLoad) {
                isInitialLoad = false; // Mark initial load as done after successful display.
            }
        } catch (error) {
            allFetchedComments = []; // Reset on error
            window.currentLikeCounts.clear();

            if (wasInitialLoad) {
                showErrorMessage(`Failed to load comments: ${error.message}`);
            } else {
                // For background refresh errors, log and optionally show a non-intrusive message.
                console.error("Background refresh failed:", error);
                if (postStatusMessage)
                    showPostStatus(
                        `Refresh failed: ${error.message}`,
                        true,
                        postStatusMessage
                    );
                // Do not clear existing comments on background refresh failure.
            }
            renderChannelMenu(); // Still attempt to render menu.
        } finally {
            // Re-enable refresh button if it was a background refresh.
            if (!wasInitialLoad && refreshButton) {
                refreshButton.textContent = "Refresh Comments";
                refreshButton.disabled = false;
            }
            // If it was an initial load, the refresh button wasn't in a "Refreshing..." state.
        }
    }

    if (refreshButton) {
        refreshButton.addEventListener("click", initializeCommentsView);
    }
    if (logoElement) {
        logoElement.addEventListener("click", () => handleChannelClick(null));
    } else {
        console.warn("Logo element with ID 'logo' not found.");
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

    initializeCommentsView();
});
