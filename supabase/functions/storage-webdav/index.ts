import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

type StorageAction =
  | "list"
  | "mkdir"
  | "delete"
  | "upload"
  | "set_credentials"
  | "start_nextcloud_login"
  | "poll_nextcloud_login";

type StorageConfig = {
  provider: "none" | "webdav" | "nextcloud";
  url: string;
  username: string;
  password: string;
  basePath: string;
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders }
  });

const normalizeBasePath = (value: string) => {
  const trimmed = value.trim();
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const collapsed = withLeadingSlash.replace(/\/+/g, "/");
  const withoutTrailing = collapsed.length > 1 ? collapsed.replace(/\/+$/g, "") : collapsed;
  return withoutTrailing.length > 0 ? withoutTrailing : "/domora";
};

const sanitizeRelativePath = (value: unknown) => {
  if (typeof value !== "string") return "/";
  const trimmed = value.trim();
  if (!trimmed) return "/";
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const collapsed = withLeadingSlash.replace(/\\/g, "/").replace(/\/+/g, "/");
  const segments = collapsed
    .split("/")
    .filter((segment) => segment.length > 0 && segment !== "." && segment !== "..");
  return segments.length === 0 ? "/" : `/${segments.join("/")}`;
};

const joinNormalizedPaths = (...parts: string[]) => {
  const segments = parts
    .flatMap((part) => part.split("/"))
    .filter((segment) => segment.length > 0);
  return `/${segments.join("/")}`;
};

const withNoTrailingSlash = (value: string) => value.replace(/\/+$/g, "");

