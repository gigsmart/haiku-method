/**
 * GitLab GraphQL operations for H·AI·K·U browse provider.
 *
 * These queries use `graphql` tagged templates processed by relay-compiler
 * for schema validation and TypeScript type generation.
 *
 * Key differences from GitHub:
 * - Uses project(fullPath:) instead of repository(owner:, name:)
 * - Tree traversal via repository.tree(path:, ref:, recursive:)
 * - File content via repository.blobs(paths:, ref:) -> nodes { rawTextBlob }
 */
import { graphql } from "relay-runtime"

/**
 * Fetches the full .haiku/intents/ tree recursively, then fetches
 * all intent.md file contents in a second query. This query handles
 * the tree listing.
 */
export const GitLabListIntentsTreeQuery = graphql`
  query operationsListIntentsTreeQuery($fullPath: ID!, $path: String!, $ref: String) {
    project(fullPath: $fullPath) {
      repository {
        tree(path: $path, ref: $ref, recursive: false) {
          trees(first: 100) {
            nodes {
              name
              path
            }
          }
        }
      }
    }
  }
`

/**
 * Fetches blob content for multiple files at once.
 * Used to batch-load intent.md files after listing the tree.
 * GitLab's repository.blobs takes an array of paths.
 */
export const GitLabBatchBlobsQuery = graphql`
  query operationsBatchBlobsQuery($fullPath: ID!, $paths: [String!]!, $ref: String) {
    project(fullPath: $fullPath) {
      repository {
        blobs(paths: $paths, ref: $ref, first: 100) {
          nodes {
            name
            path
            rawTextBlob
            rawPath
          }
        }
      }
    }
  }
`

/**
 * Fetches the full recursive tree for an intent's stages directory.
 * Returns all blobs and trees so we can reconstruct the full hierarchy.
 */
export const GitLabIntentTreeQuery = graphql`
  query operationsIntentTreeQuery($fullPath: ID!, $path: String!, $ref: String) {
    project(fullPath: $fullPath) {
      repository {
        tree(path: $path, ref: $ref, recursive: true) {
          blobs(first: 500) {
            nodes {
              name
              path
            }
          }
          trees(first: 100) {
            nodes {
              name
              path
            }
          }
        }
      }
    }
  }
`

/**
 * Reads a single file from the repository.
 * Used for readFile() calls.
 */
export const GitLabReadFileQuery = graphql`
  query operationsReadFileQuery($fullPath: ID!, $paths: [String!]!, $ref: String) {
    project(fullPath: $fullPath) {
      repository {
        blobs(paths: $paths, ref: $ref, first: 1) {
          nodes {
            path
            rawTextBlob
          }
        }
      }
    }
  }
`

/**
 * Lists entries in a directory (non-recursive).
 * Used for listFiles() calls.
 */
export const GitLabListFilesQuery = graphql`
  query operationsListFilesQuery($fullPath: ID!, $path: String!, $ref: String) {
    project(fullPath: $fullPath) {
      repository {
        tree(path: $path, ref: $ref, recursive: false) {
          blobs(first: 100) {
            nodes {
              name
              path
            }
          }
          trees(first: 100) {
            nodes {
              name
              path
            }
          }
        }
      }
    }
  }
`

/**
 * Lists branch names matching a search pattern.
 * Used to discover haiku/* branches for the branch-scanning flow.
 */
export const GitLabListBranchNamesQuery = graphql`
  query operationsListBranchNamesQuery($fullPath: ID!, $searchPattern: String!, $offset: Int!, $limit: Int!) {
    project(fullPath: $fullPath) {
      repository {
        branchNames(searchPattern: $searchPattern, offset: $offset, limit: $limit)
      }
    }
  }
`
