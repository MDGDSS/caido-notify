# Notify Plugin for Caido

A Caido plugin that automatically sends findings to notification platforms (Slack, Discord, Telegram, etc.) using [ProjectDiscovery Notify](https://github.com/projectdiscovery/notify).

## Features

- **Automatic Finding Detection**: Continuously monitors Caido findings and sends them in real-time
- **Configurable Check Interval**: Set custom delay between checks (default: 60 seconds)
- **Smart Deduplication**: Only sends new findings from the last hour, preventing duplicate notifications
- **Custom Notify IDs per Reporter**: Configure different notify IDs for different finding reporters
- **Exclude Findings**: Exclude specific findings by Reporter name no more spam
- **Provider Configuration**: Use custom provider config or default notify provider config file

## Requirements

- [ProjectDiscovery Notify](https://github.com/projectdiscovery/notify) must be installed and available in your PATH
- Use the defaut provider or use a custom in the plugin interface

## Configuration

### Where to Send

Configure default notify IDs that will be used for all findings:
- Enter notify ID(s) in the "Where to send" field
- Select whether to use `-id` or `-provider` flag

### Custom Finding IDs

Configure different notify IDs based on finding reporter:
- Add a reporter name (e.g., "Enhanced File Detector")
- Specify the notify ID(s) to use for that reporter
- Select whether to use `-id` or `-provider` flag

### Excluded Findings

Prevent specific findings from being sent:
- Exclude by Finding ID (e.g., "30abc123...")
- Exclude by Reporter name (e.g., "Enhanced File Detector")
- Case-insensitive matching for reporter names

### Provider Configuration

Choose between:
- **Custom Configuration**: Use the provider config YAML entered in the text area
- **Default Configuration**: Use the default notify provider config file at `~/.config/notify/provider-config.yaml`

### Check Delay

Set the interval between automatic finding checks (in seconds):
- Default: 60 seconds
- Minimum: 1 second
- Advise check every 15 min -> 900

## How It Works

1. The plugin automatically checks for new findings at the configured interval
2. Only findings from the last hour are considered
3. Findings are filtered to exclude:
   - Already sent findings (stored in memory cache)
   - Excluded findings (by ID or reporter name)
4. Findings are grouped by reporter and sent using custom IDs when configured
5. Sent findings are saved to prevent resending

## Usage

1. Open the "Notify" page from the Caido sidebar
2. Configure your notify IDs and settings
3. Click "Save Configuration" to apply changes
4. The plugin will automatically start checking and sending findings
5. Use "Clear Sent Findings" to reset the sent findings cache

## Contributing

Feel free to contribute or suggest improvements!
