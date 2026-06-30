import { useCallback, useEffect, useRef } from 'react';

/**
 * A hook that returns a function to check if the component is still mounted.
 * Use this to guard async operations from calling setState or navigation
 * after the component has unmounted.
 *
 * @example
 * const isMounted = useIsMounted();
 * await someAsyncOp();
 * if (!isMounted()) return;
 * setState(result); // safe to call
 */
export function useIsMounted(): () => boolean {
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return useCallback(() => isMountedRef.current, []);
}
