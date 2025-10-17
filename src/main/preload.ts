import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from './ipc';
import type { AppConfig, EmailConfig } from '../common/types';

contextBridge.exposeInMainWorld('multi', {
  getConfig: async (): Promise<AppConfig> => ipcRenderer.invoke(IPC_CHANNELS.GET_CONFIG),
  saveConfig: async (cfg: AppConfig): Promise<boolean> => ipcRenderer.invoke(IPC_CHANNELS.SAVE_CONFIG, cfg),
  sendUnreadTotal: (count: number) => ipcRenderer.send(IPC_CHANNELS.UNREAD_UPDATE, count),

  // email
  emailConnect: (id: string, cfg: EmailConfig) => ipcRenderer.invoke(IPC_CHANNELS.EMAIL_CONNECT, id, cfg),
  emailDisconnect: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.EMAIL_DISCONNECT, id),
  emailOnUnread: (cb: (p: { instanceId: string; unread: number }) => void) => {
    ipcRenderer.on(IPC_CHANNELS.EMAIL_UNREAD, (_e, payload) => cb(payload));
  },
  emailList: (id: string, limit?: number) => ipcRenderer.invoke(IPC_CHANNELS.EMAIL_LIST, id, limit),
  emailFetch: (id: string, uid: number) => ipcRenderer.invoke(IPC_CHANNELS.EMAIL_FETCH, id, uid),
  emailCompose: (id: string, data: { to: string; subject?: string; text?: string }) =>
    ipcRenderer.invoke(IPC_CHANNELS.EMAIL_COMPOSE, id, data),
});