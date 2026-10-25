"use client";

import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { cssVariablesResolver, theme } from "./theme";

/** Mantine's provider and the toast area, for the whole portal. Light or dark follows the system until someone picks one. */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver} defaultColorScheme="auto">
      <Notifications position="bottom-center" limit={3} />
      {children}
    </MantineProvider>
  );
}
