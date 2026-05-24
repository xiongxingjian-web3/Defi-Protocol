"use client";
import { ReactNode } from 'react';
import '@rainbow-me/rainbowkit/styles.css';
import {
    RainbowKitProvider,
} from '@rainbow-me/rainbowkit';
import { WagmiProvider } from 'wagmi';
import {
    QueryClientProvider,
    QueryClient,
} from "@tanstack/react-query";
import config from "@/rainbowkit";
const queryClient = new QueryClient();
const Provider = ({ children }: { children: ReactNode }) => {
    return (
        <WagmiProvider config={config}>
            <QueryClientProvider client={queryClient}>
                <RainbowKitProvider>
                    {children}
                </RainbowKitProvider>
            </QueryClientProvider>
        </WagmiProvider>
    );
};
export default Provider;
