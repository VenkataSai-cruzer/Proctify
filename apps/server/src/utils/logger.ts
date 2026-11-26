import winston from "winston";
import path from "path";
import fs from "fs";

// LOG_DIR lets the desktop app keep server logs inside userData instead of
// the (often read-only) install directory.
const logDir = process.env.LOG_DIR ? path.resolve(process.env.LOG_DIR) : path.resolve("logs");

try {
  fs.mkdirSync(logDir, { recursive: true });
} catch {
  /* best effort — console transport still works */
}

const fileTransports = () => {
  try {
    fs.accessSync(logDir, fs.constants.W_OK);
    return [
      new winston.transports.File({
        filename: path.join(logDir, "error.log"),
        level: "error",
        maxsize: 5_242_880,
        maxFiles: 3,
      }),
      new winston.transports.File({
        filename: path.join(logDir, "combined.log"),
        maxsize: 10_485_760,
        maxFiles: 5,
      }),
    ];
  } catch {
    return [];
  }
};

export const logger = winston.createLogger({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.errors({ stack: true }),
    process.env.NODE_ENV === "production"
      ? winston.format.json()
      : winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message, ...meta }) => {
            const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
            return `${timestamp} [${level}] ${message}${metaStr}`;
          })
        )
  ),
  transports: [new winston.transports.Console(), ...fileTransports()],
});
