import type { Metadata } from "next";
import { BlogChrome } from "@/components/BlogChrome";
import { PostView } from "@/components/BlogPosts";
import { Container } from "@/components/parts";

export const metadata: Metadata = { title: "Blog" };

/**
 * Any one post. Posts are uploaded after the site is built, so there's no page per post:
 * /blog/<slug> is rewritten to this one (vercel.json), which reads the slug from the address
 * and loads the post from the API.
 */
export default function BlogPost() {
  return (
    <BlogChrome>
      <Container className="max-w-3xl py-14">
        <PostView />
      </Container>
    </BlogChrome>
  );
}
