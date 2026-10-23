import type { Metadata } from "next";
import { BlogChrome } from "@/components/BlogChrome";
import { PostList } from "@/components/BlogPosts";
import { Container } from "@/components/parts";
import { SITE } from "@/content";

export const metadata: Metadata = {
  title: "Blog",
  description: `News from ${SITE.name}: what's new in the apps, what's coming, and notes from the pitch.`,
};

/** Every published post, newest first, from the API (src/blog.ts). */
export default function Blog() {
  return (
    <BlogChrome>
      <Container className="max-w-3xl py-14">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Blog</h1>
        <p className="mt-3 text-lg text-muted-foreground">What&apos;s new in the apps, what&apos;s coming, and notes from the pitch.</p>

        <PostList />
      </Container>
    </BlogChrome>
  );
}
