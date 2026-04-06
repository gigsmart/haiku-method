/**
 * @generated SignedSource<<c8b5ab1369bfd5e7fca4069dbd5c8952>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
export type operationsReadFileQuery$variables = {
  fullPath: string;
  paths: ReadonlyArray<string>;
  ref?: string | null | undefined;
};
export type operationsReadFileQuery$data = {
  readonly project: {
    readonly repository: {
      readonly blobs: {
        readonly nodes: ReadonlyArray<{
          readonly path: string;
          readonly rawBlob: string | null | undefined;
        } | null | undefined> | null | undefined;
      } | null | undefined;
    } | null | undefined;
  } | null | undefined;
};
export type operationsReadFileQuery = {
  response: operationsReadFileQuery$data;
  variables: operationsReadFileQuery$variables;
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
    "name": "paths"
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
    "kind": "Literal",
    "name": "first",
    "value": 1
  },
  {
    "kind": "Variable",
    "name": "paths",
    "variableName": "paths"
  },
  {
    "kind": "Variable",
    "name": "ref",
    "variableName": "ref"
  }
],
v3 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "path",
  "storageKey": null
},
v4 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "rawBlob",
  "storageKey": null
},
v5 = {
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
    "name": "operationsReadFileQuery",
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
                "concreteType": "RepositoryBlobConnection",
                "kind": "LinkedField",
                "name": "blobs",
                "plural": false,
                "selections": [
                  {
                    "alias": null,
                    "args": null,
                    "concreteType": "RepositoryBlob",
                    "kind": "LinkedField",
                    "name": "nodes",
                    "plural": true,
                    "selections": [
                      (v3/*: any*/),
                      (v4/*: any*/)
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
    "name": "operationsReadFileQuery",
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
                "concreteType": "RepositoryBlobConnection",
                "kind": "LinkedField",
                "name": "blobs",
                "plural": false,
                "selections": [
                  {
                    "alias": null,
                    "args": null,
                    "concreteType": "RepositoryBlob",
                    "kind": "LinkedField",
                    "name": "nodes",
                    "plural": true,
                    "selections": [
                      (v3/*: any*/),
                      (v4/*: any*/),
                      (v5/*: any*/)
                    ],
                    "storageKey": null
                  }
                ],
                "storageKey": null
              }
            ],
            "storageKey": null
          },
          (v5/*: any*/)
        ],
        "storageKey": null
      }
    ]
  },
  "params": {
    "cacheID": "ce803116cf6b854d109bec55d8b07154",
    "id": null,
    "metadata": {},
    "name": "operationsReadFileQuery",
    "operationKind": "query",
    "text": "query operationsReadFileQuery(\n  $fullPath: ID!\n  $paths: [String!]!\n  $ref: String\n) {\n  project(fullPath: $fullPath) {\n    repository {\n      blobs(paths: $paths, ref: $ref, first: 1) {\n        nodes {\n          path\n          rawBlob\n          id\n        }\n      }\n    }\n    id\n  }\n}\n"
  }
};
})();

(node as any).hash = "0b42bab60c50bd0ac6188527e3349868";

export default node;
