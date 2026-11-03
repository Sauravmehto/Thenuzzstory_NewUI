import "server-only";
import path from "node:path";

/**
 * Where the local file stores (accounts, orders, dev auth secret) keep their
 * data. Defaults to .data in the project (git-ignored); set DATA_DIR to move it,
 * e.g. the end-to-end tests use .data-e2e. Not used on Netlify, which stores
 * accounts and orders in Netlify Blobs.
 */
export const dataDir = () => (process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(process.cwd(), ".data"));
