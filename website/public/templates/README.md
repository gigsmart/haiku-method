# H·AI·K·U Templates

This directory contains templates and examples for using H·AI·K·U.

## Templates

### [intent-template.md](./intent-template.md)

Template for creating a H·AI·K·U Intent file. An intent describes the high-level goal you want to achieve, including:

- Description of what you're building
- Business context
- Completion criteria
- Unit breakdown

### [unit-template.md](./unit-template.md)

Template for creating Unit files. Units are focused pieces of work with:

- Specific completion criteria
- Quality gates
- Progress tracking

### [settings-template.yml](./settings-template.yml)

Configuration template for customizing H·AI·K·U behavior in your project:

- Workflow selection
- Operating mode defaults
- Quality gate commands
- Team settings

## Example

The [ai-dlc-example/](./ai-dlc-example/) directory shows a complete example of a H·AI·K·U intent for a user authentication system:

- `intent.md` - Overall authentication intent
- `unit-01-registration.md` - Example completed unit

## Usage

### Starting a New Intent

1. Copy `intent-template.md` to your `.haiku/` directory as `intent.md`
2. Fill in the bracketed sections with your content
3. Delete the comment blocks
4. Create unit files using `unit-template.md`

### Directory Structure

```
your-project/
  .haiku/
    intents/
      my-feature/
        intent.md              # Your intent (from template)
        unit-01-feature.md     # First unit
        unit-02-feature.md     # Second unit
    settings.yml               # Optional: project settings
```

### Customizing Settings

1. Copy `settings-template.yml` to `.haiku/settings.yml`
2. Adjust quality gate commands for your project
3. Configure operating modes as desired
4. Remove comments for cleaner file

## Quick Start

```bash
# Use /haiku:new to create a new intent interactively — it sets up the correct
# directory structure at .haiku/intents/{slug}/ automatically.
# Or download templates manually:
curl -o intent.md https://haikumethod.ai/templates/intent-template.md
curl -o unit-template.md https://haikumethod.ai/templates/unit-template.md
```

## Learn More

- [H·AI·K·U Documentation](https://haikumethod.ai/docs/)
- [Getting Started](https://haikumethod.ai/docs/getting-started/)
- [Core Concepts](https://haikumethod.ai/docs/concepts/)
