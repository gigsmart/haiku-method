#!/usr/bin/env npx tsx
// Test suite for H·AI·K·U MCP server — tool definitions, routing, zod schemas
// Run: npx tsx test/server-tools.test.mjs

import assert from "node:assert"
import { z } from "zod"

import { stateToolDefs } from "../src/state-tools.ts"
import { orchestratorToolDefs } from "../src/orchestrator.ts"

// ── Setup ──────────────────────────────────────────────────────────────────

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    fn()
    passed++
    console.log(`  ✓ ${name}`)
  } catch (e) {
    failed++
    console.log(`  ✗ ${name}: ${e.message}`)
  }
}

// ── Combined tool definitions ─────────────────────────────────────────────

// These are the tools listed in the server's ListTools handler
const serverTools = [
  ...orchestratorToolDefs,
  ...stateToolDefs,
  // The manually-defined tools from server.ts:
  {
    name: "ask_user_visual_question",
    inputSchema: {
      type: "object",
      properties: {
        questions: { type: "array" },
        context: { type: "string" },
        title: { type: "string" },
        image_paths: { type: "array" },
      },
      required: ["questions"],
    },
  },
  {
    name: "pick_design_direction",
    inputSchema: {
      type: "object",
      properties: {
        intent_slug: { type: "string" },
        archetypes: { type: "array" },
        archetypes_file: { type: "string" },
        parameters: { type: "array" },
        parameters_file: { type: "string" },
        title: { type: "string" },
      },
      required: ["intent_slug"],
    },
  },
]

// ── Tool Definition Completeness ──────────────────────────────────────────

console.log("\n=== Tool Definition Completeness ===")

test("no duplicate tool names across all tool sets", () => {
  const names = serverTools.map((t) => t.name)
  const duplicates = names.filter((n, i) => names.indexOf(n) !== i)
  assert.strictEqual(duplicates.length, 0, `Duplicate tool names: ${duplicates.join(", ")}`)
})

test("all tool names are non-empty strings", () => {
  for (const tool of serverTools) {
    assert.ok(typeof tool.name === "string" && tool.name.length > 0)
  }
})

test("all tools have inputSchema with type object", () => {
  for (const tool of serverTools) {
    assert.ok(tool.inputSchema, `${tool.name} missing inputSchema`)
    assert.strictEqual(tool.inputSchema.type, "object", `${tool.name} inputSchema.type not object`)
  }
})

test("all tools have properties in inputSchema", () => {
  for (const tool of serverTools) {
    assert.ok(tool.inputSchema.properties, `${tool.name} missing inputSchema.properties`)
    assert.strictEqual(typeof tool.inputSchema.properties, "object")
  }
})

test("required fields reference existing properties", () => {
  for (const tool of serverTools) {
    const required = tool.inputSchema.required || []
    for (const req of required) {
      assert.ok(
        req in tool.inputSchema.properties,
        `${tool.name}: required field '${req}' not found in properties`
      )
    }
  }
})

// ── State Tool Coverage ───────────────────────────────────────────────────

console.log("\n=== State Tool Coverage ===")

const expectedStateTools = [
  "haiku_intent_get",
  "haiku_intent_list",
  "haiku_stage_get",
  "haiku_unit_get",
  "haiku_unit_set",
  "haiku_unit_list",
  "haiku_unit_start",
  "haiku_unit_advance_hat",
  "haiku_unit_reject_hat",
  "haiku_unit_increment_bolt",
  "haiku_knowledge_list",
  "haiku_knowledge_read",
  "haiku_studio_list",
  "haiku_studio_get",
  "haiku_studio_stage_get",
  "haiku_settings_get",
]

for (const toolName of expectedStateTools) {
  test(`state tool '${toolName}' exists`, () => {
    const found = stateToolDefs.find((t) => t.name === toolName)
    assert.ok(found, `Missing state tool: ${toolName}`)
  })
}

// ── Orchestrator Tool Coverage ────────────────────────────────────────────

console.log("\n=== Orchestrator Tool Coverage ===")

const expectedOrchestratorTools = [
  "haiku_run_next",
  "haiku_intent_create",
  "haiku_go_back",
]

