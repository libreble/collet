import { useEffect, useReducer } from 'react';
import type { ToolClient } from '../protocol/client';

/** Re-render the component whenever the client emits a state/log change. */
export function useToolClient(client: ToolClient): ToolClient {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => client.subscribe(force), [client]);
  return client;
}
