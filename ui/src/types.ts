// src/types.ts
export interface Tab {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  parentId?: string;
}

export interface WindowData {
  id: string;
  tabs: Tab[];
  collapsed?: boolean;
  width?: number;
}

export type SortMode = 'oldest' | 'alpha' | 'alpha-desc' | 'newest';

export type SaveStatus = 'saved' | 'saving' | 'error';