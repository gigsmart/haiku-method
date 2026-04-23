/**
 * @generated SignedSource<<bbc3d2728f0ccbf8e38dacbd6ca9e98d>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
export type operationsListIntentsTreeQuery$variables = {
  fullPath: string;
  path: string;
  ref?: string | null | undefined;
};
export type operationsListIntentsTreeQuery$data = {
  readonly project: {
    readonly repository: {
      readonly tree: {
        readonly trees: {
          readonly nodes: ReadonlyArray<{
            readonly name: string;
            readonly path: string;
          } | null | undefined> | null | undefined;
        };
      } | null | undefined;
    } | null | undefined;
  } | null | undefined;
};
export type operationsListIntentsTreeQuery = {
  response: operationsListIntentsTreeQuery$data;
  variables: operationsListIntentsTreeQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "fullPath"
  },
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "path"
  },
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "ref"
  }
],
v1 = [
  {
    "kind": "Variable",
    "name": "fullPath",
    "variableName": "fullPath"
  }
],
v2 = [
  {
    "kind": "Variable",
    "name": "path",
    "variableName": "path"
  },
  {
    "kind": "Literal",
    "name": "recursive",
    "value": false
  },
  {
    "kind": "Variable",
    "name": "ref",
    "variableName": "ref"
  }
],
v3 = [
  {
    "kind": "Literal",
    "name": "first",
    "value": 100
  }
],
v4 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "name",
  "storageKey": null
},
v5 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "path",
  "storageKey": null
},
v6 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "id",
  "storageKey": null
};
return {
  "fragment": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Fragment",
    "metadata": null,
    "name": "operationsListIntentsTreeQuery",
    "selections": [
      {
        "alias": null,
        "args": (v1/*: any*/),
        "concreteType": "Project",
        "kind": "LinkedField",
        "name": "project",
        "plural": false,
        "selections": [
          {
            "alias": null,
            "args": null,
            "concreteType": "Repository",
            "kind": "LinkedField",
            "name": "repository",
            "plural": false,
            "selections": [
              {
                "alias": null,
                "args": (v2/*: any*/),
                "concreteType": "Tree",
                "kind": "LinkedField",
                "name": "tree",
                "plural": false,
                "selections": [
                  {
                    "alias": null,
                    "args": (v3/*: any*/),
                    "concreteType": "TreeEntryConnection",
                    "kind": "LinkedField",
                    "name": "trees",
                    "plural": false,
                    "selections": [
                      {
                        "alias": null,
                        "args": null,
                        "concreteType": "TreeEntry",
                        "kind": "LinkedField",
                        "name": "nodes",
                        "plural": true,
                        "selections": [
                          (v4/*: any*/),
                          (v5/*: any*/)
                        ],
                        "storageKey": null
                      }
                    ],
                    "storageKey": "trees(first:100)"
                  }
                ],
                "storageKey": null
              }
            ],
            "storageKey": null
          }
        ],
        "storageKey": null
      }
    ],
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "operationsListIntentsTreeQuery",
    "selections": [
      {
        "alias": null,
        "args": (v1/*: any*/),
        "concreteType": "Project",
        "kind": "LinkedField",
        "name": "project",
        "plural": false,
        "selections": [
          {
            "alias": null,
            "args": null,
            "concreteType": "Repository",
            "kind": "LinkedField",
            "name": "repository",
            "plural": false,
            "selections": [
              {
                "alias": null,
                "args": (v2/*: any*/),
                "concreteType": "Tree",
                "kind": "LinkedField",
                "name": "tree",
                "plural": false,
                "selections": [
                  {
                    "alias": null,
                    "args": (v3/*: any*/),
                    "concreteType": "TreeEntryConnection",
                    "kind": "LinkedField",
                    "name": "trees",
                    "plural": false,
                    "selections": [
                      {
                        "alias": null,
                        "args": null,
                        "concreteType": "TreeEntry",
                        "kind": "LinkedField",
                        "name": "nodes",
                        "plural": true,
                        "selections": [
                          (v4/*: any*/),
                          (v5/*: any*/),
                          (v6/*: any*/)
                        ],
                        "storageKey": null
                      }
                    ],
                    "storageKey": "trees(first:100)"
                  }
                ],
                "storageKey": null
              }
            ],
            "storageKey": null
          },
          (v6/*: any*/)
        ],
        "storageKey": null
      }
    ]
  },
  "params": {
    "cacheID": "a84fb1d02fec9424535d00f01f8ca33b",
    "id": null,
    "metadata": {},
    "name": "operationsListIntentsTreeQuery",
    "operationKind": "query",
    "text": "query operationsListIntentsTreeQuery(\n  $fullPath: ID!\n  $path: String!\n  $ref: String\n) {\n  project(fullPath: $fullPath) {\n    repository {\n      tree(path: $path, ref: $ref, recursive: false) {\n        trees(first: 100) {\n          nodes {\n            name\n            path\n            id\n          }\n        }\n      }\n    }\n    id\n  }\n}\n"
  }
};
})();

(node as any).hash = "46560d5826466b9870d32e4c7397f272";

export default node;