for (const toolName of expectedOrchestratorTools) {
  test(`orchestrator tool '${toolName}' exists`, () => {
    const found = orchestratorToolDefs.find((t) => t.name === toolName)
    assert.ok(found, `Missing orchestrator tool: ${toolName}`)
  })
}

// ── Tool Input Schema Specifics ───────────────────────────────────────────

console.log("\n=== Tool Input Schema Specifics ===")

test("haiku_intent_get requires slug and field", () => {
  const tool = stateToolDefs.find((t) => t.name === "haiku_intent_get")
  assert.deepStrictEqual(tool.inputSchema.required, ["slug", "field"])
})

test("haiku_unit_start requires intent, unit", () => {
  const tool = stateToolDefs.find((t) => t.name === "haiku_unit_start")
  assert.deepStrictEqual(tool.inputSchema.required, ["intent", "unit"])
})

test("haiku_unit_reject_hat requires intent, unit", () => {
  const tool = stateToolDefs.find((t) => t.name === "haiku_unit_reject_hat")
  assert.deepStrictEqual(tool.inputSchema.required, ["intent", "unit"])
})

test("haiku_unit_set requires intent, stage, unit, field, value", () => {
  const tool = stateToolDefs.find((t) => t.name === "haiku_unit_set")
  assert.deepStrictEqual(tool.inputSchema.required, ["intent", "stage", "unit", "field", "value"])
})

test("haiku_run_next requires intent", () => {
  const tool = orchestratorToolDefs.find((t) => t.name === "haiku_run_next")
  assert.deepStrictEqual(tool.inputSchema.required, ["intent"])
})

test("haiku_run_next has optional external_review_url", () => {
  const tool = orchestratorToolDefs.find((t) => t.name === "haiku_run_next")
  assert.ok("external_review_url" in tool.inputSchema.properties)
})

test("haiku_intent_create requires description", () => {
  const tool = orchestratorToolDefs.find((t) => t.name === "haiku_intent_create")
  assert.deepStrictEqual(tool.inputSchema.required, ["description"])
})

test("haiku_intent_create has optional slug and context", () => {
  const tool = orchestratorToolDefs.find((t) => t.name === "haiku_intent_create")
  assert.ok("slug" in tool.inputSchema.properties)
  assert.ok("context" in tool.inputSchema.properties)
  assert.ok(!tool.inputSchema.required.includes("slug"))
  assert.ok(!tool.inputSchema.required.includes("context"))
})

test("haiku_go_back requires intent only", () => {
  const tool = orchestratorToolDefs.find((t) => t.name === "haiku_go_back")
  assert.deepStrictEqual(tool.inputSchema.required, ["intent"])
  assert.ok("intent" in tool.inputSchema.properties)
})

test("haiku_intent_list requires no arguments", () => {
  const tool = stateToolDefs.find((t) => t.name === "haiku_intent_list")
  assert.ok(!tool.inputSchema.required || tool.inputSchema.required.length === 0)
})

test("haiku_studio_list requires no arguments", () => {
  const tool = stateToolDefs.find((t) => t.name === "haiku_studio_list")
  assert.ok(!tool.inputSchema.required || tool.inputSchema.required.length === 0)
})

test("haiku_settings_get requires field", () => {
  const tool = stateToolDefs.find((t) => t.name === "haiku_settings_get")
  assert.deepStrictEqual(tool.inputSchema.required, ["field"])
})

// ── Zod Schema Validation ─────────────────────────────────────────────────

console.log("\n=== Zod Schema Validation ===")

// NOTE: These schemas mirror the ones in server.ts. If the source schemas change,
// update these to match. They cannot be imported directly because server.ts has
// side effects (MCP server initialization, process signal handlers) that would
// run on import.

const GetReviewStatusInput = z.object({
  session_id: z.string(),
})

test("GetReviewStatusInput accepts valid input", () => {
  const result = GetReviewStatusInput.parse({ session_id: "abc-123" })
  assert.strictEqual(result.session_id, "abc-123")
})

test("GetReviewStatusInput rejects missing session_id", () => {
  assert.throws(() => GetReviewStatusInput.parse({}))
})

