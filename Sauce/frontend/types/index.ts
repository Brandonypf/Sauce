export type ContentCategory =
  | "visual-novel"
  | "manga"
  | "game"
  | "illustration"
  | "music";

export type ContentStatus = "active" | "draft" | "hidden";

export interface Creator {
  address: string;
  handle: string;
  name: string;
  bio: string;
  avatarUrl?: string;
  workCount: number;
  followerCount: number;
}

export interface ContentWork {
  id: number;
  slug: string;
  title: string;
  creator: Creator;
  category: ContentCategory;
  description: string;
  synopsis: string;
  price: string;
  currency: string;
  coverUrl: string;
  screenshots: string[];
  tags: string[];
  language: string;
  duration?: string;
  engine?: string;
  createdAt: string;
  licenseCount: number;
}

export interface OwnedLicense {
  tokenId: string;
  workId: number;
  purchasedAt: string;
}
