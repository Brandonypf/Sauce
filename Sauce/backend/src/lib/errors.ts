export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const badRequest = (code: string, msg: string) => new HttpError(400, code, msg);
export const unauthorized = (msg = "Sesion requerida") => new HttpError(401, "unauthorized", msg);
export const forbidden = (msg = "Sin permiso") => new HttpError(403, "forbidden", msg);
export const notFound = (msg = "No encontrado") => new HttpError(404, "not_found", msg);
export const conflict = (code: string, msg: string) => new HttpError(409, code, msg);