test("GetReviewStatusInput rejects non-string session_id", () => {
  assert.throws(() => GetReviewStatusInput.parse({ session_id: 123 }))
})

const AskVisualQuestionInput = z.object({
  questions: z.array(
    z.object({
      question: z.string(),
      header: z.string().optional(),
      options: z.array(z.string()),
      multiSelect: z.boolean().optional(),
    })
  ),
  context: z.string().optional(),
  title: z.string().optional(),
  image_paths: z.array(z.string()).optional(),
})

test("AskVisualQuestionInput accepts minimal valid input", () => {
  const result = AskVisualQuestionInput.parse({
    questions: [{ question: "What color?", options: ["Red", "Blue"] }],
  })
  assert.strictEqual(result.questions.length, 1)
  assert.strictEqual(result.questions[0].question, "What color?")
})

test("AskVisualQuestionInput accepts full input", () => {
  const result = AskVisualQuestionInput.parse({
    questions: [
      {
        question: "Pick one",
        header: "Colors",
        options: ["Red", "Blue", "Green"],
        multiSelect: true,
      },
    ],
    context: "Some context",
    title: "My Question",
    image_paths: ["/tmp/img.png"],
  })
  assert.strictEqual(result.questions[0].multiSelect, true)
  assert.strictEqual(result.title, "My Question")
  assert.strictEqual(result.image_paths.length, 1)
})

test("AskVisualQuestionInput accepts empty questions array", () => {
  // z.array allows empty by default — this should parse
  const result = AskVisualQuestionInput.parse({ questions: [] })
  assert.strictEqual(result.questions.length, 0)
})

test("AskVisualQuestionInput rejects missing questions", () => {
  assert.throws(() => AskVisualQuestionInput.parse({}))
})

test("AskVisualQuestionInput rejects question without options", () => {
  assert.throws(() =>
    AskVisualQuestionInput.parse({
      questions: [{ question: "What?" }],
    })
  )
})

const DesignArchetypeSchema = z.object({
  name: z.string(),
  description: z.string(),
  preview_html: z.string(),
  default_parameters: z.record(z.number()),
})

test("DesignArchetypeSchema accepts valid archetype", () => {
  const result = DesignArchetypeSchema.parse({
    name: "Minimal",
    description: "Clean and simple",
    preview_html: "<div>Preview</div>",
    default_parameters: { spacing: 1.5, font_size: 16 },
  })
  assert.strictEqual(result.name, "Minimal")
  assert.strictEqual(result.default_parameters.spacing, 1.5)
})

test("DesignArchetypeSchema rejects non-numeric parameters", () => {
  assert.throws(() =>
    DesignArchetypeSchema.parse({
      name: "Bad",
      description: "Bad",
      preview_html: "<div/>",
      default_parameters: { spacing: "big" },
    })
  )
})

test("DesignArchetypeSchema rejects missing fields", () => {
  assert.throws(() => DesignArchetypeSchema.parse({ name: "Incomplete" }))
})

const DesignParameterSchema = z.object({
  name: z.string(),
  label: z.string(),
  description: z.string(),
  min: z.number(),
  max: z.number(),
  step: z.number(),
  default: z.number(),
  labels: z.object({
    low: z.string(),
    high: z.string(),
  }),
})

test("DesignParameterSchema accepts valid parameter", () => {
  const result = DesignParameterSchema.parse({
    name: "spacing",
    label: "Spacing",
    description: "Controls spacing between elements",
    min: 0,
    max: 100,
    step: 1,
    default: 50,
    labels: { low: "Tight", high: "Spacious" },
  })
  assert.strictEqual(result.name, "spacing")
  assert.strictEqual(result.labels.low, "Tight")
})

test("DesignParameterSchema rejects missing labels", () => {
  assert.throws(() =>
    DesignParameterSchema.parse({
      name: "spacing",
      label: "Spacing",
      description: "desc",
      min: 0,
      max: 100,
      step: 1,
      default: 50,
    })
  )
})

test("DesignParameterSchema rejects non-numeric min", () => {
  assert.throws(() =>
    DesignParameterSchema.parse({
      name: "spacing",
      label: "Spacing",
      description: "desc",
      min: "zero",
      max: 100,
      step: 1,
      default: 50,
      labels: { low: "L", high: "H" },
    })
  )
})

