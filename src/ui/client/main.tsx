import { createRoot } from "react-dom/client";
import { TooltipProvider } from "@/components/ui/tooltip";
import { App } from "./app/App.tsx";

const root = document.getElementById("root");
// One provider for every tooltip; a short delay keeps them from flashing
// while the pointer crosses a row of logos.
if (root)
	createRoot(root).render(
		<TooltipProvider delay={250}>
			<App />
		</TooltipProvider>,
	);
