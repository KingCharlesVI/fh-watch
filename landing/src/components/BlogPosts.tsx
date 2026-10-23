"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { type Post, type PostMeta, fetchPost, fetchPosts, postHref, postHtml, showPostDate, slugFromLocation } from "@/blog";
import { SITE } from "@/content";
import { Section } from "./parts";

type Loaded<T> = { state: "loading" } | { state: "ready"; value: T } | { state: "failed" };

/** Runs `load` once the page is open, as the posts come from the API rather than the build. */
function useLoaded<T>(load: () => Promise<T>): Loaded<T> {
  const [loaded, setLoaded] = useState<Loaded<T>>({ state: "loading" });
  useEffect(() => {
    let live = true;
    load()
      .then((value) => live && setLoaded({ state: "ready", value }))
      .catch(() => live && setLoaded({ state: "failed" }));
    return () => {
      live = false;
    };
    // Once per page.
  }, []);
  return loaded;
}

const Note = ({ children }: { children: ReactNode }) => (
  <p className="mt-10 rounded-xl border border-dashed bg-card p-5 text-sm text-muted-foreground">{children}</p>
);

const Failed = () => <Note>The blog couldn&apos;t be loaded just now. Try again in a minute.</Note>;

/** The /blog page's list: every published post, newest first. */
export function PostList() {
  const posts = useLoaded(fetchPosts);
  if (posts.state === "loading") return <ol aria-busy className="mt-10 h-40 animate-pulse rounded-xl bg-muted/60" />;
  if (posts.state === "failed") return <Failed />;
  if (posts.value.length === 0) return <Note>Nothing here yet. The first post is on its way.</Note>;
  return (
    <ol className="mt-10 divide-y border-y">
      {posts.value.map((post) => (
        <li key={post.slug}>
          <a href={postHref(post.slug)} className="group block py-6">
            <Byline post={post} />
            <h2 className="mt-1 text-xl font-semibold tracking-tight group-hover:text-primary">{post.title}</h2>
            {post.summary && <p className="mt-2 text-muted-foreground">{post.summary}</p>}
            <Read />
          </a>
        </li>
      ))}
    </ol>
  );
}

/** The front page's three newest posts. The section stays away until there's one to show, or if the blog can't be loaded. */
export function LatestPosts() {
  const posts = useLoaded(fetchPosts);
  if (posts.state !== "ready" || posts.value.length === 0) return null;
  return (
    <Section id="blog" eyebrow="Blog" title="Latest news">
      <div className="grid gap-6 md:grid-cols-3">
        {posts.value.slice(0, 3).map((post) => (
          <a key={post.slug} href={postHref(post.slug)} className="group flex flex-col rounded-xl border bg-card p-5 transition-colors hover:border-primary">
            <time dateTime={post.date} className="text-sm text-muted-foreground">
              {showPostDate(post.date)}
            </time>
            <h3 className="mt-2 font-semibold group-hover:text-primary">{post.title}</h3>
            {post.summary && <p className="mt-1.5 text-sm text-muted-foreground">{post.summary}</p>}
            <span className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-medium text-primary">
              Read <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </a>
        ))}
      </div>
      <a href="/blog" className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
        All posts <ArrowRight className="size-3.5" />
      </a>
    </Section>
  );
}

/** One post, the one this page's address names. */
export function PostView() {
  const post = useLoaded(async (): Promise<Post | null> => {
    const slug = slugFromLocation(window.location);
    return slug ? fetchPost(slug) : null;
  });

  useEffect(() => {
    if (post.state !== "ready") return;
    document.title = post.value ? `${post.value.title} · ${SITE.name}` : `Post not found · ${SITE.name}`;
    if (post.value?.summary) document.querySelector('meta[name="description"]')?.setAttribute("content", post.value.summary);
  }, [post]);

  return (
    <>
      <a href="/blog" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> All posts
      </a>
      {post.state === "loading" && <div aria-busy className="mt-6 h-64 animate-pulse rounded-xl bg-muted/60" />}
      {post.state === "failed" && <Failed />}
      {post.state === "ready" && !post.value && (
        <div className="mt-6">
          <h1 className="text-3xl font-semibold tracking-tight">Post not found</h1>
          <p className="mt-3 text-muted-foreground">It may have moved or been taken down. All the posts are on the blog.</p>
        </div>
      )}
      {post.state === "ready" && post.value && (
        <article className="mt-6">
          <header className="border-b pb-6">
            <Byline post={post.value} />
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{post.value.title}</h1>
            {post.value.summary && <p className="mt-3 text-lg text-muted-foreground">{post.value.summary}</p>}
          </header>
          <div className="post mt-8" dangerouslySetInnerHTML={{ __html: postHtml(post.value) }} />
        </article>
      )}
    </>
  );
}

function Byline({ post }: { post: PostMeta }) {
  return (
    <p className="text-sm text-muted-foreground">
      <time dateTime={post.date}>{showPostDate(post.date)}</time>
      {post.author && <> · {post.author}</>}
    </p>
  );
}

const Read = () => (
  <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary">
    Read <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
  </span>
);
