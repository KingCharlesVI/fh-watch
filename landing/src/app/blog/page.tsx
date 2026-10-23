import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import { readPosts, showPostDate } from "@/blog";
import { BlogChrome } from "@/components/BlogChrome";
import { Container } from "@/components/parts";
import { SITE } from "@/content";

export const metadata: Metadata = {
  title: "Blog",
  description: `News from ${SITE.name}: what's new in the apps, what's coming, and notes from the pitch.`,
};

/** Every post in landing/blog/, newest first. */
export default function Blog() {
  const posts = readPosts();
  return (
    <BlogChrome>
      <Container className="max-w-3xl py-14">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Blog</h1>
        <p className="mt-3 text-lg text-muted-foreground">What&apos;s new in the apps, what&apos;s coming, and notes from the pitch.</p>

        {posts.length === 0 ? (
          <p className="mt-10 rounded-xl border border-dashed bg-card p-5 text-sm text-muted-foreground">Nothing here yet. The first post is on its way.</p>
        ) : (
          <ol className="mt-10 divide-y border-y">
            {posts.map((post) => (
              <li key={post.slug}>
                <a href={`/blog/${post.slug}`} className="group block py-6">
                  <p className="text-sm text-muted-foreground">
                    <time dateTime={post.date}>{showPostDate(post.date)}</time>
                    {post.author && <> · {post.author}</>}
                  </p>
                  <h2 className="mt-1 text-xl font-semibold tracking-tight group-hover:text-primary">{post.title}</h2>
                  {post.summary && <p className="mt-2 text-muted-foreground">{post.summary}</p>}
                  <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary">
                    Read <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </a>
              </li>
            ))}
          </ol>
        )}
      </Container>
    </BlogChrome>
  );
}
