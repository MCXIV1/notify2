export type ServiceType = 'messaging' | 'email';

export interface ServicePermissions {
  camera?: boolean;
  microphone?: boolean;
  notifications?: boolean;
  popups?: boolean;
}

export type BuiltinKind = 'imap';

export interface ServiceRecipe {
  id: string;
  name: string;
  type: ServiceType;
  icon?: string;
  url?: string;
  userAgent?: string;
  allowPopups?: boolean;
  permissions?: ServicePermissions;

  // Для web-сервисов: выражение, которое возвращает число непрочитанных (выполняется в webview)
  unreadEval?: string;

  // Для встроенной почты
  builtin?: BuiltinKind;
}

export interface EmailConfig {
  imap: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
  };
  smtp?: {
    host: string;
    port: number;
    secure: boolean;
    user?: string;
    pass?: string;
  };
  folder?: string; // INBOX по умолчанию
}

export interface SavedServiceInstance {
  instanceId: string;
  recipeId: string;
  name: string;
  url?: string;
  muted?: boolean;
  partition: string;

  // Для builtin: imap
  email?: EmailConfig;
}

export interface AppConfig {
  services: SavedServiceInstance[];
  masterPasswordSet: boolean;
}