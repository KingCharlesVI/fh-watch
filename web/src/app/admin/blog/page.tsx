import { ExternalLink } from "lucide-react";
import { deleteBlogPost, uploadBlogPost } from "@/app/actions/admin";
import { ActionForm } from "@/components/ActionForm";
import { PageHeader } from "@/components/PageHeader";
import { TextField } from "@/components/TextField";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/format";
import { requireAdmin } from "@/lib/session";
import { LANDING_URL } from "@/lib/site";
import type { BlogPostSummary, Items } from "@/lib/types";

export const metadata = { title: "Blog" };

const EXAMPLE = `---
title: Our first match on the watch
date: 2026-10-23
summary: One or two sentences for the list of posts.
author: The FH Match Centre team
---

The post itself, in Markdown.`;

/** The landing page's blog: each post uploaded as a Markdown file, out as soon as it's in. */
export default async function AdminBlogPage() {
  await requireAdmin("/admin/blog");
  const posts = await api<Items<BlogPostSummary>>("/v1/blog/posts", { query: { drafts: true } });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Blog"
        back={{ href: "/admin", label: "Admin" }}
        description={
          <>
            Posts on the landing page&apos;s <a href={`${LANDING_URL}/blog`}>blog</a>. Upload one as a Markdown file and it&apos;s out straight away, within
            a minute for anyone who had the blog open. Upload a file to a post&apos;s address again to change it.
          </>
        }
      />
      <div className="grid items-start gap-6 md:grid-cols-[3fr_2fr]">
        <div className="space-y-4">
          {posts.items.length === 0 && <p className="text-muted-foreground">No posts yet.</p>}
          {posts.items.map((post) => (
            <Card key={post.slug} className={post.draft ? "bg-muted/40" : undefined}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  {post.title}
                  {post.draft && <Badge variant="secondary">Draft</Badge>}
                </CardTitle>
                <CardDescription>
                  {formatDate(`${post.date}T12:00:00Z`)} · /blog/{post.slug}
                  {post.author && ` · ${post.author}`} · uploaded {formatDateTime(post.updatedAt)}
                </CardDescription>
              </CardHeader>
              {post.summary && (
                <CardContent>
                  <p className="text-sm text-muted-foreground">{post.summary}</p>
                </CardContent>
              )}
              <CardFooter className="flex-wrap items-end gap-2">
                <ActionForm action={uploadBlogPost} submitLabel="Replace" variant="outline" inline>
                  <input type="hidden" name="slug" value={post.slug} />
                  <Input name="file" type="file" accept=".md,.markdown,text/markdown" required aria-label={`New file for ${post.title}`} className="w-64" />
                </ActionForm>
                <ActionForm
                  action={deleteBlogPost}
                  submitLabel="Delete"
                  variant="destructive"
                  inline
                  confirm={{ title: `Delete “${post.title}”?`, description: "It comes off the blog, and links to it stop working." }}
                >
                  <input type="hidden" name="slug" value={post.slug} />
                </ActionForm>
                {!post.draft && (
                  <a href={`${LANDING_URL}/blog/${post.slug}`} className="ml-auto inline-flex items-center gap-1 text-sm">
                    View <ExternalLink className="size-3.5" />
                  </a>
                )}
              </CardFooter>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Upload a post</CardTitle>
            <CardDescription>A Markdown file that starts with its front matter, like this:</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">{EXAMPLE}</pre>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li>A title and a date (YYYY-MM-DD) are needed; the summary and author aren&apos;t.</li>
              <li>
                <code>draft: true</code> keeps it off the blog until you upload it again without that line.
              </li>
              <li>Start headings at ##: the title is the post&apos;s only #.</li>
              <li>Posts are listed by their date, newest first. The three newest are on the front page.</li>
            </ul>
            <ActionForm action={uploadBlogPost} submitLabel="Upload" className="max-w-none">
              <TextField label="File" name="file" type="file" accept=".md,.markdown,text/markdown" required />
              <TextField
                label="Address"
                name="slug"
                placeholder="first-match"
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                maxLength={80}
                hint="Optional. Lower case, with hyphens; without one, it's the file's name. Don't change it once it's out, or links to it break."
              />
            </ActionForm>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
