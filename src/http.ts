import { WclError, record } from './errors.ts';

export type Fetch = (input: string, init: RequestInit) => Promise<Response>;
export interface TransportOptions {
  fetch?: Fetch;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export class Transport {
  private fetcher: Fetch;
  private timeoutMs: number;
  private sleep: (ms: number) => Promise<void>;
  constructor(options: TransportOptions = {}) {
    this.fetcher = options.fetch ?? ((input, init) => fetch(input, init));
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  }

  async json(url: string, init: RequestInit, authentication = false): Promise<Record<string, unknown>> {
    for (let attempt = 0; attempt < 3; attempt++) {
      let response: Response;
      let body: unknown;
      try {
        // The deadline covers both headers and body consumption.
        response = await this.fetcher(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(this.timeoutMs) });
        if (response.status >= 500 && attempt < 2) {
          await response.body?.cancel();
          await this.sleep(250 * 2 ** attempt);
          continue;
        }
        const contentType = response.headers.get('content-type') ?? '';
        if (response.status === 429) {
          const wait = response.headers.get('retry-after');
          const safeWait = wait && /^\d{1,8}$/.test(wait) ? `，${wait} 秒后重试` : '，请稍后重试';
          throw new WclError('RATE_LIMITED', `WCL 请求限额已触发${safeWait}。`);
        }
        if (response.status === 401 || (authentication && response.status === 400 && contentType.includes('json'))) {
          throw new WclError('AUTH_FAILED', 'WCL 认证失败，请检查本地客户端凭据。');
        }
        if (response.status === 403 || response.headers.get('cf-mitigated') === 'challenge') {
          throw new WclError('ACCESS_BLOCKED', 'WCL 拒绝访问或返回了 Cloudflare 挑战；这不代表角色不存在。');
        }
        if (!response.ok) {
          throw new WclError('UPSTREAM_ERROR', `WCL 返回 HTTP ${response.status}；未取得有效数据。`);
        }
        if (!contentType.toLowerCase().includes('json')) {
          throw new WclError('INVALID_RESPONSE', 'WCL 返回非 JSON 内容，可能是 HTML 挑战页；不能判定角色不存在。');
        }
        try { body = await response.json(); }
        catch (error) {
          if (error instanceof SyntaxError) throw new WclError('INVALID_RESPONSE', 'WCL 返回了无法解析的 JSON。');
          // Body stream failures are network failures, not malformed JSON.
          throw error;
        }
      } catch (error) {
        if (error instanceof WclError) throw error;
        if (attempt < 2) { await this.sleep(250 * 2 ** attempt); continue; }
        const timeout = error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name);
        throw new WclError(timeout ? 'TIMEOUT' : 'NETWORK_ERROR', timeout
          ? 'WCL 请求超时（已重试两次）。' : '无法连接 WCL（已重试两次），请检查网络。');
      }
      return record(body, 'WCL JSON');
    }
    throw new WclError('UPSTREAM_ERROR', 'WCL 请求失败。');
  }
}

export class WclClient {
  private transport: Transport;
  private credentials: { id: string; secret: string };
  private token: { value: string; expiresAt: number } | null = null;
  private now: () => number;
  constructor(credentials: { id: string; secret: string }, options: TransportOptions & { now?: () => number } = {}) {
    if (!credentials.id.trim() || !credentials.secret.trim()) {
      throw new WclError('MISSING_CREDENTIALS', '请在本地 .env 配置 WCL_CLIENT_ID 和 WCL_CLIENT_SECRET；参见 .env.example。');
    }
    this.credentials = credentials;
    this.transport = new Transport(options);
    this.now = options.now ?? Date.now;
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > this.now()) return this.token.value;
    const basic = Buffer.from(`${this.credentials.id}:${this.credentials.secret}`).toString('base64');
    const body = await this.transport.json('https://www.warcraftlogs.com/oauth/token', {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: 'grant_type=client_credentials',
    }, true);
    if (typeof body.access_token !== 'string' || !body.access_token ||
      typeof body.expires_in !== 'number' || body.expires_in <= 0) {
      throw new WclError('INVALID_RESPONSE', 'OAuth token 响应缺少有效 token 或有效期。');
    }
    this.token = { value: body.access_token, expiresAt: this.now() + Math.max(0, body.expires_in - 30) * 1000 };
    return body.access_token;
  }

  async query(query: string, variables: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await this.accessToken();
      let result: Record<string, unknown>;
      try {
        result = await this.transport.json('https://www.warcraftlogs.com/api/v2/client', {
          method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ query, variables }),
        });
      } catch (error) {
        if (error instanceof WclError && error.code === 'AUTH_FAILED' && attempt === 0) { this.token = null; continue; }
        throw error;
      }
      if (result.errors !== undefined && (!Array.isArray(result.errors) || result.errors.length > 0)) {
        const limited = Array.isArray(result.errors) && result.errors.some(value => {
          if (!value || typeof value !== 'object') return false;
          const e = value as Record<string, unknown>;
          const extensions = e.extensions && typeof e.extensions === 'object' ? e.extensions as Record<string, unknown> : {};
          return /rate.?limit|quota|points.*exceed|exceed.*points/i.test(String(e.message ?? '') + ' ' + String(extensions.code ?? ''));
        });
        if (limited) throw new WclError('RATE_LIMITED', 'WCL API 配额不足或已耗尽，请等待配额恢复后重试。');
        // Deliberately don't print upstream messages: they can echo request data.
        throw new WclError('GRAPHQL_ERROR', 'WCL GraphQL 返回错误（包括部分数据响应）；请核对参数、权限和当前 Schema。');
      }
      record(result.data, 'GraphQL data');
      return result;
    }
    throw new WclError('AUTH_FAILED', 'WCL token 刷新后仍认证失败。');
  }
}
