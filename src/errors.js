export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

export function badRequest(message) {
  return new HttpError(400, message);
}

export function forbidden(message = 'You do not have permission to do that.') {
  return new HttpError(403, message);
}

export function notFound(message = 'Record not found.') {
  return new HttpError(404, message);
}
