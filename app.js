let allFetchedComments = [];
let currentChannelFilter = null; // null for 'All Comments', 0 for 'No Channel', channelId for specific channel

// Add these:
const COMMENT_MANAGER_ADDRESS = "0x519D00E2C60BD598a8c234785216A3037b09F0CF";
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

// Wallet related global variables
let eip6963Providers = []; // To store discovered EIP-6963 providers
let selectedProviderDetail = null; // To store the EIP6963ProviderDetail of the chosen wallet
let ethersProvider; // This will be the Ethers.js provider instance
let signer;
let userAddress;
let commentManagerContract;
let isOnCorrectNetwork = false; // New global flag

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
    const walletStatusSpan = document.getElementById("wallet-status");
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
                !userAddress
            ) {
                connectWalletButton.disabled = false;
                connectWalletButton.textContent = "Connect Wallet";
                walletStatusSpan.textContent = `${eip6963Providers.length} wallet(s) available.`;
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
                // Check !userAddress to not override "Connected" status
                if (connectWalletButton) {
                    connectWalletButton.disabled = true;
                    connectWalletButton.textContent = "No Wallets Found";
                }
                if (walletStatusSpan) {
                    walletStatusSpan.textContent =
                        "No EIP-6963 wallets detected.";
                }
            } else if (eip6963Providers.length > 0 && !userAddress) {
                if (connectWalletButton) {
                    connectWalletButton.disabled = false;
                    connectWalletButton.textContent = "Connect Wallet";
                }
                // Update status to reflect number of wallets or a generic message
                if (walletStatusSpan) {
                    walletStatusSpan.textContent = `${eip6963Providers.length} wallet(s) available.`;
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
            if (walletStatusSpan)
                walletStatusSpan.textContent = "No wallets detected.";
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
                    if (walletStatusSpan)
                        walletStatusSpan.textContent = `Wrong Network. Please switch to ${BASE_SEPOLIA_CHAIN_NAME}.`;
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

            if (walletStatusSpan)
                walletStatusSpan.textContent = `Connected: ${formatAddress(
                    userAddress
                )}`;
            if (connectWalletButton) {
                connectWalletButton.textContent = "Wallet Connected";
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
            if (walletStatusSpan)
                walletStatusSpan.textContent =
                    "Connection/Network Switch failed.";
            selectedProviderDetail = null;
            showPostStatus(
                `Error: ${
                    error.message || "Could not connect/switch network."
                }`,
                true
            );
            if (newCommentArea) newCommentArea.style.display = "none";
            initializeCommentsView(); // Re-render to update reply buttons state
        }
    }

    async function submitEcpComment(
        content,
        channelIdStr,
        parentId,
        statusElement = postStatusMessage
    ) {
        if (!signer || !commentManagerContract) {
            showPostStatus(
                "Please connect your wallet first.",
                true,
                statusElement
            );
            return Promise.reject("Wallet not connected");
        }

        // Add this network check
        if (!isOnCorrectNetwork || !ethersProvider) {
            // Also check ethersProvider for safety
            showPostStatus(
                `Please connect to the ${BASE_SEPOLIA_CHAIN_NAME} network to post.`,
                true,
                statusElement
            );
            return Promise.reject("Wrong network or provider not ready");
        }
        // Double check current network with provider, in case it changed outside our flow
        const network = await ethersProvider.getNetwork();
        if (network.chainId !== TARGET_CHAIN_ID) {
            isOnCorrectNetwork = false; // Update global flag
            showPostStatus(
                `You are on the wrong network. Please switch to ${BASE_SEPOLIA_CHAIN_NAME}.`,
                true,
                statusElement
            );
            if (newCommentArea) newCommentArea.style.display = "none"; // Hide main comment area
            initializeCommentsView(); // Re-render comments to disable reply buttons
            return Promise.reject("Wrong network");
        }
        // End of network check

        if (!content.trim()) {
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
            app: userAddress, // For this example, app is the same as author. Adjust if different.
            channelId: ethers.BigNumber.from(channelId),
            deadline: ethers.BigNumber.from(
                Math.floor(Date.now() / 1000) + 86400
            ), // 1 day from now
            parentId: parentId || ethers.constants.HashZero,
            commentType: 0, // Standard comment
            content: content,
            metadata: [], // No metadata for this example
            targetUri: "", // No target URI for this example
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
            ); // Assuming no app signature needed for this setup
            showPostStatus(
                `Transaction sent: ${formatAddress(
                    tx.hash
                )}. Waiting for confirmation...`,
                false,
                statusElement
            );

            await tx.wait();
            showPostStatus(
                "Comment posted successfully! Refreshing comments...",
                false,
                statusElement
            );

            if (!parentId || parentId === ethers.constants.HashZero) {
                // Clear main form if it was a new comment
                if (newCommentContent) newCommentContent.value = "";
                if (newCommentChannelId) newCommentChannelId.value = "";
            }
            // Reply form clearing will be handled in its own scope by the caller

            setTimeout(() => {
                initializeCommentsView(); // Refresh the entire view
                showPostStatus("", false, statusElement); // Clear status after refresh
            }, 3000); // Delay to allow indexer to catch up
            return Promise.resolve();
        } catch (error) {
            console.error("Error posting comment:", error);
            const errMsg =
                error.data?.message ||
                error.reason ||
                error.message ||
                "Failed to post comment.";
            showPostStatus(`Error: ${errMsg}`, true, statusElement);
            return Promise.reject(error);
        }
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

        // Add Reply Button and Form
        if (userAddress && isOnCorrectNetwork) {
            // Only show if wallet is connected AND on correct network
            const replyButtonContainer = document.createElement("div"); // Container for button
            replyButtonContainer.classList.add("reply-button-container");

            const replyButton = document.createElement("button");
            replyButton.classList.add("reply-button");
            replyButton.textContent = "Reply";
            replyButtonContainer.appendChild(replyButton);
            commentDiv.appendChild(replyButtonContainer);

            const replyFormDiv = document.createElement("div");
            replyFormDiv.classList.add("reply-form");
            replyFormDiv.style.display = "none"; // Initially hidden
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
                    : "none"; // Hide "Reply" button when form is open
                if (!isVisible) replyTextarea.focus();
                showPostStatus("", false, replyStatusMsgElement); // Clear status
            };

            cancelReplyBtn.onclick = () => {
                replyFormDiv.style.display = "none";
                replyButtonContainer.style.display = "block"; // Show "Reply" button again
                replyTextarea.value = "";
                showPostStatus("", false, replyStatusMsgElement);
            };

            submitReplyBtn.onclick = async () => {
                const replyContent = replyTextarea.value;
                // Replies inherit the parent's channelId. If parent has no channel or "0", reply gets "0".
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
                    // On success, submitEcpComment handles main refresh. Clear local form.
                    replyTextarea.value = "";
                    replyFormDiv.style.display = "none";
                    replyButtonContainer.style.display = "block";
                    // Status is cleared by submitEcpComment after timeout
                } catch (e) {
                    // Error message is set by submitEcpComment
                    // No need to do anything here as submitEcpComment handles the status message
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
        // Close burger menu if open on mobile
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

        channelMenuContainer.innerHTML = ""; // Clear previous menu items

        const menuTitle = document.createElement("h3");
        menuTitle.textContent = "Channels";
        channelMenuContainer.appendChild(menuTitle);

        if (allFetchedComments.length === 0 && currentChannelFilter === null) {
            // Logic below will handle adding "All Comments" button.
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
            // Update wallet status display based on current state
            if (userAddress && !isOnCorrectNetwork && walletStatusSpan) {
                walletStatusSpan.textContent = `Connected: ${formatAddress(
                    userAddress
                )} (Wrong Network - Switch to ${BASE_SEPOLIA_CHAIN_NAME})`;
            } else if (userAddress && isOnCorrectNetwork && walletStatusSpan) {
                walletStatusSpan.textContent = `Connected: ${formatAddress(
                    userAddress
                )} (${
                    selectedProviderDetail?.info?.name || "Wallet"
                }) on ${BASE_SEPOLIA_CHAIN_NAME}`;
            }

            const fetchedComments = await fetchComments();
            allFetchedComments = fetchedComments || [];

            if (allFetchedComments.length === 0) {
                showNoCommentsMessage();
                renderChannelMenu(); // Still render menu for consistency
                return;
            }
            // If a filter is already set (e.g. user connected wallet and view refreshed), maintain it.
            // Otherwise, default to null (all comments).
            displayFilteredComments(currentChannelFilter);
        } catch (error) {
            allFetchedComments = []; // Clear any potentially stale data
            showErrorMessage(`Failed to load comments: ${error.message}`);
            renderChannelMenu(); // Render menu even on error
        }
    }

    if (refreshButton) {
        refreshButton.addEventListener("click", initializeCommentsView);
    }

    if (logoElement) {
        logoElement.addEventListener("click", () => {
            handleChannelClick(null);
        });
    } else {
        console.warn("Logo element with ID 'logo' not found.");
    }

    // Event Listeners for New Buttons
    if (connectWalletButton) {
        connectWalletButton.addEventListener("click", connectWallet);
    }

    if (submitNewCommentButton) {
        submitNewCommentButton.addEventListener("click", () => {
            const content = newCommentContent.value;
            const channelId = newCommentChannelId.value; // Will be parsed in submitEcpComment
            submitNewCommentButton.disabled = true;
            showPostStatus("Posting new comment...", false, postStatusMessage); // Use the main status element
            submitEcpComment(content, channelId, null, postStatusMessage) // parentId is null for new comments
                .catch(() => {
                    /* Error already handled by showPostStatus in submitEcpComment */
                })
                .finally(() => {
                    submitNewCommentButton.disabled = false; // Re-enable button
                });
        });
    }

    // Initial load
    initializeCommentsView();
});
