"use client";

import { PostsFeed } from "@/components/PostsFeed";

export default function LocataireInfosPage() {
  return <PostsFeed canPublish={false} admin={false} />;
}
