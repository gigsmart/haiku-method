/**
 * @generated SignedSource<<1f561bb14fd331c3a877c363163d13b2>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
export type operationsListBranchNamesQuery$variables = {
  fullPath: string;
  limit: number;
  offset: number;
  searchPattern: string;
};
export type operationsListBranchNamesQuery$data = {
  readonly project: {
    readonly repository: {
      readonly branchNames: ReadonlyArray<string> | null | undefined;
    } | null | undefined;
  } | null | undefined;
};
export type operationsListBranchNamesQuery = {
  response: operationsListBranchNamesQuery$data;
  variables: operationsListBranchNamesQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "fullPath"
},
v1 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "limit"
},
v2 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "offset"
},
v3 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "searchPattern"
},
v4 = [
  {
    "kind": "Variable",
    "name": "fullPath",
    "variableName": "fullPath"
  }
],
v5 = {
  "alias": null,
  "args": null,
  "concreteType": "Repository",
  "kind": "LinkedField",
  "name": "repository",
  "plural": false,
  "selections": [
    {
      "alias": null,
      "args": [
        {
          "kind": "Variable",
          "name": "limit",
          "variableName": "limit"
        },
        {
          "kind": "Variable",
          "name": "offset",
          "variableName": "offset"
        },
        {
          "kind": "Variable",
          "name": "searchPattern",
          "variableName": "searchPattern"
        }
      ],
      "kind": "ScalarField",
      "name": "branchNames",
      "storageKey": null
    }
  ],
  "storageKey": null
};
return {
  "fragment": {
    "argumentDefinitions": [
      (v0/*: any*/),
      (v1/*: any*/),
      (v2/*: any*/),
      (v3/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "operationsListBranchNamesQuery",
    "selections": [
      {
        "alias": null,
        "args": (v4/*: any*/),
        "concreteType": "Project",
        "kind": "LinkedField",
        "name": "project",
        "plural": false,
        "selections": [
          (v5/*: any*/)
        ],
        "storageKey": null
      }
    ],
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v0/*: any*/),
      (v3/*: any*/),
      (v2/*: any*/),
      (v1/*: any*/)
    ],
    "kind": "Operation",
    "name": "operationsListBranchNamesQuery",
    "selections": [
      {
        "alias": null,
        "args": (v4/*: any*/),
        "concreteType": "Project",
        "kind": "LinkedField",
        "name": "project",
        "plural": false,
        "selections": [
          (v5/*: any*/),
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "id",
            "storageKey": null
          }
        ],
        "storageKey": null
      }
    ]
  },
  "params": {
    "cacheID": "8bdc9eb5b7cff821d0959670c22cb7b1",
    "id": null,
    "metadata": {},
    "name": "operationsListBranchNamesQuery",
    "operationKind": "query",
    "text": "query operationsListBranchNamesQuery(\n  $fullPath: ID!\n  $searchPattern: String!\n  $offset: Int!\n  $limit: Int!\n) {\n  project(fullPath: $fullPath) {\n    repository {\n      branchNames(searchPattern: $searchPattern, offset: $offset, limit: $limit)\n    }\n    id\n  }\n}\n"
  }
};
})();

(node as any).hash = "5d7d93b3c2df63d8ccc6d576c66460ac";

export default node;
