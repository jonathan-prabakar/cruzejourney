"use client";
import { createContext, useContext, useState, useSyncExternalStore } from 'react';
import { ConnectedVehicleSession, type VehicleNavigationProvider } from '@/lib/vehicle/connected';

const VehicleContext = createContext<VehicleNavigationProvider | null>(null);
export function ConnectedVehicleProvider({ children, provider }: { children: React.ReactNode; provider?: VehicleNavigationProvider }) {
  const [session] = useState(() => new ConnectedVehicleSession());
  return <VehicleContext.Provider value={provider ?? session}>{children}</VehicleContext.Provider>;
}
export function useConnectedVehicle() {
  const session = useContext(VehicleContext);
  if (!session) throw new Error('Connected vehicle provider is required.');
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  return { session, ...snapshot };
}
