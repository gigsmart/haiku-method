/**
 * @generated SignedSource<<7e19e2af15dec605236bac751a42439e>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
export type operationsGetIntentQuery$variables = {
  intentExpr: string;
  knowledgeExpr: string;
  name: string;
  operationsExpr: string;
  owner: string;
  reflectionExpr: string;
  stagesExpr: string;
};
export type operationsGetIntentQuery$data = {
  readonly repository: {
    readonly intentFile: {
      readonly text?: string | null | undefined;
    } | null | undefined;
    readonly knowledgeTree: {
      readonly entries?: ReadonlyArray<{
        readonly name: string;
        readonly type: string;
      }> | null | undefined;
    } | null | undefined;
    readonly operationsTree: {
      readonly entries?: ReadonlyArray<{
        readonly name: string;
        readonly type: string;
      }> | null | undefined;
    } | null | undefined;
    readonly reflectionFile: {
      readonly text?: string | null | undefined;
    } | null | undefined;
    readonly stagesTree: {
      readonly entries?: ReadonlyArray<{
        readonly name: string;
        readonly object: {
          readonly entries?: ReadonlyArray<{
            readonly name: string;
            readonly object: {
              readonly entries?: ReadonlyArray<{
                readonly name: string;
                readonly object: {
                  readonly text?: string | null | undefined;
                } | null | undefined;
                readonly type: string;
              }> | null | undefined;
              readonly text?: string | null | undefined;
            } | null | undefined;
            readonly type: string;
          }> | null | undefined;
        } | null | undefined;
        readonly type: string;
      }> | null | undefined;
    } | null | undefined;
  } | null | undefined;
};
export type operationsGetIntentQuery = {
  response: operationsGetIntentQuery$data;
  variables: operationsGetIntentQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "intentExpr"
},
v1 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "knowledgeExpr"
},
v2 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "name"
},
v3 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "operationsExpr"
},
v4 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "owner"
},
v5 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "reflectionExpr"
},
v6 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "stagesExpr"
},
v7 = [
  {
    "kind": "Variable",
    "name": "name",
    "variableName": "name"
  },
  {
    "kind": "Variable",
    "name": "owner",
    "variableName": "owner"
  }
],
v8 = [
  {
    "kind": "Variable",
    "name": "expression",
    "variableName": "intentExpr"
  }
],
v9 = {
  "kind": "InlineFragment",
  "selections": [
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "text",
      "storageKey": null
    }
  ],
  "type": "Blob",
  "abstractKey": null
},
v10 = [
  (v9/*: any*/)
],
v11 = [
  {
    "kind": "Variable",
    "name": "expression",
    "variableName": "stagesExpr"
  }
],
v12 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "name",
  "storageKey": null
},
v13 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "type",
  "storageKey": null
},
v14 = [
  {
    "kind": "Variable",
    "name": "expression",
    "variableName": "knowledgeExpr"
  }
],
v15 = {
  "kind": "InlineFragment",
  "selections": [
    {
      "alias": null,
      "args": null,
      "concreteType": "TreeEntry",
      "kind": "LinkedField",
      "name": "entries",
      "plural": true,
      "selections": [
        (v12/*: any*/),
        (v13/*: any*/)
      ],
      "storageKey": null
    }
  ],
  "type": "Tree",
  "abstractKey": null
},
v16 = [
  (v15/*: any*/)
],
v17 = [
  {
    "kind": "Variable",
    "name": "expression",
    "variableName": "operationsExpr"
  }
],
v18 = [
  {
    "kind": "Variable",
    "name": "expression",
    "variableName": "reflectionExpr"
  }
],
v19 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "__typename",
  "storageKey": null
},
v20 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "id",
  "storageKey": null
},
v21 = [
  (v19/*: any*/),
  (v9/*: any*/),
  (v20/*: any*/)
],
v22 = [
  (v19/*: any*/),
  (v15/*: any*/),
  (v20/*: any*/)
];
return {
  "fragment": {
    "argumentDefinitions": [
      (v0/*: any*/),
      (v1/*: any*/),
      (v2/*: any*/),
      (v3/*: any*/),
      (v4/*: any*/),
      (v5/*: any*/),
      (v6/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "operationsGetIntentQuery",
    "selections": [
      {
        "alias": null,
        "args": (v7/*: any*/),
        "concreteType": "Repository",
        "kind": "LinkedField",
        "name": "repository",
        "plural": false,
        "selections": [
          {
            "alias": "intentFile",
            "args": (v8/*: any*/),
            "concreteType": null,
            "kind": "LinkedField",
            "name": "object",
            "plural": false,
            "selections": (v10/*: any*/),
            "storageKey": null
          },
          {
            "alias": "stagesTree",
            "args": (v11/*: any*/),
            "concreteType": null,
            "kind": "LinkedField",
            "name": "object",
            "plural": false,
            "selections": [
              {
                "kind": "InlineFragment",
                "selections": [
                  {
                    "alias": null,
                    "args": null,
                    "concreteType": "TreeEntry",
                    "kind": "LinkedField",
                    "name": "entries",
                    "plural": true,
                    "selections": [
                      (v12/*: any*/),
                      (v13/*: any*/),
                      {
                        "alias": null,
                        "args": null,
                        "concreteType": null,
                        "kind": "LinkedField",
                        "name": "object",
                        "plural": false,
                        "selections": [
                          {
                            "kind": "InlineFragment",
                            "selections": [
                              {
                                "alias": null,
                                "args": null,
                                "concreteType": "TreeEntry",
                                "kind": "LinkedField",
                                "name": "entries",
                                "plural": true,
                                "selections": [
                                  (v12/*: any*/),
                                  (v13/*: any*/),
                                  {
                                    "alias": null,
                                    "args": null,
                                    "concreteType": null,
                                    "kind": "LinkedField",
                                    "name": "object",
                                    "plural": false,
                                    "selections": [
                                      (v9/*: any*/),
                                      {
                                        "kind": "InlineFragment",
                                        "selections": [
                                          {
                                            "alias": null,
                                            "args": null,
                                            "concreteType": "TreeEntry",
                                            "kind": "LinkedField",
                                            "name": "entries",
                                            "plural": true,
                                            "selections": [
                                              (v12/*: any*/),
                                              (v13/*: any*/),
                                              {
                                                "alias": null,
                                                "args": null,
                                                "concreteType": null,
                                                "kind": "LinkedField",
                                                "name": "object",
                                                "plural": false,
                                                "selections": (v10/*: any*/),
                                                "storageKey": null
                                              }
                                            ],
                                            "storageKey": null
                                          }
                                        ],
                                        "type": "Tree",
                                        "abstractKey": null
                                      }
                                    ],
                                    "storageKey": null
                                  }
                                ],
                                "storageKey": null
                              }
                            ],
                            "type": "Tree",
                            "abstractKey": null
                          }
                        ],
                        "storageKey": null
                      }
                    ],
                    "storageKey": null
                  }
                ],
                "type": "Tree",
                "abstractKey": null
              }
            ],
            "storageKey": null
          },
          {
            "alias": "knowledgeTree",
            "args": (v14/*: any*/),
            "concreteType": null,
            "kind": "LinkedField",
            "name": "object",
            "plural": false,
            "selections": (v16/*: any*/),
            "storageKey": null
          },
          {
            "alias": "operationsTree",
            "args": (v17/*: any*/),
            "concreteType": null,
            "kind": "LinkedField",
            "name": "object",
            "plural": false,
            "selections": (v16/*: any*/),
            "storageKey": null
          },
          {
            "alias": "reflectionFile",
            "args": (v18/*: any*/),
            "concreteType": null,
            "kind": "LinkedField",
            "name": "object",
            "plural": false,
            "selections": (v10/*: any*/),
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
    "argumentDefinitions": [
      (v4/*: any*/),
      (v2/*: any*/),
      (v0/*: any*/),
      (v6/*: any*/),
      (v1/*: any*/),
      (v3/*: any*/),
      (v5/*: any*/)
    ],
    "kind": "Operation",
    "name": "operationsGetIntentQuery",
    "selections": [
      {
        "alias": null,
        "args": (v7/*: any*/),
        "concreteType": "Repository",
        "kind": "LinkedField",
        "name": "repository",
        "plural": false,
        "selections": [
          {
            "alias": "intentFile",
            "args": (v8/*: any*/),
            "concreteType": null,
            "kind": "LinkedField",
            "name": "object",
            "plural": false,
            "selections": (v21/*: any*/),
            "storageKey": null
          },
          {
            "alias": "stagesTree",
            "args": (v11/*: any*/),
            "concreteType": null,
            "kind": "LinkedField",
            "name": "object",
            "plural": false,
            "selections": [
              (v19/*: any*/),
              {
                "kind": "InlineFragment",
                "selections": [
                  {
                    "alias": null,
                    "args": null,
                    "concreteType": "TreeEntry",
                    "kind": "LinkedField",
                    "name": "entries",
                    "plural": true,
                    "selections": [
                      (v12/*: any*/),
                      (v13/*: any*/),
                      {
                        "alias": null,
                        "args": null,
                        "concreteType": null,
                        "kind": "LinkedField",
                        "name": "object",
                        "plural": false,
                        "selections": [
                          (v19/*: any*/),
                          {
                            "kind": "InlineFragment",
                            "selections": [
                              {
                                "alias": null,
                                "args": null,
                                "concreteType": "TreeEntry",
                                "kind": "LinkedField",
                                "name": "entries",
                                "plural": true,
                                "selections": [
                                  (v12/*: any*/),
                                  (v13/*: any*/),
                                  {
                                    "alias": null,
                                    "args": null,
                                    "concreteType": null,
                                    "kind": "LinkedField",
                                    "name": "object",
                                    "plural": false,
                                    "selections": [
                                      (v19/*: any*/),
                                      (v9/*: any*/),
                                      {
                                        "kind": "InlineFragment",
                                        "selections": [
                                          {
                                            "alias": null,
                                            "args": null,
                                            "concreteType": "TreeEntry",
                                            "kind": "LinkedField",
                                            "name": "entries",
                                            "plural": true,
                                            "selections": [
                                              (v12/*: any*/),
                                              (v13/*: any*/),
                                              {
                                                "alias": null,
                                                "args": null,
                                                "concreteType": null,
                                                "kind": "LinkedField",
                                                "name": "object",
                                                "plural": false,
                                                "selections": (v21/*: any*/),
                                                "storageKey": null
                                              }
                                            ],
                                            "storageKey": null
                                          }
                                        ],
                                        "type": "Tree",
                                        "abstractKey": null
                                      },
                                      (v20/*: any*/)
                                    ],
                                    "storageKey": null
                                  }
                                ],
                                "storageKey": null
                              }
                            ],
                            "type": "Tree",
                            "abstractKey": null
                          },
                          (v20/*: any*/)
                        ],
                        "storageKey": null
                      }
                    ],
                    "storageKey": null
                  }
                ],
                "type": "Tree",
                "abstractKey": null
              },
              (v20/*: any*/)
            ],
            "storageKey": null
          },
          {
            "alias": "knowledgeTree",
            "args": (v14/*: any*/),
            "concreteType": null,
            "kind": "LinkedField",
            "name": "object",
            "plural": false,
            "selections": (v22/*: any*/),
            "storageKey": null
          },
          {
            "alias": "operationsTree",
            "args": (v17/*: any*/),
            "concreteType": null,
            "kind": "LinkedField",
            "name": "object",
            "plural": false,
            "selections": (v22/*: any*/),
            "storageKey": null
          },
          {
            "alias": "reflectionFile",
            "args": (v18/*: any*/),
            "concreteType": null,
            "kind": "LinkedField",
            "name": "object",
            "plural": false,
            "selections": (v21/*: any*/),
            "storageKey": null
          },
          (v20/*: any*/)
        ],
        "storageKey": null
      }
    ]
  },
  "params": {
    "cacheID": "7eee4f3dd09b5465e59cc7ff590e38e0",
    "id": null,
    "metadata": {},
    "name": "operationsGetIntentQuery",
    "operationKind": "query",
    "text": "query operationsGetIntentQuery(\n  $owner: String!\n  $name: String!\n  $intentExpr: String!\n  $stagesExpr: String!\n  $knowledgeExpr: String!\n  $operationsExpr: String!\n  $reflectionExpr: String!\n) {\n  repository(owner: $owner, name: $name) {\n    intentFile: object(expression: $intentExpr) {\n      __typename\n      ... on Blob {\n        text\n      }\n      id\n    }\n    stagesTree: object(expression: $stagesExpr) {\n      __typename\n      ... on Tree {\n        entries {\n          name\n          type\n          object {\n            __typename\n            ... on Tree {\n              entries {\n                name\n                type\n                object {\n                  __typename\n                  ... on Blob {\n                    text\n                  }\n                  ... on Tree {\n                    entries {\n                      name\n                      type\n                      object {\n                        __typename\n                        ... on Blob {\n                          text\n                        }\n                        id\n                      }\n                    }\n                  }\n                  id\n                }\n              }\n            }\n            id\n          }\n        }\n      }\n      id\n    }\n    knowledgeTree: object(expression: $knowledgeExpr) {\n      __typename\n      ... on Tree {\n        entries {\n          name\n          type\n        }\n      }\n      id\n    }\n    operationsTree: object(expression: $operationsExpr) {\n      __typename\n      ... on Tree {\n        entries {\n          name\n          type\n        }\n      }\n      id\n    }\n    reflectionFile: object(expression: $reflectionExpr) {\n      __typename\n      ... on Blob {\n        text\n      }\n      id\n    }\n    id\n  }\n}\n"
  }
};
})();

(node as any).hash = "7f066a48e3fe96d721749254834b0deb";

export default node;
