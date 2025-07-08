// js/constants.js

// ECP contract
export const COMMENT_MANAGER_ADDRESS =
    "0xb262C9278fBcac384Ef59Fc49E24d800152E19b1";
export const ICommentManagerABI = [
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

// Network Configuration
export const TARGET_CHAIN_ID = 8453;
export const TARGET_CHAIN_ID_HEX = "0x2105"; // Hex representation of 8453
export const BASE_RPC_URL = "https://base.llamarpc.com";
export const BASE_EXPLORER_URL = "https://basescan.org";
export const BASE_CHAIN_NAME = "Base Mainnet";
export const ETH_MAINNET_RPC_URL = "https://ethereum-rpc.publicnode.com";

// ECP Comment Types
export const COMMENT_TYPE_REACTION = 1;
export const REACTION_CONTENT_LIKE = "like";

// API and UI Configuration
export const ECP_API_URL = "https://api.ethcomments.xyz/";
export const COMMENTS_QUERY = `query PaginatedComments($limit: Int, $after: String) {
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
export const COMMENT_FETCH_LIMIT = 100;
export const MAX_COMMENT_LENGTH = 300;

// ENS Provider (can be shared)
export const ensProvider = new window.ethers.providers.JsonRpcProvider(
    ETH_MAINNET_RPC_URL
);
