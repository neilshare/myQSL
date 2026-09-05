export const API_PATHS = {
  qsos: "/api/v1/qsos",
  templates: "/api/v1/card-templates",
  cards: "/api/v1/cards",
  publicLookup: "/api/v1/public/card-lookup",
  backups: "/api/v1/backups",
  imports: "/api/v1/imports"
} as const;

export const publicCardPath = (id: string) => `/c/${encodeURIComponent(id)}`;
export const cardImagePath = (id: string) => `${API_PATHS.cards}/${encodeURIComponent(id)}/image`;
