import React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Header } from "@/components/header";
import Prose from "@/components/ui/prose";
import { Separator } from "@/components/ui/separator";
import { getSinglePost, processHtmlContent } from "@/lib/blog-query";

export const Route = createFileRoute("/blog/$slug")({
  component: BlogPostPage,
  loader: async ({ params }) => {
    const data = await getSinglePost(params.slug);
    if (!data || !data.post) {
      throw new Error("Post not found");
    }
    const html = await processHtmlContent(data.post.content);
    return { post: data.post, html };
  },
});

function BlogPostPage() {
  const { post, html } = Route.useLoaderData();

  const formattedDate = new Date(post.publishedAt).toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="relative">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-96 h-96 bg-linear-to-br from-muted/20 to-transparent rounded-full blur-3xl" />
          <div className="absolute top-1/2 -left-40 w-80 h-80 bg-linear-to-tr from-muted/10 to-transparent rounded-full blur-3xl" />
        </div>

        <div className="relative container max-w-3xl mx-auto px-4 py-16">
          <div className="text-center mb-6">
            {post.coverImage && (
              <div className="relative aspect-video rounded-lg overflow-hidden mb-6">
                <img
                  src={post.coverImage}
                  alt={post.title}
                  className="w-full h-full object-cover rounded-lg"
                />
              </div>
            )}
            <div className="flex items-center justify-center mb-6">
              <time dateTime={post.publishedAt.toString()}>
                {formattedDate}
              </time>
            </div>

            <h1 className="text-5xl md:text-4xl font-bold tracking-tight mb-6">
              {post.title}
            </h1>
            <div className="flex items-center justify-center gap-2">
              {post.authors[0] && (
                <>
                  <img
                    src={post.authors[0].image}
                    alt={post.authors[0].name}
                    className="aspect-square shrink-0 size-8 rounded-full"
                  />
                  <p className="text-muted-foreground">
                    {post.authors[0].name}
                  </p>
                </>
              )}
            </div>
          </div>
          <Separator />
          <section className="mt-14">
            <Prose html={html} />
          </section>
        </div>
      </main>
    </div>
  );
}
