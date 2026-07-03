# BotWave Websocket Client (BWSC)
BWSC is a CLI tool that lets you remotely connect to a [BotWave](https://github.com/dpipstudio/botwave/) remote command server, so you can send commands and manage your server / device remotely.

## Installation
> Make sure you have Node.js and npm installed.
```bash
npm i -g bwsc
```

## Usage
Connect to your server with
```bash
bwsc <host> [passkey]
```
- `host`: Hostname or IP address of your host machine. Supports protocols and ports (e.g. `wss://example.com:443`). Defaults to `ws://localhost:9939` if given `localhost`.
- `passkey`: Passkey to authenticate with the BWS server, defaults to none.

## Additional flags

| Flag | Description |
| -- | -- |
| `-f, --fire <command>` | Fire-and-forget a command |
| `-c, --command <command>` | Run a command and collect its output |

## Older support
`1.1.2` is the latest version that supports versions prior to `BotWave 1.2.0`.
```bash
npm i -g bwsc@1.1.2
```

## License
Licensed under [GPLv3.0](LICENSE)

![mbd](https://madeby.douxx.tech)