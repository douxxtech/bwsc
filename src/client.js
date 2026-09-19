import WebSocket from 'ws';
import { EventEmitter } from 'events';

/**
 * Thrown when the server rejects the passkey, or closes the connection during authentication.
 */
export class AuthError extends Error {
    /** @param {string} message */
    constructor(message) {
        super(message);
        this.name = 'AuthError';
    }
}

/**
 * Thrown when connecting, authenticating or running a command takes too long.
 */
export class TimeoutError extends Error {
    /** @param {string} message */
    constructor(message) {
        super(message);
        this.name = 'TimeoutError';
    }
}

/**
 * @typedef {Object} ParsedHost
 * @property {'ws'|'wss'} protocol
 * @property {string} host
 * @property {number} port
 */

/**
 * Splits a host string into protocol, host and port. Defaults to `ws` and port 9939.
 * @param {string} host
 * @returns {ParsedHost}
 */
function parseHost(host) {
    const protocolMatch = host.match(/^(wss?):\/\/(.+)$/);
    const hostToParse = protocolMatch ? protocolMatch[2] : host;
    const protocol = protocolMatch ? protocolMatch[1] : 'ws';

    const portMatch = hostToParse.match(/^(.+):(\d+)$/);
    if (portMatch) {
        return { protocol, host: portMatch[1], port: parseInt(portMatch[2], 10) };
    }

    return { protocol, host: hostToParse, port: 9939 }; // default
}

/**
 * @typedef {Object} BotWaveClientOptions
 * @property {string} host ws://host:port, wss://host:port, host:port or host
 * @property {string} [passkey] server passkey, leave empty if the server doesn't ask for one
 * @property {number} [timeout=5000] used for both connecting and authenticating (ms)
 */

/**
 * @typedef {Object} RunOptions
 * @property {number} [timeout=0] ms, 0 = wait forever
 * @property {(line: string) => void} [onLine] called with each line as it arrives
 */

/**
 * @typedef {Object} Transaction
 * @property {(line: string) => void} onLine
 * @property {() => void} end
 * @property {(error: Error) => void} fail
 */


/**
 * WebSocket client for a BotWave server.
 *
 * @fires BotWaveClient#open
 * @fires BotWaveClient#authenticated
 * @fires BotWaveClient#message
 * @fires BotWaveClient#error
 * @fires BotWaveClient#close
 * @extends EventEmitter
 */
export class BotWaveClient extends EventEmitter {
    /**
     * @param {BotWaveClientOptions} options
     * @throws {TypeError} if `host` is missing
     */
    constructor({ host, passkey, timeout = 5000 } = {}) {
        super();
        if (!host) throw new TypeError('host is required');

        const parsed = parseHost(host);

        /** @type {'ws'|'wss'} */
        this.protocol = parsed.protocol;
        /** @type {string} */
        this.host = parsed.host;
        /** @type {number} */
        this.port = parsed.port;

        /** @type {string} */
        this.passkey = passkey ?? '';
        /** @type {number} */
        this.timeout = timeout; // used for both connecting and authenticating (ms)
        /** @type {WebSocket|null} */
        this.ws = null;
        /** @type {boolean} */
        this.authenticated = false;
        /** @type {boolean} */
        this.connecting = false;
        /** @type {Map<string, Transaction>} */
        this.transactions = new Map(); // txId -> { onLine, end, fail }
    }

    /**
     * Full websocket url built from protocol, host and port.
     * @type {string}
     */
    get url() {
        return `${this.protocol}://${this.host}:${this.port}`;
    }

    /**
     * Opens the websocket and authenticates.
     * @returns {Promise<this>}
     * @throws {Error} if already connected (or connecting)
     * @throws {TimeoutError} if connecting or authenticating takes longer than `timeout`
     * @throws {AuthError} if the passkey is wrong or the connection closes during auth
     */
    async connect() {
        if (this.connecting || this.isConnected())
            throw new Error('Already connected (or connecting)');

        this.connecting = true;

        try {
            this.ws = new WebSocket(this.url);

            await new Promise((resolve, reject) => {
                const timer = setTimeout(() => {
                    reject(new TimeoutError(`Connection timeout (${this.timeout / 1000}s)`));
                }, this.timeout);

                this.ws.on('open', () => {
                    clearTimeout(timer);
                    this.emit('open');
                    this.setupWebSocketHandlers();
                    resolve(this.authenticate());
                });

                this.ws.on('error', (error) => {
                    clearTimeout(timer);
                    reject(error);
                });
            });

            this.emit('authenticated');

            return this;

        } catch (error) {
            this.ws?.terminate();
            throw error;

        } finally {
            this.connecting = false;
        }
    }

