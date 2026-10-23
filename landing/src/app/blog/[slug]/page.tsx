import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { readPost, readPosts, showPostDate } from "@/blog";
import { BlogChrome } from "@/components/BlogChrome";
import { Container } from "@/components/parts";
import { SITE } from "@/content";

// A static site: every post is built ahead, and any other address is a 404.
export const dynamicParams = false;

export function generateStaticParams() {
  const posts = readPosts().map((post) => ({ slug: post.slug }));
  // A static export needs at least one page here, so with no posts yet it builds one that's a 404.
  return posts.length > 0 ? posts : [{ slug: "none" }];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const post = readPost((await params).slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.summary,
    openGraph: { title: post.title, description: post.summary, type: "article", publishedTime: post.date, siteName: SITE.name },
  };
}

export default async function BlogPost({ params }: { params: Promise<{ slug: string }> }) {
  const post = readPost((await params).slug);
  if (!post) notFound();
  return (
    <BlogChrome>
      <Container className="max-w-3xl py-14">
        <a href="/blog" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> All posts
        </a>
        <article className="mt-6">
          <header className="border-b pb-6">
            <p className="text-sm text-muted-foreground">
              <time dateTime={post.date}>{showPostDate(post.date)}</time>
              {post.author && <> · {post.author}</>}
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{post.title}</h1>
            {post.summary && <p className="mt-3 text-lg text-muted-foreground">{post.summary}</p>}
          </header>
          {/* Written in the repository, so the HTML is ours to trust. */}
          <div className="post mt-8" dangerouslySetInnerHTML={{ __html: post.html }} />
        </article>
      </Container>
    </BlogChrome>
  );
}
