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
bwsc <host> [-p port] [--pk passkey]
```
- `host`: Hostname or IP address of your host machine.
- `-p, --port`: Port of the BWS server, defaults to 9939.
- `--pk, --passkey`: Passkey to authenticate to the BWS server, defaults to none.

## License
Licensed under the [GPLv3.0](LICENSE)

![mbd](https://madeby.douxx.tech)