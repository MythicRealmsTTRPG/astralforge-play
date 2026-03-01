export const onRequest: PagesFunction = async ({ request, env }) => {
  const url = new URL(request.url);
  url.pathname = "/campaigns/_/index.html";
  return (env as any).ASSETS.fetch(new Request(url.toString(), request));
};
