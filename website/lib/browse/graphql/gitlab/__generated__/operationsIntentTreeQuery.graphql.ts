/**
 * @generated SignedSource<<762eea0d2207ef3b46387811b35dec2c>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
export type operationsIntentTreeQuery$variables = {
  fullPath: string;
  path: string;
  ref?: string | null | undefined;
};
export type operationsIntentTreeQuery$data = {
  readonly project: {
    readonly repository: {
      readonly tree: {
        readonly blobs: {
          readonly nodes: ReadonlyArray<{
            readonly name: string;
            readonly path: string;
          } | null | undefined> | null | undefined;
        };
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
export type operationsIntentTreeQuery = {
  response: operationsIntentTreeQuery$data;
  variables: operationsIntentTreeQuery$variables;
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
    "value": true
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
v6 = [
  (v4/*: any*/),
  (v5/*: any*/)
],
v7 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "id",
  "storageKey": null
},
v8 = [
  (v4/*: any*/),
  (v5/*: any*/),
  (v7/*: any*/)
];
return {
  "fragment": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Fragment",
    "metadata": null,
    "name": "operationsIntentTreeQuery",
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
                    "concreteType": "BlobConnection",
                    "kind": "LinkedField",
                    "name": "blobs",
                    "plural": false,
                    "selections": [
                      {
                        "alias": null,
                        "args": null,
                        "concreteType": "Blob",
                        "kind": "LinkedField",
                        "name": "nodes",
                        "plural": true,
                        "selections": (v6/*: any*/),
                        "storageKey": null
                      }
                    ],
                    "storageKey": "blobs(first:100)"
                  },
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
                        "selections": (v6/*: any*/),
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
    "name": "operationsIntentTreeQuery",
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
                    "concreteType": "BlobConnection",
                    "kind": "LinkedField",
                    "name": "blobs",
                    "plural": false,
                    "selections": [
                      {
                        "alias": null,
                        "args": null,
                        "concreteType": "Blob",
                        "kind": "LinkedField",
                        "name": "nodes",
                        "plural": true,
                        "selections": (v8/*: any*/),
                        "storageKey": null
                      }
                    ],
                    "storageKey": "blobs(first:100)"
                  },
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
                        "selections": (v8/*: any*/),
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
          (v7/*: any*/)
        ],
        "storageKey": null
      }
    ]
  },
  "params": {
    "cacheID": "84ac35a89ea986736492cca9c5096766",
    "id": null,
    "metadata": {},
    "name": "operationsIntentTreeQuery",
    "operationKind": "query",
    "text": "query operationsIntentTreeQuery(\n  $fullPath: ID!\n  $path: String!\n  $ref: String\n) {\n  project(fullPath: $fullPath) {\n    repository {\n      tree(path: $path, ref: $ref, recursive: true) {\n        blobs(first: 100) {\n          nodes {\n            name\n            path\n            id\n          }\n        }\n        trees(first: 100) {\n          nodes {\n            name\n            path\n            id\n          }\n        }\n      }\n    }\n    id\n  }\n}\n"
  }
};
})();

(node as any).hash = "eb5c7c2e55ca97b7fb1b43439357b474";

export default node;
