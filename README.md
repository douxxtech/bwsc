# BotWave Websocket Client (BWSC)
BWSC is a CLI tool allowing you to remotely connect to [BotWave](https://github.com/dpipstudio/botwave/) websocket server, letting your send commands and manage your server / device remotely.

## Installation
> Make sure you have nodejs and npm installed.
```bash
npm i -g bwsc
```

## Usage
Connect to your server with
```bash
bwsc <host> [passkey]
```
- `host`: Hostname or IP address of your host machine. Supports protocols and ports (e.g. `wss://example.com:443`). Defaults to `ws://localhost:9939` if given `localhost`.
- `passkey`: Passkey to authenticate to the BWS server, defaults to none.

## Additional flags

| Flag | Description |
| -- | -- |
| `-f, --fire <command>` | Fire-and-forget a command | 

## Older support
`1.1.2` is the latest version supporting versions prior to `BotWave 1.2.0`.
```bash
npm i -g bwsc@1.1.2
```

## License
Licensed under the [GPLv3.0](LICENSE)

![mbd](https://madeby.douxx.tech)