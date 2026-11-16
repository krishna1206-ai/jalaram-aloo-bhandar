import multer from "multer";

export class HttpError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

export const badRequest = (message, fields) => new HttpError(400, message, fields);

// Collects field errors so the client can show them all at once.
export function validator() {
  const fields = {};
  return {
    fields,
    check(ok, field, message) {
      if (!ok && !fields[field]) fields[field] = message;
      return ok;
    },
    done() {
      const keys = Object.keys(fields);
      if (keys.length) throw badRequest(fields[keys[0]], fields);
    },
  };
}

export function notFound(req, res) {
  res.status(404).json({ error: `No route for ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, ...(err.fields && { fields: err.fields }) });
  }
  if (err instanceof multer.MulterError) {
    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? "Each file must be 2 MB or smaller."
        : err.code === "LIMIT_UNEXPECTED_FILE"
        ? `Unexpected file field "${err.field}".`
        : "File upload failed.";
    return res.status(400).json({ error: message, ...(err.field && { fields: { [err.field]: message } }) });
  }
  if (err?.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Request body is not valid JSON." });
  }
  if (err?.type === "entity.too.large") {
    return res.status(413).json({ error: "Request is too large." });
  }
  if (err?.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || "value";
    return res.status(409).json({ error: `That ${field} is already registered.`, fields: { [field]: "Already registered." } });
  }
  console.error(err);
  res.status(500).json({ error: "Something went wrong on our side. Please try again." });
}
