"use client";

import { createContext, useContext } from "react";
import type { SelectedGroup } from "@/lib/whatsappTypes";

// What the sidebar needs from the connection gate. Null outside the gate.
export interface WhatsAppControls {
  group: SelectedGroup;
  changeGroup: () => void;
  logout: () => void;
}

export const WhatsAppContext = createContext<WhatsAppControls | null>(null);

export function useWhatsAppControls(): WhatsAppControls | null {
  return useContext(WhatsAppContext);
}
