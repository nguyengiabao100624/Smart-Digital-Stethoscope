import { StartClient } from "@tanstack/react-start/client";
import { hydrateRoot } from "react-dom/client";
import { getRouter } from "./router";

const router = getRouter();

// @ts-expect-error - StartClient typing
hydrateRoot(document, <StartClient router={router} />);
