import { api } from "./api";
import { ensureGmToken } from "./identity";

/** This browser's GM token, registering one with the server on first GM action (gm-home). */
export const getGmToken = () => ensureGmToken(api.gm.identify);
