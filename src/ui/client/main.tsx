import { QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createQueryClient } from "@/lib/queries";
import { App } from "./app/App.tsx";

const root = document.getElementById("root");
const queryClient = createQueryClient();
// One provider for every tooltip; a short delay keeps them from flashing
// while the pointer crosses a row of logos.
if (root)
	createRoot(root).render(
		<QueryClientProvider client={queryClient}>
			<TooltipProvider delay={250}>
				<App />
			</TooltipProvider>
		</QueryClientProvider>,
	);
