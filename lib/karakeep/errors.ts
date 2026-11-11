export type KarakeepErrorKind =
  /** The request never got an answer: offline, DNS, TLS, missing host permission. */
  | 'network'
  | 'timeout'
  /** The server answered with a redirect. Redirects are never followed. */
  | 'redirect'
  /** 401: the API key is missing, invalid or expired. */
  | 'unauthorized'
  /** 403: the API key is valid but may not do this. */
  | 'forbidden'
  /** 404: most likely not a Karakeep instance at this URL. */
  | 'not-found'
  /** Any other HTTP error status. */
  | 'http'
  /** A success status, but the body is not what the Karakeep API returns. */
  | 'invalid-response';

export class KarakeepError extends Error {
  readonly kind: KarakeepErrorKind;
  readonly status: number | undefined;

  constructor(kind: KarakeepErrorKind, status?: number) {
    super(
      status === undefined
        ? `Karakeep request failed: ${kind}`
        : `Karakeep request failed: ${kind} (HTTP ${status})`,
    );
    this.name = 'KarakeepError';
    this.kind = kind;
    this.status = status;
  }
}
