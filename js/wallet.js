// js/wallet.js

import {
    TARGET_CHAIN_ID,
    TARGET_CHAIN_ID_HEX,
    BASE_RPC_URL,
    BASE_EXPLORER_URL,
    BASE_CHAIN_NAME,
    COMMENT_MANAGER_ADDRESS,
    ICommentManagerABI,
} from './constants.js';

// --- Module State ---
let eip6963Providers = [];
let selectedProviderDetail = null;
let ethersProvider;
let signer;
let userAddress;
let commentManagerContract;
let isOnCorrectNetwork = false;

// --- Callbacks for UI updates ---
let onConnectCallback = () => {};
let onLogoutCallback = () => {};
let onCommentPostedCallback = () => {};

// --- Getters for external modules to read state ---
export const getUserAddress = () => userAddress;
export const getIsOnCorrectNetwork = () => isOnCorrectNetwork;
export const getEip6963Providers = () => eip6963Providers;

// --- Callback Registration ---
export function registerOnConnect(callback) { onConnectCallback = callback; }
export function registerOnLogout(callback) { onLogoutCallback = callback; }
export function registerOnCommentPosted(callback) { onCommentPostedCallback = callback; }

// --- Wallet Functions ---

function storeProvider(providerDetail) {
    const existingProvider = eip6963Providers.find(
        (p) => p.info.uuid === providerDetail.info.uuid
    );
    if (!existingProvider) {
        eip6963Providers.push(providerDetail);
    }
}

export function discoverEIP6963Providers(connectWalletButton) {
    window.addEventListener("eip6963:announceProvider", (event) => {
        storeProvider(event.detail);
        if (connectWalletButton && connectWalletButton.disabled && !userAddress) {
            connectWalletButton.disabled = false;
            connectWalletButton.textContent = "Connect Wallet";
        }
    });
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    setTimeout(() => {
        if (eip6963Providers.length === 0 && !userAddress) {
            if (connectWalletButton) {
                connectWalletButton.disabled = true;
                connectWalletButton.textContent = "No Wallets Found";
            }
        }
    }, 1000);
}

async function switchToBase(rawProvider) {
    try {
        await rawProvider.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: TARGET_CHAIN_ID_HEX }],
        });
        return true;
    } catch (switchError) {
        if (switchError.code === 4902) {
            try {
                await rawProvider.request({
                    method: "wallet_addEthereumChain",
                    params: [{
                        chainId: TARGET_CHAIN_ID_HEX,
                        chainName: BASE_CHAIN_NAME,
                        nativeCurrency: { name: "Ethereum", symbol: "ETH", decimals: 18 },
                        rpcUrls: [BASE_RPC_URL],
                        blockExplorerUrls: [BASE_EXPLORER_URL],
                    }],
                });
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

export async function connectWallet(showPostStatus, connectWalletButton) {
    if (eip6963Providers.length === 0) {
        showPostStatus("No wallet providers found.", true);
        return;
    }
    selectedProviderDetail = eip6963Providers[0];
    const rawProvider = selectedProviderDetail.provider;

    try {
        const accounts = await rawProvider.request({ method: "eth_requestAccounts" });
        if (!accounts || accounts.length === 0) throw new Error("No accounts returned.");

        ethersProvider = new window.ethers.providers.Web3Provider(rawProvider, "any");
        const network = await ethersProvider.getNetwork();

        if (network.chainId !== TARGET_CHAIN_ID) {
            const switched = await switchToBase(rawProvider);
            if (!switched) {
                logout();
                showPostStatus(`Please switch to ${BASE_CHAIN_NAME}.`, true);
                if (connectWalletButton) {
                    connectWalletButton.textContent = `Switch to ${BASE_CHAIN_NAME.replace(" Mainnet", "")}`;
                    connectWalletButton.disabled = false;
                }
                return;
            }
            ethersProvider = new window.ethers.providers.Web3Provider(rawProvider, "any");
        }

        isOnCorrectNetwork = true;
        signer = ethersProvider.getSigner();
        userAddress = await signer.getAddress();
        commentManagerContract = new window.ethers.Contract(COMMENT_MANAGER_ADDRESS, ICommentManagerABI, signer);

        showPostStatus("", false);
        onConnectCallback(); // Trigger UI update
    } catch (error) {
        console.error("Error connecting wallet:", error);
        showPostStatus(`Error: ${error.message || "Could not connect."}`, true);
        logout();
    }
}

export function logout() {
    ethersProvider = null;
    signer = null;
    userAddress = null;
    isOnCorrectNetwork = false;
    selectedProviderDetail = null;
    onLogoutCallback(); // Trigger UI update
}

export async function submitEcpComment(content, channelIdStr, parentId, statusElement, showPostStatus, commentTypeParam = 0) {
    if (!signer || !commentManagerContract) {
        showPostStatus("Please connect your wallet first.", true, statusElement);
        return Promise.reject("Wallet not connected");
    }
    if (!isOnCorrectNetwork) {
        showPostStatus(`Please connect to ${BASE_CHAIN_NAME}.`, true, statusElement);
        return Promise.reject("Wrong network");
    }

    const { ethers } = window;
    const channelId = channelIdStr && String(channelIdStr).trim() !== "" ? parseInt(channelIdStr) : 0;
    if (isNaN(channelId)) {
        showPostStatus("Invalid Channel ID.", true, statusElement);
        return Promise.reject("Invalid Channel ID");
    }

    showPostStatus("Preparing comment...", false, statusElement);
    const commentData = {
        author: userAddress,
        app: userAddress,
        channelId: ethers.BigNumber.from(channelId),
        deadline: ethers.BigNumber.from(Math.floor(Date.now() / 1000) + 86400),
        parentId: parentId || ethers.constants.HashZero,
        commentType: commentTypeParam,
        content: content,
        metadata: [],
        targetUri: "",
    };

    try {
        showPostStatus("Confirm transaction in wallet...", false, statusElement);
        const tx = await commentManagerContract.postComment(commentData, "0x");
        showPostStatus(`Transaction sent: ${tx.hash.substring(0, 10)}...`, false, statusElement);
        await tx.wait();
        showPostStatus("Action completed! Refreshing...", false, statusElement);
        onCommentPostedCallback(); // Trigger UI update
        return Promise.resolve();
    } catch (error) {
        console.error("Error performing action:", error);
        const errMsg = error.data?.message || error.reason || error.message || "Failed to perform action.";
        showPostStatus(`Error: ${errMsg}`, true, statusElement);
        return Promise.reject(error);
    }
}
