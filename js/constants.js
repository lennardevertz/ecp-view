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
export const DEFAULT_CHANNEL_ID =
    "100036372667656530751584069124758750674110482798070943145930443465728545275054";

// API and UI Configuration
export const ECP_API_URL = "https://api.ethcomments.xyz/";
export const COMMENTS_QUERY = `query PaginatedComments($limit: Int, $after: String) {
  comments(
    limit: $limit
    after: $after
    orderBy: "createdAt"
    orderDirection: "desc"
    where: {parentId: null}
  ) {
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
      reactionCounts
      replies {
        totalCount
      }
      flatReplies {
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
          reactionCounts
        }
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}`;
export const COMMENT_FETCH_LIMIT = 50;
export const MAX_COMMENT_LENGTH = 300;

// ENS Provider (can be shared)
export const ensProvider = new window.ethers.providers.JsonRpcProvider(
    ETH_MAINNET_RPC_URL
);

// Minimal ABIs for fetching token info
export const MINIMAL_ERC20_ABI = [
    "function name() view returns (string)",
    "function symbol() view returns (string)",
];

export const MINIMAL_ERC721_ABI = [
    "function name() view returns (string)",
    "function tokenURI(uint256 tokenId) view returns (string)",
];

export const COMMENTS_BY_AUTHOR_QUERY = `query PaginatedCommentsByAuthor($author: String!, $limit: Int, $after: String) {
  comments(
    limit: $limit
    after: $after
    orderBy: "createdAt"
    orderDirection: "desc"
    where: {author_contains: $author}
  ) {
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
      reactionCounts
      replies {
        totalCount
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}`;

export const COMMENTS_BY_IDS_QUERY = `query CommentsByIds($ids: [String!]) {
  comments(where: {id_in: $ids}) {
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
      reactionCounts
      replies {
        totalCount
      }
    }
  }
}`;

export const CHANNEL_QUERY = `query GetChannels {
  channels {
    items {
      name
      description
      metadata
      id
      owner
    }
    totalCount
  }
}`;
