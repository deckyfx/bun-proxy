/**
 * Application configuration object containing environment-specific settings.
 * All configuration values are read from environment variables with fallback values.
 *
 * @property {number} DASHBOARD_PORT - The port number on which the dashboard server will run.
 * Defaults to 3000 if not specified in environment variables.
 */
export default {
  DASHBOARD_PORT: Number(process.env.DASHBOARD_PORT) || 3000,

  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || "123456",
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || "123456",

  DATABASE_URL: process.env.DATABASE_URL || "./data/data.db",
} as const;
