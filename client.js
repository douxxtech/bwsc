#!/usr/bin/env node

const WebSocket = require('ws');
const readline = require('readline');
const { program } = require('commander');

class BotWaveWSClient {
    constructor(host, passkey) {
        const protocolMatch = host.match(/^(wss?):\/\/(.+)$/);
        const hostToParse = protocolMatch ? protocolMatch[2] : host;
        this.protocol = protocolMatch ? protocolMatch[1] : 'ws';

        const portMatch = hostToParse.match(/^(.+):(\d+)$/);
        if (portMatch) {
            this.host = portMatch[1];
            this.port = parseInt(portMatch[2], 10);
        } else {
            this.host = hostToParse;
            this.port = 9939; // default
        }

        this.passkey = passkey;
        this.ws = null;
        this.authenticated = false;
        this.rl = null;
        this.commandHistory = [];
        this.historyIndex = 0;
        this.connecting = false;

        this.colors = {
            reset: '\u001b[0m',
            bold: '\u001b[1m',
            dim: '\u001b[2m',
            red: '\u001b[31m',
            green: '\u001b[32m',
            yellow: '\u001b[33m',
            blue: '\u001b[34m',
            magenta: '\u001b[35m',
            cyan: '\u001b[36m',
            white: '\u001b[37m',
            bright_red: '\u001b[91m',
            bright_green: '\u001b[92m',
            bright_yellow: '\u001b[93m',
            bright_blue: '\u001b[94m',
            bright_magenta: '\u001b[95m',
            bright_cyan: '\u001b[96m',
            bright_white: '\u001b[97m'
        };

        this.messageTypes = {
            OK: 'bright_green',
            ERR: 'bright_red',
            WARN: 'bright_yellow',
            INFO: 'bright_cyan',
            CLIENT: 'magenta',
            SERVER: 'cyan',
            FILE: 'yellow',
            BCAST: 'bright_magenta',
            VER: 'bright_cyan',
            UPD: 'bright_yellow',
            HNDL: 'magenta'
        };
    }

    colorize(text, color) {
        return `${this.colors[color]}${text}${this.colors.reset}`;
    }

    log(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const prefix = this.colorize(`[${timestamp}]`, 'dim');

        switch (type) {
            case 'success':
                console.log(`${prefix} ${this.colorize('[OK]', 'bright_green')} ${message}`);
                break;
            case 'error':
                console.log(`${prefix} ${this.colorize('[ERR]', 'bright_red')} ${message}`);
                break;
            case 'warning':
                console.log(`${prefix} ${this.colorize('[WARN]', 'bright_yellow')} ${message}`);
                break;
            case 'info':
                console.log(`${prefix} ${this.colorize('[INFO]', 'bright_blue')} ${message}`);
                break;
            default:
                console.log(`${prefix} ${message}`);
        }
    }

    async connect() {
        if (this.connecting) return;
        this.connecting = true;

        try {
            const wsUrl = `${this.protocol}://${this.host}:${this.port}`;
            this.log(`Connecting to ${wsUrl}...`, 'info');

            this.ws = new WebSocket(wsUrl);

            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Connection timeout (5s)'));
                }, 5000);

                this.ws.on('open', () => {
                    clearTimeout(timeout);
                    this.log('WebSocket connection established', 'success');
                    resolve();
                });

