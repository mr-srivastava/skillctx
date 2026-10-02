import { createRoot } from "react-dom/client";
import { TooltipProvider } from "@/components/ui/tooltip";
import { App } from "./App.tsx";

const root = document.getElementById("root");
// One provider for every tooltip; a short delay keeps them from flashing
// while the pointer crosses the presence table.
if (root)
	createRoot(root).render(
		<TooltipProvider delay={250}>
			<App />
		</TooltipProvider>,
	);
