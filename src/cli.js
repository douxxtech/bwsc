#!/usr/bin/env node

import readline from 'readline';
import { program } from 'commander';
import { BotWaveClient, AuthError, TimeoutError } from './client.js';
import pkg from '../package.json' with { type: 'json' };

class BotWaveClientCLI {
    constructor(host, passkey) {
        this.client = new BotWaveClient({ host, passkey });
        this.rl = null;
        this.commandHistory = [];
        this.historyIndex = 0;
        this.silent = false;

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
            bright_white: '\u001b[97m',
            bright_yellow_bold: '\u001b[93m\u001b[1m',
            purple: '\u001b[38;5;129m',
            pink: '\u001b[38;5;213m',
            orange: '\u001b[38;5;208m',
            converter: '\u001b[38;2;50;215;165m',
            environ: '\u001b[38;2;224;107;61m'
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
            UPD: 'bright_yellow_bold',
            HNDL: 'magenta',
            SSTV: 'bright_blue',
            AUTH: 'blue',
            TLS: 'red',
            MORSE: 'purple',
            ALSA: 'pink',
            QUEUE: 'orange',
            DBG: 'orange',
            CVRT: 'converter',
            ENV: 'environ'
        };

        this.setupClientHandlers();
    }

    colorize(text, color) {
        return `${this.colors[color]}${text}${this.colors.reset}`;
    }

    log(message, type = 'info') {
        if (this.silent) return;
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

    setupClientHandlers() {
        this.client.on('open', () => {
            this.log('WebSocket connection established', 'success');
        });

        this.client.on('authenticated', () => {
            this.log('Authentication successful', 'success');
        });

        this.client.on('message', (message) => {
            this.handleMessage(message);
        });

        this.client.on('error', (error) => {
            this.log(`WebSocket error: ${error.message}`, 'error');
        });

        this.client.on('close', (code, reason) => {
            this.log(`Connection closed (${code}): ${reason || 'No reason provided'}`, 'warning');
            this.cleanup();
        });
    }

    async connect() {
        this.log(`Connecting to ${this.client.url}...`, 'info');

        if (!this.client.passkey) {
            this.log('No passkey, skipping auth', 'info');
        }

        await this.client.connect();
    }

    handleMessage(message) {
        if (/\[\d{1,3}(\.\d{1,3}){3}\]/.test(message)) {
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

    async runCommand(command, timeoutSecs = 0) {
        // the client already strips the transaction id, we just colorize and print
        return this.client.run(command, {
            timeout: timeoutSecs * 1000,
            onLine: (line) => console.log(this.colorizeMessage(line))
        });
    }

    async handleCommand(command) {
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

        try {
            await this.client.send(command);
        } catch (error) {
            this.log(error.message, 'error');
        }

        this.rl.prompt();
    }

    showHeader() {
        const title = this.colorize('BotWave WebSocket Client', 'bright_blue');
        const version = this.colorize(`v${pkg.version ?? '???'}`, 'dim');
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
        
        this.client.removeAllListeners();
        this.client.close().finally(() => process.exit(0));
    }
}

program
    .name('bwsc')
    .description('BotWave WebSocket Client - Connect to a BotWave Remote CLI server')
    .version(`bwsc v${pkg.version ?? '???'}`)
    .argument('<host>', 'Server (ws://host:port, wss://host:port, host:port, or just host)')
    .argument('[passkey]', 'Authentication passkey (optional)')
    .option('-f, --fire <command>', 'Fire-and-forget a command')
    .option('-c, --command <command>', 'Run a command and collect its output')
    .parse();

async function main() {
    const [host, passkey] = program.args;
    const options = program.opts();

    const cli = new BotWaveClientCLI(host, passkey);

    const shutdown = () => {
        console.log('\n');
        cli.log('Shutting down...', 'info');
        cli.cleanup();
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    try {
        if (options.fire || options.command) {
            cli.silent = true;
        }

        await cli.connect();

        if (options.fire) {
            await cli.client.send(options.fire);
            await cli.client.close();
            process.exit(0);
        }

        if (options.command) {
            await cli.runCommand(options.command);
            await cli.client.close();
            process.exit(0);
        }

        cli.start();
    } catch (error) {
        cli.silent = false;

        if (error instanceof AuthError) {
            cli.log(error.message, 'error');

        } else if (error instanceof TimeoutError) {
            cli.log(error.message, 'error');

        } else {
            cli.log(`Failed to connect: ${error.message}`, 'error');
            cli.log(`Double check protocol (wss:// ?), hostname, port and passkey!`, 'error');
        }

        process.exit(1);
    }
}

main().catch(console.error);