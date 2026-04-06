/**
 * GitHub GraphQL operations for H·AI·K·U browse provider.
 *
 * These queries use `graphql` tagged templates processed by relay-compiler
 * for schema validation and TypeScript type generation.
 */
import { graphql } from "relay-runtime"

/**
 * Fetches the .haiku/intents/ tree and each intent's intent.md content
 * in a single GraphQL query. Replaces N+1 REST calls.
 *
 * The expression should be e.g. "main:.haiku/intents" or "HEAD:.haiku/intents"
 */
export const GitHubListIntentsQuery = graphql`
  query operationsListIntentsQuery($owner: String!, $name: String!, $expression: String!) {
    repository(owner: $owner, name: $name) {
      object(expression: $expression) {
        ... on Tree {
          entries {
            name
            type
            object {
              ... on Tree {
                entries {
                  name
                  type
                  object {
                    ... on Blob {
                      text
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`

/**
 * Fetches a single intent's full detail in one query:
 * - intent.md content
 * - All stages with state.json and units
 * - Knowledge files listing
 * - Operations listing
 * - reflection.md content
 *
 * Uses aliased object() fields to fetch multiple paths in one round-trip.
 */
export const GitHubGetIntentQuery = graphql`
  query operationsGetIntentQuery(
    $owner: String!
    $name: String!
    $intentExpr: String!
    $stagesExpr: String!
    $knowledgeExpr: String!
    $operationsExpr: String!
    $reflectionExpr: String!
  ) {
    repository(owner: $owner, name: $name) {
      intentFile: object(expression: $intentExpr) {
        ... on Blob {
          text
        }
      }
      stagesTree: object(expression: $stagesExpr) {
        ... on Tree {
          entries {
            name
            type
            object {
              ... on Tree {
                entries {
                  name
                  type
                  object {
                    ... on Blob {
                      text
                    }
                    ... on Tree {
                      entries {
                        name
                        type
                        object {
                          ... on Blob {
                            text
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
      knowledgeTree: object(expression: $knowledgeExpr) {
        ... on Tree {
          entries {
            name
            type
          }
        }
      }
      operationsTree: object(expression: $operationsExpr) {
        ... on Tree {
          entries {
            name
            type
          }
        }
      }
      reflectionFile: object(expression: $reflectionExpr) {
        ... on Blob {
          text
        }
      }
    }
  }
`

/**
 * Reads a single file's content from the repository via GraphQL.
 * Used for readFile() fallback.
 */
export const GitHubReadFileQuery = graphql`
  query operationsReadFileQuery($owner: String!, $name: String!, $expression: String!) {
    repository(owner: $owner, name: $name) {
      object(expression: $expression) {
        ... on Blob {
          text
        }
      }
    }
  }
`

/**
 * Lists entries in a directory (tree) via GraphQL.
 * Used for listFiles() fallback.
 */
export const GitHubListFilesQuery = graphql`
  query operationsListFilesQuery($owner: String!, $name: String!, $expression: String!) {
    repository(owner: $owner, name: $name) {
      object(expression: $expression) {
        ... on Tree {
          entries {
            name
            type
          }
        }
      }
    }
  }
`
