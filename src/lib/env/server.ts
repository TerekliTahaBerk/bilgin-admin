import "server-only";

import { parseServerEnv } from "@/lib/env/schema";

export const serverEnv = parseServerEnv(
  {
    BILGIN_API_URL: process.env.BILGIN_API_URL,
    APP_ORIGIN: process.env.APP_ORIGIN,
    SESSION_SECRET: process.env.SESSION_SECRET,
    SESSION_MAX_AGE_SECONDS: process.env.SESSION_MAX_AGE_SECONDS,
  },
  process.env.NODE_ENV,
);
