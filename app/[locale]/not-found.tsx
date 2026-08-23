import type { Metadata } from "next";

import { NotFoundContent } from "./NotFoundContent";

// A page that calls notFound() has its own metadata discarded, so this
// boundary is the only place a 404 title can come from — without one the
// response inherits the site default and reads like an ordinary page.
//
// The title is deliberately static and language-neutral. Resolving a locale
// here would mean a dynamic API (this boundary receives no route params), and
// reading headers() turns any statically rendered page that calls notFound()
// dynamic at runtime, which Next rejects outright. "404" needs no translation
// and matches the heading the body already renders in every locale.
export const metadata: Metadata = {
  title: "404",
};

export default function NotFound() {
  return <NotFoundContent />;
}
