export interface ModelEndpoint {
  endpoint: URL;
  credentialScope: string;
}

export function resolveModelEndpoint(input: string): ModelEndpoint {
  if (typeof input !== "string" || input.length > 2_048) {
    throw new Error("请填写有效的模型 API 地址。");
  }

  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error("请填写完整的模型 API HTTPS 地址。");
  }

  if (
    url.protocol !== "https:" ||
    !url.hostname ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error("模型地址必须使用 HTTPS，且不能包含账号、密码、查询参数或片段。");
  }

  const path = url.pathname.replace(/^\/+|\/+$/g, "");
  if (!path) {
    url.pathname = "/v1/chat/completions";
  } else if (path !== "chat/completions" && !path.endsWith("/chat/completions")) {
    url.pathname = `/${path}/chat/completions`;
  } else {
    url.pathname = `/${path}`;
  }

  return {
    endpoint: url,
    credentialScope: url.toString(),
  };
}

export function validateExternalUrl(input: string): URL {
  if (typeof input !== "string" || input.length > 8_192) {
    throw new Error("链接无效。");
  }

  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error("链接格式无效。");
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    !url.hostname ||
    url.username !== "" ||
    url.password !== ""
  ) {
    throw new Error("只能打开不含账号密码的 HTTP 或 HTTPS 链接。");
  }
  return url;
}
