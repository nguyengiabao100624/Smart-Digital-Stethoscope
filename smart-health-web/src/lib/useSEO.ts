import { useEffect, useMemo } from "react";

const SITE_URL = (import.meta.env.VITE_PUBLIC_SITE_URL || "https://shcare.web.app").replace(
  /\/+$/,
  "",
);

type JsonLd = Record<string, unknown> | Array<Record<string, unknown>>;

export interface SEOOptions {
  title: string;
  description: string;
  path: string; // route path beginning with "/"
  ogImage?: string;
  ogType?: string;
  jsonLd?: JsonLd;
}

function upsertMeta(selector: string, attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

export function useSEO(opts: SEOOptions) {
  const { title, description, path, ogImage, ogType = "website", jsonLd } = opts;
  const jsonLdText = useMemo(() => (jsonLd ? JSON.stringify(jsonLd) : ""), [jsonLd]);
  useEffect(() => {
    const url = `${SITE_URL}${path}`;
    document.title = title;
    upsertMeta('meta[name="description"]', "name", "description", description);
    upsertMeta('meta[property="og:title"]', "property", "og:title", title);
    upsertMeta('meta[property="og:description"]', "property", "og:description", description);
    upsertMeta('meta[property="og:url"]', "property", "og:url", url);
    upsertMeta('meta[property="og:type"]', "property", "og:type", ogType);
    upsertMeta('meta[name="twitter:title"]', "name", "twitter:title", title);
    upsertMeta('meta[name="twitter:description"]', "name", "twitter:description", description);
    if (ogImage) {
      upsertMeta('meta[property="og:image"]', "property", "og:image", ogImage);
      upsertMeta('meta[name="twitter:image"]', "name", "twitter:image", ogImage);
    }
    upsertLink("canonical", url);

    let ldEl: HTMLScriptElement | null = null;
    if (jsonLdText) {
      ldEl = document.createElement("script");
      ldEl.type = "application/ld+json";
      ldEl.setAttribute("data-seo-page", "true");
      ldEl.textContent = jsonLdText;
      document.head.appendChild(ldEl);
    }
    return () => {
      if (ldEl && ldEl.parentNode) ldEl.parentNode.removeChild(ldEl);
    };
  }, [title, description, path, ogImage, ogType, jsonLdText]);
}
