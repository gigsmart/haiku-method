# AI-DLC Templates

This directory contains templates and examples for using AI-DLC.

## Templates

### [intent-template.md](./intent-template.md)

Template for creating an AI-DLC Intent file. An intent describes the high-level goal you want to achieve, including:

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

Configuration template for customizing AI-DLC behavior in your project:

- Workflow selection
- Operating mode defaults
- Quality gate commands
- Team settings

## Example

The [ai-dlc-example/](./ai-dlc-example/) directory shows a complete example of an AI-DLC intent for a user authentication system:

- `intent.md` - Overall authentication intent
- `unit-01-registration.md` - Example completed unit

## Usage

### Starting a New Intent

1. Copy `intent-template.md` to your `.ai-dlc/` directory as `intent.md`
2. Fill in the bracketed sections with your content
3. Delete the comment blocks
4. Create unit files using `unit-template.md`

### Directory Structure

```
your-project/
  .ai-dlc/
    intent.md              # Your intent (from template)
    unit-01-feature.md     # First unit
    unit-02-feature.md     # Second unit
    settings.yml           # Optional: project settings
```

### Customizing Settings

1. Copy `settings-template.yml` to `.ai-dlc/settings.yml`
2. Adjust quality gate commands for your project
3. Configure operating modes as desired
4. Remove comments for cleaner file

## Quick Start

```bash
# Create .ai-dlc directory
mkdir -p .ai-dlc

# Download templates
curl -o .ai-dlc/intent.md https://ai-dlc.dev/templates/intent-template.md
curl -o .ai-dlc/unit-01.md https://ai-dlc.dev/templates/unit-template.md

# Or copy from this directory if you have it locally
cp templates/intent-template.md .ai-dlc/intent.md
cp templates/unit-template.md .ai-dlc/unit-01-feature.md
```

## Learn More

- [AI-DLC Documentation](https://ai-dlc.dev/docs/)
- [Quick Start Guide](https://ai-dlc.dev/docs/quick-start/)
- [Core Concepts](https://ai-dlc.dev/docs/concepts/)