                this.ws.on('error', (error) => {
                    clearTimeout(timeout);
                    reject(error);
                });
            });

            this.setupWebSocketHandlers();
            await this.authenticate();

        } finally {
            this.connecting = false;
        }
    }

    setupWebSocketHandlers() {
        this.ws.on('message', (data) => {
            this.handleMessage(data.toString());
        });

        this.ws.on('error', (error) => {
            this.log(`WebSocket error: ${error.message}`, 'error');
        });

        this.ws.on('close', (code, reason) => {
            this.log(`Connection closed (${code}): ${reason || 'No reason provided'}`, 'warning');
            this.cleanup();
        });
    }

    async authenticate() {
        return new Promise((resolve, reject) => {
            const authMessage = {
                type: 'auth',
                passkey: this.passkey || ''
            };

            const timeout = setTimeout(() => {
                reject(new Error('Authentication timeout (5s)'));
            }, 5000);

            const authHandler = (data) => {
                clearTimeout(timeout);
                this.ws.removeListener('message', authHandler);

                try {
                    const response = JSON.parse(data);
                    if (response.type === 'auth_ok') {
                        this.authenticated = true;
                        this.log('Authentication successful', 'success');
                        resolve();
                    } else if (response.type === 'auth_failed') {
                        reject(new Error(`Authentication failed: ${response.message}`));
                    } else {
                        reject(new Error('Unexpected authentication response'));
                    }
                } catch (e) {
                    reject(new Error('Invalid authentication response'));
                }
            };

            this.ws.on('message', authHandler);
            this.ws.send(JSON.stringify(authMessage));
        });
    }

    handleMessage(message) {
        if (!this.authenticated) return;

        // Skip JSON auth responses
        try {
            const data = JSON.parse(message);
            if (data.type) return;
        } catch (e) {
            // no json = log message
        }

        if (message.includes('WebSocket CMD')) {
            return;
        }

        const colorizedMessage = this.colorizeMessage(message);

        if (this.rl) {
            readline.clearLine(process.stdout, 0);
            readline.cursorTo(process.stdout, 0);
            console.log(colorizedMessage);
            this.rl.prompt(true);
        } else {
            console.log(colorizedMessage);
        }
    }

    colorizeMessage(message) {
        // tagged messages
        const tagMatch = message.match(/^\[([A-Z]+)\]\s(.*)$/);
        if (tagMatch) {
            const [, tag, content] = tagMatch;
            const color = this.messageTypes[tag];
            if (color) {
                return `${this.colorize(`[${tag}]`, color)} ${content}`;
            }
        }

        // sec devicdesrs
        if (message.includes('─')) {
            return this.colorize(message, 'bright_blue');
        }

        // client info matches
        if (message.match(/^\s+(Hostname|Address|Protocol|Connected|Last seen|Machine):/)) {
            return this.colorize(message, 'cyan');
        }

        // id lines
        if (message.match(/^ID:\s/)) {
            return this.colorize(message, 'bright_white');
        }

        // intends
        if (message.match(/^\s{2,4}[^\s]/)) {
            return this.colorize(message, 'white');
        }

        return message;
    }

    setupReadline() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: this.colorize('botwave › ', 'bright_green'),
            historySize: 100
        });

        this.rl.on('line', (input) => {
            const command = input.trim();

            if (!command) {
                this.rl.prompt();
                return;
            }

            this.handleCommand(command);
        });

        this.rl.on('close', () => {
            this.cleanup();
        });

        this.rl.on('SIGINT', () => {
            console.log('\n' + this.colorize('Use "exit" or Ctrl+D to quit', 'yellow'));
            this.rl.prompt();
        });

        this.setupHistoryNavigation();
    }

    setupHistoryNavigation() {
        this.rl.input.on('keypress', (str, key) => {
            if (!key) return;

            if (key.name === 'up' && this.historyIndex > 0) {
                this.historyIndex--;
                this.rl.line = this.commandHistory[this.historyIndex];
                this.rl.cursor = this.rl.line.length;
                this.rl._refreshLine();
            } else if (key.name === 'down') {
                if (this.historyIndex < this.commandHistory.length - 1) {
                    this.historyIndex++;
                    this.rl.line = this.commandHistory[this.historyIndex];
                    this.rl.cursor = this.rl.line.length;
                } else {
                    this.historyIndex = this.commandHistory.length;
                    this.rl.line = '';
                    this.rl.cursor = 0;
                }
                this.rl._refreshLine();
            }
        });
    }

    handleCommand(command) {
        if (command === 'exit' || command === 'quit') {
            this.log('bye!', 'info');
            this.cleanup();
            return;
        }

        if (command === 'clear') {
            console.clear();
            this.showHeader();
            this.rl.prompt();
            return;
        }

        if (this.commandHistory[this.commandHistory.length - 1] !== command) {
            this.commandHistory.push(command);
            if (this.commandHistory.length > 100) {
                this.commandHistory.shift();
            }
        }
        this.historyIndex = this.commandHistory.length;

        if (this.isConnected()) {
            this.ws.send(command);
        } else {
            this.log('Not connected to server', 'error');
        }

        this.rl.prompt();
    }

    isConnected() {
        return this.ws && this.ws.readyState === WebSocket.OPEN && this.authenticated;
    }

    showHeader() {
        const title = this.colorize('BotWave WebSocket Client', 'bright_blue');
        const version = this.colorize('v1.1.0', 'dim');
        const divider = this.colorize('─'.repeat(50), 'dim');

        console.log(`\n${title} ${version}`);
        console.log(divider);
        console.log(this.colorize('Built-in commands: clear, exit', 'yellow'));
        console.log(this.colorize('Use ↑/↓ arrows for command history\n', 'dim'));
    }

    start() {
        this.showHeader();
        this.setupReadline();
        this.rl.prompt();
    }

    cleanup() {
        if (this.rl) {
            this.rl.close();
            this.rl = null;
        }
        if (this.ws && this.ws.readyState !== WebSocket.CLOSED) {
            this.ws.close();
        }
        process.exit(0);
    }
}

program
    .name('bwsc')
    .description('BotWave WebSocket Client - Connect to BotWave WS servers')
    .version('1.1.0')
    .argument('<host>', 'Server (ws://host:port, wss://host:port, host:port, or just host)')
    .argument('[passkey]', 'Authentication passkey (optional)')
    .parse();

async function main() {
    const [host, passkey] = program.args;

    const client = new BotWaveWSClient(host, passkey);

    const shutdown = () => {
        console.log('\n');
        client.log('Shutting down...', 'info');
        client.cleanup();
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    try {
        await client.connect();
        client.start();
    } catch (error) {
        client.log(`Failed to connect: ${error.message}`, 'error');
        client.log(`Double check protocol (wss:// ?), hostname, port and passkey!`, 'error');
        process.exit(1);
    }
}

main().catch(console.error);