    /**
     * Hooks up the message/error/close listeners once the socket is open.
     * @private
     * @returns {void}
     */
    setupWebSocketHandlers() {
        this.ws.on('message', (data) => {
            this.handleMessage(data.toString());
        });

        this.ws.on('error', (error) => {
            if (this.listenerCount('error') > 0) this.emit('error', error);
        });

        this.ws.on('close', (code, reason) => {
            this.authenticated = false;

            // stuff still waiting for an answer wont get one
            for (const tx of this.transactions.values()) {
                tx.fail(new Error('Connection closed'));
            }

            this.emit('close', code, reason.toString());
        });
    }

    /**
     * Runs the passkey handshake. Resolves right away if no passkey was given.
     * @private
     * @returns {Promise<void>}
     * @throws {TimeoutError} if the server doesn't answer in time
     * @throws {AuthError} if the passkey is wrong or the connection closes during auth
     */
    authenticate() {
        return new Promise((resolve, reject) => {
            if (!this.passkey) {
                // no passkey, assuming the server doesn't ask for one
                this.authenticated = true;
                return resolve();
            }

            const cleanup = () => {
                clearTimeout(timer);
                this.ws.removeListener('message', authHandler);
                this.ws.removeListener('close', onClose);
            };

            const timer = setTimeout(() => {
                cleanup();
                reject(new TimeoutError('Authentication timeout'));
            }, this.timeout);

            const authHandler = (data) => {
                const message = data.toString().trim();

                if (message === 'Password:') {
                    this.ws.send(this.passkey);

                } else if (message === 'OK.') {
                    cleanup();
                    this.authenticated = true;
                    resolve();
                    
                } else if (message.startsWith('Authentication failed')) {
                    cleanup();
                    reject(new AuthError('Authentication failed: wrong passkey'));
                }
            };

            const onClose = () => {
                cleanup();
                reject(new AuthError('Connection closed during authentication'));
            };

            this.ws.on('message', authHandler);
            this.ws.on('close', onClose);
        });
    }

    /**
     * Routes an incoming line to the matching transaction, or emits it as a `message` event.
     * @private
     * @param {string} message
     * @returns {void}
     */
    handleMessage(message) {
        if (!this.authenticated) return;

        for (const [txId, tx] of this.transactions) {
            if (!message.includes(txId)) continue;

            if (message.trim() === `ENDtransaction_id=${txId}`) {
                tx.end();
            } else {
                tx.onLine(message.replace(`transaction_id=${txId}`, '').trimEnd());
            }
            return;
        }

        this.emit('message', message);
    }

    /**
     * Whether the socket is open and authenticated.
     * @returns {boolean}
     */
    isConnected() {
        return this.ws && this.ws.readyState === WebSocket.OPEN && this.authenticated;
    }

    /**
     * Makes a unique id used to match a command with its answer.
     * @private
     * @returns {string}
     */
    generateTransactionId() {
        return `bwsc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    }

    /**
     * Sends a command without waiting for its output.
     * @param {string} command
     * @returns {Promise<void>}
     * @throws {Error} if not connected, or if the send fails
     */
    send(command) {
        return new Promise((resolve, reject) => {
            if (!this.isConnected()) return reject(new Error('Not connected to server'));

            this.ws.send(command, (error) => (error ? reject(error) : resolve()));
        });
    }


    /**
     * Runs a command and collects its output.
     * @param {string} command
     * @param {RunOptions} [options]
     * @returns {Promise<string[]>} every line of output, in order
     * @throws {Error} if not connected, the send fails, or the connection closes before the command ends
     * @throws {TimeoutError} if `timeout` is set and reached before the command ends
     */
    run(command, { timeout = 0, onLine } = {}) {
        return new Promise((resolve, reject) => {
            if (!this.isConnected()) return reject(new Error('Not connected to server'));

            const txId = this.generateTransactionId();
            const lines = [];
            let timer = null;

            /** @type {Transaction} */
            const tx = {
                onLine: (line) => {
                    lines.push(line);
                    if (onLine) onLine(line);
                },
                end: () => {
                    clearTimeout(timer);
                    this.transactions.delete(txId);
                    resolve(lines);
                },
                fail: (error) => {
                    clearTimeout(timer);
                    this.transactions.delete(txId);
                    reject(error);
                }
            };

            this.transactions.set(txId, tx);

            if (timeout > 0) {
                timer = setTimeout(() => {
                    tx.fail(new TimeoutError(`Command timeout (${timeout / 1000}s)`));
                }, timeout);
            }

            this.ws.send(`${command} transaction_id=${txId}`, (error) => {
                if (error) tx.fail(error);
            });
        });
    }

    /**
     * Closes the connection.
     * @returns {Promise<void>} resolves once the socket is fully closed
     */
    close() {
        return new Promise((resolve) => {
            if (!this.ws || this.ws.readyState === WebSocket.CLOSED) return resolve();

            this.ws.once('close', () => resolve());
            this.ws.close(1000, 'done');
        });
    }
}

export default BotWaveClient;