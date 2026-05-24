import { sepolia } from "wagmi/chains";
import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "viem";

const projectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ??
  "YOUR_WALLETCONNECT_PROJECT_ID";

const sepoliaRpcUrl =
  process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL ?? "https://rpc.sepolia.org";

const config = getDefaultConfig({
  appName: "Foundrry Defi UI",
  projectId,
  chains: [sepolia],
  ssr: true,
  transports: {
    [sepolia.id]: http(sepoliaRpcUrl),
  },
});

export default config;
