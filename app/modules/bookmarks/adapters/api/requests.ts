export interface CreateBookmarkRequest {
  parentId: string;
  title: string;
  url?: string;
}
export interface UpdateBookmarkRequest {
  title?: string;
  url?: string;
}
export interface MoveBookmarkRequest {
  parentId?: string;
  index?: number;
}