const PickDesignDirectionInput = z.object({
  intent_slug: z.string(),
  archetypes: z.array(DesignArchetypeSchema).optional(),
  archetypes_file: z.string().optional(),
  parameters: z.array(DesignParameterSchema).optional(),
  parameters_file: z.string().optional(),
  title: z.string().optional(),
})

test("PickDesignDirectionInput accepts minimal input", () => {
  const result = PickDesignDirectionInput.parse({ intent_slug: "my-feature" })
  assert.strictEqual(result.intent_slug, "my-feature")
  assert.strictEqual(result.archetypes, undefined)
})

test("PickDesignDirectionInput accepts inline archetypes", () => {
  const result = PickDesignDirectionInput.parse({
    intent_slug: "feat",
    archetypes: [
      {
        name: "Minimal",
        description: "Clean",
        preview_html: "<div/>",
        default_parameters: { x: 1 },
      },
    ],
    parameters: [
      {
        name: "x",
        label: "X",
        description: "X factor",
        min: 0,
        max: 10,
        step: 1,
        default: 5,
        labels: { low: "Low", high: "High" },
      },
    ],
  })
  assert.strictEqual(result.archetypes.length, 1)
  assert.strictEqual(result.parameters.length, 1)
})

test("PickDesignDirectionInput accepts file paths", () => {
  const result = PickDesignDirectionInput.parse({
    intent_slug: "feat",
    archetypes_file: "/tmp/archetypes.json",
    parameters_file: "/tmp/parameters.json",
  })
  assert.strictEqual(result.archetypes_file, "/tmp/archetypes.json")
  assert.strictEqual(result.parameters_file, "/tmp/parameters.json")
})

test("PickDesignDirectionInput rejects missing intent_slug", () => {
  assert.throws(() => PickDesignDirectionInput.parse({}))
})

// ── Server Tool Routing Invariants ────────────────────────────────────────

console.log("\n=== Server Tool Routing Invariants ===")

test("all haiku_ tools are routed to either orchestrator or state handler", () => {
  const orchestratorNames = new Set(orchestratorToolDefs.map((t) => t.name))
  const stateNames = new Set(stateToolDefs.map((t) => t.name))

  for (const tool of serverTools) {
    if (tool.name.startsWith("haiku_")) {
      const inOrchestrator = orchestratorNames.has(tool.name)
      const inState = stateNames.has(tool.name)
      assert.ok(
        inOrchestrator || inState,
        `Tool ${tool.name} starts with haiku_ but isn't in orchestrator or state handlers`
      )
    }
  }
})

test("orchestrator and state tools don't overlap", () => {
  const orchestratorNames = new Set(orchestratorToolDefs.map((t) => t.name))
  const stateNames = new Set(stateToolDefs.map((t) => t.name))
  const overlap = [...orchestratorNames].filter((n) => stateNames.has(n))
  assert.strictEqual(overlap.length, 0, `Overlapping tools: ${overlap.join(", ")}`)
})

test("non-haiku tools exist (ask_user_visual_question, pick_design_direction)", () => {
  const nonHaiku = serverTools.filter((t) => !t.name.startsWith("haiku_"))
  const names = nonHaiku.map((t) => t.name)
  assert.ok(names.includes("ask_user_visual_question"))
  assert.ok(names.includes("pick_design_direction"))
})

// ── Property Type Checks ──────────────────────────────────────────────────

console.log("\n=== Property Type Annotations ===")

test("all tool properties have type field", () => {
  for (const tool of serverTools) {
    for (const [propName, propDef] of Object.entries(tool.inputSchema.properties)) {
      assert.ok(
        propDef.type,
        `${tool.name}.${propName} missing type field`
      )
    }
  }
})

test("string properties use type 'string'", () => {
  // Spot-check known string properties
  const intentGet = stateToolDefs.find((t) => t.name === "haiku_intent_get")
  assert.strictEqual(intentGet.inputSchema.properties.slug.type, "string")
  assert.strictEqual(intentGet.inputSchema.properties.field.type, "string")
})

// ── Summary ───────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed\n`)
process.exit(failed > 0 ? 1 : 0)
