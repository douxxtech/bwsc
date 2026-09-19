# BotWave Websocket Client (BWSC)
BWSC is a CLI tool and Node.js library that lets you remotely connect to a [BotWave](https://github.com/dpipstudio/botwave/) remote command server, so you can send commands and manage your server / device remotely.

## Installation
> Make sure you have Node.js (>= 24) and npm installed.
```bash
npm i -g bwsc
```
Or, if you want to use it in your own project:
```bash
npm i bwsc
```

## CLI usage
Connect to your server with
```bash
bwsc <host> [passkey]
```
- `host`: Hostname or IP address of your host machine. Supports protocols and ports (e.g. `wss://example.com:443`). Defaults to `ws://localhost:9939` if given `localhost`.
- `passkey`: Passkey to authenticate with the BWS server, defaults to none.

### Additional flags

| Flag | Description |
| -- | -- |
| `-f, --fire <command>` | Fire-and-forget a command |
| `-c, --command <command>` | Run a command and collect its output |

## Programmatic usage
BWSC can also be imported and used from your own code (ESM only).

```js
import { BotWaveClient, AuthError, TimeoutError } from 'bwsc';

const client = await new BotWaveClient({
    host: 'wss://example.com:9939',
    passkey: 'mypasskey', // optional
}).connect();

// run a command and get its output, line by line
const lines = await client.run('list');
console.log(lines);

// or fire-and-forget
await client.send('stop');

await client.close();
```

### `new BotWaveClient(options)`

| Option | Type | Description |
| -- | -- | -- |
| `host` | `string` | **Required.** Same format as the CLI: `host`, `host:port`, `ws://host:port` or `wss://host:port`. Defaults to `ws` and port `9939` |
| `passkey` | `string` | The access passkey. Leave it empty if the server doesn't have one set |
| `timeout` | `number` | Timeout in ms, used for both connecting and authenticating. Defaults to `5000` |

### Methods

| Method | Description |
| -- | -- |
| `connect()` | Opens the connection and authenticates. Resolves with the client |
| `run(command, [options])` | Runs a command and resolves with all of its output as an array of lines |
| `send(command)` | Sends a command without waiting for its output |
| `isConnected()` | Whether the socket is open and authenticated |
| `close()` | Closes the connection. Resolves once it is fully closed |

`run()` accepts these options:

| Option | Type | Description |
| -- | -- | -- |
| `timeout` | `number` | Timeout in ms. Defaults to `0` (wait forever) |
| `onLine` | `(line: string) => void` | Called with each line as it arrives, instead of waiting for the end |

```js
await client.run('list', {
    timeout: 10_000,
    onLine: (line) => console.log(line),
});
```

### Events
`BotWaveClient` is an `EventEmitter`.

| Event | Arguments | Description |
| -- | -- | -- |
| `open` | | The websocket connection is open |
| `authenticated` | | Authentication succeeded |
| `message` | `message` | A message from the server that isn't the answer to a `run()` call |
| `error` | `error` | A websocket error |
| `close` | `code`, `reason` | The connection was closed |

### Errors

| Error | Thrown when |
| -- | -- |
| `AuthError` | The passkey is wrong, or the connection closes during authentication |
| `TimeoutError` | Connecting, authenticating, or running a command (if `timeout` is set) takes too long |

Anything else (not connected, connection closed before a command ended, send failed) is thrown as a regular `Error`.

```js
try {
    await client.connect();
} catch (error) {
    if (error instanceof AuthError) console.error('Wrong passkey!');
    else if (error instanceof TimeoutError) console.error('Server took too long to answer');
    else throw error;
}
```

## License
Licensed under [GPLv3.0](LICENSE)
