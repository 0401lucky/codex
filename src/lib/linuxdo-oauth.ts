// LinuxDo OAuth2 工具函数

const LINUXDO_AUTHORIZE_URL = "https://connect.linux.do/oauth2/authorize";
const LINUXDO_TOKEN_URL = "https://connect.linux.do/oauth2/token";
const LINUXDO_USERINFO_URL = "https://connect.linux.do/api/user";

export interface LinuxDoUser {
  id: number;
  username: string;
  name: string;         // display name
  avatar_url: string;
  active: boolean;
  trust_level: number;
}

function getClientId(): string {
  const id = process.env.LINUXDO_CLIENT_ID;
  if (!id) throw new Error("LINUXDO_CLIENT_ID is not set");
  return id;
}

function getClientSecret(): string {
  const secret = process.env.LINUXDO_CLIENT_SECRET;
  if (!secret) throw new Error("LINUXDO_CLIENT_SECRET is not set");
  return secret;
}

function getRedirectUri(): string {
  const uri = process.env.LINUXDO_REDIRECT_URI;
  if (!uri) throw new Error("LINUXDO_REDIRECT_URI is not set");
  return uri;
}

/**
 * 构建 OAuth2 授权 URL
 */
export function buildAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: getClientId(),
    redirect_uri: getRedirectUri(),
    state,
  });
  return `${LINUXDO_AUTHORIZE_URL}?${params.toString()}`;
}

/**
 * 用 authorization code 换取 access token
 */
export async function exchangeCodeForToken(code: string): Promise<{
  access_token: string;
  token_type: string;
}> {
  const response = await fetch(LINUXDO_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${getClientId()}:${getClientSecret()}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: getRedirectUri(),
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token exchange failed: ${response.status} ${text}`);
  }

  return response.json();
}

/**
 * 用 access token 获取用户信息
 */
export async function getUserInfo(accessToken: string): Promise<LinuxDoUser> {
  const response = await fetch(LINUXDO_USERINFO_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Get user info failed: ${response.status} ${text}`);
  }

  return response.json();
}
