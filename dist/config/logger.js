"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class ConsoleLogger {
    formatMessage(level, message, ...args) {
        const timestamp = new Date().toISOString();
        return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    }
    info(message, ...args) {
        console.log(this.formatMessage('info', message), ...args);
    }
    error(message, ...args) {
        console.error(this.formatMessage('error', message), ...args);
    }
    warn(message, ...args) {
        console.warn(this.formatMessage('warn', message), ...args);
    }
    debug(message, ...args) {
        if (process.env.NODE_ENV === 'development') {
            console.debug(this.formatMessage('debug', message), ...args);
        }
    }
}
const logger = new ConsoleLogger();
exports.default = logger;
