"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IPC_CHANNELS = void 0;
exports.IPC_CHANNELS = {
    UNREAD_UPDATE: 'unread:update',
    GET_CONFIG: 'config:get',
    SAVE_CONFIG: 'config:save',
    // Email (builtin IMAP/SMTP)
    EMAIL_CONNECT: 'email:connect',
    EMAIL_DISCONNECT: 'email:disconnect',
    EMAIL_UNREAD: 'email:unread', // event main -> renderer
    EMAIL_LIST: 'email:list', // headers
    EMAIL_FETCH: 'email:fetch', // body text
    EMAIL_COMPOSE: 'email:compose' // send via SMTP
};
