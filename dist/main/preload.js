"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const ipc_1 = require("./ipc");
electron_1.contextBridge.exposeInMainWorld('multi', {
    getConfig: async () => electron_1.ipcRenderer.invoke(ipc_1.IPC_CHANNELS.GET_CONFIG),
    saveConfig: async (cfg) => electron_1.ipcRenderer.invoke(ipc_1.IPC_CHANNELS.SAVE_CONFIG, cfg),
    sendUnreadTotal: (count) => electron_1.ipcRenderer.send(ipc_1.IPC_CHANNELS.UNREAD_UPDATE, count),
    // email
    emailConnect: (id, cfg) => electron_1.ipcRenderer.invoke(ipc_1.IPC_CHANNELS.EMAIL_CONNECT, id, cfg),
    emailDisconnect: (id) => electron_1.ipcRenderer.invoke(ipc_1.IPC_CHANNELS.EMAIL_DISCONNECT, id),
    emailOnUnread: (cb) => {
        electron_1.ipcRenderer.on(ipc_1.IPC_CHANNELS.EMAIL_UNREAD, (_e, payload) => cb(payload));
    },
    emailList: (id, limit) => electron_1.ipcRenderer.invoke(ipc_1.IPC_CHANNELS.EMAIL_LIST, id, limit),
    emailFetch: (id, uid) => electron_1.ipcRenderer.invoke(ipc_1.IPC_CHANNELS.EMAIL_FETCH, id, uid),
    emailCompose: (id, data) => electron_1.ipcRenderer.invoke(ipc_1.IPC_CHANNELS.EMAIL_COMPOSE, id, data),
});