const buildWebdavUrl = (baseUrl: string, absolutePath: string) => {
  const trimmedBase = withNoTrailingSlash(baseUrl);
  const encodedPath = absolutePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${trimmedBase}${encodedPath}`;
};

const buildAuthHeader = (username: string, password: string) => {
  const token = btoa(`${username}:${password}`);
  return `Basic ${token}`;
};

const extractXmlTagValue = (xml: string, tagName: string): string | null => {
  const pattern = new RegExp(`<(?:[A-Za-z0-9_-]+:)?${tagName}[^>]*>([\\s\\S]*?)</(?:[A-Za-z0-9_-]+:)?${tagName}>`, "i");
  const match = xml.match(pattern);
  if (!match) return null;
  const trimmed = match[1].trim();
  return trimmed.length > 0 ? trimmed : null;
};

const hasXmlTag = (xml: string, tagName: string) => {
  const pattern = new RegExp(`<(?:[A-Za-z0-9_-]+:)?${tagName}(?:\\s[^>]*)?>`, "i");
  return pattern.test(xml);
};

const splitWebdavResponseNodes = (xml: string) =>
  xml.match(/<(?:[A-Za-z0-9_-]+:)?response\b[\s\S]*?<\/(?:[A-Za-z0-9_-]+:)?response>/gi) ?? [];

const toAbsolutePathFromHref = (href: string, storageUrlPathPrefix: string) => {
  const hrefPath = (() => {
    try {
      return decodeURIComponent(new URL(href, "https://local.invalid").pathname);
    } catch {
      return decodeURIComponent(href);
    }
  })();
  const prefix = storageUrlPathPrefix.length > 1 ? storageUrlPathPrefix.replace(/\/+$/g, "") : storageUrlPathPrefix;
  const stripped = hrefPath.startsWith(prefix) ? hrefPath.slice(prefix.length) : hrefPath;
  const normalized = stripped.startsWith("/") ? stripped : `/${stripped}`;
  return normalized.replace(/\/+$/g, "") || "/";
};

const toRelativePath = (absolutePath: string, basePath: string) => {
  if (absolutePath === basePath) return "/";
  const prefix = `${basePath}/`;
  if (absolutePath.startsWith(prefix)) {
    return `/${absolutePath.slice(prefix.length)}`;
  }
  return "/";
};

const deriveNextcloudInstanceUrl = (rawUrl: string) => {
  const parsed = new URL(rawUrl);
  const pathname = parsed.pathname.replace(/\/+$/g, "");
  const remoteIndex = pathname.indexOf("/remote.php");
  if (remoteIndex >= 0) {
    const prefix = pathname.slice(0, remoteIndex);
    return `${parsed.origin}${prefix}`;
  }
  const indexPhpIndex = pathname.indexOf("/index.php");
  if (indexPhpIndex >= 0) {
    const prefix = pathname.slice(0, indexPhpIndex);
    return `${parsed.origin}${prefix}`;
  }
  if (pathname.length > 0 && pathname !== "/") {
    return `${parsed.origin}${pathname}`;
  }
  return parsed.origin;
};

const resolveWebdavBaseUrl = (provider: StorageConfig["provider"], url: string, username: string) => {
  const trimmedUrl = withNoTrailingSlash(url.trim());
  if (provider !== "nextcloud") {
    return trimmedUrl;
  }
  if (/\/remote\.php\//.test(trimmedUrl)) {
    return trimmedUrl;
  }
  const instanceUrl = withNoTrailingSlash(deriveNextcloudInstanceUrl(trimmedUrl));
  return `${instanceUrl}/remote.php/dav/files/${encodeURIComponent(username)}`;
};

const resolveNextcloudLegacyWebdavBaseUrl = (url: string) => {
  const instanceUrl = withNoTrailingSlash(deriveNextcloudInstanceUrl(url));
  return `${instanceUrl}/remote.php/webdav`;
};

const ensureDirectoryTree = async (
  webdavBaseUrl: string,
  authHeader: string,
  absolutePath: string
) => {
  const segments = absolutePath.split("/").filter(Boolean);
  let current = "";
  for (const segment of segments) {
    current = `${current}/${segment}`;
    const response = await fetch(buildWebdavUrl(webdavBaseUrl, current), {
      method: "MKCOL",
      headers: { Authorization: authHeader }
    });
    if (!(response.ok || response.status === 405 || response.status === 409)) {
      return false;
    }
  }
  return true;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return new Response("Missing env", { status: 500, headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } }
  });
  const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey);

  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData?.user) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    return new Response("Invalid JSON", { status: 400, headers: corsHeaders });
  }

  const householdId = typeof payload.householdId === "string" ? payload.householdId : "";
  const action = payload.action;
  if (
    !householdId ||
    ![
      "list",
      "mkdir",
      "delete",
      "upload",
      "set_credentials",
      "start_nextcloud_login",
      "poll_nextcloud_login"
    ].includes(String(action))
  ) {
    return new Response("Invalid request payload", { status: 400, headers: corsHeaders });
  }
  const actionTyped = action as StorageAction;

  const { data: membership, error: membershipError } = await userClient
    .from("household_members")
    .select("user_id,role")
    .eq("household_id", householdId)
    .eq("user_id", authData.user.id)
    .maybeSingle();
  if (membershipError || !membership) {
    return new Response("Forbidden", { status: 403, headers: corsHeaders });
  }

  if (
    ["set_credentials", "start_nextcloud_login", "poll_nextcloud_login"].includes(actionTyped) &&
    membership.role !== "owner"
  ) {
    return new Response("Forbidden", { status: 403, headers: corsHeaders });
  }

  const { data: householdRow, error: householdError } = await userClient
    .from("households")
    .select("storage_provider,storage_url,storage_username,storage_password,storage_base_path")
    .eq("id", householdId)
    .maybeSingle();

  if (householdError || !householdRow) {
    return new Response("Storage config not found", { status: 404, headers: corsHeaders });
  }

  if (actionTyped === "set_credentials") {
    const username = typeof payload.username === "string" ? payload.username.trim() : "";
    const password = typeof payload.password === "string" ? payload.password : "";
    if (!username || !password) {
      return new Response("Missing credentials", { status: 400, headers: corsHeaders });
    }

    const { error: secretError } = await serviceClient.from("household_storage_secrets").upsert({
      household_id: householdId,
      storage_username: username,
      storage_password: password,
      updated_by: authData.user.id,
      updated_at: new Date().toISOString()
    });
    if (secretError) {
      return json(500, { error: "failed_to_store_storage_secret" });
    }

    const { error: householdUpdateError } = await userClient
      .from("households")
      .update({ storage_username: username })
      .eq("id", householdId);
    if (householdUpdateError) {
      return json(500, { error: "failed_to_update_storage_username" });
    }

    return json(200, { ok: true });
  }

  if (actionTyped === "start_nextcloud_login") {
    const storageUrlRaw =
      typeof payload.storageUrl === "string" && payload.storageUrl.trim().length > 0
        ? payload.storageUrl.trim()
        : typeof householdRow.storage_url === "string"
          ? householdRow.storage_url.trim()
          : "";
    if (!storageUrlRaw) {
      return new Response("Missing storage URL", { status: 400, headers: corsHeaders });
    }

    let instanceUrl: string;
    try {
      instanceUrl = withNoTrailingSlash(deriveNextcloudInstanceUrl(storageUrlRaw));
    } catch {
      return new Response("Invalid storage URL", { status: 400, headers: corsHeaders });
    }

    const loginInitResponse = await fetch(`${instanceUrl}/index.php/login/v2`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      }
    });

    if (!loginInitResponse.ok) {
      return json(loginInitResponse.status, { error: "nextcloud_login_start_failed" });
    }

    const loginInit = await loginInitResponse.json() as {
      login?: unknown;
      poll?: { token?: unknown; endpoint?: unknown };
    };

    const loginUrl = typeof loginInit.login === "string" ? loginInit.login : "";
    const pollToken = typeof loginInit.poll?.token === "string" ? loginInit.poll.token : "";
    const pollEndpoint = typeof loginInit.poll?.endpoint === "string" ? loginInit.poll.endpoint : "";

    if (!loginUrl || !pollToken || !pollEndpoint) {
      return json(502, { error: "nextcloud_login_response_invalid" });
    }

    const flowId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    const { error: flowError } = await serviceClient.from("household_storage_login_flows").insert({
      flow_id: flowId,
      household_id: householdId,
      requested_by: authData.user.id,
      status: "pending",
      nextcloud_login_url: loginUrl,
      nextcloud_poll_endpoint: pollEndpoint,
      nextcloud_poll_token: pollToken,
      nextcloud_instance_url: instanceUrl,
      expires_at: expiresAt
    });
    if (flowError) {
      return json(500, { error: "failed_to_create_nextcloud_flow" });
    }

    return json(200, {
      flowId,
      loginUrl,
      expiresAt
    });
  }

  if (actionTyped === "poll_nextcloud_login") {
    const flowId = typeof payload.flowId === "string" ? payload.flowId : "";
    if (!flowId) {
      return new Response("Missing flow id", { status: 400, headers: corsHeaders });
    }

    const { data: flowRow, error: flowReadError } = await serviceClient
      .from("household_storage_login_flows")
      .select("flow_id,status,nextcloud_poll_endpoint,nextcloud_poll_token,nextcloud_instance_url,expires_at")
      .eq("flow_id", flowId)
      .eq("household_id", householdId)
      .eq("requested_by", authData.user.id)
      .maybeSingle();

    if (flowReadError || !flowRow) {
      return new Response("Flow not found", { status: 404, headers: corsHeaders });
    }

    if (flowRow.status !== "pending") {
      return json(200, { status: "pending" });
    }

    const expiresAtMs = Date.parse(String(flowRow.expires_at ?? ""));
    if (Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()) {
      await serviceClient
        .from("household_storage_login_flows")
        .update({ status: "expired", updated_at: new Date().toISOString() })
        .eq("flow_id", flowId);
      return json(410, { error: "nextcloud_flow_expired" });
    }

    const pollEndpoint = typeof flowRow.nextcloud_poll_endpoint === "string" ? flowRow.nextcloud_poll_endpoint : "";
    const pollToken = typeof flowRow.nextcloud_poll_token === "string" ? flowRow.nextcloud_poll_token : "";
    const instanceUrl = typeof flowRow.nextcloud_instance_url === "string" ? flowRow.nextcloud_instance_url : "";
    if (!pollEndpoint || !pollToken || !instanceUrl) {
      return json(500, { error: "nextcloud_flow_invalid" });
    }

    const pollResponse = await fetch(pollEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({ token: pollToken }).toString()
    });

    if (pollResponse.status === 404 || pollResponse.status === 202) {
      return json(200, { status: "pending" });
    }

    if (!pollResponse.ok) {
      return json(pollResponse.status, { error: "nextcloud_login_poll_failed" });
    }

    const pollPayload = await pollResponse.json() as {
      server?: unknown;
      loginName?: unknown;
      appPassword?: unknown;
    };

    const server = typeof pollPayload.server === "string" ? pollPayload.server : "";
    const loginName = typeof pollPayload.loginName === "string" ? pollPayload.loginName : "";
    const appPassword = typeof pollPayload.appPassword === "string" ? pollPayload.appPassword : "";
    if (!server || !loginName || !appPassword) {
      return json(502, { error: "nextcloud_login_poll_response_invalid" });
    }

    const { error: secretError } = await serviceClient.from("household_storage_secrets").upsert({
      household_id: householdId,
      storage_username: loginName,
      storage_password: appPassword,
      updated_by: authData.user.id,
      updated_at: new Date().toISOString()
    });
    if (secretError) {
      return json(500, { error: "failed_to_store_storage_secret" });
    }

    const { error: householdUpdateError } = await userClient
      .from("households")
      .update({
        storage_username: loginName,
        storage_url: server
      })
      .eq("id", householdId);
    if (householdUpdateError) {
      return json(500, { error: "failed_to_update_household_storage" });
    }

    await serviceClient
      .from("household_storage_login_flows")
      .update({
        status: "completed",
        nextcloud_poll_token: null,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("flow_id", flowId);

    return json(200, {
      status: "connected",
      username: loginName,
      server
    });
  }

  const { data: secretRow } = await serviceClient
    .from("household_storage_secrets")
    .select("storage_username,storage_password")
    .eq("household_id", householdId)
    .maybeSingle();

  const resolvedUsername =
    typeof secretRow?.storage_username === "string" && secretRow.storage_username.trim().length > 0
      ? secretRow.storage_username.trim()
      : typeof householdRow.storage_username === "string"
        ? householdRow.storage_username.trim()
        : "";
  const resolvedPassword =
    typeof secretRow?.storage_password === "string" && secretRow.storage_password.length > 0
      ? secretRow.storage_password
      : typeof householdRow.storage_password === "string"
        ? householdRow.storage_password
        : "";

  const config: StorageConfig = {
    provider: (typeof householdRow.storage_provider === "string"
      ? householdRow.storage_provider
      : "none") as StorageConfig["provider"],
    url: typeof householdRow.storage_url === "string" ? householdRow.storage_url.trim() : "",
    username: resolvedUsername,
    password: resolvedPassword,
    basePath: normalizeBasePath(
      typeof householdRow.storage_base_path === "string" ? householdRow.storage_base_path : "/domora"
    )
  };

  const webdavBaseUrl = resolveWebdavBaseUrl(config.provider, config.url, config.username);

  if (config.provider === "none" || !webdavBaseUrl || !config.username || !config.password) {
    return json(412, { error: "storage_not_configured" });
  }

  const webdavAuth = buildAuthHeader(config.username, config.password);
  try {
    if (actionTyped === "list") {
      const relativePath = sanitizeRelativePath(payload.path);
      const absolutePath = joinNormalizedPaths(config.basePath, relativePath);
      let activeWebdavBaseUrl = webdavBaseUrl;
      let url = buildWebdavUrl(activeWebdavBaseUrl, absolutePath);
      let response = await fetch(url, {
        method: "PROPFIND",
        headers: {
          Authorization: webdavAuth,
          Depth: "1",
          "Content-Type": "application/xml"
        },
        body: `<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/><d:getcontentlength/><d:getlastmodified/><d:getcontenttype/></d:prop></d:propfind>`
      });
      if (response.status === 404 && relativePath === "/") {
        const ensured = await ensureDirectoryTree(activeWebdavBaseUrl, webdavAuth, config.basePath);
        if (ensured) {
          response = await fetch(url, {
            method: "PROPFIND",
            headers: {
              Authorization: webdavAuth,
              Depth: "1",
              "Content-Type": "application/xml"
            },
            body: `<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/><d:getcontentlength/><d:getlastmodified/><d:getcontenttype/></d:prop></d:propfind>`
          });
        }
      }
      if (response.status === 404 && config.provider === "nextcloud") {
        activeWebdavBaseUrl = resolveNextcloudLegacyWebdavBaseUrl(config.url);
        url = buildWebdavUrl(activeWebdavBaseUrl, absolutePath);
        response = await fetch(url, {
          method: "PROPFIND",
          headers: {
            Authorization: webdavAuth,
            Depth: "1",
            "Content-Type": "application/xml"
          },
          body: `<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/><d:getcontentlength/><d:getlastmodified/><d:getcontenttype/></d:prop></d:propfind>`
        });
      }
      if (!response.ok) {
        return json(response.status, { error: "webdav_list_failed", baseUrl: activeWebdavBaseUrl });
      }
      const storageUrlPathPrefix = (() => {
        try {
          const parsed = new URL(activeWebdavBaseUrl);
          return parsed.pathname.replace(/\/+$/g, "") || "/";
        } catch {
          return "/";
        }
      })();
      const xml = await response.text();
      const responses = splitWebdavResponseNodes(xml);
      const entries = responses
        .map((responseNode) => {
          const href = extractXmlTagValue(responseNode, "href");
          if (!href) return null;
          const absolute = toAbsolutePathFromHref(href, storageUrlPathPrefix);
          if (absolute === absolutePath) return null;
          const relative = toRelativePath(absolute, config.basePath);
          if (relative === "/") return null;
          const cleanRelative = sanitizeRelativePath(relative);
          const name = cleanRelative.split("/").filter(Boolean).at(-1) ?? cleanRelative;
          const isDirectory = hasXmlTag(responseNode, "collection");
          const sizeRaw = extractXmlTagValue(responseNode, "getcontentlength");
          const size = sizeRaw ? Number(sizeRaw) : null;
          return {
            path: cleanRelative,
            name: decodeURIComponent(name),
            isDirectory,
            size: Number.isFinite(size) ? size : null,
            updatedAt: extractXmlTagValue(responseNode, "getlastmodified"),
            contentType: extractXmlTagValue(responseNode, "getcontenttype")
          };
        })
        .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
        .sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
          return a.name.localeCompare(b.name, "de");
        });

      return json(200, {
        path: relativePath,
        entries
      });
    }

    if (actionTyped === "mkdir") {
      const relativePath = sanitizeRelativePath(payload.path);
      const rawName = typeof payload.name === "string" ? payload.name.trim() : "";
      if (!rawName) {
        return new Response("Missing folder name", { status: 400, headers: corsHeaders });
      }
      const safeName = rawName.replace(/[\\/]/g, "_").trim();
      if (!safeName) {
        return new Response("Invalid folder name", { status: 400, headers: corsHeaders });
      }
      const absolutePath = joinNormalizedPaths(config.basePath, relativePath, safeName);
      const response = await fetch(buildWebdavUrl(webdavBaseUrl, absolutePath), {
        method: "MKCOL",
        headers: { Authorization: webdavAuth }
      });
      if (!(response.ok || response.status === 405)) {
        return json(response.status, { error: "webdav_mkdir_failed" });
      }
      return json(200, { ok: true });
    }

    if (actionTyped === "delete") {
      const targetPath = sanitizeRelativePath(payload.targetPath);
      if (targetPath === "/") {
        return new Response("Refusing to delete root", { status: 400, headers: corsHeaders });
      }
      const absolutePath = joinNormalizedPaths(config.basePath, targetPath);
      const response = await fetch(buildWebdavUrl(webdavBaseUrl, absolutePath), {
        method: "DELETE",
        headers: { Authorization: webdavAuth }
      });
      if (!response.ok) {
        return json(response.status, { error: "webdav_delete_failed" });
      }
      return json(200, { ok: true });
    }

    if (actionTyped === "upload") {
      const relativePath = sanitizeRelativePath(payload.path);
      const rawName = typeof payload.fileName === "string" ? payload.fileName.trim() : "";
      const contentBase64 = typeof payload.contentBase64 === "string" ? payload.contentBase64 : "";
      const contentType = typeof payload.contentType === "string" && payload.contentType.trim().length > 0
        ? payload.contentType.trim()
        : "application/octet-stream";
      if (!rawName || !contentBase64) {
        return new Response("Missing upload payload", { status: 400, headers: corsHeaders });
      }
      const safeName = rawName.replace(/[\\/]/g, "_").trim();
      if (!safeName) {
        return new Response("Invalid file name", { status: 400, headers: corsHeaders });
      }
      const bytes = Uint8Array.from(atob(contentBase64), (char) => char.charCodeAt(0));
      const absolutePath = joinNormalizedPaths(config.basePath, relativePath, safeName);
      const response = await fetch(buildWebdavUrl(webdavBaseUrl, absolutePath), {
        method: "PUT",
        headers: {
          Authorization: webdavAuth,
          "Content-Type": contentType
        },
        body: bytes
      });
      if (!response.ok) {
        return json(response.status, { error: "webdav_upload_failed" });
      }
      return json(200, { ok: true });
    }

    return new Response("Unsupported action", { status: 400, headers: corsHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : "storage_proxy_failed";
    return json(500, { error: message });
  }
});
