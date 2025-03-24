import { StoreApi } from "zustand";

import { StoreActions, StoreState } from "@/store";

/**
 * Global type declarations for the application
 */
declare global {
  // eslint-disable-next-line no-var
  var store: StoreApi<StoreState & StoreActions> | undefined;
}

// This export is needed to make this a module
export { };
